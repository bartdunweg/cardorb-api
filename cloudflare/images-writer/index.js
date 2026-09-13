/**
 * Stores a card picture in the cardorb-images bucket, for the catalogue copy (mirror.ts).
 *
 * Why a Worker and not the bucket's own S3 keys: a Worker is bound to the bucket and can be put up
 * from the command line, where an S3 key is made by hand in the dashboard and would be a second
 * secret to keep. The API holds one bearer (IMAGES_WRITE_SECRET) and this checks it.
 *
 *   HEAD /<key>  200 when the file is there, 404 when it is not
 *   PUT  /<key>  stores the body under the key, with the request's content type
 *
 * A key is a picture's path at its source (en/swsh/swsh11/186/low.webp for TCGdex), so the
 * public address is images.cardorb.com/<key> and nothing has to remember a mapping.
 */
const KEY = /^[A-Za-z0-9][A-Za-z0-9._~%!-]*(\/[A-Za-z0-9._~%!-]+)*$/;
const TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const MAX_BYTES = 5 * 1024 * 1024;

async function sameSecret(given, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const worker = {
  async fetch(request, env) {
    if (!env.IMAGES_WRITE_SECRET) return new Response("Not configured.", { status: 503 });
    const auth = request.headers.get("authorization") ?? "";
    if (!(await sameSecret(auth, `Bearer ${env.IMAGES_WRITE_SECRET}`))) {
      return new Response("No.", { status: 401 });
    }
    const key = decodeURIComponent(new URL(request.url).pathname.slice(1));
    if (key.length > 300 || !KEY.test(key) || key.split("/").some((p) => p === "." || p === "..")) {
      return new Response("Bad key.", { status: 400 });
    }
    if (request.method === "HEAD") {
      return new Response(null, { status: (await env.IMAGES.head(key)) ? 200 : 404 });
    }
    if (request.method === "PUT") {
      const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!TYPES.has(type)) return new Response("Not a picture.", { status: 415 });
      const length = Number(request.headers.get("content-length") ?? "0");
      if (!length || length > MAX_BYTES) return new Response("Wrong size.", { status: 413 });
      await env.IMAGES.put(key, request.body, {
        httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
      });
      return new Response(null, { status: 201 });
    }
    return new Response("Method not allowed.", { status: 405, headers: { allow: "HEAD, PUT" } });
  },
};

export default worker;
