- `createRows` no longer claims a CSV import is idempotent. It never was: the conflict target
  names a `source_id` a CSV row does not carry, and in Postgres every null is distinct. Writing
  the file twice writes every card twice, which is deliberate and argued where the decision
  actually lives — the comment was the part that was wrong.
- A refused `imports` row is logged instead of discarded, so an import can no longer run with no
  record that it started.
