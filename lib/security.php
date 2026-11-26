<?php
// Security helpers: login throttling. (CSRF tokens, session hardening and output headers live in api.php.)
declare(strict_types=1);

function client_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? 'cli'); }
function throttle_key(string $username): string { return strtolower(substr($username, 0, 40)) . '|' . client_ip(); }

/** Refuse logins after too many recent failures for this username + IP. */
function login_throttle(string $username): void
{
    $since = time() - LOGIN_WINDOW;
    db()->prepare('DELETE FROM login_attempts WHERE at < ?')->execute([$since - 86400]);
    $st = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ukey = ? AND at >= ?');
    $st->execute([throttle_key($username), $since]);
    if ((int)$st->fetchColumn() >= LOGIN_MAX_FAILS) fail('Too many failed logins. Please wait ' . (int)ceil(LOGIN_WINDOW / 60) . ' minutes and try again.');
}

function login_failed(string $username): void
{
    db()->prepare('INSERT INTO login_attempts (ukey, at) VALUES (?, ?)')->execute([throttle_key($username), time()]);
}
