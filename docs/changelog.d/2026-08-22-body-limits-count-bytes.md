- Request size limits now count bytes rather than characters. Anything you sent
  with accents or non-Latin script was measured short, so a field capped at
  4 kB accepted up to twice that. Nothing you can do in the app came near either
  number; this closes the gap rather than fixes a symptom.
