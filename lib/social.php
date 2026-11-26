<?php
// Social layer: public profiles, follows, leaderboards. Groundwork for friends, band battles and shared festivals.
declare(strict_types=1);

function rockstar_id(int $uid, bool $required = true): int
{
    $st = db()->prepare('SELECT id FROM rockstars WHERE user_id = ?');
    $st->execute([$uid]);
    $id = (int)$st->fetchColumn();
    if (!$id && $required) fail('Create your rockstar first.');
    return $id;
}

function find_rockstar_by_name(string $name): ?array
{
    $st = db()->prepare('SELECT * FROM rockstars WHERE LOWER(stage_name) = LOWER(?) ORDER BY fame DESC LIMIT 1');
    $st->execute([trim($name)]);
    return $st->fetch() ?: null;
}

/** What anyone can see about a rockstar. */
function public_profile(string $name, int $viewerRid = 0): array
{
    $r = find_rockstar_by_name($name) ?? fail('No rockstar by that name.');
    $band = band_of($r);
    $mates = bandmates((int)$band['id']);
    $ach = db()->prepare('SELECT COUNT(*) FROM achievements WHERE rockstar_id = ?'); $ach->execute([$r['id']]);
    $gigs = db()->prepare('SELECT venue, stars, attendance, played_at FROM gigs WHERE rockstar_id = ? ORDER BY played_at DESC LIMIT 5'); $gigs->execute([$r['id']]);
    $songs = db()->prepare('SELECT title, quality, streams FROM songs WHERE band_id = ? AND released_at IS NOT NULL ORDER BY streams DESC LIMIT 5'); $songs->execute([$band['id']]);
    $fol = db()->prepare('SELECT COUNT(*) FROM follows WHERE followed_id = ?'); $fol->execute([$r['id']]);
    $following = false;
    if ($viewerRid) { $f = db()->prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?'); $f->execute([$viewerRid, $r['id']]); $following = (bool)$f->fetch(); }
    return [
        'stageName' => $r['stage_name'], 'pronouns' => $r['pronouns'], 'hometown' => $r['hometown'], 'bio' => $r['bio'],
        'appearance' => json_decode($r['appearance'], true), 'level' => (int)$r['level'], 'fame' => (int)$r['fame'],
        'tier' => fame_tier((int)$r['fame'])['name'], 'fans' => (int)$r['fans'], 'gigsPlayed' => (int)$r['gigs_played'],
        'bestWpm' => (int)$r['best_wpm'], 'achievements' => (int)$ach->fetchColumn(), 'achievementsTotal' => count(ACHIEVEMENTS),
        'followers' => (int)$fol->fetchColumn(), 'following' => $following, 'isYou' => $viewerRid === (int)$r['id'],
        'band' => ['name' => $band['name'], 'genre' => GENRES[$band['genre']]['name'] ?? $band['genre'],
            'members' => array_map(fn($m) => ['name' => $m['name'], 'role' => BAND_ROLES[$m['role']], 'appearance' => json_decode($m['appearance'], true)], $mates)],
        'recentGigs' => array_map(fn($g) => ['venue' => VENUES[$g['venue']]['name'] ?? $g['venue'], 'stars' => (int)$g['stars'], 'attendance' => (int)$g['attendance']], $gigs->fetchAll()),
        'topSingles' => array_map(fn($s) => ['title' => $s['title'], 'streams' => (int)$s['streams']], $songs->fetchAll()),
    ];
}

function act_follow(int $rid, string $name, bool $on): array
{
    $t = find_rockstar_by_name($name) ?? fail('No rockstar by that name.');
    if ((int)$t['id'] === $rid) fail("You can't follow yourself.");
    if ($on) db()->prepare(insert_ignore() . ' INTO follows (follower_id, followed_id, created_at) VALUES (?,?,?)')->execute([$rid, $t['id'], time()]);
    else db()->prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?')->execute([$rid, $t['id']]);
    return ['ok' => true, 'following' => $on, 'message' => $on ? "You're following {$t['stage_name']}." : "Unfollowed {$t['stage_name']}."];
}

const LEADERBOARDS = [
    'fame'  => ['label' => 'Fame',         'order' => 'r.fame DESC, r.fans DESC'],
    'level' => ['label' => 'Level',        'order' => 'r.level DESC, r.xp DESC'],
    'wpm'   => ['label' => 'Typing speed', 'order' => 'r.best_wpm DESC'],
    'gigs'  => ['label' => 'Gigs played',  'order' => 'r.gigs_played DESC'],
    'fans'  => ['label' => 'Fans',         'order' => 'r.fans DESC'],
];

function leaderboard(string $by): array
{
    $order = (LEADERBOARDS[$by] ?? LEADERBOARDS['fame'])['order'];
    $rows = db()->query("SELECT r.stage_name, r.fame, r.fans, r.level, r.appearance, r.gigs_played, r.best_wpm, b.name AS band, b.genre
        FROM rockstars r JOIN bands b ON b.rockstar_id = r.id ORDER BY $order LIMIT 25")->fetchAll();
    foreach ($rows as &$x) {
        $x['appearance'] = json_decode($x['appearance'], true);
        $x['tier'] = fame_tier((int)$x['fame'])['name'];
        foreach (['fame', 'fans', 'level', 'gigs_played', 'best_wpm'] as $k) $x[$k] = (int)$x[$k];
    }
    return $rows;
}
