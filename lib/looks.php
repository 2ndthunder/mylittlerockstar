<?php
// Appearance validation (never trust the client) and random looks for NPC bandmates.
declare(strict_types=1);

function hexcolor($v, string $fallback = '#888888'): string
{
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : $fallback;
}

function find_item(array $list, $id): ?array
{
    foreach ($list as $i) if (($i['id'] ?? null) === $id) return $i;
    return null;
}

/** A slider value: integer -50..50 (0 = default). */
function slider($v): int { return max(-50, min(50, (int)round((float)$v))); }

/** Slider ids from catalog.json, e.g. slider_ids('body') → ['head', 'shoulders', ...]. */
function slider_ids(string $group): array { return array_column(looks()['sliders'][$group] ?? [], 'id'); }

/** Item key used in the wardrobe table, e.g. "outfit.top.corset" or "hair.liberty". */
function item_key(string $group, string $id): string { return "$group.$id"; }

/**
 * Returns a clean appearance. Locked items (price/fame) are only allowed if owned.
 * $owned: set of item keys; $fame: player's fame. Throws GameError on anything locked.
 */
function clean_appearance(array $a, array $owned, int $fame, bool $creating = false): array
{
    $L = looks();
    $locked = function (string $group, ?array $item) use ($owned, $fame, $creating): void {
        if (!$item) fail('Unknown item in ' . $group . '.');
        $price = $item['price'] ?? 0;
        $need = $item['fame'] ?? 0;
        if ($need > $fame) fail($item['name'] . ' unlocks at ' . number_format($need) . ' fame.');
        if ($price > 0 && !isset($owned[item_key($group, $item['id'])])) {
            fail($item['name'] . ($creating ? ' is a shop item. Buy it in the wardrobe after you start.' : ' must be bought in the wardrobe first.'));
        }
    };
    $pickId = fn(array $list, $id, $default) => find_item($list, $id) ? $id : $default;

    $out = [];
    $out['build']  = $pickId($L['builds'], $a['build'] ?? '', 'average');
    $out['height'] = round(max(0.88, min(1.12, (float)($a['height'] ?? 1))), 2);
    $out['skin']   = hexcolor($a['skin'] ?? '', $L['palettes']['skin'][2]);
    $out['stance'] = $pickId($L['stances'], $a['stance'] ?? '', 'relaxed');
    $out['body'] = [];
    foreach (slider_ids('body') as $k) $out['body'][$k] = slider($a['body'][$k] ?? 0);

    $f = $a['face'] ?? [];
    $out['face'] = [
        'shape' => $pickId($L['face']['shape'], $f['shape'] ?? '', 'oval'),
        'eyes' => $pickId($L['face']['eyes'], $f['eyes'] ?? '', 'almond'),
        'eyeColor' => hexcolor($f['eyeColor'] ?? '', '#3b2414'),
        'brows' => $pickId($L['face']['brows'], $f['brows'] ?? '', 'soft'),
        'nose' => $pickId($L['face']['nose'], $f['nose'] ?? '', 'button'),
        'mouth' => $pickId($L['face']['mouth'], $f['mouth'] ?? '', 'smile'),
        'marks' => $pickId($L['face']['marks'], $f['marks'] ?? '', 'none'),
    ];
    foreach (slider_ids('face') as $k) $out['face'][$k] = slider($f[$k] ?? 0);

    $h = $a['hair'] ?? [];
    $style = find_item($L['hair'], $h['style'] ?? '') ?? find_item($L['hair'], 'messy');
    $locked('hair', $style);
    $out['hair'] = [
        'style' => $style['id'],
        'color' => hexcolor($h['color'] ?? '', '#16120f'),
        'color2' => empty($h['color2']) ? '' : hexcolor($h['color2'], ''),
        'facial' => $pickId($L['facialHair'], $h['facial'] ?? '', 'none'),
        'facialColor' => empty($h['facialColor']) ? '' : hexcolor($h['facialColor'], ''),
    ];

    $m = $a['makeup'] ?? [];
    $paint = find_item($L['makeup']['paint'], $m['paint'] ?? 'none') ?? find_item($L['makeup']['paint'], 'none');
    $locked('makeup.paint', $paint);
    $out['makeup'] = [
        'liner' => !empty($m['liner']),
        'shadow' => empty($m['shadow']) ? '' : hexcolor($m['shadow'], ''),
        'lips' => empty($m['lips']) ? '' : hexcolor($m['lips'], ''),
        'paint' => $paint['id'],
        'paintColor' => hexcolor($m['paintColor'] ?? '', '#121216'),
    ];

    $patterns = array_column($L['patterns'], 'id');
    $out['outfit'] = [];
    foreach ($L['outfit'] as $slot => $list) {
        $in = $a['outfit'][$slot] ?? [];
        $default = in_array($slot, ['top', 'bottom', 'shoes'], true) ? $list[0]['id'] : 'none';
        $item = find_item($list, $in['id'] ?? $default) ?? find_item($list, $default);
        $locked("outfit.$slot", $item);
        $o = ['id' => $item['id'], 'color' => hexcolor($in['color'] ?? '', '#121216')];
        if (!empty($in['color2'])) $o['color2'] = hexcolor($in['color2']);
        if (!empty($in['pattern']) && in_array($in['pattern'], $patterns, true)) $o['pattern'] = $in['pattern'];
        if (in_array($slot, ['top', 'outer', 'bottom'], true) && in_array($in['fit'] ?? '', array_column($L['fits'], 'id'), true)) $o['fit'] = $in['fit'];
        if ($slot === 'top' && !empty($item['print']) && !empty($in['print'])) {
            preg_match('/^.{0,12}/u', preg_replace('/[^\p{L}\p{N} !&\-\'.]/u', '', (string)$in['print']), $pm);
            $o['print'] = $pm[0] ?? '';
            if (!empty($in['printColor'])) $o['printColor'] = hexcolor($in['printColor']);
        }
        $out['outfit'][$slot] = $o;
    }

    $validP = array_column($L['piercings'], 'id');
    $out['piercings'] = array_values(array_unique(array_filter((array)($a['piercings'] ?? []), fn($p) => in_array($p, $validP, true))));

    $slots = array_column($L['tattoos']['slots'], 'id');
    $out['tattoos'] = [];
    foreach (array_slice((array)($a['tattoos'] ?? []), 0, $L['tattoos']['max']) as $t) {
        if (!in_array($t['slot'] ?? '', $slots, true)) continue;
        $d = find_item($L['tattoos']['designs'], $t['design'] ?? '');
        $locked('tattoo', $d);
        $out['tattoos'][] = ['slot' => $t['slot'], 'design' => $d['id'], 'color' => hexcolor($t['color'] ?? '', '#1b2236')];
    }

    $i = $a['instrument'] ?? [];
    $type = isset($L['instruments'][$i['type'] ?? '']) && ($i['type'] ?? '') !== 'finishes' ? $i['type'] : 'guitar';
    $model = find_item($L['instruments'][$type]['models'], $i['model'] ?? '') ?? $L['instruments'][$type]['models'][0];
    $locked("instrument.$type", $model);
    $finish = find_item($L['instruments']['finishes'], $i['finish'] ?? 'gloss') ?? $L['instruments']['finishes'][0];
    $locked('finish', $finish);
    $out['instrument'] = ['type' => $type, 'model' => $model['id'], 'color' => hexcolor($i['color'] ?? '', '#b3121f'), 'finish' => $finish['id']];
    return $out;
}

/**
 * A full look from a catalog archetype (the 30 starter characters). With a seed, body/face sliders, skin and
 * sometimes hair colour vary a little so two recruits of the same archetype don't look identical.
 */
function archetype_appearance(string $id, ?int $seed = null): array
{
    $L = looks();
    $ar = null;
    foreach ($L['archetypes'] ?? [] as $x) if ($x['id'] === $id) $ar = $x;
    if (!$ar) fail('Unknown starter look.');
    $look = $ar['look'];
    $none = ['id' => 'none'];
    $base = [
        'build' => 'average', 'height' => 1, 'skin' => '#eab48f', 'stance' => 'relaxed',
        'body' => array_fill_keys(slider_ids('body'), 0),
        'face' => ['shape' => 'oval', 'eyes' => 'classic', 'eyeColor' => '#3b2414', 'brows' => 'soft', 'nose' => 'button', 'mouth' => 'smile', 'marks' => 'none'] + array_fill_keys(slider_ids('face'), 0),
        'hair' => ['style' => 'messy', 'color' => '#16120f', 'color2' => '', 'facial' => 'none', 'facialColor' => ''],
        'makeup' => ['liner' => false, 'shadow' => '', 'lips' => '', 'paint' => 'none', 'paintColor' => '#121216'],
        'outfit' => ['top' => ['id' => 'tee', 'color' => '#121216'], 'outer' => $none, 'bottom' => ['id' => 'skinny', 'color' => '#1d2a4d'], 'legwear' => $none,
            'shoes' => ['id' => 'sneakers', 'color' => '#121216'], 'hat' => $none, 'glasses' => $none, 'neck' => $none, 'wrist' => $none, 'belt' => $none],
        'piercings' => [], 'tattoos' => [],
    ];
    $a = array_merge($base, $look);
    foreach (['body', 'face', 'hair', 'makeup', 'outfit'] as $k) $a[$k] = array_merge($base[$k], $look[$k] ?? []);
    if ($seed !== null) {
        mt_srand($seed);
        foreach (slider_ids('body') as $k) $a['body'][$k] = max(-50, min(50, $a['body'][$k] + mt_rand(-15, 15)));
        foreach (slider_ids('face') as $k) $a['face'][$k] = max(-50, min(50, ($a['face'][$k] ?? 0) + mt_rand(-15, 15)));
        $skins = array_slice($L['palettes']['skin'], 0, 10);
        if (mt_rand(0, 1)) $a['skin'] = $skins[mt_rand(0, count($skins) - 1)];
        if (mt_rand(1, 10) <= 3) $a['hair']['color'] = $L['palettes']['hair'][mt_rand(0, count($L['palettes']['hair']) - 1)];
        mt_srand();
    }
    return $a;
}

/** Swap shop/fame-locked items for free lookalikes (same fallbacks as the designer). */
function freeify_look(array $a): array
{
    $L = looks();
    $FB = ['creepers' => 'sneakers', 'cowboy' => 'boots', 'corset' => 'tank', 'mesh' => 'tank', 'studvest' => 'denimvest', 'trench' => 'leather',
        'flares' => 'skinny', 'platforms' => 'boots', 'fedora' => 'porkpie', 'vee' => 'classic', 'star' => 'classic', 'furcoat' => 'leather', 'tophat' => 'porkpie',
        'hairmetal' => 'curly', 'liberty' => 'spiky', 'pompadour' => 'messy', 'mohawk' => 'spiky', 'locs' => 'braids', 'mullet' => 'messy'];
    $isLocked = fn(?array $i) => $i && (($i['price'] ?? 0) > 0 || ($i['fame'] ?? 0) > 0);
    $fix = function (array $list, $id) use ($FB, $isLocked) {
        $item = find_item($list, $id);
        if (!$isLocked($item)) return $id;
        foreach ([$FB[$id] ?? null, 'none'] as $want) { $f = $want ? find_item($list, $want) : null; if ($f && !$isLocked($f)) return $f['id']; }
        foreach ($list as $i) if (!$isLocked($i)) return $i['id'];
        return $id;
    };
    foreach ($a['outfit'] as $slot => $it) if (isset($L['outfit'][$slot])) $a['outfit'][$slot]['id'] = $fix($L['outfit'][$slot], $it['id'] ?? 'none');
    $a['hair']['style'] = $fix($L['hair'], $a['hair']['style']);
    $a['makeup']['paint'] = $fix($L['makeup']['paint'], $a['makeup']['paint'] ?? 'none');
    $t = $a['instrument']['type'];
    $a['instrument']['model'] = $fix($L['instruments'][$t]['models'], $a['instrument']['model']);
    $a['instrument']['finish'] = $fix($L['instruments']['finishes'], $a['instrument']['finish'] ?? 'gloss');
    return $a;
}

/** Archetype ids whose instrument is this role (e.g. 'horns' → ska, funksax, trumpet). */
function archetypes_for(string $role): array
{
    return array_values(array_map(fn($x) => $x['id'], array_filter(looks()['archetypes'] ?? [], fn($x) => $x['instrument'] === $role)));
}

/**
 * Random look, seeded so a recruit always looks the same. Most are a remix of a starter archetype for the role.
 * $premium = true keeps shop gear (recruits flex items you can't afford yet); otherwise everything is free.
 */
function random_appearance(string $role, int $seed, bool $premium = false): array
{
    mt_srand($seed);
    $pool = archetypes_for($role);
    if ($pool && mt_rand(1, 10) <= 7) {
        $id = $pool[mt_rand(0, count($pool) - 1)];
        mt_srand();
        $look = archetype_appearance($id, $seed);
        return $premium ? $look : freeify_look($look);
    }
    $L = looks(); $P = $L['palettes'];
    $pick = fn(array $a) => $a[mt_rand(0, count($a) - 1)];
    $free = fn(array $list) => array_values(array_filter($list, fn($i) => empty($i['price']) && empty($i['fame'])));
    $item = fn(array $list) => ['id' => $pick($free($list))['id'], 'color' => $pick($P['fabric']), 'color2' => $pick($P['fabric']),
        'pattern' => mt_rand(1, 4) === 1 ? $pick($L['patterns'])['id'] : 'solid', 'fit' => $pick(['regular', 'regular', 'baggy', 'skinny'])];
    $tattoos = [];
    for ($n = mt_rand(0, 3), $k = 0; $k < $n; $k++) {
        $tattoos[] = ['slot' => $pick($L['tattoos']['slots'])['id'], 'design' => $pick($free($L['tattoos']['designs']))['id'], 'color' => $pick(array_slice($P['ink'], 0, 3))];
    }
    $top = $item($L['outfit']['top']);
    if (mt_rand(1, 3) === 1) $top['print'] = $pick(['ROCK', 'RIOT', 'NOISE', 'LOUD', 'FUZZ', 'AMPED']);
    $look = [
        'build' => $pick($L['builds'])['id'], 'height' => round(0.94 + mt_rand(0, 12) / 100, 2), 'skin' => $pick(array_slice($P['skin'], 0, 10)),
        'stance' => $pick(['relaxed', 'relaxed', 'relaxed', 'wide']),
        'body' => array_combine(slider_ids('body'), array_map(fn() => mt_rand(-20, 20), slider_ids('body'))),
        'face' => ['shape' => $pick($L['face']['shape'])['id'], 'eyes' => $pick($L['face']['eyes'])['id'], 'eyeColor' => $pick($P['eyes']),
            'brows' => $pick(array_slice($L['face']['brows'], 0, 5))['id'], 'nose' => $pick($L['face']['nose'])['id'],
            'mouth' => $pick($L['face']['mouth'])['id'], 'marks' => mt_rand(1, 3) === 1 ? $pick($L['face']['marks'])['id'] : 'none']
            + array_combine(slider_ids('face'), array_map(fn() => mt_rand(-25, 25), slider_ids('face'))),
        'hair' => ['style' => $pick($free($L['hair']))['id'], 'color' => $pick($P['hair']), 'color2' => mt_rand(1, 4) === 1 ? $pick($P['hair']) : '',
            'facial' => mt_rand(1, 3) === 1 ? $pick($L['facialHair'])['id'] : 'none', 'facialColor' => ''],
        'makeup' => ['liner' => mt_rand(1, 3) === 1, 'shadow' => '', 'lips' => mt_rand(1, 4) === 1 ? $pick($P['lips']) : '',
            'paint' => mt_rand(1, 8) === 1 ? $pick($free($L['makeup']['paint']))['id'] : 'none', 'paintColor' => '#121216'],
        'outfit' => [
            'top' => $top, 'bottom' => $item($L['outfit']['bottom']),
            'legwear' => ['id' => mt_rand(1, 3) === 1 ? $pick($free($L['outfit']['legwear']))['id'] : 'none', 'color' => '#121216'],
            'shoes' => ['id' => $pick($free($L['outfit']['shoes']))['id'], 'color' => $pick($P['fabric'])],
            'outer' => mt_rand(0, 1) ? ['id' => 'none'] : $item($L['outfit']['outer']),
            'hat' => mt_rand(1, 4) === 1 ? ['id' => $pick($free($L['outfit']['hat']))['id'], 'color' => $pick($P['fabric'])] : ['id' => 'none'],
            'glasses' => mt_rand(1, 4) === 1 ? ['id' => $pick($free($L['outfit']['glasses']))['id'], 'color' => '#121216'] : ['id' => 'none'],
            'neck' => mt_rand(1, 3) === 1 ? ['id' => $pick($free($L['outfit']['neck']))['id'], 'color' => '#c0c5cc'] : ['id' => 'none'],
            'wrist' => mt_rand(1, 2) === 1 ? ['id' => $pick($free($L['outfit']['wrist']))['id'], 'color' => $pick($P['fabric'])] : ['id' => 'none'],
            'belt' => mt_rand(1, 2) === 1 ? ['id' => $pick($free($L['outfit']['belt']))['id'], 'color' => '#141014'] : ['id' => 'none'],
        ],
        'piercings' => array_values(array_map(fn($p) => $p['id'], array_filter($L['piercings'], fn() => mt_rand(1, 6) === 1))),
        'tattoos' => $tattoos,
        'instrument' => ['type' => $role, 'model' => $pick($free($L['instruments'][$role]['models']))['id'],
            'color' => $pick($P['fabric']), 'finish' => $pick($free($L['instruments']['finishes']))['id']],
    ];
    mt_srand();
    return $look;
}
