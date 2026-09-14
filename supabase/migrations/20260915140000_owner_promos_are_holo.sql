-- 65 of the owner's copies were recorded as normal on cards that are foil (2026-09-14). TCGdex calls
-- a foil full art or promo "normal", and the rows took its word: XY Black Star promos (XY74 to
-- XY124, XY67a, XY150a, XY185, XY186), SM promos SM229, SM230, SM240, SM241, Cosmic Eclipse's GX and
-- Secret Rares (211 to 248), the XY-era Secret Rare EX, Double Crisis' EX and Wizards promos 13
-- and 15: TCGplayer sells each of these 59 as Holofoil only. The six Double Crisis Holo Rares
-- (2, 5, 8, 11, 14, 21) exist as holo and reverse; the owner said on 2026-09-14 that theirs are
-- holo, as they did for the 59. Team Rocket's Meowth (Wizards promo 18) stays holo: the owner's
-- card is holo, though TCGplayer lists only a normal. Guarded on the stored value, so a second run
-- changes nothing.
with owner as (select id from public.profiles where username = 'bartdunweg')
update public.cards c
   set finish = 'holo'
  from owner
 where c.user_id = owner.id
   and c.finish = 'normal'
   and c.tcg_id in (
     'xyp-XY74', 'xyp-XY75', 'xyp-XY76', 'xyp-XY77', 'xyp-XY78', 'xyp-XY79', 'xyp-XY80', 'xyp-XY81', 
     'xyp-XY82', 'xyp-XY83', 'xyp-XY110', 'xyp-XY111', 'xyp-XY112', 'xyp-XY113', 'xyp-XY114', 
     'xyp-XY115', 'xyp-XY117', 'xyp-XY118', 'xyp-XY119', 'xyp-XY120', 'xyp-XY121', 'xyp-XY122', 
     'xyp-XY123', 'xyp-XY124', 'xyp-XY67a', 'xyp-XY150a', 'xyp-XY185', 'xyp-XY186', 'smp-SM229', 
     'smp-SM230', 'smp-SM240', 'smp-SM241', 'sm12-211', 'sm12-216', 'sm12-222', 'sm12-227', 
     'sm12-237', 'sm12-238', 'sm12-239', 'sm12-240', 'sm12-241', 'sm12-242', 'sm12-243', 'sm12-244', 
     'sm12-245', 'sm12-246', 'sm12-247', 'sm12-248', 'xy8-163', 'xy8-164', 'xy9-123', 'xy10-125', 
     'xy11-115', 'xy11-116', 'xy6-77a', 'dc1-6', 'dc1-15', 'basep-13', 'basep-15', 'dc1-2', 'dc1-5', 
     'dc1-8', 'dc1-11', 'dc1-14', 'dc1-21'
   );
