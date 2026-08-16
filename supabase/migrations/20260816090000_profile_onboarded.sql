-- Whether this account has been through the welcome flow, and when.
--
-- A timestamp rather than a boolean: "have you seen it" and "when did you
-- start" are the same fact here, and the second one is free. Nullable, and
-- null is the interesting value — the (app) layout sends an account with a
-- null here to /welcome before it fetches anything.
--
-- A column on profiles rather than a preferences table. There is nothing else
-- to keep: currency and locale are compile-time constants (lib/core/config.ts)
-- and the theme lives in localStorage on purpose. A table for one boolean-
-- shaped fact is a join every profile read would have to pay for.
--
-- It is written by the owner alone, through profiles_write (id = auth.uid()),
-- so it needs no policy of its own.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Every account that exists at this point has already been set up by hand. A
-- deploy that sent them to a first-run wizard would be asking them to redo
-- work they have already done, so they are marked as having been through it.
-- New accounts arrive with null and see the flow once.
update public.profiles
   set onboarded_at = created_at
 where onboarded_at is null;
