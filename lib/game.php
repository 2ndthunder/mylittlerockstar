<?php
// My Little Rockstar — game rules.
declare(strict_types=1);

final class GameError extends RuntimeException {}
function fail(string $msg): never { throw new GameError($msg); }
function clampf(float $v, float $lo, float $hi): float { return max($lo, min($hi, $v)); }
function frand(float $lo = 0, float $hi = 1): float { return $lo + mt_rand() / mt_getrandmax() * ($hi - $lo); }
function clean_text(string $s, int $max, int $min = 0, string $what = 'Text'): string
{
    $s = trim(preg_replace('/\s+/u', ' ', strip_tags($s)));
    preg_match('/^.{0,' . $max . '}/us', $s, $m);   // unicode-safe cut without mbstring
    $s = $m[0] ?? '';
    if ($min && preg_match_all('/./us', $s) < $min) fail("$what needs at least $min characters.");
    return $s;
}

/* =============================================================== loading & ticking */

function fame_tier(int $fame): array
{
    $name = 'Garage Nobody'; $floor = 0; $next = null;
    foreach (FAME_TIERS as $min => $label) {
        if ($fame >= $min) { $name = $label; $floor = $min; }
        elseif ($next === null) $next = $min;
    }
    return ['name' => $name, 'floor' => $floor, 'next' => $next, 'index' => array_search($floor, array_keys(FAME_TIERS))];
}

function perk(array $r, string $p): bool
{
    $b = json_decode($r['backstory'], true);
    return (BACKSTORY['motivation'][$b['motivation']]['perk'] ?? '') === $p;
}
function trait_is(array $r, string $t): bool { return (json_decode($r['backstory'], true)['trait'] ?? '') === $t; }

function load_rockstar(int $uid, bool $required = true): ?array
{
    $st = db()->prepare('SELECT * FROM rockstars WHERE user_id = ?');
    $st->execute([$uid]);
    $r = $st->fetch();
    if (!$r) { if ($required) fail('Create your rockstar first.'); return null; }
    return tick($r);
}

/** Real-time passage: energy regen, mood drift, streaming income. */
function tick(array $r): array
{
    $now = time();
    $hours = max(0, $now - (int)$r['last_tick']) / 3600;
    if ($hours < 1 / 120) return $r;   // ~30s granularity

    $regen = ENERGY_REGEN_HOUR * (trait_is($r, 'nightowl') ? 1.3 : 1) * (1 + $r['stamina'] / 200);
    $r['energy'] = clampf($r['energy'] + $regen * $hours, 0, 100);
    $target = perk($r, 'mood_floor') ? 70 : 60;
    $drift = MOOD_DRIFT_HOUR * $hours;
    $r['mood'] = $r['mood'] > $target ? max($target, $r['mood'] - $drift) : min($target, $r['mood'] + $drift);

    // streaming income from released singles (decays as songs age)
    $band = band_of($r);
    if ($band) {
        $st = db()->prepare('SELECT id, quality, released_at FROM songs WHERE band_id = ? AND released_at IS NOT NULL');
        $st->execute([$band['id']]);
        $totalStreams = 0;
        foreach ($st->fetchAll() as $s) {
            $ageDays = ($now - (int)$s['released_at']) / 86400;
            $rate = pow($s['quality'], 1.6) * 0.35 * (1 + $r['fans'] / 400) * exp(-$ageDays / 21);   // streams per hour
            $n = (int)round($rate * $hours);
            if ($n > 0) {
                db()->prepare('UPDATE songs SET streams = streams + ? WHERE id = ?')->execute([$n, $s['id']]);
                $totalStreams += $n;
            }
        }
        if ($totalStreams) {
            $r['cash'] += (int)floor($totalStreams * 0.004 * (perk($r, 'cash_gain') ? 1.2 : 1));
            $r['fans'] += (int)floor($totalStreams / 1500);
        }
    }
    $r['last_tick'] = $now;
    save_rockstar($r);
    return $r;
}

function save_rockstar(array $r): void
{
    $cols = ['musicianship', 'vocals', 'songwriting', 'stagecraft', 'charisma', 'stamina', 'energy', 'mood', 'cash', 'fame', 'fans',
        'gigs_played', 'best_wpm', 'xp', 'level', 'skill_points', 'last_rest', 'last_tick', 'appearance', 'bio', 'pronouns', 'gender', 'stage_name', 'real_name', 'hometown', 'age'];
    $sql = 'UPDATE rockstars SET ' . implode(', ', array_map(fn($c) => "$c = ?", $cols)) . ' WHERE id = ?';
    db()->prepare($sql)->execute([...array_map(fn($c) => $r[$c], $cols), $r['id']]);
}

function band_of(array $r): ?array
{
    $st = db()->prepare('SELECT * FROM bands WHERE rockstar_id = ?');
    $st->execute([$r['id']]);
    return $st->fetch() ?: null;
}

function bandmates(int $bandId): array
{
    $st = db()->prepare('SELECT * FROM bandmates WHERE band_id = ? ORDER BY hired_at');
    $st->execute([$bandId]);
    return $st->fetchAll();
}

function owned_items(int $rid): array
{
    $st = db()->prepare('SELECT item FROM wardrobe WHERE rockstar_id = ?');
    $st->execute([$rid]);
    return array_fill_keys(array_column($st->fetchAll(), 'item'), true);
}

function news(int $rid, string $kind, string $text): void
{
    db()->prepare('INSERT INTO news (rockstar_id, kind, text, created_at) VALUES (?,?,?,?)')->execute([$rid, $kind, $text, time()]);
}

function spend(array &$r, int $amount, string $what = 'that'): void
{
    if ($r['cash'] < $amount) fail("You need \$$amount for $what.");
    $r['cash'] -= $amount;
}

function need_energy(array $r, float $amount): void
{
    if ($r['energy'] < $amount) fail('Not enough energy (' . round($amount) . ' needed). Rest or wait a bit.');
}

function gain_fame(array &$r, int $fame): array
{
    $before = fame_tier((int)$r['fame']);
    $r['fame'] += max(0, $fame);
    $after = fame_tier((int)$r['fame']);
    if ($after['name'] !== $before['name']) news((int)$r['id'], 'milestone', "You are now a {$after['name']}! New venues and gear unlocked.");
    return ['tierUp' => $after['name'] !== $before['name'], 'tier' => $after['name']];
}

/* =============================================================== XP & levels */

function xp_for_level(int $level): int { return (int)round(100 * pow($level, 1.45)); }

/** Live play multiplies XP: 1.25x at 0% accuracy up to 2x at 100%. */
function live_mult(float $acc): float { return LIVE_XP_BASE + LIVE_XP_PER_ACC * clampf($acc, 0, 100); }

function add_xp(array &$r, float $xp): array
{
    $xp = (int)round($xp);
    $r['xp'] += $xp;
    $levels = 0;
    while ($r['xp'] >= xp_for_level((int)$r['level'])) {
        $r['xp'] -= xp_for_level((int)$r['level']);
        $r['level']++;
        $r['skill_points'] += SKILL_POINTS_PER_LEVEL;
        $levels++;
    }
    if ($levels) news((int)$r['id'], 'milestone', "Level up! {$r['stage_name']} is now level {$r['level']}. +" . SKILL_POINTS_PER_LEVEL * $levels . ' skill points.');
    return ['xp' => $xp, 'levelUp' => $levels > 0, 'level' => (int)$r['level']];
}

function act_spend_point(array $r, string $skill): array
{
    if (!isset(SKILLS[$skill])) fail('Unknown skill.');
    if ($r['skill_points'] < 1) fail('No skill points left. Level up to earn more.');
    if ($r[$skill] >= 100) fail('That skill is maxed out.');
    $r['skill_points']--;
    $r[$skill] = min(100, $r[$skill] + 2);
    save_rockstar($r);
    return ['message' => SKILLS[$skill] . ' +2.'];
}

/** What autopilot "plays" like: skill, tightness and chemistry decide it. */
function auto_accuracy(array $r, array $song, float $chemistry): float
{
    $main = $r['instrument'] === 'vocals' ? $r['vocals'] : $r['musicianship'];
    return round(clampf(30 + $main * 0.4 + $song['tightness'] * 0.22 + $chemistry * 0.1 + frand(-5, 5), 20, 90), 1);
}

function mark_learned(int $songId): bool
{
    $st = db()->prepare('UPDATE songs SET learned = 1 WHERE id = ? AND learned = 0');
    $st->execute([$songId]);
    return $st->rowCount() > 0;
}

/* =============================================================== creation */

function create_rockstar(int $uid, array $in): void
{
    if (load_rockstar($uid, false)) fail('You already have a rockstar.');
    $b = $in['backstory'] ?? [];
    foreach (['origin', 'upbringing', 'influence', 'motivation', 'trait'] as $k) {
        if (!isset(BACKSTORY[$k][$b[$k] ?? ''])) fail("Pick your $k.");
    }
    $look = clean_appearance((array)($in['appearance'] ?? []), [], 0, true);

    $gender = (string)($in['gender'] ?? 'unsaid');
    if ($gender === 'custom') $gender = clean_text((string)($in['genderCustom'] ?? ''), 40, 1, 'Gender');
    elseif (!isset(GENDER_IDENTITIES[$gender])) $gender = 'unsaid';
    $pronouns = (string)($in['pronouns'] ?? 'they/them');
    if ($pronouns === 'custom') $pronouns = clean_text((string)($in['pronounsCustom'] ?? ''), 30, 1, 'Pronouns');
    elseif (!in_array($pronouns, PRONOUNS, true)) $pronouns = 'they/them';

    $genre = (string)($in['genre'] ?? '');
    if (!isset(GENRES[$genre])) $genre = BACKSTORY['influence'][$b['influence']]['genre'];

    $skills = array_fill_keys(array_keys(SKILLS), 10.0);
    foreach (['origin', 'upbringing', 'trait'] as $k) {
        foreach (BACKSTORY[$k][$b[$k]]['mods'] ?? [] as $s => $v) $skills[$s] += $v;
    }
    // instrument specialty
    $skills[$look['instrument']['type'] === 'vocals' ? 'vocals' : 'musicianship'] += 4;
    $cash = START_CASH + (BACKSTORY['upbringing'][$b['upbringing']]['cash'] ?? 0);
    $now = time();

    $pdo = db();
    $pdo->prepare('INSERT INTO rockstars (user_id, stage_name, real_name, pronouns, gender, age, hometown, bio, backstory, appearance, instrument,
        musicianship, vocals, songwriting, stagecraft, charisma, stamina, cash, last_tick, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            $uid,
            clean_text((string)($in['stageName'] ?? ''), 30, 2, 'Stage name'),
            clean_text((string)($in['realName'] ?? ''), 40),
            $pronouns, $gender,
            max(18, min(70, (int)($in['age'] ?? 21))),
            clean_text((string)($in['hometown'] ?? ''), 60),
            clean_text((string)($in['bio'] ?? ''), 600),
            json_encode(array_intersect_key($b, array_flip(['origin', 'upbringing', 'influence', 'motivation', 'trait']))),
            json_encode($look),
            $look['instrument']['type'],
            ...array_values(array_map(fn($v) => max(1, $v), $skills)),
            $cash, $now, $now,
        ]);
    $rid = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO bands (rockstar_id, name, genre, created_at) VALUES (?,?,?,?)')
        ->execute([$rid, clean_text((string)($in['bandName'] ?? ''), 30, 2, 'Band name'), $genre, $now]);
    news($rid, 'story', 'Your story begins in a cluttered garage with big dreams and a borrowed amp.');
}

/* =============================================================== typing sessions (anti-cheat) */

/** Server remembers what minigame was started so results can't be faked instantly. */
function start_run(string $kind, array $params, int $songs): string
{
    $token = bin2hex(random_bytes(8));
    $_SESSION['runs'][$token] = ['kind' => $kind, 'params' => $params, 'songs' => $songs, 'started' => microtime(true)];
    if (count($_SESSION['runs']) > 10) array_shift($_SESSION['runs']);
    return $token;
}

function finish_run(string $token, string $kind): array
{
    $run = $_SESSION['runs'][$token] ?? null;
    if (!$run || $run['kind'] !== $kind) fail('That session expired. Please play it again.');
    if (microtime(true) - $run['started'] < MIN_SECONDS_PER_SONG * $run['songs']) fail('That was suspiciously fast!');
    unset($_SESSION['runs'][$token]);
    return $run['params'];
}

/** Clamp one song's typing result from the client. */
function clean_result($r): array
{
    $r = (array)$r;
    return [
        'accuracy' => clampf((float)($r['accuracy'] ?? 0), 0, 100),   // % of words hit correctly & on time
        'wpm' => (int)clampf((float)($r['wpm'] ?? 0), 0, 220),
        'combo' => (int)clampf((float)($r['combo'] ?? 0), 0, 500),
    ];
}

/* =============================================================== lyrics */

function make_lyrics(string $theme, int $seed): array
{
    mt_srand($seed);
    $W = SONG_THEMES[$theme]['words'];
    $w = fn() => $W[mt_rand(0, count($W) - 1)];
    $templates = [
        'we are %s and %s', 'turn the %s up loud', 'running through the %s', 'hear the %s call my name', 'never let the %s go',
        'oh %s %s tonight', 'I feel the %s inside', '%s in my %s', 'we will %s forever', 'take me to the %s',
        'one more %s for the road', 'my %s is on fire', 'can you hear the %s', 'all we need is %s', 'lost in the %s again',
    ];
    $lines = [];
    for ($i = 0; $i < 6; $i++) {
        $t = $templates[mt_rand(0, count($templates) - 1)];
        $lines[] = sprintf($t, $w(), $w());
    }
    mt_srand();
    return $lines;
}

function song_title(string $theme): string
{
    $W = SONG_THEMES[$theme]['words'];
    $a = $W[array_rand($W)]; $b = $W[array_rand($W)];
    $forms = ["$a $b", "$a Tonight", "The $a", "$a & $b", "Never $a", "$a Song", "Electric $a"];
    return ucwords($forms[array_rand($forms)]);
}

/* =============================================================== actions */

function act_practice_start(array $r, string $skill): array
{
    if (!isset(SKILLS[$skill])) fail('Unknown skill.');
    need_energy($r, PRACTICE_ENERGY);
    $theme = array_rand(SONG_THEMES);
    $seed = mt_rand();
    $bpm = mt_rand(96, 132);
    return ['token' => start_run('practice', ['skill' => $skill, 'seed' => $seed], 1),
        'chart' => ['title' => SKILLS[$skill] . ' drill', 'bpm' => $bpm, 'genre' => 'indie', 'lyrics' => make_lyrics($theme, $seed), 'seed' => $seed % 1000000]];
}

function act_practice_finish(array $r, string $token, $result): array
{
    $p = finish_run($token, 'practice');
    $res = clean_result($result);
    need_energy($r, PRACTICE_ENERGY);
    $skill = $p['skill'];
    $mul = (trait_is($r, 'perfectionist') ? 1.25 : 1) * (perk($r, 'practice_gain') ? 1.15 : 1);
    $cur = (float)$r[$skill];
    $gain = round((0.8 + $res['accuracy'] / 35) * $mul * max(0.15, 1 - $cur / 110), 2);
    $r[$skill] = min(100, $cur + $gain);
    $r['energy'] -= PRACTICE_ENERGY * (1 - $r['stamina'] / 250);
    $r['mood'] = clampf($r['mood'] + ($res['accuracy'] >= 70 ? 3 : -2), 0, 100);
    $r['best_wpm'] = max((int)$r['best_wpm'], $res['wpm']);
    $x = add_xp($r, (8 + $res['accuracy'] / 10) * live_mult($res['accuracy']));
    save_rockstar($r);
    return ['message' => sprintf('%s +%.1f (now %.1f).%s +%d XP (live bonus x%.2f)', SKILLS[$skill], $gain, $r[$skill], $res['wpm'] ? " {$res['wpm']} WPM." : '', $x['xp'], live_mult($res['accuracy'])),
        'gain' => $gain] + $x;
}

function act_practice_auto(array $r, string $skill): array
{
    if (!isset(SKILLS[$skill])) fail('Unknown skill.');
    need_energy($r, PRACTICE_ENERGY);
    $mul = (trait_is($r, 'perfectionist') ? 1.25 : 1) * (perk($r, 'practice_gain') ? 1.15 : 1);
    $cur = (float)$r[$skill];
    $gain = round(2.2 * AUTO_SKILL_RATE * $mul * max(0.15, 1 - $cur / 110), 2);
    $r[$skill] = min(100, $cur + $gain);
    $r['energy'] -= PRACTICE_ENERGY * (1 - $r['stamina'] / 250);
    $x = add_xp($r, 8);
    save_rockstar($r);
    return ['message' => sprintf('Autopilot practice: %s +%.1f, +%d XP. Practice live for bigger gains.', SKILLS[$skill], $gain, $x['xp'])] + $x;
}

/* ---------------------------------------------------------------- learning songs */

function act_learn_start(array $r, int $songId): array
{
    need_energy($r, LEARN_ENERGY);
    $songs = load_songs($r, [$songId], 1, 1);
    return ['token' => start_run('learn', ['song' => $songId], 1), 'charts' => array_map('chart_of', $songs)];
}

function act_learn_finish(array $r, string $token, $result): array
{
    $p = finish_run($token, 'learn');
    $res = clean_result($result);
    need_energy($r, LEARN_ENERGY);
    $r['energy'] -= LEARN_ENERGY;
    $r['best_wpm'] = max((int)$r['best_wpm'], $res['wpm']);
    if ($res['accuracy'] >= LEARN_ACCURACY) {
        $new = mark_learned((int)$p['song']);
        db()->prepare('UPDATE songs SET tightness = ' . sql_min() . '(100, tightness + 5) WHERE id = ?')->execute([$p['song']]);
        $x = add_xp($r, (20 + $res['accuracy'] / 5) * live_mult($res['accuracy']));
        save_rockstar($r);
        return ['message' => ($new ? 'Song learned! It can now be played on autopilot. ' : 'Nice run! ') . "+{$x['xp']} XP.", 'learned' => true] + $x;
    }
    $x = add_xp($r, 6);
    save_rockstar($r);
    return ['message' => sprintf('%d%% — you need %d%% to learn it. Try again!', $res['accuracy'], LEARN_ACCURACY), 'learned' => false] + $x;
}

function act_write_song(array $r, array $in): array
{
    need_energy($r, WRITE_ENERGY);
    $band = band_of($r);
    $theme = isset(SONG_THEMES[$in['theme'] ?? '']) ? $in['theme'] : array_rand(SONG_THEMES);
    $genre = isset(GENRES[$in['genre'] ?? '']) ? $in['genre'] : $band['genre'];
    $title = trim((string)($in['title'] ?? '')) !== '' ? clean_text((string)$in['title'], 40, 1, 'Title') : song_title($theme);
    $bpmRange = GENRES[$genre]['bpm'];
    $bpm = (int)clampf((int)($in['bpm'] ?? 0) ?: mt_rand(...$bpmRange), 70, 200);

    $influence = BACKSTORY['influence'][json_decode($r['backstory'], true)['influence']]['genre'];
    $fit = in_array($genre, SONG_THEMES[$theme]['genres'], true) ? 6 : 0;
    $affinity = $genre === $influence ? 8 : ($genre === $band['genre'] ? 4 : 0);
    $inspiration = ($r['mood'] - 50) / 6;
    $quality = $r['songwriting'] * 0.62 + $r['musicianship'] * 0.12 + frand(0, 22) + $fit + $affinity + $inspiration;
    if (perk($r, 'song_quality')) $quality *= 1.12;
    $quality = round(clampf($quality, 1, 100), 1);

    $lyrics = make_lyrics($theme, mt_rand());
    $userLyrics = trim((string)($in['lyrics'] ?? ''));
    if ($userLyrics !== '') {   // players can write their own lyrics; they become the typing chart
        $lines = array_values(array_filter(array_map(fn($l) => clean_text($l, 60), preg_split('/\R/', $userLyrics))));
        if (count($lines) >= 2) $lyrics = array_slice($lines, 0, 8);
    }

    db()->prepare('INSERT INTO songs (band_id, title, genre, theme, bpm, lyrics, quality, created_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$band['id'], $title, $genre, $theme, $bpm, json_encode($lyrics), $quality, time()]);
    $r['energy'] -= WRITE_ENERGY;
    $r['songwriting'] = min(100, $r['songwriting'] + 0.4);
    $r['mood'] = clampf($r['mood'] + 4, 0, 100);
    add_xp($r, 15);
    save_rockstar($r);
    $word = $quality >= 80 ? 'a potential hit' : ($quality >= 60 ? 'a strong track' : ($quality >= 40 ? 'a decent song' : 'a rough demo'));
    news((int)$r['id'], 'song', "You wrote \"$title\" — $word.");
    return ['message' => "You wrote \"$title\" (quality " . round($quality) . "). It's $word!", 'quality' => $quality];
}

function act_release(array $r, int $songId): array
{
    $band = band_of($r);
    $st = db()->prepare('SELECT * FROM songs WHERE id = ? AND band_id = ?');
    $st->execute([$songId, $band['id']]);
    $s = $st->fetch();
    if (!$s) fail('Song not found.');
    if ($s['released_at']) fail('Already released.');
    if ($s['tightness'] < 30) fail('Rehearse it more first (tightness 30+).');
    spend($r, RECORD_COST, 'studio time');
    $now = time();
    $launch = (int)round(pow($s['quality'], 1.5) * (1 + $r['fans'] / 300) * (0.6 + $s['tightness'] / 200));
    db()->prepare('UPDATE songs SET released_at = ?, streams = ? WHERE id = ?')->execute([$now, $launch, $songId]);
    $fans = (int)round($launch / 60 * (perk($r, 'fan_gain') ? 1.2 : 1));
    $r['fans'] += $fans;
    $tier = gain_fame($r, (int)round($fans / 2 + $s['quality'] / 4));
    add_xp($r, 20);
    save_rockstar($r);
    news((int)$r['id'], 'release', "\"{$s['title']}\" is out! $launch streams on day one.");
    return ['message' => "\"{$s['title']}\" is released! $launch streams and $fans new fans.", 'tierUp' => $tier['tierUp']];
}

function act_rehearse_start(array $r, array $songIds): array
{
    need_energy($r, REHEARSE_ENERGY);
    $songs = load_songs($r, $songIds, 1, 3);
    return ['token' => start_run('rehearse', ['songs' => array_column($songs, 'id')], count($songs)), 'charts' => array_map('chart_of', $songs)];
}

/** Live rehearsal: typed results for every song. Typing a song here also teaches it. */
function act_rehearse_finish(array $r, string $token, array $results): array
{
    $p = finish_run($token, 'rehearse');
    $songs = load_songs($r, $p['songs'], 1, 3);
    $accs = []; $wpm = 0;
    foreach ($songs as $i => $s) { $res = clean_result($results[$i] ?? []); $accs[] = $res['accuracy']; $wpm = max($wpm, $res['wpm']); }
    return rehearse_apply($r, $songs, $accs, true, $wpm);
}

/** Autopilot rehearsal: instant, needs every song learned, no typing. */
function act_rehearse_auto(array $r, array $songIds): array
{
    $songs = load_songs($r, $songIds, 1, 3);
    foreach ($songs as $s) if (!$s['learned']) fail("\"{$s['title']}\" isn't learned yet. Type it once (Learn it or rehearse live) to unlock autopilot.");
    $band = band_of($r);
    $accs = array_map(fn($s) => auto_accuracy($r, $s, (float)$band['chemistry']), $songs);
    return rehearse_apply($r, $songs, $accs, false, 0);
}

function rehearse_apply(array $r, array $songs, array $accs, bool $live, int $wpm): array
{
    need_energy($r, REHEARSE_ENERGY);
    $band = band_of($r);
    $mates = bandmates((int)$band['id']);
    if ($mates) spend($r, REHEARSAL_ROOM_COST, 'the rehearsal room');
    $avgSkill = $mates ? array_sum(array_column($mates, 'skill')) / count($mates) : $r['musicianship'];
    $chemMul = array_product(array_map(fn($m) => PERSONALITIES[$m['personality']]['chem'], $mates) ?: [1]) ** (1 / max(1, count($mates)));
    $gains = []; $learnedNow = [];
    foreach ($songs as $i => $s) {
        $acc = $accs[$i];
        $gain = (3 + $acc / 10) * (0.55 + $band['chemistry'] / 250 + $avgSkill / 250) * ($live ? 1.2 : 1);
        db()->prepare('UPDATE songs SET tightness = ' . sql_min() . '(100, tightness + ?) WHERE id = ?')->execute([round($gain, 1), $s['id']]);
        $gains[] = round($gain, 1);
        if ($live && $acc >= LEARN_ACCURACY && mark_learned((int)$s['id'])) $learnedNow[] = $s['title'];
    }
    $acc = array_sum($accs) / max(1, count($accs));
    $chem = (1 + $acc / 40) * $chemMul * (trait_is($r, 'leader') ? 1.3 : 1);
    db()->prepare('UPDATE bands SET chemistry = ' . sql_min() . '(100, chemistry + ?) WHERE id = ?')->execute([round($chem, 1), $band['id']]);
    foreach ($mates as $m) db()->prepare('UPDATE bandmates SET loyalty = ' . sql_min() . '(100, loyalty + ?) WHERE id = ?')->execute([$acc >= 60 ? 2 : 0.5, $m['id']]);
    $r['musicianship'] = min(100, $r['musicianship'] + 0.3 + $acc / 300);
    $r['energy'] -= REHEARSE_ENERGY * (1 - $r['stamina'] / 250);
    $r['mood'] = clampf($r['mood'] + ($acc >= 60 ? 4 : -3), 0, 100);
    if ($wpm) $r['best_wpm'] = max((int)$r['best_wpm'], $wpm);
    $baseXp = 12 * count($songs) + $acc / 5;
    $mult = $live ? live_mult($acc) : 1;
    $x = add_xp($r, $baseXp * $mult);
    save_rockstar($r);
    $msg = sprintf('%s rehearsal: songs tightened %s, chemistry +%.1f, +%d XP%s.', $live ? 'Live' : 'Autopilot',
        implode(' ', array_map(fn($g) => "+$g", $gains)), $chem, $x['xp'], $live ? sprintf(' (live bonus x%.2f)', $mult) : '');
    if ($learnedNow) $msg .= ' Learned: ' . implode(', ', $learnedNow) . '!';
    return ['message' => $msg, 'accuracy' => round($acc, 1), 'live' => $live] + $x;
}

function load_songs(array $r, array $ids, int $min, int $max): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (count($ids) < $min || count($ids) > $max) fail("Pick $min to $max songs.");
    $band = band_of($r);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $st = db()->prepare("SELECT * FROM songs WHERE band_id = ? AND id IN ($in)");
    $st->execute([$band['id'], ...$ids]);
    $byId = array_column($st->fetchAll(), null, 'id');
    $songs = [];
    foreach ($ids as $id) { if (!isset($byId[$id])) fail('Song not found.'); $songs[] = $byId[$id]; }
    return $songs;
}

function chart_of(array $s): array
{
    return ['id' => (int)$s['id'], 'title' => $s['title'], 'bpm' => (int)$s['bpm'], 'genre' => $s['genre'], 'lyrics' => json_decode($s['lyrics'], true),
        'seed' => (int)$s['id'] * 7919 + (int)$s['bpm'], 'learned' => (bool)$s['learned']];
}

/* ---------------------------------------------------------------- band */

function recruits(array $r): array
{
    $band = band_of($r);
    $day = gmdate('Y-m-d');
    $taken = db()->prepare('SELECT slot FROM recruit_log WHERE rockstar_id = ? AND day = ?');
    $taken->execute([$r['id'], $day]);
    $taken = array_column($taken->fetchAll(), 'slot');
    $filled = array_column(bandmates((int)$band['id']), 'role');
    $tier = fame_tier((int)$r['fame'])['index'];
    $out = [];
    for ($slot = 0; $slot < RECRUITS_PER_DAY; $slot++) {
        if (in_array($slot, $taken)) continue;
        $out[] = recruit_candidate((int)$r['id'], $day, $slot, $tier, $r['instrument'], $filled);
    }
    return $out;
}

function recruit_candidate(int $rid, string $day, int $slot, int $tier, string $playerRole, array $filled): array
{
    $seed = crc32("$rid|$day|$slot");
    mt_srand($seed);
    $roles = array_values(array_diff(array_keys(BAND_ROLES), [$playerRole]));
    $open = array_values(array_diff($roles, $filled)) ?: $roles;
    $role = $open[($slot + crc32("$rid|$day") % 97) % count($open)];   // spread recruits across roles
    $pers = array_keys(PERSONALITIES)[mt_rand(0, count(PERSONALITIES) - 1)];
    $skill = round(min(95, 12 + $tier * 9 + mt_rand(0, 25)) * PERSONALITIES[$pers]['perf'], 1);
    $name = FIRST_NAMES[mt_rand(0, count(FIRST_NAMES) - 1)] . ' ' . LAST_NAMES[mt_rand(0, count(LAST_NAMES) - 1)];
    $pronouns = ['she/her', 'he/him', 'they/them'][mt_rand(0, 2)];
    $wage = (int)round((8 + $skill * 0.9) * PERSONALITIES[$pers]['wage']);
    mt_srand();
    return ['slot' => $slot, 'name' => $name, 'role' => $role, 'roleName' => BAND_ROLES[$role], 'pronouns' => $pronouns,
        'personality' => $pers, 'personalityName' => PERSONALITIES[$pers]['name'], 'personalityDesc' => PERSONALITIES[$pers]['desc'],
        'skill' => $skill, 'wage' => $wage, 'signing' => $wage * 4, 'appearance' => random_appearance($role, $seed)];
}

function act_hire(array $r, int $slot): array
{
    $band = band_of($r);
    $mates = bandmates((int)$band['id']);
    if (count($mates) + 1 >= MAX_BAND) fail('Your band is full (' . MAX_BAND . ' members). Fire someone first.');
    $c = null;
    foreach (recruits($r) as $cand) if ($cand['slot'] === $slot) $c = $cand;
    if (!$c) fail('That musician is no longer available.');
    spend($r, $c['signing'], 'the signing fee');
    db()->prepare('INSERT INTO bandmates (band_id, name, role, pronouns, personality, skill, wage, appearance, hired_at) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$band['id'], $c['name'], $c['role'], $c['pronouns'], $c['personality'], $c['skill'], $c['wage'], json_encode($c['appearance']), time()]);
    db()->prepare(insert_ignore() . ' INTO recruit_log (rockstar_id, day, slot) VALUES (?,?,?)')->execute([$r['id'], gmdate('Y-m-d'), $slot]);
    db()->prepare('UPDATE bands SET chemistry = ' . sql_max() . '(5, chemistry - 6) WHERE id = ?')->execute([$band['id']]);
    save_rockstar($r);
    news((int)$r['id'], 'band', "{$c['name']} joined the band on " . strtolower($c['roleName']) . '!');
    return ['message' => "{$c['name']} joined on " . strtolower($c['roleName']) . '! Rehearse together to build chemistry.'];
}

function act_fire(array $r, int $mateId): array
{
    $band = band_of($r);
    $st = db()->prepare('SELECT * FROM bandmates WHERE id = ? AND band_id = ?');
    $st->execute([$mateId, $band['id']]);
    $m = $st->fetch();
    if (!$m) fail('Bandmate not found.');
    $severance = (int)$m['wage'] * 2;
    $r['cash'] = max(0, $r['cash'] - $severance);
    db()->prepare('DELETE FROM bandmates WHERE id = ?')->execute([$mateId]);
    db()->prepare('UPDATE bands SET chemistry = ' . sql_max() . '(5, chemistry - 10) WHERE id = ?')->execute([$band['id']]);
    $r['mood'] = clampf($r['mood'] - 6, 0, 100);
    save_rockstar($r);
    news((int)$r['id'], 'band', "{$m['name']} left the band. It got awkward.");
    return ['message' => "You let {$m['name']} go (\$$severance severance). The band is a little shaken."];
}

function act_hangout(array $r): array
{
    $band = band_of($r);
    if (!bandmates((int)$band['id'])) fail('Recruit some bandmates first.');
    spend($r, HANGOUT_COST, 'pizza and arcade tokens');
    db()->prepare('UPDATE bands SET chemistry = ' . sql_min() . '(100, chemistry + ?) WHERE id = ?')->execute([trait_is($r, 'leader') ? 7 : 5, $band['id']]);
    db()->prepare('UPDATE bandmates SET loyalty = ' . sql_min() . '(100, loyalty + 4) WHERE band_id = ?')->execute([$band['id']]);
    $r['mood'] = clampf($r['mood'] + 10, 0, 100);
    $r['charisma'] = min(100, $r['charisma'] + 0.3);
    save_rockstar($r);
    return ['message' => 'Pizza, arcade, terrible karaoke. Band chemistry and mood up!'];
}

function act_rest(array $r): array
{
    $wait = (int)$r['last_rest'] + REST_COOLDOWN - time();
    if ($wait > 0) fail('You just rested. Try again in ' . ceil($wait / 60) . ' min.');
    $r['energy'] = clampf($r['energy'] + REST_ENERGY, 0, 100);
    $r['mood'] = clampf($r['mood'] + 3, 0, 100);
    $r['last_rest'] = time();
    save_rockstar($r);
    return ['message' => 'You crashed on the garage couch. +' . REST_ENERGY . ' energy.'];
}

/* ---------------------------------------------------------------- gigs */

/** $modes[i] = 'live' (you play it) or 'auto' (autopilot, song must be learned). */
function act_gig_start(array $r, string $venue, array $songIds, array $modes): array
{
    $v = VENUES[$venue] ?? fail('Unknown venue.');
    if ($r['fame'] < $v['fame']) fail("{$v['name']} needs " . number_format($v['fame']) . ' fame.');
    need_energy($r, GIG_ENERGY);
    $songs = load_songs($r, $songIds, $v['songs'][0], $v['songs'][1]);
    $m = [];
    foreach ($songs as $i => $s) {
        $mode = ($modes[$i] ?? 'live') === 'auto' ? 'auto' : 'live';
        if ($mode === 'auto' && !$s['learned']) fail("\"{$s['title']}\" isn't learned yet, so it has to be played live.");
        $m[] = $mode;
    }
    $liveCount = count(array_filter($m, fn($x) => $x === 'live'));
    $token = start_run('gig', ['venue' => $venue, 'songs' => array_column($songs, 'id'), 'modes' => $m], $liveCount);
    return ['token' => $token, 'charts' => array_map('chart_of', $songs), 'modes' => $m, 'venue' => $v + ['id' => $venue]];
}

function act_gig_finish(array $r, string $token, array $results, array $moves): array
{
    $p = finish_run($token, 'gig');
    need_energy($r, GIG_ENERGY);
    $v = VENUES[$p['venue']];
    $band = band_of($r);
    $mates = bandmates((int)$band['id']);
    $songs = load_songs($r, $p['songs'], 1, 6);
    $tier = fame_tier((int)$r['fame'])['index'];

    // ---- performance score 0-100 (live songs use what you played, autopilot songs use your skills)
    $modes = $p['modes'] ?? array_fill(0, count($songs), 'live');
    $acc = 0; $wpm = 0; $combo = 0; $liveAcc = []; $learnedNow = [];
    foreach ($songs as $i => $s) {
        if ($modes[$i] === 'auto') { $acc += auto_accuracy($r, $s, (float)$band['chemistry']); continue; }
        $res = clean_result($results[$i] ?? []);
        $acc += $res['accuracy']; $liveAcc[] = $res['accuracy'];
        $wpm = max($wpm, $res['wpm']); $combo = max($combo, $res['combo']);
        if ($res['accuracy'] >= LEARN_ACCURACY && mark_learned((int)$s['id'])) $learnedNow[] = $s['title'];
    }
    $acc /= count($songs);
    $liveShare = count($liveAcc) / count($songs);
    $quality = array_sum(array_column($songs, 'quality')) / count($songs);
    $tight = array_sum(array_column($songs, 'tightness')) / count($songs);
    $bandSkill = $mates ? array_sum(array_map(fn($m) => $m['skill'] * PERSONALITIES[$m['personality']]['perf'], $mates)) / count($mates) : 0;
    $fullness = min(1, (count($mates) + 1) / 4);   // a fuller band sounds bigger
    $show = ($r['stagecraft'] + $r['charisma']) / 2;
    $main = $r['instrument'] === 'vocals' ? $r['vocals'] : $r['musicianship'];
    $perf = 0.34 * $acc + 0.14 * $quality + 0.14 * $tight + 0.12 * $show + 0.08 * $main
          + 0.10 * $bandSkill * $fullness + 0.08 * $band['chemistry'] + ($r['mood'] - 50) / 10
          + 4 * $liveShare;   // crowds feel it when you really play

    // ---- stage moves
    $moveLog = []; $moveCost = 0;
    foreach (array_slice($moves, 0, count($songs)) as $mv) {
        if (!isset(MOVES[$mv])) continue;
        $m = MOVES[$mv];
        if (($m['minTier'] ?? 0) > $v['tier']) continue;
        if ($r['cash'] - $moveCost < $m['cost']) { $moveLog[] = ['move' => $m['name'], 'ok' => false, 'note' => "couldn't afford it"]; continue; }
        $moveCost += $m['cost'];
        $chance = 0.35 + $r[$m['skill']] / 160 - $m['risk'] * 0.07 + (trait_is($r, 'wildchild') && $m['risk'] >= 3 ? 0.15 : 0);
        $ok = frand() < clampf($chance, 0.1, 0.95);
        $perf += $ok ? $m['risk'] * 3 : -$m['risk'] * 2.5;
        $moveLog[] = ['move' => $m['name'], 'ok' => $ok];
    }
    $perf = round(clampf($perf, 0, 100), 1);

    // ---- crowd & money
    $draw = 0.1 + 0.3 / $v['tier'] + $r['fans'] / max(1, $v['cap'] * 2.5) + $r['fame'] / max(200, $v['fame'] * 5 + 200);
    $attendance = (int)round(clampf($v['cap'] * clampf($draw, 0.1, 1) * frand(0.85, 1.1), 3, $v['cap']));
    $gross = $v['ticket'] > 0 ? (int)round($attendance * $v['ticket'] * (0.45 + $perf / 250)) : (int)round($attendance * $perf / 40 * frand(0.6, 1.3));
    if (perk($r, 'cash_gain')) $gross = (int)round($gross * 1.2);
    $wages = array_sum(array_column($mates, 'wage'));
    $net = $gross - $wages - $moveCost;
    $fans = (int)round($attendance * pow($perf / 100, 2) * 0.45 * (1 + $r['charisma'] / 200) * (perk($r, 'fan_gain') ? 1.25 : 1));
    $fame = (int)round(($fans * 0.6 + $v['tier'] * $perf / 12) * (perk($r, 'fame_gain') ? 1.25 : 1));
    $stars = max(1, min(5, (int)ceil($perf / 20)));

    $r['cash'] = max(0, $r['cash'] + $net);
    $r['fans'] += $fans;
    $tierInfo = gain_fame($r, $fame);
    $r['gigs_played']++;
    $r['energy'] -= GIG_ENERGY * (1 - $r['stamina'] / 250);
    $moodDelta = $perf / 8 - 4;
    if (trait_is($r, 'perfectionist') && $perf < 45) $moodDelta -= 5;
    $r['mood'] = clampf($r['mood'] + $moodDelta, 0, 100);
    $r['stagecraft'] = min(100, $r['stagecraft'] + 0.5 + $perf / 150);
    $r['stamina'] = min(100, $r['stamina'] + 0.3);
    $r['best_wpm'] = max((int)$r['best_wpm'], $wpm);
    $avgLive = $liveAcc ? array_sum($liveAcc) / count($liveAcc) : 0;
    $xpMult = 1 + $liveShare * (live_mult($avgLive) - 1);
    $xp = add_xp($r, (25 + $v['tier'] * 12 + $perf / 3) * $xpMult);
    foreach ($songs as $s) db()->prepare('UPDATE songs SET times_played = times_played + 1, tightness = ' . sql_min() . '(100, tightness + 2) WHERE id = ?')->execute([$s['id']]);
    db()->prepare('UPDATE bands SET chemistry = ' . sql_min() . '(100, chemistry + ?) WHERE id = ?')->execute([$perf >= 50 ? 2 : -1, $band['id']]);
    foreach ($mates as $m) {   // unhappy bandmates may quit after bad nights
        $loy = $m['loyalty'] + ($perf >= 50 ? 3 : -6) + ($net < 0 ? -4 : 0);
        if ($loy < 15 && frand() < 0.5) {
            db()->prepare('DELETE FROM bandmates WHERE id = ?')->execute([$m['id']]);
            news((int)$r['id'], 'band', "{$m['name']} quit after the show. \"I'm out.\"");
        } else db()->prepare('UPDATE bandmates SET loyalty = ? WHERE id = ?')->execute([clampf($loy, 0, 100), $m['id']]);
    }
    save_rockstar($r);

    $review = review_text($r, $band, $v, $perf, $moveLog, $attendance);
    db()->prepare('INSERT INTO gigs (rockstar_id, venue, setlist, performance, attendance, earnings, fans_gained, fame_gained, stars, review, played_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$r['id'], $p['venue'], json_encode($p['songs']), $perf, $attendance, $net, $fans, $fame, $stars, $review, time()]);
    news((int)$r['id'], 'gig', "{$v['name']}: " . str_repeat('★', $stars) . " — $attendance people, $fans new fans.");

    return [
        'result' => compact('perf', 'attendance', 'gross', 'wages', 'moveCost', 'net', 'fans', 'fame', 'stars', 'review') + [
            'moves' => $moveLog, 'accuracy' => round($acc, 1), 'wpm' => $wpm, 'combo' => $combo, 'tierUp' => $tierInfo['tierUp'], 'tier' => $tierInfo['tier'],
            'xp' => $xp['xp'], 'xpMult' => round($xpMult, 2), 'levelUp' => $xp['levelUp'], 'level' => $xp['level'],
            'liveSongs' => count($liveAcc), 'autoSongs' => count($songs) - count($liveAcc), 'learned' => $learnedNow,
        ],
        'message' => "Show over! $attendance people, " . str_repeat('★', $stars),
    ];
}

function review_text(array $r, array $band, array $v, float $perf, array $moves, int $att): string
{
    $name = $band['name'];
    $open = $perf >= 85 ? ["Jaw-dropping.", "Instant legends.", "Unreal."] : ($perf >= 65 ? ["A seriously good night.", "Tight and loud.", "They earned every cheer."]
        : ($perf >= 45 ? ["Rough edges, real heart.", "Not bad at all.", "Room to grow."] : ["Ouch.", "A night to forget.", "Back to the garage."]));
    $body = $perf >= 65 ? "$name owned {$v['name']} in front of $att fans" : "$name played {$v['name']} to $att people";
    $lead = $r['stage_name'];
    $bits = [];
    foreach ($moves as $m) $bits[] = $m['ok'] ? "{$m['move']} landed perfectly" : "{$m['move']} went sideways";
    $extra = $bits ? ' Highlights: ' . implode('; ', $bits) . '.' : '';
    $closer = $perf >= 65 ? " Keep an eye on $lead." : " $lead will need more rehearsal.";
    return $open[array_rand($open)] . " $body.$extra$closer";
}

/* ---------------------------------------------------------------- wardrobe */

function act_buy(array $r, string $group, string $id): array
{
    $L = looks();
    $list = match (true) {
        $group === 'hair' => $L['hair'],
        $group === 'makeup.paint' => $L['makeup']['paint'],
        $group === 'tattoo' => $L['tattoos']['designs'],
        $group === 'finish' => $L['instruments']['finishes'],
        str_starts_with($group, 'outfit.') => $L['outfit'][substr($group, 7)] ?? fail('Unknown shop.'),
        str_starts_with($group, 'instrument.') => $L['instruments'][substr($group, 11)]['models'] ?? fail('Unknown shop.'),
        default => fail('Unknown shop.'),
    };
    $item = find_item($list, $id) ?? fail('Unknown item.');
    if (empty($item['price'])) fail('That item is free.');
    if (($item['fame'] ?? 0) > $r['fame']) fail("{$item['name']} unlocks at " . number_format($item['fame']) . ' fame.');
    if (isset(owned_items((int)$r['id'])[item_key($group, $id)])) fail('You already own that.');
    spend($r, (int)$item['price'], $item['name']);
    db()->prepare('INSERT INTO wardrobe (rockstar_id, item, bought_at) VALUES (?,?,?)')->execute([$r['id'], item_key($group, $id), time()]);
    save_rockstar($r);
    return ['message' => "You bought {$item['name']}. Try it on!"];
}

function act_update_look(array $r, array $appearance): array
{
    $look = clean_appearance($appearance, owned_items((int)$r['id']), (int)$r['fame']);
    if ($look['instrument']['type'] !== $r['instrument']) {
        // switching instrument = switching your role in the band
        db()->prepare('UPDATE rockstars SET instrument = ? WHERE id = ?')->execute([$look['instrument']['type'], $r['id']]);
    }
    $r['appearance'] = json_encode($look);
    save_rockstar($r);
    return ['message' => 'Looking good. New look saved.'];
}

function act_update_profile(array $r, array $in): array
{
    $r['bio'] = clean_text((string)($in['bio'] ?? $r['bio']), 600);
    $r['hometown'] = clean_text((string)($in['hometown'] ?? $r['hometown']), 60);
    $r['stage_name'] = clean_text((string)($in['stageName'] ?? $r['stage_name']), 30, 2, 'Stage name');
    $r['real_name'] = clean_text((string)($in['realName'] ?? $r['real_name']), 40);
    $p = (string)($in['pronouns'] ?? $r['pronouns']);
    $r['pronouns'] = $p === 'custom' ? clean_text((string)($in['pronounsCustom'] ?? ''), 30, 1, 'Pronouns') : (in_array($p, PRONOUNS, true) ? $p : $r['pronouns']);
    $g = (string)($in['gender'] ?? $r['gender']);
    $r['gender'] = $g === 'custom' ? clean_text((string)($in['genderCustom'] ?? ''), 40, 1, 'Gender') : (isset(GENDER_IDENTITIES[$g]) ? $g : $r['gender']);
    save_rockstar($r);
    if (!empty($in['bandName'])) db()->prepare('UPDATE bands SET name = ? WHERE rockstar_id = ?')->execute([clean_text((string)$in['bandName'], 30, 2, 'Band name'), $r['id']]);
    return ['message' => 'Profile updated.'];
}

/* =============================================================== public state */

function public_state(int $uid): array
{
    $r = load_rockstar($uid, false);
    if (!$r) return ['rockstar' => null];
    $band = band_of($r);
    $songs = db()->prepare('SELECT * FROM songs WHERE band_id = ? ORDER BY created_at DESC');
    $songs->execute([$band['id']]);
    $newsQ = db()->prepare('SELECT kind, text, created_at FROM news WHERE rockstar_id = ? ORDER BY created_at DESC, id DESC LIMIT 15');
    $newsQ->execute([$r['id']]);
    $gigs = db()->prepare('SELECT venue, performance, attendance, earnings, stars, played_at FROM gigs WHERE rockstar_id = ? ORDER BY played_at DESC LIMIT 8');
    $gigs->execute([$r['id']]);
    $tier = fame_tier((int)$r['fame']);
    return [
        'rockstar' => [
            'stageName' => $r['stage_name'], 'realName' => $r['real_name'], 'pronouns' => $r['pronouns'],
            'gender' => GENDER_IDENTITIES[$r['gender']] ?? $r['gender'], 'genderKey' => $r['gender'], 'age' => (int)$r['age'],
            'hometown' => $r['hometown'], 'bio' => $r['bio'], 'backstory' => json_decode($r['backstory'], true),
            'appearance' => json_decode($r['appearance'], true), 'instrument' => $r['instrument'],
            'skills' => array_map(fn($k) => round((float)$r[$k], 1), array_combine(array_keys(SKILLS), array_keys(SKILLS))),
            'energy' => (int)round($r['energy']), 'mood' => (int)round($r['mood']), 'cash' => (int)$r['cash'],
            'fame' => (int)$r['fame'], 'fans' => (int)$r['fans'], 'tier' => $tier, 'gigsPlayed' => (int)$r['gigs_played'],
            'bestWpm' => (int)$r['best_wpm'],
            'level' => (int)$r['level'], 'xp' => (int)$r['xp'], 'xpNext' => xp_for_level((int)$r['level']), 'skillPoints' => (int)$r['skill_points'], 'restIn' => max(0, (int)$r['last_rest'] + REST_COOLDOWN - time()),
        ],
        'band' => [
            'name' => $band['name'], 'genre' => $band['genre'], 'chemistry' => round((float)$band['chemistry'], 1),
            'members' => array_map(fn($m) => [
                'id' => (int)$m['id'], 'name' => $m['name'], 'role' => $m['role'], 'roleName' => BAND_ROLES[$m['role']], 'pronouns' => $m['pronouns'],
                'personality' => PERSONALITIES[$m['personality']]['name'], 'skill' => round((float)$m['skill']), 'loyalty' => round((float)$m['loyalty']),
                'wage' => (int)$m['wage'], 'appearance' => json_decode($m['appearance'], true),
            ], bandmates((int)$band['id'])),
        ],
        'songs' => array_map(fn($s) => [
            'id' => (int)$s['id'], 'title' => $s['title'], 'genre' => $s['genre'], 'theme' => $s['theme'], 'bpm' => (int)$s['bpm'],
            'quality' => round((float)$s['quality']), 'tightness' => round((float)$s['tightness']), 'timesPlayed' => (int)$s['times_played'],
            'released' => (bool)$s['released_at'], 'learned' => (bool)$s['learned'], 'streams' => (int)$s['streams'], 'lyrics' => json_decode($s['lyrics'], true),
        ], $songs->fetchAll()),
        'owned' => array_keys(owned_items((int)$r['id'])),
        'news' => $newsQ->fetchAll(),
        'gigs' => $gigs->fetchAll(),
    ];
}
