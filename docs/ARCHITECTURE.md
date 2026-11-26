# Architecture

My Little Rockstar is a plain PHP + vanilla JS game with no framework and no build step. It runs on any PHP 8.1+ host.

```
browser ──fetch──▶ api.php ──▶ lib/game.php (rules) ──▶ lib/db.php (PDO: SQLite or MySQL)
   │                   │              │
   │                   │              └─ emit() ──▶ lib/progress.php (counters, achievements, daily goals)
   │                   └─ lib/social.php (profiles, follows, leaderboards), lib/security.php (throttling)
   └─ assets/js: app.js (UI) · creator.js (designer) · avatar.js (SVG renderer) · stage.js (rhythm engine + synth band)
```

## Server

| File | Job |
|---|---|
| `config.php` | Every setting. Each one can be overridden with an environment variable `MLR_<NAME>` (e.g. `MLR_DB_DRIVER=mysql`). |
| `api.php` | One JSON endpoint: `POST api.php?action=…`. Sessions, CSRF-free JSON (same-origin cookie, `SameSite=Lax`), error logging to `data/error.log`. |
| `lib/db.php` | Connection, the version-1 base schema, SQL helpers that differ between SQLite and MySQL (`insert_ignore`, `sql_min`, `sql_max`). |
| `lib/migrations.php` | Numbered migrations. Runs automatically on the first request after an upgrade; tracked in `schema_version`. |
| `lib/catalog.php` | Static game data: skills, genres, backstory, venues, fame tiers, stage moves, names. |
| `lib/looks.php` | Validates appearance JSON against `assets/data/catalog.json`; generates random NPC looks. |
| `lib/game.php` | All rules. Every player action is an `act_*` function that loads, mutates and saves the rockstar, then `emit()`s an event. |
| `lib/progress.php` | Event bus (`on`/`emit`), counters, 25 achievements, daily goals, toast notices. |
| `lib/social.php` | Public profiles, follow, leaderboards by category. |
| `lib/security.php` | Login throttling by IP + username. |

### Rules of thumb

* **Rules live in `lib/game.php` only.** The client is never trusted for outcomes: it reports a performance result
  (accuracy, WPM, combo) for a *run token* the server issued, and the server checks the token, the elapsed time and
  clamps the numbers before applying them (`start_run` / `finish_run`).
* **New feature that reacts to play?** Don't edit the action. Subscribe to its event in `lib/progress.php`
  (`on('gig', fn($rid, $data) => …)`).
* **Schema change?** Add migration `4` in `lib/migrations.php`, run `php tools/export_schema.php`, run the tests.
* **Balance change?** Edit `config.php`, then `php tools/simulate.php 30 75 50` to see the 30-day curve.

## Client

| File | Job |
|---|---|
| `assets/js/app.js` | Screens (Home, Practice, Songs, Band, Gigs, Wardrobe, Profile, Charts), modals, toasts, settings. |
| `assets/js/creator.js` | The character designer, used for new characters and the wardrobe. |
| `assets/js/avatar.js` | Draws a character as layered SVG from an appearance object. Pure function: same input, same picture. |
| `assets/js/stage.js` | `Stage.play()` runs a performance: typing lyrics or an instrument note highway, or autopilot for learned songs. `Band` synthesises drums, bass, chords and lead with WebAudio. |
| `assets/data/catalog.json` | Every customisation option, shared by PHP (validation, prices) and JS (designer, renderer). |

The page sends a strict Content-Security-Policy (`index.php`): scripts must be same-origin files, so never use inline
`onclick=` handlers. Use `data-*` attributes and listeners instead.

## Data

One rockstar per account. A rockstar has one band; a band has up to `MAX_BAND` bandmates. Songs, gigs, news, wardrobe,
counters, achievements and daily goals all hang off the rockstar id. See `sql/schema.mysql.sql` for the full schema.

## Testing and tools

```
php tests/run.php                      # 15 integration tests on in-memory SQLite
MLR_DB_DRIVER=mysql MLR_DB_NAME=mlr_test MLR_DB_USER=… MLR_DB_PASS=… php tests/run.php   # same tests on MySQL
php tools/simulate.php [days] [accuracy] [live%]   # balance curve
php tools/export_schema.php            # regenerate sql/schema.*.sql from the migrations
php tools/seed_demo.php [count]        # demo rockstars for the charts (--remove to undo)
```
