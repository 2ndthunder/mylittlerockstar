# API

Every call is `POST api.php?action=<name>` with a JSON body. Responses are JSON:

```json
{ "ok": true, "message": "optional toast text", "state": { … }, "notices": [{ "text": "…", "kind": "achievement" }] }
{ "ok": false, "error": "Human-readable reason" }
```

Actions that change the game return the fresh `state`, so the client just re-renders.
Auth is a PHP session cookie named `mlr_session`.

| Action | Body | What it does |
|---|---|---|
| `catalog` | — | Static game data (skills, genres, backstory, venues, moves, costs). |
| `register` | `username`, `password` | Create an account and log in. |
| `login` | `username`, `password` | Log in (throttled after repeated failures). |
| `logout` | — | End the session. |
| `state` | — | Full game state for the logged-in player (rockstar, band, songs, gigs, goals, notices). |
| `create` | `stageName`, `bandName`, `genre`, `backstory{…}`, `appearance{…}`, `gender`, `pronouns`, … | Create your rockstar. |
| `update_look` | `appearance{…}` | Restyle (only owned/unlocked items). |
| `update_profile` | `bio`, `hometown`, `realName`, `pronouns`, … | Edit profile text. |
| `buy` | `group`, `id` | Buy a wardrobe item. |
| `rest` | — | Recover energy (cooldown). |
| `write_song` | `theme`, `genre`, `bpm`, `title?`, `lyrics?` | Write a song. |
| `release` | `song` | Release a song as a single. |
| `recruits` | — | Today's recruit list. |
| `hire` | `slot` | Sign a recruit. |
| `fire` | `member` | Fire a bandmate. |
| `hangout` | — | Spend time with the band (+chemistry, +mood). |
| `practice_start` | `skill` | Start a live practice run; returns a run token and chart. |
| `practice_finish` | `token`, `result{accuracy,wpm,combo}` | Score it. |
| `practice_auto` | `skill` | Practise on autopilot (smaller gains). |
| `learn_start` | `song` | Start learning a song (play it once). |
| `learn_finish` | `token`, `result` | ≥ 50% accuracy marks the song learned (autopilot unlocked). |
| `rehearse_start` | `songs[]` | Start a live rehearsal. |
| `rehearse_finish` | `token`, `results[]` | Score it. |
| `rehearse_auto` | `songs[]` | Rehearse learned songs on autopilot. |
| `gig_start` | `venue`, `songs[]`, `modes[]` (live/auto per song) | Start a gig. |
| `gig_finish` | `token`, `results[]`, `moves[]` | Score the show: crowd, money, fans, fame, review. |
| `spend_point` | `skill` | Spend a skill point (+2). |
| `claim_goal` | `slot` | Claim a finished daily goal. |
| `achievements` | — | All achievements with progress. |
| `profile` | `name` | Public profile of any rockstar. |
| `follow` | `name`, `on` | Follow or unfollow. |
| `leaderboard` | `by` = fame | level · fans · wpm · gigs · Top 50. |

## Performance runs

Live play is two calls. `*_start` returns `{ token, chart }`; the client plays the chart (typing or note highway) and
sends `*_finish` with the token and the result. The server rejects unknown, reused or impossibly fast tokens and clamps
accuracy to 0–100 and WPM to a sane maximum.
