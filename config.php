<?php
// My Little Rockstar configuration.
declare(strict_types=1);

// ---- Database ---------------------------------------------------------------
// 'sqlite' needs no setup (great for playing locally).
// 'mysql' for a web host: create a database, then fill in the details below.
// Tables are created automatically on first run (or import sql/schema.mysql.sql yourself).
const DB_DRIVER = 'sqlite';
const DB_SQLITE_PATH = __DIR__ . '/data/rockstar.sqlite';
const DB_HOST = 'localhost';
const DB_NAME = 'rockstar';
const DB_USER = 'rockstar';
const DB_PASS = '';

// ---- Economy & pacing -------------------------------------------------------
const START_CASH        = 250;
const ENERGY_REGEN_HOUR = 14;     // energy per real hour
const MOOD_DRIFT_HOUR   = 2;      // mood drifts toward 60 per hour
const REST_ENERGY       = 30;
const REST_COOLDOWN     = 20 * 60;

const PRACTICE_ENERGY   = 12;
const WRITE_ENERGY      = 18;
const REHEARSE_ENERGY   = 18;
const REHEARSAL_ROOM_COST = 15;   // cash per rehearsal once you have bandmates
const GIG_ENERGY        = 30;
const HANGOUT_COST      = 40;
const RECORD_COST       = 120;    // studio cost to release a single

const RECRUITS_PER_DAY  = 4;

// ---- Live play vs autopilot ----------------------------------------------------
// Typing a song once teaches it (accuracy >= LEARN_ACCURACY). Learned songs can be played on autopilot.
// Playing live (typing) multiplies XP and boosts the show.
const LEARN_ACCURACY   = 50;
const LEARN_ENERGY     = 8;
const LIVE_XP_BASE     = 1.25;   // live XP multiplier at 0% accuracy ...
const LIVE_XP_PER_ACC  = 0.0075; // ... + this per accuracy point (100% accuracy = x2.0)
const AUTO_SKILL_RATE  = 0.6;    // auto practice gives 60% of a live drill's skill gain
const SKILL_POINTS_PER_LEVEL = 3;

// Minimum seconds a minigame must take per song before results are accepted (anti-cheat).
const MIN_SECONDS_PER_SONG = 12;
