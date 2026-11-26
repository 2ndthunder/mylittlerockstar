<?php
// Balance simulator: plays the real game rules for N in-game days and prints the progression curve.
// Use it after changing numbers in config.php / lib/catalog.php to see how fast players level and get famous.
//
//   php tools/simulate.php [days=30] [accuracy=75] [livePercent=50]
//
// Each simulated day the player gets a full energy bar plus two rests, writes/learns songs when needed,
// rehearses, and plays the best venue they've unlocked. "accuracy" is how well they play live.
declare(strict_types=1);

putenv('MLR_DB_DRIVER=sqlite');
putenv('MLR_DB_SQLITE_PATH=:memory:');
putenv('MLR_MIN_SECONDS_PER_SONG=0');
putenv('MLR_REST_COOLDOWN=0');
require __DIR__ . '/../config.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/catalog.php';
require __DIR__ . '/../lib/looks.php';
require __DIR__ . '/../lib/game.php';
require __DIR__ . '/../lib/progress.php';
require __DIR__ . '/../lib/social.php';
$_SESSION = [];

$days = (int)($argv[1] ?? 30);
$acc = (float)($argv[2] ?? 75);
$livePct = (int)($argv[3] ?? 50);

db()->prepare('INSERT INTO users (username, pass_hash, created_at) VALUES (?,?,?)')->execute(['sim', 'x', time()]);
$uid = (int)db()->lastInsertId();
create_rockstar($uid, ['stageName' => 'Sim Star', 'bandName' => 'The Simulations', 'genre' => 'punk', 'age' => 21,
    'backstory' => ['origin' => 'smalltown', 'upbringing' => 'garage', 'influence' => 'punk', 'motivation' => 'fame', 'trait' => 'wildchild'],
    'appearance' => random_appearance('guitar', 1)]);
$R = fn() => load_rockstar($uid);
$try = function (callable $fn) { try { return $fn(); } catch (GameError $e) { return null; } };
$res = fn() => ['accuracy' => max(0, min(100, $acc + mt_rand(-10, 10))), 'wpm' => 50, 'combo' => 10];
$live = fn() => mt_rand(1, 100) <= $livePct;

printf("%-4s %-5s %-7s %-17s %-8s %-7s %-6s %-5s\n", 'Day', 'Lvl', 'Fame', 'Tier', 'Fans', 'Cash', 'Songs', 'Band');
for ($day = 1; $day <= $days; $day++) {
    $GLOBALS['mlr_today'] = gmdate('Y-m-d', time() + $day * 86400);
    db()->prepare('UPDATE rockstars SET energy = 100, last_rest = 0 WHERE user_id = ?')->execute([$uid]);
    db()->prepare('UPDATE gigs SET played_at = played_at - 86400')->execute();   // yesterday's shows are a day older
    for ($restLeft = 2; ; ) {
        $r = $R();
        $st = public_state($uid);
        $songs = $st['songs'];
        $unlearned = array_values(array_filter($songs, fn($s) => !$s['learned']));
        $did = null;
        if (count($songs) < 3 + intdiv($day, 5)) $did = $try(fn() => act_write_song($r, ['theme' => array_rand(SONG_THEMES)]));
        elseif ($unlearned) { $t = $try(fn() => act_learn_start($r, $unlearned[0]['id'])); if ($t) $did = $try(fn() => act_learn_finish($R(), $t['token'], $res())); }
        elseif (count($st['band']['members']) < 4 && $r['cash'] > 400 && ($c = recruits($r))) $did = $try(fn() => act_hire($r, $c[0]['slot']));
        else {
            // best unlocked venue
            $venue = 'openmic';
            foreach (VENUES as $k => $v) if ($r['fame'] >= $v['fame'] && count($songs) >= $v['songs'][0]) $venue = $k;
            $set = array_slice(array_column($songs, 'id'), 0, VENUES[$venue]['songs'][1]);
            $modes = array_map(fn() => $live() ? 'live' : 'auto', $set);
            $g = $try(fn() => act_gig_start($r, $venue, $set, $modes));
            if ($g) $did = $try(fn() => act_gig_finish($R(), $g['token'], array_map(fn($m) => $m === 'live' ? $res() : null, $modes), ['banter', 'solo']));
            elseif (($t = $try(fn() => act_rehearse_start($r, array_slice(array_column($songs, 'id'), 0, 3))))) $did = $try(fn() => act_rehearse_finish($R(), $t['token'], [$res(), $res(), $res()]));
        }
        if ($did) continue;
        if ($restLeft-- > 0) { db()->prepare('UPDATE rockstars SET last_rest = 0 WHERE user_id = ?')->execute([$uid]); $try(fn() => act_rest($R())); continue; }
        break;
    }
    foreach (daily_goals(rockstar_id($uid)) as $g) if ($g['done'] && !$g['claimed']) $try(fn() => act_claim_goal($R(), $g['slot']));
    $r = $R(); $st = public_state($uid);
    printf("%-4d %-5d %-7d %-17s %-8d %-7d %-6d %-5d\n", $day, $r['level'], $r['fame'], fame_tier((int)$r['fame'])['name'], $r['fans'], $r['cash'], count($st['songs']), count($st['band']['members']));
}
$ach = array_filter(achievements_view(rockstar_id($uid)), fn($a) => $a['unlocked']);
echo "\nAchievements unlocked: " . count($ach) . '/' . count(ACHIEVEMENTS) . ' — ' . implode(', ', array_column($ach, 'name')) . "\n";
