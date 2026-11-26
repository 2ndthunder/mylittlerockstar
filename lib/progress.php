<?php
// Progression layer: event bus, counters, achievements and daily goals.
//
// Game actions call emit('event_name', $rockstarId, [...data]) AFTER they have saved the rockstar.
// Listeners update counters, then achievements and daily goals react to those counters.
// Rewards are applied with direct SQL increments, so they never fight with an unsaved $r array.
//
// Adding an achievement or goal = adding an entry to ACHIEVEMENTS / GOAL_TEMPLATES below.
declare(strict_types=1);

/* ================================================================ event bus */

$GLOBALS['mlr_listeners'] = [];

function on(string $event, callable $fn): void { $GLOBALS['mlr_listeners'][$event][] = $fn; }

/** Fire an event. Returns notifications (unlocked achievements, completed goals) for the UI. */
function emit(string $event, int $rid, array $data = []): array
{
    $GLOBALS['mlr_notices'] ??= [];
    foreach ($GLOBALS['mlr_listeners'][$event] ?? [] as $fn) $fn($rid, $data);
    foreach ($GLOBALS['mlr_listeners']['*'] ?? [] as $fn) $fn($rid, $data + ['event' => $event]);
    return $GLOBALS['mlr_notices'];
}

function notify(string $kind, string $text): void { $GLOBALS['mlr_notices'][] = ['kind' => $kind, 'text' => $text]; }
function take_notices(): array { $n = $GLOBALS['mlr_notices'] ?? []; $GLOBALS['mlr_notices'] = []; return $n; }

/* ================================================================ counters */

/** Lifetime counters per rockstar, e.g. live_songs, gigs, hires, perfect_runs. */
function bump(int $rid, string $key, int $by = 1): void
{
    if ($by === 0) return;
    $up = db()->prepare('UPDATE counters SET value = value + ? WHERE rockstar_id = ? AND ckey = ?');
    $up->execute([$by, $rid, $key]);
    if ($up->rowCount() === 0) {
        db()->prepare(insert_ignore() . ' INTO counters (rockstar_id, ckey, value) VALUES (?,?,0)')->execute([$rid, $key]);
        $up->execute([$by, $rid, $key]);
    }
    goal_progress($rid, $key, $by);
}

function counters(int $rid): array
{
    $st = db()->prepare('SELECT ckey, value FROM counters WHERE rockstar_id = ?');
    $st->execute([$rid]);
    return array_map('intval', array_column($st->fetchAll(), 'value', 'ckey'));
}

/* ================================================================ event → counter wiring */

on('song_written',  fn($rid, $d) => bump($rid, 'songs_written'));
on('song_learned',  fn($rid, $d) => bump($rid, 'songs_learned', $d['count'] ?? 1));
on('practice',      function ($rid, $d) { bump($rid, 'practices'); if (!empty($d['live'])) live_run($rid, $d['accuracy'] ?? 0, 1); });
on('rehearsal',     function ($rid, $d) { bump($rid, 'rehearsals'); if (!empty($d['live'])) live_run($rid, $d['accuracy'] ?? 0, $d['songs'] ?? 1); });
on('learn',         fn($rid, $d) => live_run($rid, $d['accuracy'] ?? 0, 1));
on('gig', function ($rid, $d) {
    bump($rid, 'gigs');
    if (($d['live_songs'] ?? 0) > 0) live_run($rid, $d['live_accuracy'] ?? 0, $d['live_songs']);
    if (($d['stars'] ?? 0) >= 5) bump($rid, 'five_star_gigs');
    foreach ($d['moves'] ?? [] as $m) if ($m['ok'] && $m['key'] === 'surf') bump($rid, 'crowd_surfs');
    if (!empty($d['venue'])) bump($rid, 'venue_' . $d['venue']);
});
on('release',       fn($rid, $d) => bump($rid, 'releases'));
on('hire',          fn($rid, $d) => bump($rid, 'hires'));
on('fire',          fn($rid, $d) => bump($rid, 'fires'));
on('buy',           fn($rid, $d) => bump($rid, 'items_bought'));
on('hangout',       fn($rid, $d) => bump($rid, 'hangouts'));
on('*',             fn($rid, $d) => check_achievements($rid));

function live_run(int $rid, float $accuracy, int $songs): void
{
    bump($rid, 'live_songs', $songs);
    if ($accuracy >= 85) bump($rid, 'great_runs');
    if ($accuracy >= 95) bump($rid, 'perfect_runs');
}

/* ================================================================ achievements */

// type: 'counter' (counters table), 'stat' (rockstars column), 'band' (band size), 'derived' (custom fn)
const ACHIEVEMENTS = [
    'first_song'    => ['name' => 'First Draft',        'desc' => 'Write your first song.',              'icon' => '✍️', 'type' => 'counter', 'key' => 'songs_written', 'n' => 1,   'cash' => 25,   'xp' => 20],
    'songsmith'     => ['name' => 'Songsmith',          'desc' => 'Write 10 songs.',                     'icon' => '📓', 'type' => 'counter', 'key' => 'songs_written', 'n' => 10,  'cash' => 150,  'xp' => 120],
    'quick_study'   => ['name' => 'Quick Study',        'desc' => 'Learn your first song.',              'icon' => '🎯', 'type' => 'counter', 'key' => 'songs_learned', 'n' => 1,   'cash' => 25,   'xp' => 25],
    'repertoire'    => ['name' => 'Deep Repertoire',    'desc' => 'Learn 10 songs.',                     'icon' => '📚', 'type' => 'counter', 'key' => 'songs_learned', 'n' => 10,  'cash' => 200,  'xp' => 150],
    'first_gig'     => ['name' => 'Stage Debut',        'desc' => 'Play your first gig.',                'icon' => '🎤', 'type' => 'counter', 'key' => 'gigs',          'n' => 1,   'cash' => 40,   'xp' => 30],
    'road_warrior'  => ['name' => 'Road Warrior',       'desc' => 'Play 25 gigs.',                       'icon' => '🚐', 'type' => 'counter', 'key' => 'gigs',          'n' => 25,  'cash' => 400,  'xp' => 300],
    'centurion'     => ['name' => 'Centurion',          'desc' => 'Play 100 gigs.',                      'icon' => '💯', 'type' => 'counter', 'key' => 'gigs',          'n' => 100, 'cash' => 2000, 'xp' => 1200],
    'live_wire'     => ['name' => 'Live Wire',          'desc' => 'Play 10 songs live.',                 'icon' => '⚡', 'type' => 'counter', 'key' => 'live_songs',    'n' => 10,  'cash' => 80,   'xp' => 80],
    'live_legend'   => ['name' => 'Live Legend',        'desc' => 'Play 100 songs live.',                'icon' => '🔥', 'type' => 'counter', 'key' => 'live_songs',    'n' => 100, 'cash' => 800,  'xp' => 700],
    'perfect_take'  => ['name' => 'Perfect Take',       'desc' => 'Score 95%+ on a live song.',          'icon' => '💎', 'type' => 'counter', 'key' => 'perfect_runs',  'n' => 1,   'cash' => 120,  'xp' => 120],
    'five_stars'    => ['name' => 'Five-Star Night',    'desc' => 'Get a 5-star review.',                'icon' => '⭐', 'type' => 'counter', 'key' => 'five_star_gigs', 'n' => 1,  'cash' => 200,  'xp' => 150],
    'stage_diver'   => ['name' => 'Stage Diver',        'desc' => 'Land a crowd surf.',                  'icon' => '🏄', 'type' => 'counter', 'key' => 'crowd_surfs',   'n' => 1,   'cash' => 60,   'xp' => 50],
    'speed_demon'   => ['name' => 'Speed Demon',        'desc' => 'Type lyrics at 60+ WPM.',             'icon' => '⌨️', 'type' => 'stat',    'key' => 'best_wpm',      'n' => 60,  'cash' => 100,  'xp' => 100],
    'keyboard_hero' => ['name' => 'Keyboard Hero',      'desc' => 'Type lyrics at 90+ WPM.',             'icon' => '🦸', 'type' => 'stat',    'key' => 'best_wpm',      'n' => 90,  'cash' => 300,  'xp' => 250],
    'full_band'     => ['name' => 'Full Lineup',        'desc' => 'Have 4 bandmates.',                   'icon' => '👥', 'type' => 'band',    'key' => 'members',       'n' => 4,   'cash' => 150,  'xp' => 120],
    'youre_fired'   => ['name' => "You're Fired",       'desc' => 'Fire a bandmate.',                    'icon' => '🚪', 'type' => 'counter', 'key' => 'fires',         'n' => 1,   'cash' => 0,    'xp' => 20],
    'talent_scout'  => ['name' => 'Talent Scout',       'desc' => 'Sign 5 bandmates.',                   'icon' => '🔍', 'type' => 'counter', 'key' => 'hires',         'n' => 5,   'cash' => 100,  'xp' => 100],
    'on_the_radio'  => ['name' => 'On the Radio',       'desc' => 'Release your first single.',          'icon' => '📻', 'type' => 'counter', 'key' => 'releases',      'n' => 1,   'cash' => 80,   'xp' => 60],
    'fashionista'   => ['name' => 'Fashionista',        'desc' => 'Buy 5 wardrobe items.',               'icon' => '🛍️', 'type' => 'counter', 'key' => 'items_bought',  'n' => 5,   'cash' => 100,  'xp' => 80],
    'level_5'       => ['name' => 'Getting Good',       'desc' => 'Reach level 5.',                      'icon' => '🎚️', 'type' => 'stat',    'key' => 'level',         'n' => 5,   'cash' => 100,  'xp' => 0],
    'level_10'      => ['name' => 'Seasoned Pro',       'desc' => 'Reach level 10.',                     'icon' => '🎛️', 'type' => 'stat',    'key' => 'level',         'n' => 10,  'cash' => 300,  'xp' => 0],
    'level_25'      => ['name' => 'Virtuoso',           'desc' => 'Reach level 25.',                     'icon' => '👑', 'type' => 'stat',    'key' => 'level',         'n' => 25,  'cash' => 1500, 'xp' => 0],
    'local_buzz'    => ['name' => 'Local Buzz',         'desc' => 'Reach 500 fame.',                     'icon' => '📣', 'type' => 'stat',    'key' => 'fame',          'n' => 500,   'cash' => 150,  'xp' => 100],
    'headliner'     => ['name' => 'Headliner',          'desc' => 'Reach 25,000 fame.',                  'icon' => '🏟️', 'type' => 'stat',    'key' => 'fame',          'n' => 25000, 'cash' => 2500, 'xp' => 1500],
    'rock_legend'   => ['name' => 'Rock Legend',        'desc' => 'Reach 200,000 fame.',                 'icon' => '🎸', 'type' => 'stat',    'key' => 'fame',          'n' => 200000,'cash' => 10000,'xp' => 5000],
];

function achievement_progress(int $rid, array $a, array $counters, array $row, int $bandSize): int
{
    return match ($a['type']) {
        'counter' => $counters[$a['key']] ?? 0,
        'stat' => (int)($row[$a['key']] ?? 0),
        'band' => $bandSize,
        default => 0,
    };
}

function check_achievements(int $rid): void
{
    $have = db()->prepare('SELECT akey FROM achievements WHERE rockstar_id = ?');
    $have->execute([$rid]);
    $have = array_flip(array_column($have->fetchAll(), 'akey'));
    if (count($have) >= count(ACHIEVEMENTS)) return;
    $row = db()->prepare('SELECT * FROM rockstars WHERE id = ?'); $row->execute([$rid]); $row = $row->fetch();
    if (!$row) return;
    $c = counters($rid);
    $band = db()->prepare('SELECT COUNT(*) FROM bandmates m JOIN bands b ON b.id = m.band_id WHERE b.rockstar_id = ?');
    $band->execute([$rid]); $bandSize = (int)$band->fetchColumn();
    foreach (ACHIEVEMENTS as $key => $a) {
        if (isset($have[$key])) continue;
        if (achievement_progress($rid, $a, $c, $row, $bandSize) < $a['n']) continue;
        db()->prepare(insert_ignore() . ' INTO achievements (rockstar_id, akey, unlocked_at) VALUES (?,?,?)')->execute([$rid, $key, time()]);
        grant($rid, $a['cash'], $a['xp']);
        news($rid, 'milestone', "Achievement unlocked: {$a['icon']} {$a['name']}!");
        notify('achievement', "{$a['icon']} Achievement: {$a['name']}" . ($a['cash'] ? " (+\${$a['cash']})" : ''));
    }
}

function achievements_view(int $rid): array
{
    $st = db()->prepare('SELECT akey, unlocked_at FROM achievements WHERE rockstar_id = ?');
    $st->execute([$rid]);
    $have = array_column($st->fetchAll(), 'unlocked_at', 'akey');
    $row = db()->prepare('SELECT * FROM rockstars WHERE id = ?'); $row->execute([$rid]); $row = $row->fetch();
    $c = counters($rid);
    $band = db()->prepare('SELECT COUNT(*) FROM bandmates m JOIN bands b ON b.id = m.band_id WHERE b.rockstar_id = ?');
    $band->execute([$rid]); $bandSize = (int)$band->fetchColumn();
    $out = [];
    foreach (ACHIEVEMENTS as $key => $a) {
        $out[] = ['key' => $key, 'name' => $a['name'], 'desc' => $a['desc'], 'icon' => $a['icon'], 'target' => $a['n'],
            'progress' => min($a['n'], achievement_progress($rid, $a, $c, $row, $bandSize)),
            'unlocked' => isset($have[$key]), 'reward' => ['cash' => $a['cash'], 'xp' => $a['xp']]];
    }
    return $out;
}

/** Give cash/XP outside the main $r flow (handles level-ups too). */
function grant(int $rid, int $cash, int $xp): void
{
    if (!$cash && !$xp) return;
    $st = db()->prepare('SELECT * FROM rockstars WHERE id = ?'); $st->execute([$rid]); $r = $st->fetch();
    $r['cash'] += $cash;
    if ($xp) add_xp($r, $xp);
    db()->prepare('UPDATE rockstars SET cash = ?, xp = ?, level = ?, skill_points = ? WHERE id = ?')
        ->execute([$r['cash'], $r['xp'], $r['level'], $r['skill_points'], $rid]);
}

/* ================================================================ daily goals */

// counter: which counter advances it; target range; reward scales with difficulty.
const GOAL_TEMPLATES = [
    'live_songs'   => ['text' => 'Play %d songs live',              'counter' => 'live_songs',   'min' => 2, 'max' => 4, 'cash' => 30, 'xp' => 30],
    'gigs'         => ['text' => 'Play %d gig(s)',                  'counter' => 'gigs',         'min' => 1, 'max' => 2, 'cash' => 50, 'xp' => 40],
    'rehearsals'   => ['text' => 'Rehearse %d time(s)',             'counter' => 'rehearsals',   'min' => 1, 'max' => 3, 'cash' => 25, 'xp' => 25],
    'practices'    => ['text' => 'Practice %d time(s)',             'counter' => 'practices',    'min' => 2, 'max' => 3, 'cash' => 20, 'xp' => 20],
    'songs_learned'=> ['text' => 'Learn %d new song(s)',            'counter' => 'songs_learned','min' => 1, 'max' => 1, 'cash' => 50, 'xp' => 50],
    'songs_written'=> ['text' => 'Write %d song(s)',                'counter' => 'songs_written','min' => 1, 'max' => 2, 'cash' => 35, 'xp' => 30],
    'great_runs'   => ['text' => 'Score 85%%+ on %d live song(s)',  'counter' => 'great_runs',   'min' => 1, 'max' => 2, 'cash' => 60, 'xp' => 60],
    'hangouts'     => ['text' => 'Hang out with the band %d time(s)','counter' => 'hangouts',    'min' => 1, 'max' => 1, 'cash' => 20, 'xp' => 20],
];

/** Game calendar day (UTC). Tools like the simulator can override it via \$GLOBALS['mlr_today']. */
function today(): string { return $GLOBALS['mlr_today'] ?? gmdate('Y-m-d'); }

/** Make sure today's goals exist (deterministic per rockstar + day) and return them. */
function daily_goals(int $rid): array
{
    $day = today();
    $st = db()->prepare('SELECT * FROM daily_goals WHERE rockstar_id = ? AND day = ? ORDER BY slot');
    $st->execute([$rid, $day]);
    $rows = $st->fetchAll();
    if (!$rows) {
        mt_srand(crc32("$rid|$day|goals"));
        $keys = array_keys(GOAL_TEMPLATES);
        // hangouts only make sense with bandmates
        $band = db()->prepare('SELECT COUNT(*) FROM bandmates m JOIN bands b ON b.id = m.band_id WHERE b.rockstar_id = ?');
        $band->execute([$rid]);
        if (!(int)$band->fetchColumn()) $keys = array_values(array_diff($keys, ['hangouts']));
        $picked = [];
        while (count($picked) < min(DAILY_GOALS, count($keys))) { $k = $keys[mt_rand(0, count($keys) - 1)]; $picked[$k] = true; }
        $slot = 0;
        foreach (array_keys($picked) as $k) {
            $g = GOAL_TEMPLATES[$k];
            $target = mt_rand($g['min'], $g['max']);
            db()->prepare(insert_ignore() . ' INTO daily_goals (rockstar_id, day, slot, gkey, target, reward_cash, reward_xp) VALUES (?,?,?,?,?,?,?)')
                ->execute([$rid, $day, $slot++, $k, $target, $g['cash'] * $target, $g['xp'] * $target]);
        }
        mt_srand();
        $st->execute([$rid, $day]);
        $rows = $st->fetchAll();
    }
    return array_map(fn($g) => [
        'slot' => (int)$g['slot'], 'key' => $g['gkey'], 'text' => sprintf(GOAL_TEMPLATES[$g['gkey']]['text'] ?? '%d', $g['target']),
        'target' => (int)$g['target'], 'progress' => min((int)$g['target'], (int)$g['progress']),
        'done' => $g['progress'] >= $g['target'], 'claimed' => (bool)$g['claimed'],
        'reward' => ['cash' => (int)$g['reward_cash'], 'xp' => (int)$g['reward_xp']],
    ], $rows);
}

function goal_progress(int $rid, string $counter, int $by): void
{
    $keys = array_keys(array_filter(GOAL_TEMPLATES, fn($g) => $g['counter'] === $counter));
    if (!$keys) return;
    $in = implode(',', array_fill(0, count($keys), '?'));
    $st = db()->prepare("SELECT slot, gkey, target, progress FROM daily_goals WHERE rockstar_id = ? AND day = ? AND claimed = 0 AND gkey IN ($in)");
    $st->execute([$rid, today(), ...$keys]);
    foreach ($st->fetchAll() as $g) {
        $new = (int)$g['progress'] + $by;
        db()->prepare('UPDATE daily_goals SET progress = ? WHERE rockstar_id = ? AND day = ? AND slot = ?')->execute([$new, $rid, today(), $g['slot']]);
        if ($g['progress'] < $g['target'] && $new >= $g['target']) notify('goal', '✅ Daily goal complete: ' . sprintf(GOAL_TEMPLATES[$g['gkey']]['text'], $g['target']) . ' — claim it on Home!');
    }
}

function act_claim_goal(array $r, int $slot): array
{
    $st = db()->prepare('SELECT * FROM daily_goals WHERE rockstar_id = ? AND day = ? AND slot = ?');
    $st->execute([$r['id'], today(), $slot]);
    $g = $st->fetch();
    if (!$g) fail('Goal not found.');
    if ($g['claimed']) fail('Already claimed.');
    if ($g['progress'] < $g['target']) fail('Not finished yet.');
    db()->prepare('UPDATE daily_goals SET claimed = 1 WHERE rockstar_id = ? AND day = ? AND slot = ?')->execute([$r['id'], today(), $slot]);
    grant((int)$r['id'], (int)$g['reward_cash'], (int)$g['reward_xp']);
    return ['message' => "Goal reward: +\${$g['reward_cash']} and +{$g['reward_xp']} XP!"];
}
