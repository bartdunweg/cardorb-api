-- display_name held a copy of the username, which made "no name" unreadable.
--
-- app/api/v1/signup/route.ts used to call auth.signUp with
-- `data: { username, display_name: username }`, so handle_new_user() wrote the
-- generated handle into both columns. Every account therefore had a display
-- name — "swift-eevee-4821" — and nothing downstream could tell a name somebody
-- chose from one nobody did. The route now sends the name the person typed, or
-- nothing at all; the trigger's existing `nullif(... ->> 'display_name', '')`
-- turns both an absent key and an empty string into null, so no trigger change
-- is needed and none is made here.
--
-- This clears the copies that were already written. Left alone they would keep
-- rendering as a chosen name on the public page, and Settings would never show
-- the placeholder that tells somebody the field is empty and what happens if it
-- stays that way.
--
-- Deliberately narrow. Only rows where the two columns are literally identical
-- are touched: a person who typed their own name that happens to equal their
-- own username has picked it on purpose, and the fallback in
-- lib/core/owner.ts renders exactly the same string for them either way, so
-- nulling it costs them nothing visible. Anything that differs is a name
-- somebody meant and is left alone.
--
-- citext on username, text on display_name, so the comparison is cast
-- explicitly rather than left to an implicit one — and a case-insensitive
-- match is the right test here: "Swift-Eevee-4821" is the same seeded copy.
update public.profiles
set display_name = null
where display_name is not null
  and lower(display_name) = lower(username::text);
