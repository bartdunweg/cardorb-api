- Every failure under `/v1` is written by one helper now. The 140 hand-typed `{ error }`
  answers across 31 route files were rewritten to `apiError()`; nothing a client sees changed.
