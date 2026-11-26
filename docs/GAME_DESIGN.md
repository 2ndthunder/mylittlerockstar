# My Little Rockstar — design foundation & roadmap

## Pillars

1. **Customization is everything.** A rockstar is built from independent layers: body, face, hair, makeup, clothing,
   tattoos, piercings, instrument. Every layer has free colour choice. Identity (gender, pronouns) is free-form and
   never affects gameplay. Backstory is the only thing that shapes starting stats.
2. **Skill you can feel.** Rehearsals and shows are played on the keyboard. Typing speed and accuracy matter as much as
   the character's stats, so players improve along with their rockstar.
3. **The band is people.** Bandmates have looks, personalities, wages and loyalty. Hiring, firing and keeping them happy
   are real decisions.
4. **Fame is a ladder.** Each fame tier unlocks venues, gear and stage moves, so there is always a next stage.

## Core loop

```
practice (skills) ─┐
write songs ───────┼─> rehearse (tightness, chemistry) ─> gig (cash, fans, fame) ─> unlock venues + gear ─┐
recruit/fire band ─┘                                       └─> release singles (passive streams) ─────────┘
           energy & mood gate the pace; rest and real time restore them
```

## Data model (see lib/db.php)

| Table | Purpose |
|---|---|
| users | accounts |
| rockstars | identity, backstory JSON, appearance JSON, six skills, energy, mood, cash, fame, fans |
| bands | name, genre, chemistry |
| bandmates | NPCs: role, personality, skill, loyalty, wage, appearance JSON |
| songs | title, genre, theme, BPM, lyrics JSON (the typing chart), quality, tightness, streams |
| gigs | history with performance, crowd, earnings, review |
| wardrobe | purchased item keys like `outfit.top.corset` |
| news | the feed on the home screen |
| recruit_log | which daily recruits were already signed |

Appearance and backstory are JSON on purpose: new customization options never need a migration.

## Performance formula (lib/game.php → act_gig_finish)

```
performance = 34% typing accuracy + 14% song quality + 14% tightness + 12% stage presence/charisma
            + 8% main skill + 10% bandmate skill × band fullness + 8% chemistry + mood bonus ± stage moves
crowd       = venue capacity × draw(fans, fame, venue tier)
money       = crowd × ticket × performance factor − wages − effects
fans        = crowd × performance² × charisma factor
```

Anti-cheat: each typing run starts on the server (`*_start`), which issues a token and remembers the songs. Results are
only accepted if at least 12 seconds per song have passed, and all scores are clamped server-side.

## Accessibility

* Big type, high contrast, visible focus, full keyboard control, screen-reader announcements.
* Typing difficulty settings, plus **call-outs** that speak each word before it arrives, so shows can be played by ear.
* Reduced motion is respected.

## Roadmap ideas (next steps on this foundation)

* **More art:** more Gemini venues (recording studio, TV talk show, world-tour cities), crowd and pyro sprite effects, item icons for the shop.
* **Character turnarounds:** side and back views, more poses (jump, knee slide, crowd surf), emotes.
* **Typing modes:** instrument-specific charts (guitar riffs as letter patterns, drum fills on home-row keys), solos with speed bursts, duet lines for bandmates.
* **Band life:** bandmate events (creative differences, poaching by rivals), bandmate requests, a loyalty-driven storyline.
* **Career:** managers, record labels and contracts, music videos, merch stand, tours across multiple days, rival NPC bands.
* **Social:** visit other players' bands, battle-of-the-bands typing duels, shared festival line-ups.
* **Progression:** achievements, signature stage moves unlocked by backstory, legendary gear.
