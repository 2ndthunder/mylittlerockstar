<?php
// Database: one schema definition that works on both MySQL and SQLite.
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if (DB_DRIVER === 'mysql') {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, $opts);
    } else {
        $dir = dirname(DB_SQLITE_PATH);
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        $pdo = new PDO('sqlite:' . DB_SQLITE_PATH, null, null, $opts);
        $pdo->exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    }
    migrate($pdo);
    return $pdo;
}

function is_mysql(): bool { return DB_DRIVER === 'mysql'; }

/** Version-1 base schema (as first shipped — never edit; add a migration in lib/migrations.php). Neutral dialect; {PK}, {TEXT}, {END} are swapped per driver. */
function schema_statements(string $driver): array
{
    $map = $driver === 'mysql'
        ? ['{PK}' => 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY', '{FK}' => 'INT UNSIGNED', '{TEXT}' => 'MEDIUMTEXT',
           '{STR}' => 'VARCHAR(191)', '{END}' => ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci']
        : ['{PK}' => 'INTEGER PRIMARY KEY AUTOINCREMENT', '{FK}' => 'INTEGER', '{TEXT}' => 'TEXT',
           '{STR}' => 'TEXT', '{END}' => ')'];

    $sql = [
        "CREATE TABLE IF NOT EXISTS users (
            id {PK},
            username {STR} NOT NULL UNIQUE,
            pass_hash VARCHAR(255) NOT NULL,
            created_at INT NOT NULL
        {END}",

        // One rockstar per account. Looks and backstory are JSON so customization can grow without migrations.
        "CREATE TABLE IF NOT EXISTS rockstars (
            id {PK},
            user_id {FK} NOT NULL UNIQUE,
            stage_name {STR} NOT NULL,
            real_name {STR} NOT NULL DEFAULT '',
            pronouns VARCHAR(40) NOT NULL DEFAULT 'they/them',
            gender VARCHAR(60) NOT NULL DEFAULT 'unsaid',
            age INT NOT NULL DEFAULT 21,
            hometown VARCHAR(80) NOT NULL DEFAULT '',
            bio {TEXT},
            backstory {TEXT} NOT NULL,
            appearance {TEXT} NOT NULL,
            instrument VARCHAR(20) NOT NULL,
            musicianship DOUBLE NOT NULL DEFAULT 10,
            vocals DOUBLE NOT NULL DEFAULT 10,
            songwriting DOUBLE NOT NULL DEFAULT 10,
            stagecraft DOUBLE NOT NULL DEFAULT 10,
            charisma DOUBLE NOT NULL DEFAULT 10,
            stamina DOUBLE NOT NULL DEFAULT 10,
            energy DOUBLE NOT NULL DEFAULT 100,
            mood DOUBLE NOT NULL DEFAULT 70,
            cash INT NOT NULL DEFAULT 0,
            fame INT NOT NULL DEFAULT 0,
            fans INT NOT NULL DEFAULT 0,
            gigs_played INT NOT NULL DEFAULT 0,
            best_wpm INT NOT NULL DEFAULT 0,
            last_rest INT NOT NULL DEFAULT 0,
            last_tick INT NOT NULL,
            created_at INT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        {END}",

        "CREATE TABLE IF NOT EXISTS bands (
            id {PK},
            rockstar_id {FK} NOT NULL UNIQUE,
            name {STR} NOT NULL,
            genre VARCHAR(20) NOT NULL,
            chemistry DOUBLE NOT NULL DEFAULT 20,
            created_at INT NOT NULL,
            FOREIGN KEY (rockstar_id) REFERENCES rockstars(id) ON DELETE CASCADE
        {END}",

        "CREATE TABLE IF NOT EXISTS bandmates (
            id {PK},
            band_id {FK} NOT NULL,
            name {STR} NOT NULL,
            role VARCHAR(20) NOT NULL,
            pronouns VARCHAR(40) NOT NULL DEFAULT 'they/them',
            personality VARCHAR(20) NOT NULL,
            skill DOUBLE NOT NULL,
            loyalty DOUBLE NOT NULL DEFAULT 60,
            wage INT NOT NULL,
            appearance {TEXT} NOT NULL,
            hired_at INT NOT NULL,
            FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE CASCADE
        {END}",

        "CREATE TABLE IF NOT EXISTS songs (
            id {PK},
            band_id {FK} NOT NULL,
            title {STR} NOT NULL,
            genre VARCHAR(20) NOT NULL,
            theme VARCHAR(20) NOT NULL,
            bpm INT NOT NULL,
            lyrics {TEXT} NOT NULL,
            quality DOUBLE NOT NULL,
            tightness DOUBLE NOT NULL DEFAULT 0,
            times_played INT NOT NULL DEFAULT 0,
            released_at INT,
            streams INT NOT NULL DEFAULT 0,
            created_at INT NOT NULL,
            FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE CASCADE
        {END}",

        "CREATE TABLE IF NOT EXISTS gigs (
            id {PK},
            rockstar_id {FK} NOT NULL,
            venue VARCHAR(20) NOT NULL,
            setlist {TEXT} NOT NULL,
            performance DOUBLE NOT NULL,
            attendance INT NOT NULL,
            earnings INT NOT NULL,
            fans_gained INT NOT NULL,
            fame_gained INT NOT NULL,
            stars INT NOT NULL,
            review {TEXT} NOT NULL,
            played_at INT NOT NULL,
            FOREIGN KEY (rockstar_id) REFERENCES rockstars(id) ON DELETE CASCADE
        {END}",

        "CREATE TABLE IF NOT EXISTS wardrobe (
            rockstar_id {FK} NOT NULL,
            item VARCHAR(60) NOT NULL,
            bought_at INT NOT NULL,
            PRIMARY KEY (rockstar_id, item),
            FOREIGN KEY (rockstar_id) REFERENCES rockstars(id) ON DELETE CASCADE
        {END}",

        "CREATE TABLE IF NOT EXISTS news (
            id {PK},
            rockstar_id {FK} NOT NULL,
            kind VARCHAR(20) NOT NULL,
            text {TEXT} NOT NULL,
            created_at INT NOT NULL,
            FOREIGN KEY (rockstar_id) REFERENCES rockstars(id) ON DELETE CASCADE
        {END}",

        // Fired / hired history so recruits don't repeat on the same day.
        "CREATE TABLE IF NOT EXISTS recruit_log (
            rockstar_id {FK} NOT NULL,
            day VARCHAR(10) NOT NULL,
            slot INT NOT NULL,
            PRIMARY KEY (rockstar_id, day, slot)
        {END}",

        "CREATE INDEX IF NOT EXISTS idx_news ON news (rockstar_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_fame ON rockstars (fame)",
    ];

    return array_map(function ($s) use ($map, $driver) {
        $s = strtr($s, $map);
        // MySQL < 8.0.29 has no CREATE INDEX IF NOT EXISTS; indexes are created in migrate() instead.
        return $s;
    }, $sql);
}

require_once __DIR__ . '/migrations.php';

function migrate(PDO $pdo): void { run_migrations($pdo); }

function insert_ignore(): string { return is_mysql() ? 'INSERT IGNORE' : 'INSERT OR IGNORE'; }

/** Two-argument scalar min/max: SQLite uses MIN()/MAX(), MySQL uses LEAST()/GREATEST(). */
function sql_min(): string { return is_mysql() ? 'LEAST' : 'MIN'; }
function sql_max(): string { return is_mysql() ? 'GREATEST' : 'MAX'; }
