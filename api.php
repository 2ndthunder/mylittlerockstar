<?php
// My Little Rockstar JSON API. POST JSON {action, csrf, ...}.
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/catalog.php';
require __DIR__ . '/lib/looks.php';
require __DIR__ . '/lib/game.php';
require __DIR__ . '/lib/progress.php';
require __DIR__ . '/lib/social.php';
require __DIR__ . '/lib/security.php';

session_name('mlr_session');   // own cookie name: other localhost games (e.g. Nexokin) must not share our login
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

function out(array $d, int $code = 200): never { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function uid(): int
{
    static $checked = null;
    if (empty($_SESSION['uid'])) throw new GameError('Please log in.');
    if ($checked === null) {   // a login must belong to a real account in this game's database
        $st = db()->prepare('SELECT 1 FROM users WHERE id = ?');
        $st->execute([(int)$_SESSION['uid']]);
        $checked = (bool)$st->fetchColumn();
        if (!$checked) { unset($_SESSION['uid']); throw new GameError('Please log in.'); }
    }
    return (int)$_SESSION['uid'];
}
function with_state(array $res): array
{
    $state = public_state(uid());
    if ($state['rockstar']) {
        $rid = rockstar_id(uid());
        $state['goals'] = daily_goals($rid);
        $state['notices'] = array_merge($res['notices'] ?? [], take_notices());
    }
    unset($res['notices']);
    return $res + $state + ['csrf' => $_SESSION['csrf']];
}

$in = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
$in += $_GET;
$action = (string)($in['action'] ?? '');
$open = ['catalog', 'register', 'login', 'leaderboard'];

try {
    $_SESSION['csrf'] ??= bin2hex(random_bytes(16));
    if (!in_array($action, $open, true) && $action !== 'state') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals($_SESSION['csrf'], (string)($in['csrf'] ?? ''))) out(['error' => 'Session expired, please reload.'], 403);
    }
    $pdo = db();
    $tx = fn(callable $fn) => (function () use ($pdo, $fn) { $pdo->beginTransaction(); $r = $fn(); $pdo->commit(); return $r; })();

    switch ($action) {
        case 'catalog':
            out([
                'skills' => SKILLS, 'genres' => GENRES, 'backstory' => BACKSTORY, 'genders' => GENDER_IDENTITIES, 'pronouns' => PRONOUNS,
                'tiers' => FAME_TIERS, 'venues' => VENUES, 'moves' => MOVES, 'themes' => array_map(fn($t) => ['name' => $t['name'], 'genres' => $t['genres']], SONG_THEMES),
                'roles' => BAND_ROLES, 'personalities' => PERSONALITIES, 'maxBand' => MAX_BAND,
                'costs' => ['rest' => REST_ENERGY, 'practice' => PRACTICE_ENERGY, 'write' => WRITE_ENERGY, 'rehearse' => REHEARSE_ENERGY,
                    'gig' => GIG_ENERGY, 'learn' => LEARN_ENERGY, 'learnAcc' => LEARN_ACCURACY, 'hangout' => HANGOUT_COST, 'record' => RECORD_COST, 'room' => REHEARSAL_ROOM_COST],
            ]);

        case 'register': {
            $name = trim((string)($in['username'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $name)) fail('Usernames are 3-20 letters, numbers or _.');
            if (strlen((string)($in['password'] ?? '')) < 6) fail('Passwords need at least 6 characters.');
            $chk = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)');
            $chk->execute([$name]);
            if ($chk->fetch()) fail('That username is taken.');
            $pdo->prepare('INSERT INTO users (username, pass_hash, created_at) VALUES (?,?,?)')
                ->execute([$name, password_hash((string)$in['password'], PASSWORD_DEFAULT), time()]);
            session_regenerate_id(true);
            $_SESSION['uid'] = (int)$pdo->lastInsertId();
            $_SESSION['csrf'] = bin2hex(random_bytes(16));
            out(with_state([]));
        }

        case 'login': {
            $uname = trim((string)($in['username'] ?? ''));
            login_throttle($uname);
            $st = $pdo->prepare('SELECT id, pass_hash FROM users WHERE LOWER(username) = LOWER(?)');
            $st->execute([$uname]);
            $u = $st->fetch();
            if (!$u || !password_verify((string)($in['password'] ?? ''), $u['pass_hash'])) { login_failed($uname); fail('Wrong username or password.'); }
            if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) $pdo->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')->execute([password_hash((string)$in['password'], PASSWORD_DEFAULT), $u['id']]);
            session_regenerate_id(true);
            $_SESSION['uid'] = (int)$u['id'];
            $_SESSION['csrf'] = bin2hex(random_bytes(16));
            out(with_state([]));
        }

        case 'logout': session_destroy(); out(['ok' => true]);
        case 'state': out(with_state([]));

        case 'create':
            $tx(fn() => create_rockstar(uid(), $in));
            out(with_state(['message' => 'Welcome to the garage. Time to get famous.']));

        case 'update_look':   out(with_state($tx(fn() => act_update_look(load_rockstar(uid()), (array)($in['appearance'] ?? [])))));
        case 'save_preset':   out(with_state($tx(fn() => act_save_preset(load_rockstar(uid()), (int)($in['slot'] ?? -1), (string)($in['name'] ?? ''), (array)($in['appearance'] ?? [])))));
        case 'delete_preset': out(with_state($tx(fn() => act_delete_preset(load_rockstar(uid()), (int)($in['slot'] ?? -1)))));
        case 'update_profile':out(with_state($tx(fn() => act_update_profile(load_rockstar(uid()), $in))));
        case 'buy':           out(with_state($tx(fn() => act_buy(load_rockstar(uid()), (string)($in['group'] ?? ''), (string)($in['id'] ?? '')))));
        case 'rest':          out(with_state($tx(fn() => act_rest(load_rockstar(uid())))));
        case 'write_song':    out(with_state($tx(fn() => act_write_song(load_rockstar(uid()), $in))));
        case 'release':       out(with_state($tx(fn() => act_release(load_rockstar(uid()), (int)($in['song'] ?? 0)))));
        case 'hire':          out(with_state($tx(fn() => act_hire(load_rockstar(uid()), (int)($in['slot'] ?? -1)))));
        case 'fire':          out(with_state($tx(fn() => act_fire(load_rockstar(uid()), (int)($in['member'] ?? 0)))));
        case 'hangout':       out(with_state($tx(fn() => act_hangout(load_rockstar(uid())))));
        case 'recruits':      out(['recruits' => recruits(load_rockstar(uid()))]);

        // Typing minigames: *_start returns charts + a token, *_finish submits per-song results.
        case 'practice_start': out(act_practice_start(load_rockstar(uid()), (string)($in['skill'] ?? '')));
        case 'practice_finish':out(with_state($tx(fn() => act_practice_finish(load_rockstar(uid()), (string)($in['token'] ?? ''), $in['result'] ?? []))));
        case 'rehearse_start': out(act_rehearse_start(load_rockstar(uid()), (array)($in['songs'] ?? [])));
        case 'rehearse_finish':out(with_state($tx(fn() => act_rehearse_finish(load_rockstar(uid()), (string)($in['token'] ?? ''), (array)($in['results'] ?? [])))));
        case 'gig_start':      out(act_gig_start(load_rockstar(uid()), (string)($in['venue'] ?? ''), (array)($in['songs'] ?? []), (array)($in['modes'] ?? [])));
        case 'practice_auto':  out(with_state($tx(fn() => act_practice_auto(load_rockstar(uid()), (string)($in['skill'] ?? '')))));
        case 'rehearse_auto':  out(with_state($tx(fn() => act_rehearse_auto(load_rockstar(uid()), (array)($in['songs'] ?? [])))));
        case 'learn_start':    out(act_learn_start(load_rockstar(uid()), (int)($in['song'] ?? 0)));
        case 'learn_finish':   out(with_state($tx(fn() => act_learn_finish(load_rockstar(uid()), (string)($in['token'] ?? ''), $in['result'] ?? []))));
        case 'claim_goal':     out(with_state($tx(fn() => act_claim_goal(load_rockstar(uid()), (int)($in['slot'] ?? -1)))));
        case 'achievements':   out(['achievements' => achievements_view(rockstar_id(uid()))]);
        case 'profile':        out(['profile' => public_profile((string)($in['name'] ?? ''), rockstar_id(uid(), false))]);
        case 'follow':         out($tx(fn() => act_follow(rockstar_id(uid()), (string)($in['name'] ?? ''), !empty($in['on']))));
        case 'spend_point':    out(with_state($tx(fn() => act_spend_point(load_rockstar(uid()), (string)($in['skill'] ?? '')))));
        case 'gig_finish':     out(with_state($tx(fn() => act_gig_finish(load_rockstar(uid()), (string)($in['token'] ?? ''), (array)($in['results'] ?? []), (array)($in['moves'] ?? [])))));

        case 'leaderboard': out(['leaders' => leaderboard((string)($in['by'] ?? 'fame'))]);

        default: out(['error' => 'Unknown action.'], 400);
    }
} catch (GameError $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    out(['error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('[rockstar] ' . $e);
    @file_put_contents(__DIR__ . '/data/error.log', '[' . date('c') . "] $action: " . $e . "\n\n", FILE_APPEND);
    // When playing locally (start.bat / php -S) show the real reason so problems are easy to report.
    $local = PHP_SAPI === 'cli-server' || getenv('ROCKSTAR_DEBUG');
    out(['error' => 'Something went wrong on the server.' . ($local ? ' (' . $e->getMessage() . ')' : '')], 500);
}
