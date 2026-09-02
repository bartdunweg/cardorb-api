- A public profile's collection is read again. The anonymous role may read only the public
  columns of `cards` since the web app's schema review, and the three public routes read the
  whole row as anonymous, so they answered every visitor with an empty collection — cached at
  the CDN for an hour. They read as the service role now, scoped to the one public profile, and
  a failed read is a 503 nothing caches rather than an empty 200.
