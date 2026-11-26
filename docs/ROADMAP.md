# Roadmap

Where the game goes next, roughly in order. Each item lists where it plugs in.

## Done: character pass #2
- Organic muscle limbs, body + face sliders, stances, clothing fit, toon eyes / toothy grins / triangle nose,
  wild spiky hair, belts, fingerless gloves; designer with face close-up, pose + expression preview, undo/redo,
  saved looks (migration 4, `look_presets`).

## Done: variety pass
- 30 starter archetypes (catalog `archetypes`), used by the designer and by recruits (`archetype_appearance`, `freeify_look`).
- New instruments: banjo, offset guitar, cello, harp, sitar, synth, upright piano, accordion, trombone, sax, trumpet,
  turntables, boombox, marching snare, electronic pads, harmonica, vintage stand mic; roles Horns and DJ; voices for each.
- Wardrobe: glam/track/tech/uniform/fringe jackets, cardigan, waistcoat, overshirt, cropped jacket, open-collar shirt,
  cut-off tee, overalls, track pants, patched jeans, ball gown, harem pants, socks, sandals, glow boots, curled slippers,
  8 hats, 7 hairstyles, big beard, square shades, tie, medallion, gloves, opera gloves, glam star paint,
  7 patterns (camo, corduroy, pinstripe, sparkle, zebra, Hawaiian floral, psychedelic).

## Now: characters, continued
- Keep closing the gap to `assets/art/style_target.jpg`: dynamic poses (leaning, jumping, kneeling solo), 3/4 body turn.
- Expressions during play: rock face on a perfect streak, shout on a crowd surf, wince on a miss.
- More hair (shaggy, side-swept, afro puffs), jackets with popped collars, layered tops, jewellery stacks.
- Body extras: prosthetics, wheelchair, vitiligo and birthmark patterns, scars anywhere.

## Next: depth
- **Tours:** chain venues across cities, with travel cost, fatigue and a tour finale. New `tours` table (migration 4) and an event.
- **Rivals:** NPC bands on the charts that you can battle at shared venues.
- **Albums:** bundle 6+ released singles. Chart runs and a release-week event.
- **Bandmate stories:** personality events (the diva walks out before a gig, the prodigy gets poached).
- **Gear:** amps, pedals and drum kits that change your instrument's sound in `Band` and add small skill bonuses.
- **More instrument parts:** chord shapes (two keys at once), hold notes, drum fills.

## Online
- Friends' activity feed (from `follows` + `news`).
- Weekly seasons with leaderboard resets and cosmetic rewards.
- Co-op gigs: two players each perform a part, scores combined.
- Moderation tools for names and bios; report button.

## Platform
- Accessibility pass: full screen-reader labels on the stage, high-contrast mode, larger-text setting, slower tempos.
- Mobile layout for the note highway (on-screen pads).
- Asset pipeline: sprite atlas for venue art, cache headers.
- Admin page: player lookup, balance switches, live event toggles.
