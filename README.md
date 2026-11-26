# My Little Rockstar

Raise your rockstar from garage nobody to stadium legend. Build them from the ground up — body, face, hair, makeup,
clothes, tattoos, piercings, instrument, identity and backstory — then recruit (and fire) bandmates, write songs, and
**type your way through rehearsals and live shows**.

PHP 8.1+ · JavaScript · HTML/CSS · SQL (MySQL/MariaDB or SQLite).

## Run it on Windows

1. Install PHP once: open PowerShell and run `winget install PHP.PHP.8.4`, then close PowerShell.
2. Double-click **`start.bat`**. It opens http://localhost:8001 in your browser.
3. Keep the black window open while you play; close it to stop.

Locally the game uses SQLite (`data/rockstar.sqlite`), so there is nothing to set up.

## Run it on a web host (MySQL)

1. Create a MySQL/MariaDB database and user.
2. In `config.php` set `DB_DRIVER = 'mysql'` and fill in `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`.
3. Upload the folder. Tables are created automatically on first visit, or import `sql/schema.mysql.sql` yourself.

`.htaccess` files block web access to `config.php`, `data/`, `lib/`, `sql/`, `tools/` and `raw/` on Apache.
On nginx, deny those paths yourself.

## How it plays

| System | What happens |
|---|---|
| **Character creator** | 8 steps: identity (any gender incl. non-binary or self-described, any pronouns), body & face, hair & makeup, outfit (patterns, any colour, custom shirt print), tattoos (10 body spots, any ink colour), piercings, instrument (guitar, bass, drums, keytar, vocals, violin + models and finishes), backstory, band. |
| **Backstory** | Origin, upbringing, influence, motivation and trait set your starting skills and give lasting perks (e.g. *Prove them wrong* = better practice, *Wild child* = risky stage moves land more). Gender and pronouns never affect stats. |
| **Typing performance** | Lyrics slide toward a glowing line on the beat over a live-generated backing track for the song's genre and tempo. Type each word as it arrives. Timing + accuracy = performance. Difficulty Chill/Normal/Shred, and *call-outs* that speak each word for play-by-ear. |
| **Practice** | Typing drills that raise one of six skills: musicianship, vocals, songwriting, stage presence, charisma, stamina. |
| **Songs** | Write songs (theme, genre, tempo, optional **your own lyrics**, which become what you type on stage). Quality comes from skills, mood and genre fit. |
| **Rehearsals** | Type 1–3 songs with the band to raise each song's *tightness* and band *chemistry*. |
| **Band** | Up to 4 bandmates. New recruits daily with their own generated look, role, personality (Reliable, Prodigy, Party animal, Diva, Chill), skill and wage. Sign them, hang out, or fire them (severance + chemistry hit). Unhappy, unpaid bandmates may quit. |
| **Gigs** | 8 venues from Open Mic Night to Stadium Headline, unlocked by fame. Pick a setlist, type every song live, and choose a stage move between songs (banter, solo, singalong, crowd surf, pyro, smash your gear). You get a review, crowd size, money, fans and fame. |
| **Singles** | Release tight songs. They stream over time for passive cash and fans. |
| **Wardrobe** | Buy premium items (some need fame) and restyle anytime. |
| **Fame tiers** | Garage Nobody → Open-Mic Regular → Local Buzz → Club Circuit → Rising Star → Headliner → Arena Act → Rock Legend. |

## Develop

```
php tests/run.php                  # integration tests (in-memory SQLite)
php tools/simulate.php 30 75 50    # 30-day balance curve at 75% accuracy, half the songs played live
php tools/export_schema.php        # regenerate sql/schema.*.sql
php tools/seed_demo.php 12         # demo rockstars for the charts (--remove to undo)
```

Every setting in `config.php` can be overridden with an environment variable named `MLR_<SETTING>`
(for example `MLR_DB_DRIVER=mysql`). See `docs/ARCHITECTURE.md`, `docs/API.md` and `docs/ROADMAP.md`.

## Art

* **Venues and stages:** painted by Gemini (`assets/art/`; full-size originals in `raw/`).
* **Characters:** a layered 2.5D SVG renderer (`assets/js/avatar.js`) styled after Gemini's character sheet
  (`assets/art/character_style_sheet.jpg`): big heads (about a third of total height), thick outlines, flat cel colours,
  heavy-lidded eyes, chunky boots. Every part is drawn separately, so any combination works and recolours freely.
* **Style target:** `assets/art/style_target.jpg` is where the character art is heading: thick outlines, flat bold
  colour, big angular faces with round white eyes, sharp grins, spiky hair, baggy clothes.
* `avatar_gallery.html` is a dev page that shows 12 random rockstars; refresh it for new ones.

## Files

```
index.php              page shell
api.php                JSON API
config.php             database + balance settings
lib/db.php             one schema for MySQL and SQLite, auto-migrates
lib/catalog.php        backstory, genres, venues, fame tiers, stage moves, bandmate names, song themes
lib/looks.php          appearance validation + random NPC looks
lib/game.php           rules: ticking, practice, songs, rehearsals, recruiting/firing, gigs, wardrobe
assets/data/catalog.json  every customisation option (shared by PHP and JS); add items here
assets/js/avatar.js    2.5D character renderer
assets/js/creator.js   character creator / look editor
assets/js/stage.js     typing rhythm engine + synthesised backing band
assets/js/app.js       game UI
assets/css/style.css   styles
sql/schema.*.sql       exported schemas (php tools/export_schema.php)
lib/migrations.php     numbered schema migrations
lib/progress.php       event bus, achievements, daily goals
lib/social.php         profiles, follows, leaderboards
lib/security.php       login throttling
tests/run.php          integration tests
tools/                 simulate.php, export_schema.php, seed_demo.php
docs/                  GAME_DESIGN, ARCHITECTURE, API, ROADMAP, GEMINI_PROMPTS
```

## Adding content

* **New clothing/hair/tattoo:** add an entry to `assets/data/catalog.json`, then draw it in the matching function in
  `avatar.js` (e.g. `hairFront`/`hairBack`, `drawTop`, `TATTOO`). Price and fame unlocks work automatically.
* **New venue:** add to `VENUES` in `lib/catalog.php` and drop a 16:9 image in `assets/art/`.
* **Balance:** `config.php` and `lib/catalog.php`.
