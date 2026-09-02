- The API now has a contract and a home of its own. `openapi.yaml` describes every
  route under `/api/v1`, a plain-HTML reference is at `/docs/api`, and `api.cardorb.com`
  serves the same API as `/v1/…` once the domain is attached. Every failure answers
  `{ "error": "<sentence>" }`; the one that did not (the health check) now does, and the
  four wordings of "no database" are one.
