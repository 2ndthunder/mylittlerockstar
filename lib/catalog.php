<?php
// Game data that isn't about looks: backstory, genres, venues, fame tiers, stage moves, bandmates, songs.
// Looks live in assets/data/catalog.json (shared with the JS renderer).
declare(strict_types=1);

function looks(): array
{
    static $c = null;
    return $c ??= json_decode(file_get_contents(__DIR__ . '/../assets/data/catalog.json'), true);
}

const SKILLS = [
    'musicianship' => 'Musicianship',
    'vocals'       => 'Vocals',
    'songwriting'  => 'Songwriting',
    'stagecraft'   => 'Stage presence',
    'charisma'     => 'Charisma',
    'stamina'      => 'Stamina',
];

const GENRES = [
    'punk'      => ['name' => 'Punk',        'bpm' => [160, 190], 'scale' => 'major'],
    'grunge'    => ['name' => 'Grunge',      'bpm' => [110, 135], 'scale' => 'minor'],
    'metal'     => ['name' => 'Metal',       'bpm' => [140, 180], 'scale' => 'minor'],
    'glam'      => ['name' => 'Glam rock',   'bpm' => [115, 135], 'scale' => 'major'],
    'indie'     => ['name' => 'Indie rock',  'bpm' => [105, 130], 'scale' => 'major'],
    'poppunk'   => ['name' => 'Pop-punk',    'bpm' => [150, 175], 'scale' => 'major'],
    'classic'   => ['name' => 'Classic rock','bpm' => [100, 125], 'scale' => 'major'],
    'emo'       => ['name' => 'Emo',         'bpm' => [120, 150], 'scale' => 'minor'],
    'psych'     => ['name' => 'Psychedelic', 'bpm' => [90, 115],  'scale' => 'minor'],
    'altcountry'=> ['name' => 'Alt-country', 'bpm' => [95, 120],  'scale' => 'major'],
];

// Backstory choices. "mods" adjust starting skills; "perk" is a lasting effect used in game rules.
const BACKSTORY = [
    'origin' => [
        'smalltown' => ['name' => 'Small town',     'desc' => 'Nothing to do but play. Long nights built your endurance.', 'mods' => ['stamina' => 6, 'songwriting' => 2]],
        'bigcity'   => ['name' => 'Big city',       'desc' => 'You grew up surrounded by clubs, noise and hustle.',        'mods' => ['charisma' => 5, 'stagecraft' => 3]],
        'suburbs'   => ['name' => 'Suburbs',        'desc' => 'A quiet bedroom, headphones and a notebook full of lyrics.','mods' => ['songwriting' => 6, 'musicianship' => 2]],
        'ontheroad' => ['name' => 'On the road',    'desc' => 'Raised in a tour van. The stage feels like home.',          'mods' => ['stagecraft' => 6, 'stamina' => 2]],
        'overseas'  => ['name' => 'Moved overseas', 'desc' => 'New country, new sounds. You absorb everything.',           'mods' => ['musicianship' => 4, 'charisma' => 4]],
    ],
    'upbringing' => [
        'musicfamily' => ['name' => 'Music family',        'desc' => 'Instruments were your first toys.',                  'mods' => ['musicianship' => 8],                   'cash' => 0],
        'choir'       => ['name' => 'Choir kid',           'desc' => 'Years of choir gave you a voice that fills a room.', 'mods' => ['vocals' => 8],                         'cash' => 0],
        'garage'      => ['name' => 'Garage kid',          'desc' => 'Loud, sloppy, fearless. You learned by doing.',      'mods' => ['stagecraft' => 4, 'stamina' => 4],     'cash' => 0],
        'classical'   => ['name' => 'Classically trained', 'desc' => 'Flawless technique, terrible stage fright.',         'mods' => ['musicianship' => 12, 'stagecraft' => -4], 'cash' => 0],
        'busker'      => ['name' => 'Street busker',       'desc' => 'Strangers paid you to play. You know how to hook a crowd.', 'mods' => ['charisma' => 5, 'stagecraft' => 3], 'cash' => 60],
        'richkid'     => ['name' => 'Rich kid',            'desc' => 'Great gear, zero street credibility.',               'mods' => ['charisma' => -2],                      'cash' => 600],
    ],
    'influence' => [
        'sixties'   => ['name' => '60s psychedelia', 'genre' => 'psych'],
        'seventies' => ['name' => '70s hard rock',   'genre' => 'classic'],
        'glam'      => ['name' => 'Glam & glitter',  'genre' => 'glam'],
        'eighties'  => ['name' => '80s arena metal', 'genre' => 'metal'],
        'punk'      => ['name' => 'Original punk',   'genre' => 'punk'],
        'nineties'  => ['name' => '90s grunge',      'genre' => 'grunge'],
        'twothous'  => ['name' => '2000s pop-punk',  'genre' => 'poppunk'],
        'emo'       => ['name' => 'Emo & screamo',   'genre' => 'emo'],
        'indie'     => ['name' => 'Indie & lo-fi',   'genre' => 'indie'],
        'country'   => ['name' => 'Outlaw country',  'genre' => 'altcountry'],
    ],
    'motivation' => [
        'fame'    => ['name' => 'Fame',             'desc' => 'You want your name in lights.',      'perk' => 'fame_gain'],
        'art'     => ['name' => 'The art',          'desc' => 'The song matters more than the crowd.', 'perk' => 'song_quality'],
        'money'   => ['name' => 'Money',            'desc' => 'Rock and roll pays the rent. Eventually.', 'perk' => 'cash_gain'],
        'fans'    => ['name' => 'The fans',         'desc' => 'Every face in the crowd matters.',   'perk' => 'fan_gain'],
        'haters'  => ['name' => 'Prove them wrong', 'desc' => 'Everyone said you would fail.',      'perk' => 'practice_gain'],
        'escape'  => ['name' => 'Escape',           'desc' => 'Music is the only place you feel free.', 'perk' => 'mood_floor'],
    ],
    'trait' => [
        'perfectionist' => ['name' => 'Perfectionist', 'desc' => 'Practice pays off more. Bad shows sting more.', 'mods' => ['musicianship' => 3]],
        'wildchild'     => ['name' => 'Wild child',    'desc' => 'Risky stage moves land more often.',            'mods' => ['stagecraft' => 3]],
        'shygenius'     => ['name' => 'Shy genius',    'desc' => 'Brilliant writer, awkward talker.',             'mods' => ['songwriting' => 6, 'charisma' => -3]],
        'showman'       => ['name' => 'Natural showman','desc' => 'Born for the spotlight.',                      'mods' => ['charisma' => 4, 'stagecraft' => 2]],
        'nightowl'      => ['name' => 'Night owl',     'desc' => 'Recovers energy faster.',                       'mods' => ['stamina' => 3]],
        'leader'        => ['name' => 'Born leader',   'desc' => 'Band chemistry grows faster.',                  'mods' => ['charisma' => 2]],
    ],
];

const GENDER_IDENTITIES = ['woman' => 'Woman', 'man' => 'Man', 'nonbinary' => 'Non-binary', 'genderfluid' => 'Genderfluid',
    'agender' => 'Agender', 'twospirit' => 'Two-Spirit', 'unsaid' => 'Prefer not to say', 'custom' => 'Self-describe'];
const PRONOUNS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any', 'custom'];

const FAME_TIERS = [
    0      => 'Garage Nobody',
    100    => 'Open-Mic Regular',
    500    => 'Local Buzz',
    2000   => 'Club Circuit',
    8000   => 'Rising Star',
    25000  => 'Headliner',
    80000  => 'Arena Act',
    200000 => 'Rock Legend',
];

// Venues: fame needed, capacity, ticket price, set length (songs), art file.
const VENUES = [
    'openmic'  => ['name' => 'Open Mic Night',      'fame' => 0,      'cap' => 30,    'ticket' => 0,  'songs' => [1, 2], 'tier' => 1, 'art' => 'openmic.jpg',  'desc' => 'Tip jar, sticky floor, a sign-up sheet.'],
    'divebar'  => ['name' => 'The Rusty Nail',      'fame' => 50,     'cap' => 80,    'ticket' => 5,  'songs' => [2, 3], 'tier' => 2, 'art' => 'divebar.jpg',  'desc' => 'A dive bar with a stage made of pallets.'],
    'basement' => ['name' => 'Basement Club',       'fame' => 300,    'cap' => 200,   'ticket' => 8,  'songs' => [2, 4], 'tier' => 3, 'art' => 'basement.jpg', 'desc' => 'Sweaty all-ages underground venue.'],
    'velvet'   => ['name' => 'The Velvet Room',     'fame' => 1500,   'cap' => 500,   'ticket' => 15, 'songs' => [3, 4], 'tier' => 4, 'art' => 'velvet.jpg',   'desc' => 'Proper lights, proper sound, proper crowd.'],
    'theater'  => ['name' => 'Grand City Theater',  'fame' => 6000,   'cap' => 1800,  'ticket' => 30, 'songs' => [3, 5], 'tier' => 5, 'art' => 'theater.jpg',  'desc' => 'Red velvet seats and a famous stage.'],
    'festival' => ['name' => 'Festival Side Stage', 'fame' => 15000,  'cap' => 6000,  'ticket' => 25, 'songs' => [3, 5], 'tier' => 6, 'art' => 'festival.jpg', 'desc' => 'Open air, mud, and thousands of new ears.'],
    'arena'    => ['name' => 'The Dome Arena',      'fame' => 50000,  'cap' => 15000, 'ticket' => 55, 'songs' => [4, 5], 'tier' => 7, 'art' => 'arena.jpg',    'desc' => 'Pyro rigs, giant screens, a roaring sea of fans.'],
    'stadium'  => ['name' => 'Stadium Headline',    'fame' => 150000, 'cap' => 50000, 'ticket' => 80, 'songs' => [4, 6], 'tier' => 8, 'art' => 'stadium.jpg',  'desc' => 'The biggest stage there is.'],
];

// Stage moves between songs. risk 1-4; skill drives the success chance; cost in cash.
const MOVES = [
    'banter'  => ['name' => 'Talk to the crowd',  'risk' => 1, 'skill' => 'charisma',     'cost' => 0,   'desc' => 'Tell a story, get them laughing.'],
    'solo'    => ['name' => 'Rip a solo',         'risk' => 2, 'skill' => 'musicianship', 'cost' => 0,   'desc' => 'Show off your chops.'],
    'singalong'=>['name' => 'Crowd singalong',    'risk' => 2, 'skill' => 'vocals',       'cost' => 0,   'desc' => 'Make the whole room sing.'],
    'surf'    => ['name' => 'Crowd surf',         'risk' => 3, 'skill' => 'stamina',      'cost' => 0,   'desc' => 'Trust fall into the pit.'],
    'pyro'    => ['name' => 'Pyro blast',         'risk' => 3, 'skill' => 'stagecraft',   'cost' => 80,  'desc' => 'Fire cannons. What could go wrong?', 'minTier' => 4],
    'smash'   => ['name' => 'Smash your gear',    'risk' => 4, 'skill' => 'stagecraft',   'cost' => 200, 'desc' => 'Legendary if it lands. Expensive either way.', 'minTier' => 3],
];

const PERSONALITIES = [
    'reliable' => ['name' => 'Reliable',     'desc' => 'Always on time. Steady chemistry.',            'chem' => 1.1, 'perf' => 1.0,  'wage' => 1.0],
    'prodigy'  => ['name' => 'Prodigy',      'desc' => 'Ridiculously talented, a little arrogant.',    'chem' => 0.8, 'perf' => 1.15, 'wage' => 1.4],
    'party'    => ['name' => 'Party animal', 'desc' => 'Great energy on stage, chaos off it.',         'chem' => 1.2, 'perf' => 0.95, 'wage' => 0.9],
    'diva'     => ['name' => 'Diva',         'desc' => 'Star power, high maintenance.',                'chem' => 0.7, 'perf' => 1.1,  'wage' => 1.6],
    'chill'    => ['name' => 'Chill',        'desc' => 'Goes with the flow. Cheap, easy to work with.','chem' => 1.15,'perf' => 0.9,  'wage' => 0.8],
];

const FIRST_NAMES = ['Ash', 'Rex', 'Jet', 'Nova', 'Skye', 'Vex', 'Riot', 'Mika', 'Lux', 'Dax', 'Roxy', 'Kai', 'Zed', 'Indy', 'Juno',
    'Bo', 'Sid', 'Echo', 'Raven', 'Taz', 'Fern', 'Ozzy', 'Lola', 'Cass', 'Remy', 'Sasha', 'Quinn', 'Ziggy', 'Marlo', 'Pip', 'Wren', 'Toni'];
const LAST_NAMES = ['Static', 'Vane', 'Blaze', 'Steel', 'Crow', 'Voltage', 'Thorn', 'Riff', 'Moon', 'Fury', 'Holloway', 'Wilde',
    'Black', 'Strummer', 'Kade', 'Ravenwood', 'Cross', 'Jett', 'Daze', 'Rook', 'Sparks', 'Lockhart', 'Neon', 'Graves'];

const SONG_THEMES = [
    'heartbreak' => ['name' => 'Heartbreak',  'genres' => ['emo', 'indie', 'altcountry', 'grunge'],
        'words' => ['broken', 'heart', 'goodbye', 'rain', 'tonight', 'alone', 'tears', 'memory', 'leave', 'falling', 'cold', 'shadow']],
    'rebellion'  => ['name' => 'Rebellion',   'genres' => ['punk', 'metal', 'poppunk'],
        'words' => ['riot', 'scream', 'never', 'rules', 'burn', 'fight', 'loud', 'freedom', 'break', 'system', 'noise', 'rise']],
    'party'      => ['name' => 'Party',       'genres' => ['glam', 'poppunk', 'classic'],
        'words' => ['dance', 'night', 'wild', 'lights', 'jump', 'shout', 'louder', 'forever', 'crazy', 'glitter', 'move', 'young']],
    'road'       => ['name' => 'On the road', 'genres' => ['classic', 'altcountry', 'indie'],
        'words' => ['highway', 'engine', 'miles', 'dust', 'home', 'radio', 'driving', 'horizon', 'wheels', 'sunset', 'town', 'gone']],
    'cosmic'     => ['name' => 'Cosmic',      'genres' => ['psych', 'glam', 'metal'],
        'words' => ['stars', 'cosmic', 'galaxy', 'dream', 'orbit', 'neon', 'float', 'moon', 'electric', 'space', 'drift', 'light']],
    'dark'       => ['name' => 'Darkness',    'genres' => ['metal', 'grunge', 'emo'],
        'words' => ['darkness', 'crawl', 'demon', 'silence', 'bleed', 'ashes', 'storm', 'grave', 'chains', 'howl', 'fear', 'void']],
];

const BAND_ROLES = ['guitar' => 'Lead guitar', 'bass' => 'Bass', 'drums' => 'Drums', 'keys' => 'Keys', 'vocals' => 'Vocals', 'violin' => 'Strings', 'horns' => 'Horns', 'dj' => 'DJ'];
const MAX_BAND = 5;   // including the player
