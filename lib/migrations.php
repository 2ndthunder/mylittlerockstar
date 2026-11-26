<?php
// Versioned database migrations. Each entry runs once, in order, and is recorded in schema_version.
// To change the schema: ADD a new numbered entry at the end. Never edit an entry that has shipped.
// Every step must work on both SQLite and MySQL (use the helpers below) and be safe to re-run.
declare(strict_types=1);

function migrations(): array
{
    return [
        // 1: base tables (users, rockstars, bands, bandmates, songs, gigs, wardrobe, news, recruit_log)
        1 => function (PDO $pdo) { foreach (schema_statements(DB_DRIVER) as $sql) run_schema_sql($pdo, $sql); },

        // 2: levels, XP, skill points; learned songs (learn-once → autopilot)
        2 => function (PDO $pdo) {
            add_column($pdo, 'rockstars', 'xp', 'INT NOT NULL DEFAULT 0');
            add_column($pdo, 'rockstars', 'level', 'INT NOT NULL DEFAULT 1');
            add_column($pdo, 'rockstars', 'skill_points', 'INT NOT NULL DEFAULT 0');
            add_column($pdo, 'songs', 'learned', 'INT NOT NULL DEFAULT 0');
        },

        // 3: progression systems — counters, achievements, daily goals; security — login attempts; social — follows
        3 => function (PDO $pdo) {
            $t = sql_types();
            $pdo->exec("CREATE TABLE IF NOT EXISTS counters (
                rockstar_id {$t['FK']} NOT NULL, ckey VARCHAR(40) NOT NULL, value INT NOT NULL DEFAULT 0,
                PRIMARY KEY (rockstar_id, ckey)) {$t['END']}");
            $pdo->exec("CREATE TABLE IF NOT EXISTS achievements (
                rockstar_id {$t['FK']} NOT NULL, akey VARCHAR(40) NOT NULL, unlocked_at INT NOT NULL,
                PRIMARY KEY (rockstar_id, akey)) {$t['END']}");
            $pdo->exec("CREATE TABLE IF NOT EXISTS daily_goals (
                rockstar_id {$t['FK']} NOT NULL, day VARCHAR(10) NOT NULL, slot INT NOT NULL, gkey VARCHAR(40) NOT NULL,
                target INT NOT NULL, progress INT NOT NULL DEFAULT 0, reward_cash INT NOT NULL, reward_xp INT NOT NULL,
                claimed INT NOT NULL DEFAULT 0, PRIMARY KEY (rockstar_id, day, slot)) {$t['END']}");
            $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
                id {$t['PK']}, ukey VARCHAR(120) NOT NULL, at INT NOT NULL) {$t['END']}");
            $pdo->exec("CREATE TABLE IF NOT EXISTS follows (
                follower_id {$t['FK']} NOT NULL, followed_id {$t['FK']} NOT NULL, created_at INT NOT NULL,
                PRIMARY KEY (follower_id, followed_id)) {$t['END']}");
            add_index($pdo, 'idx_login_attempts', 'login_attempts', 'ukey, at');
            add_index($pdo, 'idx_rockstars_level', 'rockstars', 'level');
            add_index($pdo, 'idx_rockstars_wpm', 'rockstars', 'best_wpm');
            add_index($pdo, 'idx_rockstars_gigs', 'rockstars', 'gigs_played');
        },

        // 4: saved outfit presets (designer)
        4 => function (PDO $pdo) {
            $t = sql_types();
            $pdo->exec("CREATE TABLE IF NOT EXISTS look_presets (
                rockstar_id {$t['FK']} NOT NULL, slot INT NOT NULL, name VARCHAR(30) NOT NULL, appearance {$t['TEXT']} NOT NULL, saved_at INT NOT NULL,
                PRIMARY KEY (rockstar_id, slot)) {$t['END']}");
        },

        // 5: next change goes here …
    ];
}

/* ---------------------------------------------------------------- runner */

function run_migrations(PDO $pdo): void
{
    $t = sql_types();
    $pdo->exec("CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL PRIMARY KEY, applied_at INT NOT NULL) {$t['END']}");
    $current = (int)$pdo->query('SELECT COALESCE(MAX(version), 0) FROM schema_version')->fetchColumn();
    foreach (migrations() as $version => $step) {
        if ($version <= $current) continue;
        $step($pdo);
        $pdo->prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')->execute([$version, time()]);
    }
}

function schema_version(PDO $pdo): int
{
    return (int)$pdo->query('SELECT COALESCE(MAX(version), 0) FROM schema_version')->fetchColumn();
}

/* ---------------------------------------------------------------- portable helpers */

function sql_types(): array
{
    return DB_DRIVER === 'mysql'
        ? ['PK' => 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY', 'FK' => 'INT UNSIGNED', 'TEXT' => 'MEDIUMTEXT', 'END' => 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci']
        : ['PK' => 'INTEGER PRIMARY KEY AUTOINCREMENT', 'FK' => 'INTEGER', 'TEXT' => 'TEXT', 'END' => ''];
}

function column_exists(PDO $pdo, string $table, string $col): bool
{
    if (DB_DRIVER === 'mysql') {
        $st = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $st->execute([$col]);
        return (bool)$st->fetch();
    }
    foreach ($pdo->query("PRAGMA table_info($table)") as $c) if ($c['name'] === $col) return true;
    return false;
}

function add_column(PDO $pdo, string $table, string $col, string $ddl): void
{
    if (!column_exists($pdo, $table, $col)) $pdo->exec("ALTER TABLE $table ADD COLUMN $col $ddl");
}

function add_index(PDO $pdo, string $name, string $table, string $cols): void
{
    if (DB_DRIVER === 'mysql') {
        $exists = $pdo->query("SHOW INDEX FROM `$table` WHERE Key_name = " . $pdo->quote($name))->fetch();
        if (!$exists) $pdo->exec("CREATE INDEX `$name` ON `$table` ($cols)");
    } else {
        $pdo->exec("CREATE INDEX IF NOT EXISTS $name ON $table ($cols)");
    }
}

/** Base-schema statements (from lib/db.php); index statements are routed through add_index for MySQL. */
function run_schema_sql(PDO $pdo, string $sql): void
{
    if (preg_match('/^CREATE INDEX IF NOT EXISTS (\w+) ON (\w+) \((.+)\)/', $sql, $m)) { add_index($pdo, $m[1], $m[2], $m[3]); return; }
    $pdo->exec($sql);
}
