<?php
// Fills the charts with demo rockstars so a fresh server doesn't look empty.
//
//   php tools/seed_demo.php [count=12]        add demo rockstars to the configured database
//   php tools/seed_demo.php --remove          delete every demo rockstar again
//
// Demo accounts are named demo_1, demo_2, ... and have an unusable password, so nobody can log into them.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/../config.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/catalog.php';
require __DIR__ . '/../lib/looks.php';
require __DIR__ . '/../lib/game.php';
require __DIR__ . '/../lib/progress.php';

$pdo = db();
if (($argv[1] ?? '') === '--remove') {
    $ids = $pdo->query("SELECT u.id FROM users u WHERE u.username LIKE 'demo\\_%' ESCAPE '\\'")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $uid) {
        $rid = $pdo->query('SELECT id FROM rockstars WHERE user_id = ' . (int)$uid)->fetchColumn();
        if ($rid) $pdo->exec("DELETE FROM bandmates WHERE band_id IN (SELECT id FROM bands WHERE rockstar_id = $rid)");
        if ($rid) foreach (['bands', 'songs', 'gigs', 'news', 'wardrobe', 'counters', 'achievements', 'daily_goals', 'recruit_log', 'follows', 'look_presets'] as $t) {
            try { $pdo->exec("DELETE FROM $t WHERE " . ($t === 'follows' ? "follower_id = $rid OR followed_id = $rid" : "rockstar_id = $rid")); } catch (PDOException $e) { /* table may not exist on old schemas */ }
        }
        $pdo->exec('DELETE FROM rockstars WHERE user_id = ' . (int)$uid);
        $pdo->exec('DELETE FROM users WHERE id = ' . (int)$uid);
    }
    echo 'Removed ' . count($ids) . " demo rockstars.\n";
    exit;
}

$count = max(1, min(200, (int)($argv[1] ?? 12)));
$start = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE username LIKE 'demo\\_%' ESCAPE '\\'")->fetchColumn() + 1;
$genres = array_keys(GENRES);
$roles = ['guitar', 'bass', 'drums', 'keytar', 'vocals', 'violin'];
$pick = fn(array $a) => $a[array_rand($a)];
$keys = fn(string $k) => array_keys(BACKSTORY[$k]);

for ($i = $start; $i < $start + $count; $i++) {
    $pdo->prepare('INSERT INTO users (username, pass_hash, created_at) VALUES (?,?,?)')->execute(["demo_$i", '!', time()]);
    $uid = (int)$pdo->lastInsertId();
    $name = $pick(FIRST_NAMES) . ' ' . $pick(LAST_NAMES);
    create_rockstar($uid, [
        'stageName' => $name, 'bandName' => 'The ' . $pick(LAST_NAMES) . 's', 'genre' => $pick($genres), 'age' => mt_rand(18, 40),
        'pronouns' => $pick(['she/her', 'he/him', 'they/them']),
        'backstory' => ['origin' => $pick($keys('origin')), 'upbringing' => $pick($keys('upbringing')), 'influence' => $pick($keys('influence')),
            'motivation' => $pick($keys('motivation')), 'trait' => $pick($keys('trait'))],
        'appearance' => random_appearance($pick($roles), mt_rand()),
    ]);
    // a spread from fresh to famous (exponential so most are small)
    $fame = (int)(exp(mt_rand(0, 1000) / 100) - 1);
    $level = max(1, (int)round(log(1 + $fame) * 1.6));
    $pdo->prepare('UPDATE rockstars SET fame = ?, fans = ?, level = ?, gigs_played = ?, best_wpm = ? WHERE user_id = ?')
        ->execute([$fame, (int)($fame * mt_rand(60, 140) / 100), $level, (int)($level * mt_rand(2, 5)), mt_rand(25, 110), $uid]);
    printf("%-22s fame %6d  level %2d\n", $name, $fame, $level);
}
echo "Added $count demo rockstars. Remove them with: php tools/seed_demo.php --remove\n";
