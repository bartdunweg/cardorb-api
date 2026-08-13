import { ImageResponse } from "next/og";

/**
 * The same mark at the size iOS uses when this is added to a home screen.
 *
 * A separate file rather than letting the 32px favicon be scaled up, because
 * that is what iOS does when there is no apple-touch-icon and the result is a
 * blurred letter on a home screen. 180 is the size Apple asks for.
 *
 * No rounded corners here, unlike icon.tsx: iOS masks the square itself, and a
 * radius baked in shows up as a second, smaller corner inside the real one.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111111",
        color: "#ffffff",
        fontSize: 116,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      C
    </div>,
    size,
  );
}
