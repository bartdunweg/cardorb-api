-- A folder either holds what a person filed in it (rule is null) or fills itself from a
-- rule. The API validates the rule's shape (src/lib/core/collection/folders.ts); Postgres only
-- insists it is a JSON object, so a stray string or array can never reach a reader.
alter table public.collections add column if not exists rule jsonb;

alter table public.collections
  drop constraint if exists collections_rule_is_object,
  add constraint collections_rule_is_object
    check (rule is null or jsonb_typeof(rule) = 'object');

comment on column public.collections.rule is
  'Null for a folder filled by hand. Otherwise {dex?:{from,to}, sets?:[...], rarities?:[...]}: '
  'the owned copies it shows, AND between fields, OR within a list. A rule folder never has '
  'cards.collection_id pointing at it; the API refuses that (PATCH /v1/collection/items/{id}).';
