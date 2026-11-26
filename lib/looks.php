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

/** Random look for NPCs (free items only, seeded so a recruit always looks the same). */
function random_appearance(string $role, int $seed): array
{
    mt_srand($seed);
    $L = looks(); $P = $L['palettes'];
    $pick = fn(array $a) => $a[mt_rand(0, count($a) - 1)];
    $free = fn(array $list) => array_values(array_filter($list, fn($i) => empty($i['price']) && empty($i['fame'])));
    $item = fn(array $list) => ['id' => $pick($free($list))['id'], 'color' => $pick($P['fabric']), 'color2' => $pick($P['fabric']),
        'pattern' => mt_rand(1, 4) === 1 ? $pick($L['patterns'])['id'] : 'solid'];
    $tattoos = [];
    for ($n = mt_rand(0, 3), $k = 0; $k < $n; $k++) {
        $tattoos[] = ['slot' => $pick($L['tattoos']['slots'])['id'], 'design' => $pick($free($L['tattoos']['designs']))['id'], 'color' => $pick(array_slice($P['ink'], 0, 3))];
    }
    $top = $item($L['outfit']['top']);
    if (mt_rand(1, 3) === 1) $top['print'] = $pick(['ROCK', 'RIOT', 'NOISE', 'LOUD', 'FUZZ', 'AMPED']);
    $look = [
        'build' => $pick($L['builds'])['id'], 'height' => round(0.94 + mt_rand(0, 12) / 100, 2), 'skin' => $pick(array_slice($P['skin'], 0, 10)),
        'face' => ['shape' => $pick($L['face']['shape'])['id'], 'eyes' => $pick($L['face']['eyes'])['id'], 'eyeColor' => $pick($P['eyes']),
            'brows' => $pick(array_slice($L['face']['brows'], 0, 5))['id'], 'nose' => $pick($L['face']['nose'])['id'],
            'mouth' => $pick($L['face']['mouth'])['id'], 'marks' => mt_rand(1, 3) === 1 ? $pick($L['face']['marks'])['id'] : 'none'],
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
        ],
        'piercings' => array_values(array_map(fn($p) => $p['id'], array_filter($L['piercings'], fn() => mt_rand(1, 6) === 1))),
        'tattoos' => $tattoos,
        'instrument' => ['type' => $role, 'model' => $pick($free($L['instruments'][$role]['models']))['id'],
            'color' => $pick($P['fabric']), 'finish' => $pick($free($L['instruments']['finishes']))['id']],
    ];
    mt_srand();
    return $look;
}
