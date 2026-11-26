# Roadmap

Where the game goes next, roughly in order. Each item lists where it plugs in.

## Now: characters and the designer
- Character pass #2 toward `assets/art/style_target.jpg`: fuller bodies, muscle shapes, baggy clothes, round white
  eyes with small pupils, sharp grins, angular jaws. (`avatar.js`)
- Body sliders (height, head size, shoulders, chest, waist, hips, arm and leg thickness, muscle) and face sliders
  (eye size and spacing, brow tilt, nose size, mouth width, jaw width). (`catalog.json` + `looks.php` validation)
- Per-item fit: skinny, regular, baggy.
- Designer: face close-up, pose and expression preview, undo and redo, saved outfit presets.

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
