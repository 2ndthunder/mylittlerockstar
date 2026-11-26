<?php
// My Little Rockstar test suite. Runs the real game rules against a fresh in-memory database.
//   php tests/run.php
// Exit code 0 = all passed. Add tests at the bottom with test('name', function () { ... });
declare(strict_types=1);

// Default: in-memory SQLite. To test MySQL, set MLR_DB_DRIVER=mysql plus MLR_DB_NAME/USER/PASS for an EMPTY test database.
if (!getenv('MLR_DB_DRIVER')) { putenv('MLR_DB_DRIVER=sqlite'); putenv('MLR_DB_SQLITE_PATH=:memory:'); }
putenv('MLR_MIN_SECONDS_PER_SONG=0');
putenv('MLR_REST_COOLDOWN=0');

require __DIR__ . '/../config.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/catalog.php';
require __DIR__ . '/../lib/looks.php';
require __DIR__ . '/../lib/game.php';
require __DIR__ . '/../lib/progress.php';
require __DIR__ . '/../lib/social.php';
require __DIR__ . '/../lib/security.php';

$_SESSION = [];
$GLOBALS['tests'] = [];
$GLOBALS['pass'] = 0;
$GLOBALS['fail'] = 0;

function test(string $name, callable $fn): void { $GLOBALS['tests'][] = [$name, $fn]; }
function ok($cond, string $msg = 'assertion failed'): void { if (!$cond) throw new RuntimeException($msg); }
function eq($a, $b, string $msg = ''): void { if ($a !== $b) throw new RuntimeException(($msg ? "$msg: " : '') . 'expected ' . var_export($b, true) . ', got ' . var_export($a, true)); }
function throws(callable $fn, string $contains = ''): void
{
    try { $fn(); } catch (GameError $e) { if ($contains && stripos($e->getMessage(), $contains) === false) throw new RuntimeException("wrong error: {$e->getMessage()}"); return; }
    throw new RuntimeException('expected a GameError' . ($contains ? " containing '$contains'" : ''));
}

/** Fresh player with a rockstar; returns user id. */
function new_player(string $name = null, string $instrument = 'guitar'): int
{
    static $n = 0; $n++;
    $name ??= "player$n";
    db()->prepare('INSERT INTO users (username, pass_hash, created_at) VALUES (?,?,?)')->execute([$name, password_hash('secret1', PASSWORD_DEFAULT), time()]);
    $uid = (int)db()->lastInsertId();
    create_rockstar($uid, [
        'stageName' => ucfirst($name), 'pronouns' => 'they/them', 'gender' => 'nonbinary', 'age' => 22,
        'backstory' => ['origin' => 'smalltown', 'upbringing' => 'garage', 'influence' => 'punk', 'motivation' => 'fame', 'trait' => 'wildchild'],
        'appearance' => random_appearance($instrument, $n), 'bandName' => ucfirst($name) . ' Band', 'genre' => 'punk',
    ]);
    return $uid;
}
function R(int $uid): array { return load_rockstar($uid); }
function refill(int $uid): void { db()->prepare('UPDATE rockstars SET energy = 100, cash = cash + 2000 WHERE user_id = ?')->execute([$uid]); }
function song_id(int $uid, int $i = 0): int { return (int)public_state($uid)['songs'][$i]['id']; }
function result(float $acc): array { return ['accuracy' => $acc, 'wpm' => 40, 'combo' => 10]; }

/* ================================================================== tests */

test('migrations run and are recorded', function () {
    eq(schema_version(db()), max(array_keys(migrations())));
    ok(column_exists(db(), 'songs', 'learned'));
    ok(column_exists(db(), 'rockstars', 'skill_points'));
});

test('creating a rockstar applies backstory and starting cash', function () {
    $r = R(new_player());
    ok($r['stamina'] > 10, 'small town should boost stamina');
    eq((int)$r['level'], 1);
    eq((int)$r['cash'], START_CASH);
});

test('appearance validation blocks locked shop items', function () {
    $look = random_appearance('guitar', 5);
    $look['outfit']['hat'] = ['id' => 'crown'];
    throws(fn() => clean_appearance($look, [], 0, true), 'fame');
    $look['outfit']['hat'] = ['id' => 'none'];
    $clean = clean_appearance($look, [], 0, true);
    eq($clean['outfit']['hat']['id'], 'none');
});

test('songs must be learned before autopilot', function () {
    $u = new_player(); refill($u);
    act_write_song(R($u), ['theme' => 'party']);
    $sid = song_id($u);
    throws(fn() => act_rehearse_auto(R($u), [$sid]), 'learned');
    $run = act_learn_start(R($u), $sid);
    $res = act_learn_finish(R($u), $run['token'], result(40));
    eq($res['learned'], false, 'below threshold');
    $run = act_learn_start(R($u), $sid);
    $res = act_learn_finish(R($u), $run['token'], result(80));
    eq($res['learned'], true);
    $auto = act_rehearse_auto(R($u), [$sid]);
    eq($auto['live'], false);
});

test('live play earns more XP than autopilot', function () {
    $u = new_player(); refill($u);
    act_write_song(R($u), ['theme' => 'road']);
    $sid = song_id($u);
    $run = act_learn_start(R($u), $sid); act_learn_finish(R($u), $run['token'], result(90));
    refill($u);
    $auto = act_rehearse_auto(R($u), [$sid]);
    refill($u);
    $run = act_rehearse_start(R($u), [$sid]);
    $live = act_rehearse_finish(R($u), $run['token'], [result(90)]);
    ok($live['xp'] > $auto['xp'] * 1.5, "live {$live['xp']} vs auto {$auto['xp']}");
});

test('minigame tokens cannot be reused', function () {
    $u = new_player(); refill($u);
    $run = act_practice_start(R($u), 'musicianship');
    act_practice_finish(R($u), $run['token'], result(70));
    throws(fn() => act_practice_finish(R($u), $run['token'], result(70)), 'expired');
});

test('gig with mixed live/auto songs pays out and counts', function () {
    $u = new_player(); refill($u);
    act_write_song(R($u), ['theme' => 'party']); act_write_song(R($u), ['theme' => 'rebellion']);
    $a = song_id($u, 0); $b = song_id($u, 1);
    $run = act_learn_start(R($u), $a); act_learn_finish(R($u), $run['token'], result(85));
    refill($u);
    throws(fn() => act_gig_start(R($u), 'openmic', [$b], ['auto']), 'learned');
    $g = act_gig_start(R($u), 'openmic', [$a, $b], ['auto', 'live']);
    $out = act_gig_finish(R($u), $g['token'], [null, result(90)], ['banter']);
    ok($out['result']['attendance'] > 0);
    eq($out['result']['liveSongs'], 1);
    eq($out['result']['autoSongs'], 1);
    eq(counters(rockstar_id($u))['gigs'] ?? 0, 1);
});

test('venues are locked by fame', function () {
    $u = new_player(); refill($u);
    act_write_song(R($u), ['theme' => 'party']); act_write_song(R($u), ['theme' => 'party']);
    throws(fn() => act_gig_start(R($u), 'arena', [song_id($u, 0), song_id($u, 1)], []), 'fame');
});

test('levelling up grants skill points that can be spent', function () {
    $u = new_player();
    grant(rockstar_id($u), 0, 500);
    $r = R($u);
    ok($r['level'] >= 2, 'should level up');
    ok($r['skill_points'] >= SKILL_POINTS_PER_LEVEL);
    $before = $r['charisma'];
    act_spend_point($r, 'charisma');
    eq(R($u)['charisma'], $before + 2);
});

test('recruiting and firing bandmates', function () {
    $u = new_player(); refill($u);
    $c = recruits(R($u))[0];
    act_hire(R($u), $c['slot']);
    $band = band_of(R($u));
    eq(count(bandmates((int)$band['id'])), 1);
    throws(fn() => act_hire(R($u), $c['slot']), 'no longer available');
    act_fire(R($u), (int)bandmates((int)$band['id'])[0]['id']);
    eq(count(bandmates((int)$band['id'])), 0);
    eq(counters(rockstar_id($u))['fires'] ?? 0, 1);
});

test('achievements unlock from events and pay rewards', function () {
    $u = new_player(); refill($u);
    $cash = (int)R($u)['cash'];
    act_write_song(R($u), ['theme' => 'party']);
    $ach = array_column(achievements_view(rockstar_id($u)), 'unlocked', 'key');
    ok($ach['first_song'], 'First Draft should unlock');
    ok((int)R($u)['cash'] >= $cash + ACHIEVEMENTS['first_song']['cash'], 'reward paid');
});

test('daily goals are generated, progress and can be claimed', function () {
    $u = new_player(); refill($u);
    $rid = rockstar_id($u);
    $goals = daily_goals($rid);
    eq(count($goals), DAILY_GOALS);
    // force a known goal for the test
    db()->prepare("UPDATE daily_goals SET gkey = 'practices', target = 1, progress = 0 WHERE rockstar_id = ? AND slot = 0")->execute([$rid]);
    act_practice_auto(R($u), 'stamina');
    $g = daily_goals($rid)[0];
    ok($g['done'], 'goal should be done');
    $res = act_claim_goal(R($u), 0);
    ok(str_contains($res['message'], 'reward'));
    throws(fn() => act_claim_goal(R($u), 0), 'claimed');
});

test('public profiles, follows and leaderboards', function () {
    $a = new_player('alpha'); $b = new_player('bravo');
    $p = public_profile('Bravo', rockstar_id($a));
    eq($p['stageName'], 'Bravo');
    act_follow(rockstar_id($a), 'Bravo', true);
    eq(public_profile('Bravo', rockstar_id($a))['followers'], 1);
    throws(fn() => act_follow(rockstar_id($a), 'Alpha', true), 'yourself');
    foreach (array_keys(LEADERBOARDS) as $by) ok(count(leaderboard($by)) >= 2, "leaderboard $by");
});

test('login throttling kicks in after repeated failures', function () {
    for ($i = 0; $i < LOGIN_MAX_FAILS; $i++) login_failed('victim');
    throws(fn() => login_throttle('victim'), 'too many');
    login_throttle('someone_else');   // other users unaffected
    ok(true);
});

test('stage moves need the right venue tier', function () {
    ok(MOVES['pyro']['minTier'] > VENUES['openmic']['tier']);
});

test('appearance sliders, stance and fit are validated and clamped', function () {
    $look = random_appearance('guitar', 42);
    $look['body']['muscle'] = 999; $look['face']['jaw'] = -400; $look['face']['eyeSize'] = 'abc';
    $look['stance'] = 'moonwalk'; $look['outfit']['bottom']['fit'] = 'baggy'; $look['outfit']['shoes']['fit'] = 'baggy';
    $clean = clean_appearance($look, [], 0, true);
    eq($clean['body']['muscle'], 50); eq($clean['face']['jaw'], -50); eq($clean['face']['eyeSize'], 0);
    eq($clean['stance'], 'wide'); eq($clean['outfit']['bottom']['fit'], 'baggy');
    ok(!isset($clean['outfit']['shoes']['fit']), 'fit only on clothing');
    eq(count($clean['body']), count(slider_ids('body')));
});

test('outfit presets save, validate and delete', function () {
    $u = new_player('presety'); $r = load_rockstar($u);
    $look = json_decode($r['appearance'], true);
    act_save_preset($r, 0, 'Stage night', $look);
    act_save_preset($r, 0, 'Stage night v2', $look);          // overwrite the same slot
    $p = presets_of((int)$r['id']); eq(count($p), 1); eq($p[0]['name'], 'Stage night v2');
    throws(fn() => act_save_preset($r, 99, 'x', $look), 'slot');
    $look['outfit']['belt'] = ['id' => 'bullet'];               // shop item with a fame lock
    throws(fn() => act_save_preset($r, 1, 'Cheat', $look), 'fame');
    act_delete_preset($r, 0); eq(count(presets_of((int)$r['id'])), 0);
});

test('every starter archetype builds a renderable look; recruits use them', function () {
    $roles = array_keys(BAND_ROLES);
    foreach (looks()['archetypes'] as $ar) {
        ok(in_array($ar['instrument'], $roles, true), "{$ar['id']} has a band role");
        $look = archetype_appearance($ar['id'], 7);
        eq($look['instrument']['type'], $ar['instrument']);
        // only shop/fame locks may fail validation — never an unknown item
        try { clean_appearance($look, [], 10 ** 9, true); }
        catch (GameError $e) { ok(str_contains($e->getMessage(), 'shop item'), "{$ar['id']}: " . $e->getMessage()); }
    }
    foreach ($roles as $r) { $l = random_appearance($r, 1234); eq($l['instrument']['type'], $r); }
    ok(count(archetypes_for('horns')) >= 2, 'horn archetypes');
});

/* ================================================================== runner */

foreach ($GLOBALS['tests'] as [$name, $fn]) {
    try { $fn(); $GLOBALS['pass']++; echo "  ✓ $name\n"; }
    catch (Throwable $e) { $GLOBALS['fail']++; echo "  ✗ $name\n      " . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ")\n"; }
}
echo "\n{$GLOBALS['pass']} passed, {$GLOBALS['fail']} failed\n";
exit($GLOBALS['fail'] ? 1 : 0);
