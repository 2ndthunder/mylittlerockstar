<?php
// My Little Rockstar configuration.
// Every setting can be overridden with an environment variable of the same name prefixed MLR_
// (e.g. MLR_DB_DRIVER=mysql). Handy for servers, CI and the test suite.
declare(strict_types=1);

function cfg(string $name, $default)
{
    $v = getenv('MLR_' . $name);
    if ($v === false) return $default;
    return is_int($default) ? (int)$v : (is_float($default) ? (float)$v : $v);
}

// ---- Database ---------------------------------------------------------------
// 'sqlite' needs no setup (great for playing locally).
// 'mysql' for a web host: create a database, then fill in the details below.
// Tables are created and upgraded automatically (lib/migrations.php).
define('DB_DRIVER', cfg('DB_DRIVER', 'sqlite'));
define('DB_SQLITE_PATH', cfg('DB_SQLITE_PATH', __DIR__ . '/data/rockstar.sqlite'));
define('DB_HOST', cfg('DB_HOST', 'localhost'));
define('DB_NAME', cfg('DB_NAME', 'rockstar'));
define('DB_USER', cfg('DB_USER', 'rockstar'));
define('DB_PASS', cfg('DB_PASS', ''));

// ---- Economy & pacing -------------------------------------------------------
define('START_CASH', cfg('START_CASH', 250));
define('ENERGY_REGEN_HOUR', cfg('ENERGY_REGEN_HOUR', 14));   // energy per real hour
define('MOOD_DRIFT_HOUR', cfg('MOOD_DRIFT_HOUR', 2));       // mood drifts toward 60 per hour
define('REST_ENERGY', cfg('REST_ENERGY', 30));
define('REST_COOLDOWN', cfg('REST_COOLDOWN', 20 * 60));

define('PRACTICE_ENERGY', cfg('PRACTICE_ENERGY', 12));
define('WRITE_ENERGY', cfg('WRITE_ENERGY', 18));
define('REHEARSE_ENERGY', cfg('REHEARSE_ENERGY', 18));
define('REHEARSAL_ROOM_COST', cfg('REHEARSAL_ROOM_COST', 15));  // cash per rehearsal once you have bandmates
define('GIG_ENERGY', cfg('GIG_ENERGY', 30));
define('HANGOUT_COST', cfg('HANGOUT_COST', 40));
define('RECORD_COST', cfg('RECORD_COST', 120));    // studio cost to release a single
define('RECRUITS_PER_DAY', cfg('RECRUITS_PER_DAY', 4));
define('ARTIST_SHARE', cfg('ARTIST_SHARE', 0.3));          // band's cut of ticket sales
define('CREW_COST_PER_TIER', cfg('CREW_COST_PER_TIER', 12)); // crew/production cost = this × tier²
define('REPEAT_VENUE_PENALTY', cfg('REPEAT_VENUE_PENALTY', 0.2)); // −20% crowd per show at the same venue in 24h

// ---- Live play vs autopilot -------------------------------------------------
// Playing a song once (accuracy >= LEARN_ACCURACY) teaches it. Learned songs can be played on autopilot.
// Playing live multiplies XP and boosts the show.
define('LEARN_ACCURACY', cfg('LEARN_ACCURACY', 50));
define('LEARN_ENERGY', cfg('LEARN_ENERGY', 8));
define('LIVE_XP_BASE', cfg('LIVE_XP_BASE', 1.25));       // live XP multiplier at 0% accuracy ...
define('LIVE_XP_PER_ACC', cfg('LIVE_XP_PER_ACC', 0.0075)); // ... + this per accuracy point (100% = x2.0)
define('AUTO_SKILL_RATE', cfg('AUTO_SKILL_RATE', 0.6));   // auto practice gives 60% of a live drill's skill gain
define('SKILL_POINTS_PER_LEVEL', cfg('SKILL_POINTS_PER_LEVEL', 3));

// ---- Daily goals ---------------------------------------------------------------
define('DAILY_GOALS', cfg('DAILY_GOALS', 3));

// ---- Security -------------------------------------------------------------------
define('LOGIN_MAX_FAILS', cfg('LOGIN_MAX_FAILS', 8));       // failed logins allowed per window ...
define('LOGIN_WINDOW', cfg('LOGIN_WINDOW', 15 * 60));       // ... per username + IP

// Minimum seconds a live minigame must take per song before results are accepted (anti-cheat).
define('MIN_SECONDS_PER_SONG', cfg('MIN_SECONDS_PER_SONG', 12));
