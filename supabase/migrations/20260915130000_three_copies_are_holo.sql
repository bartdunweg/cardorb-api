-- Three of the owner's copies were recorded as normal on Rares that were only printed holo and
-- reverse holo: Black Bolt Haxorus 070, White Flare Emboar 013 and White Flare Gothitelle 043
-- (TCGplayer sells each as Holofoil and Reverse Holofoil only). The owner holds each card twice,
-- a reverse holo and this copy, and said on 2026-09-14 that this copy is the holo. Guarded on the
-- stored value, so a second run changes nothing.
with owner as (select id from public.profiles where username = 'bartdunweg')
update public.cards c
   set finish = 'holo'
  from owner
 where c.user_id = owner.id
   and c.finish = 'normal'
   and c.tcg_id in ('sv10.5b-070', 'sv10.5w-013', 'sv10.5w-043');
