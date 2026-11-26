// My Little Rockstar — main game UI.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString();
const num = n => Number(n).toLocaleString();

const G = { game: null, state: null, csrf: null, tab: 'home' };
const VENUE_ART = 'assets/art/';

/* ================================================================ API */
async function api(action, data = {}, { quiet = false } = {}) {
  const res = await fetch('api.php', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, csrf: G.csrf, ...data }),
  });
  let j; try { j = await res.json(); } catch { j = { error: 'The server sent an unexpected reply.' }; }
  if (!res.ok || j.error) { if (!quiet) toast(j.error || 'Something went wrong.', 'bad'); throw new Error(j.error); }
  if (j.csrf) G.csrf = j.csrf;
  if ('rockstar' in j) G.state = j;
  if (j.message && !quiet) toast(j.message);
  return j;
}

/* ================================================================ feedback */
function announce(t) { const a = $('#announcer'); a.textContent = ''; setTimeout(() => (a.textContent = t), 40); }
function toast(t, kind = 'good') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = t; $('#toasts').append(el); announce(t);
  setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800);
}
function modal(html, { wide = false } = {}) {
  const d = $('#modal'); d.classList.toggle('wide', wide); $('.modal-body', d).innerHTML = html; if (!d.open) d.showModal(); return $('.modal-body', d);
}
function closeModal() { const d = $('#modal'); if (d.open) d.close(); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function confirmBox(text, yes = 'Yes') {
  return new Promise(res => {
    const b = modal(`<h2 id="modalTitle">Are you sure?</h2><p>${esc(text)}</p><div class="row end"><button class="btn ghost" data-r="0">Cancel</button><button class="btn danger" data-r="1">${esc(yes)}</button></div>`);
    b.querySelectorAll('[data-r]').forEach(x => x.addEventListener('click', () => { closeModal(); res(x.dataset.r === '1'); }));
    b.querySelector('[data-r="0"]').focus();
  });
}
function overlay(html) { const o = $('#overlay'); o.innerHTML = html; o.hidden = false; document.body.classList.add('no-scroll'); return o; }
function closeOverlay() { const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; document.body.classList.remove('no-scroll'); }

/* ================================================================ helpers */
const R = () => G.state.rockstar;
const meter = (label, v, cls = '', max = 100) => `<div class="meter-row ${cls}"><span>${esc(label)}</span>
  <div class="meter" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.round(v)}"><div style="width:${Math.min(100, v / max * 100)}%"></div></div><b>${Math.round(v)}</b></div>`;
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const venueUnlocked = v => R().fame >= v.fame;

/** Lineup of rockstar + bandmates on a stage, depth-sorted for a 2.5D feel. */
function lineup(anim = 'idle', { height = 320 } = {}) {
  const people = [{ look: R().appearance, name: R().stageName, lead: true }, ...G.state.band.members.map(m => ({ look: m.appearance, name: m.name }))];
  const n = people.length;
  // positions: lead in front-centre, others staggered back
  const slots = [[50, 1, 3], [27, 0.86, 2], [73, 0.86, 2], [12, 0.76, 1], [88, 0.76, 1]];
  return `<div class="lineup" style="--h:${height}px">${people.map((p, i) => {
    const [x, s, z] = slots[i] || [50, 0.7, 0];
    const drums = p.look.instrument?.type === 'drums';
    return `<div class="member ${p.lead ? 'lead' : ''}" style="left:${x}%;--s:${drums ? s * 0.92 : s};z-index:${z};--delay:${(i * 0.13).toFixed(2)}s">
      ${Avatar.svg({ ...p.look, stageDrums: true }, { anim, title: p.name })}<span class="tag-name">${esc(p.name)}</span></div>`;
  }).join('')}</div>`;
}

/* ================================================================ layout & tabs */
const TABS = [['home', '🏠 Home'], ['practice', '🎯 Practice'], ['songs', '🎵 Songs'], ['band', '🥁 Band'], ['gigs', '🎤 Gigs'],
  ['wardrobe', '👕 Wardrobe'], ['profile', '🪪 Profile'], ['charts', '🏆 Charts']];

function renderShell() {
  const r = R(), t = r.tier;
  const pct = t.next ? (r.fame - t.floor) / (t.next - t.floor) * 100 : 100;
  $('#topbar').hidden = false;
  $('#topbar').innerHTML = `
    <div class="brand"><span class="logo-sm">My Little <b>Rockstar</b></span></div>
    <div class="who"><b>${esc(r.stageName)}</b> <span class="muted">· ${esc(G.state.band.name)}</span>
      <div class="lvl" title="Level"><span>Lv ${r.level}</span><div class="meter purple" role="progressbar" aria-label="Experience toward level ${r.level + 1}" aria-valuenow="${r.xp}" aria-valuemin="0" aria-valuemax="${r.xpNext}"><div style="width:${Math.min(100, r.xp / r.xpNext * 100)}%"></div></div>
      <small>${num(r.xp)} / ${num(r.xpNext)} XP</small>${r.skillPoints ? `<button class="btn small gold" id="ptsBtn">+${r.skillPoints} skill points</button>` : ''}</div>
      <div class="fame" title="Fame"><span>${esc(t.name)}</span><div class="meter gold" role="progressbar" aria-label="Fame toward next tier" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
      <small>${num(r.fame)}${t.next ? ' / ' + num(t.next) : ''} fame</small></div></div>
    <div class="nums">
      <span title="Cash">💵 <b>${money(r.cash)}</b></span><span title="Fans">🙌 <b>${num(r.fans)}</b></span>
      <span class="mini ${r.energy < 25 ? 'low' : ''}" title="Energy">⚡ <b>${r.energy}</b></span><span class="mini ${r.mood < 30 ? 'low' : ''}" title="Mood">😊 <b>${r.mood}</b></span>
      <button class="btn small" id="restBtn" ${r.restIn ? 'disabled' : ''} title="Rest">${r.restIn ? `💤 ${Math.ceil(r.restIn / 60)}m` : '💤 Rest'}</button>
      <button class="btn small ghost" id="settingsBtn" aria-label="Settings">⚙️</button>
      <button class="btn small ghost" id="logoutBtn">Log out</button>
    </div>
    <nav class="tabs" aria-label="Game sections">${TABS.map(([k, l]) => `<button data-tab="${k}" ${G.tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</nav>`;
  $$('#topbar [data-tab]').forEach(b => b.addEventListener('click', () => { G.tab = b.dataset.tab; render(); }));
  $('#restBtn').addEventListener('click', async () => { try { await api('rest'); render(); } catch {} });
  $('#logoutBtn').addEventListener('click', async () => { await api('logout').catch(() => {}); location.reload(); });
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#ptsBtn')?.addEventListener('click', () => { G.tab = 'home'; render(); $('#skillsCard')?.scrollIntoView({ block: 'center' }); });
}

function render() {
  if (!G.state?.rockstar) return;
  renderShell();
  const main = $('#main');
  main.innerHTML = '';
  ({ home: viewHome, practice: viewPractice, songs: viewSongs, band: viewBand, gigs: viewGigs, wardrobe: viewWardrobe, profile: viewProfile, charts: viewCharts })[G.tab](main);
  main.focus({ preventScroll: true });
}

function openSettings() {
  const s = Stage.settings();
  const b = modal(`<h2 id="modalTitle">Settings</h2>
    <fieldset class="ctl"><legend>Typing difficulty</legend>${Object.entries(Stage.DIFFICULTY).map(([k, d]) =>
      `<label class="radio"><input type="radio" name="diff" value="${k}" ${s.difficulty === k ? 'checked' : ''}> ${esc(d.label)}</label>`).join('')}</fieldset>
    <fieldset class="ctl"><legend>When playing live, play…</legend>
      <label class="radio"><input type="radio" name="part" value="instrument" ${s.part !== 'lyrics' ? 'checked' : ''}> My instrument part (notes on keys)</label>
      <label class="radio"><input type="radio" name="part" value="lyrics" ${s.part === 'lyrics' ? 'checked' : ''}> The lyrics (type the words)</label></fieldset>
    <label class="toggle"><input type="checkbox" name="callouts" ${s.callouts ? 'checked' : ''}> Call-outs: speak each word or key before it arrives (play by ear)</label>
    <label class="ctl">Music volume <input type="range" name="volume" min="0" max="1" step="0.05" value="${s.volume}"></label>
    <div class="row end"><button class="btn primary" id="sSave">Save</button></div>`);
  $('#sSave', b).addEventListener('click', () => {
    Stage.saveSettings({ part: $('input[name=part]:checked', b).value, difficulty: $('input[name=diff]:checked', b).value, callouts: $('input[name=callouts]', b).checked, volume: +$('input[name=volume]', b).value });
    closeModal(); toast('Settings saved.');
  });
}

/* ================================================================ HOME */
function viewHome(main) {
  const r = R(), band = G.state.band;
  main.innerHTML = `
    <section class="scene card" style="background-image:url('${VENUE_ART}garage.jpg')">
      ${lineup('idle', { height: 300 })}
      <div class="scene-caption"><h1>${esc(band.name)}</h1><p>${esc(G.game.genres[band.genre].name)} · chemistry ${band.chemistry}</p></div>
    </section>
    <div class="grid3">
      <section class="card" id="skillsCard"><h2>Skills ${r.skillPoints ? `<span class="tag gold">${r.skillPoints} points to spend</span>` : ''}</h2>
        ${Object.entries(G.game.skills).map(([k, l]) => `<div class="skill-row">${meter(l, r.skills[k])}${r.skillPoints ? `<button class="btn small" data-pt="${k}" aria-label="Spend a point on ${esc(l)}">+2</button>` : ''}</div>`).join('')}
        <p class="muted">Best typing speed: <b>${r.bestWpm} WPM</b> · Gigs played: <b>${r.gigsPlayed}</b></p></section>
      <section class="card"><h2>What next?</h2>${nextSteps().map(s => `<button class="btn block" data-go="${s.tab}">${esc(s.text)}</button>`).join('')}</section>
      <section class="card"><h2>Rock news</h2><ul class="news">${G.state.news.map(n => `<li class="n-${n.kind}">${esc(n.text)}</li>`).join('') || '<li>Nothing yet.</li>'}</ul></section>
    </div>`;
  $$('[data-go]', main).forEach(b => b.addEventListener('click', () => { G.tab = b.dataset.go; render(); }));
  $$('[data-pt]', main).forEach(b => b.addEventListener('click', async () => { try { await api('spend_point', { skill: b.dataset.pt }, { quiet: true }); render(); toast('Skill improved!'); } catch (e) { toast(e.message, 'bad'); } }));
}
function nextSteps() {
  const s = [], songs = G.state.songs, mates = G.state.band.members;
  if (!songs.length) s.push({ tab: 'songs', text: '✍️ Write your first song' });
  if (!mates.length) s.push({ tab: 'band', text: '🧑‍🎤 Recruit a bandmate' });
  if (songs.some(x => !x.learned)) s.push({ tab: 'songs', text: '🎯 Learn a song (play it once to unlock autopilot)' });
  if (songs.length && songs.every(x => x.tightness < 30)) s.push({ tab: 'songs', text: '🔁 Rehearse a song until it\'s tight' });
  if (songs.length) s.push({ tab: 'gigs', text: '🎤 Play a gig' });
  s.push({ tab: 'practice', text: '🎯 Practice a skill' });
  if (songs.some(x => !x.released && x.tightness >= 30)) s.push({ tab: 'songs', text: '💿 Release a single' });
  s.push({ tab: 'wardrobe', text: '👕 Change your look' });
  return s.slice(0, 5);
}

/* ================================================================ PRACTICE */
function viewPractice(main) {
  const r = R();
  main.innerHTML = `<section class="card"><h2>Practice room</h2>
    <p class="muted">Practice on autopilot for steady gains, or <b>play it live</b> for bigger gains and bonus XP (up to 2×). Costs ${G.game.costs.practice} energy.</p>
    <div class="skill-grid">${Object.entries(G.game.skills).map(([k, l]) => `<div class="skill-card"><b>${esc(l)}</b><span>${r.skills[k]}</span>
      <div class="meter"><div style="width:${r.skills[k]}%"></div></div>
      <div class="row"><button class="btn small" data-auto="${k}">🤖 Auto</button><button class="btn small primary" data-skill="${k}">🎸 Live</button></div></div>`).join('')}</div></section>`;
  $$('[data-skill]', main).forEach(b => b.addEventListener('click', () => runPractice(b.dataset.skill)));
  $$('[data-auto]', main).forEach(b => b.addEventListener('click', async () => { try { await api('practice_auto', { skill: b.dataset.auto }); render(); } catch {} }));
}

async function runPractice(skill) {
  let start; try { start = await api('practice_start', { skill }, {}); } catch { return; }
  const o = overlay(performanceScreen('garage.jpg', 'Practice: ' + G.game.skills[skill], false));
  const part = skill === 'vocals' || skill === 'songwriting' || skill === 'charisma' ? 'lyrics' : undefined;
  const result = await Stage.play($('.perf-typer', o), start.chart, { label: 'Practice drill', part, instrument: R().instrument, onHit: k => avatarReact(o, k) });
  closeOverlay();
  if (!result) { toast('Practice stopped.', 'bad'); return; }
  try { await api('practice_finish', { token: start.token, result }); render(); } catch {}
}

/* the full-screen performance layout used by practice / rehearsal / gigs */
function performanceScreen(art, title, crowd, { hype = false } = {}) {
  return `<div class="perf" style="background-image:url('${VENUE_ART}${art}')">
    <div class="perf-top"><h2>${esc(title)}</h2>${hype ? `<div class="hype"><span>Crowd hype</span><div class="meter hot"><div style="width:50%"></div></div></div>` : ''}</div>
    <div class="perf-stage">${lineup('play', { height: 330 })}</div>
    ${crowd ? `<div class="crowd" aria-hidden="true">${crowdHtml(crowd)}</div>` : ''}
    <div class="perf-typer card"></div>
  </div>`;
}
function crowdHtml(size) {
  const n = Math.min(60, 10 + size);
  return [...Array(n)].map((_, i) => `<span class="fan" style="left:${(i * 97) % 100}%;--d:${(i % 7) * 0.11}s;--y:${(i * 37) % 18}px;--c:${['#2a2440', '#1d1830', '#352b52', '#241f3a'][i % 4]}"></span>`).join('');
}
function avatarReact(o, kind) {
  const lead = $('.member.lead', o); if (!lead) return;
  lead.classList.remove('hit-good', 'hit-miss'); void lead.offsetWidth;
  lead.classList.add(kind === 'miss' ? 'hit-miss' : 'hit-good');
}

/* ================================================================ SONGS */
function viewSongs(main) {
  const songs = G.state.songs, costs = G.game.costs;
  main.innerHTML = `
    <section class="card"><div class="title-row"><h2>Songbook</h2><button class="btn primary" id="writeBtn">✍️ Write a song</button></div>
      <p class="muted">Quality comes from songwriting. Tightness comes from rehearsing (typing it with the band). Tight songs can be released as singles for streams and fans.</p>
      ${songs.length ? `<table class="songs"><thead><tr><th><span class="sr-only">Select</span></th><th>Song</th><th>Quality</th><th>Tightness</th><th>Played</th><th></th></tr></thead><tbody>
        ${songs.map(s => `<tr><td><input type="checkbox" class="pick" value="${s.id}" aria-label="Select ${esc(s.title)} for rehearsal"></td>
          <td><b>${esc(s.title)}</b> ${s.learned ? '<span class="tag good">✓ Learned</span>' : '<span class="tag">Not learned</span>'}<br><small class="muted">${esc(G.game.genres[s.genre].name)} · ${esc(G.game.themes[s.theme].name)} · ${s.bpm} BPM</small></td>
          <td>${meter('', s.quality, 'compact')}</td><td>${meter('', s.tightness, 'compact')}</td><td>${s.timesPlayed}</td>
          <td>${s.released ? `<span class="tag">💿 ${num(s.streams)} streams</span>` : `<button class="btn small" data-release="${s.id}" ${s.tightness < 30 ? 'disabled title="Rehearse to 30 tightness first"' : ''}>Release (${money(costs.record)})</button>`}
            ${s.learned ? '' : `<button class="btn small primary" data-learn="${s.id}">🎯 Learn it</button>`}
            <button class="btn small ghost" data-lyrics="${s.id}">Lyrics</button></td></tr>`).join('')}</tbody></table>
        <div class="row"><button class="btn" id="rehearseAuto">🤖 Auto rehearse selected</button><button class="btn primary" id="rehearseBtn">🎸 Rehearse live (bonus XP)</button>
          <span class="muted">Pick 1–3 songs. Costs ${costs.rehearse} energy${G.state.band.members.length ? ` and ${money(costs.room)} room rent` : ''}. Autopilot needs learned songs; playing live teaches them.</span></div>`
      : '<p>No songs yet. Write one!</p>'}
    </section>`;
  $('#writeBtn').addEventListener('click', writeSongDialog);
  $$('[data-release]', main).forEach(b => b.addEventListener('click', async () => { try { await api('release', { song: +b.dataset.release }); render(); } catch {} }));
  $$('[data-lyrics]', main).forEach(b => b.addEventListener('click', () => {
    const s = songs.find(x => x.id === +b.dataset.lyrics);
    modal(`<h2 id="modalTitle">${esc(s.title)}</h2><pre class="lyrics">${esc(s.lyrics.join('\n'))}</pre><div class="row end"><button class="btn" onclick="closeModal()">Close</button></div>`);
  }));
  const picked = () => { const ids = $$('.pick:checked', main).map(x => +x.value); if (!ids.length || ids.length > 3) { toast('Select 1 to 3 songs to rehearse.', 'bad'); return null; } return ids; };
  $('#rehearseBtn')?.addEventListener('click', () => { const ids = picked(); if (ids) runRehearsal(ids); });
  $('#rehearseAuto')?.addEventListener('click', async () => { const ids = picked(); if (!ids) return; try { await api('rehearse_auto', { songs: ids }); render(); } catch {} });
  $$('[data-learn]', main).forEach(b => b.addEventListener('click', () => runLearn(+b.dataset.learn)));
}

function writeSongDialog() {
  const g = G.game, band = G.state.band;
  const b = modal(`<h2 id="modalTitle">Write a song</h2>
    <form class="stack" id="songForm">
      <label class="ctl">Title <span class="muted">(leave blank for inspiration)</span><input name="title" maxlength="40"></label>
      <div class="grid2">
        <label class="ctl">Theme <select name="theme">${Object.entries(g.themes).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('')}</select></label>
        <label class="ctl">Genre <select name="genre">${Object.entries(g.genres).map(([k, x]) => `<option value="${k}" ${k === band.genre ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      </div>
      <label class="ctl">Tempo: <b id="bpmVal">120</b> BPM <input type="range" name="bpm" min="80" max="190" value="120"></label>
      <label class="ctl">Your own lyrics <span class="muted">(optional — one line per row; these become what you type on stage)</span>
        <textarea name="lyrics" rows="5" maxlength="480" placeholder="Leave empty and the muse will write them"></textarea></label>
      <p class="muted">Themes that fit the genre and genres you love write better songs. Good mood helps. Costs ${g.costs.write} energy.</p>
      <div class="row end"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary">Write it</button></div>
    </form>`);
  const f = $('#songForm', b);
  f.bpm.addEventListener('input', () => ($('#bpmVal', b).textContent = f.bpm.value));
  f.genre.addEventListener('change', () => { const [lo, hi] = g.genres[f.genre.value].bpm; f.bpm.value = Math.round((lo + hi) / 2); $('#bpmVal', b).textContent = f.bpm.value; });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('write_song', Object.fromEntries(new FormData(f))); closeModal(); render(); } catch {}
  });
}

async function runLearn(songId) {
  let start; try { start = await api('learn_start', { song: songId }); } catch { return; }
  const o = overlay(performanceScreen('garage.jpg', 'Learning: ' + start.charts[0].title, false));
  const result = await Stage.play($('.perf-typer', o), start.charts[0], { label: `Score ${G.game.costs.learnAcc}%+ to learn it`, instrument: R().instrument, onHit: k => avatarReact(o, k) });
  closeOverlay();
  if (!result) { toast('Stopped.', 'bad'); return; }
  try { await api('learn_finish', { token: start.token, result }); render(); } catch {}
}

async function runRehearsal(ids) {
  let start; try { start = await api('rehearse_start', { songs: ids }); } catch { return; }
  const o = overlay(performanceScreen('garage.jpg', 'Band rehearsal', false));
  const results = [];
  for (let i = 0; i < start.charts.length; i++) {
    const res = await Stage.play($('.perf-typer', o), start.charts[i], { label: `Song ${i + 1} of ${start.charts.length}`, instrument: R().instrument, onHit: k => avatarReact(o, k) });
    if (!res) { closeOverlay(); toast('Rehearsal stopped.', 'bad'); return; }
    results.push(res);
  }
  closeOverlay();
  try { await api('rehearse_finish', { token: start.token, results }); render(); } catch {}
}

/* ================================================================ BAND */
async function viewBand(main) {
  const band = G.state.band, g = G.game, full = band.members.length + 1 >= g.maxBand;
  main.innerHTML = `
    <section class="card"><div class="title-row"><h2>${esc(band.name)}</h2>
      <button class="btn" id="hangBtn" ${band.members.length ? '' : 'disabled'}>🍕 Hang out (${money(g.costs.hangout)})</button></div>
      ${meter('Band chemistry', band.chemistry)}
      <div class="members">
        <div class="member-card you">${Avatar.svg(R().appearance, { anim: 'idle', title: R().stageName })}
          <div><b>${esc(R().stageName)}</b><small>You · ${esc(g.roles[R().instrument])} · ${esc(R().pronouns)}</small></div></div>
        ${band.members.map(m => `<div class="member-card">${Avatar.svg(m.appearance, { anim: 'idle', title: m.name })}
          <div><b>${esc(m.name)}</b><small>${esc(m.roleName)} · ${esc(m.pronouns)} · ${esc(m.personality)}</small>
          ${meter('Skill', m.skill, 'compact')}${meter('Loyalty', m.loyalty, 'compact')}
          <small>Wage ${money(m.wage)}/gig</small>
          <button class="btn small danger" data-fire="${m.id}">Fire</button></div></div>`).join('')}
      </div>
    </section>
    <section class="card"><h2>Recruit musicians</h2>
      <p class="muted">New faces show up every day. Signing costs 4× their wage. ${full ? '<b>Your band is full — fire someone to make room.</b>' : ''}</p>
      <div class="members" id="recruits"><p>Loading…</p></div></section>`;
  $('#hangBtn').addEventListener('click', async () => { try { await api('hangout'); render(); } catch {} });
  $$('[data-fire]', main).forEach(b => b.addEventListener('click', async () => {
    const m = band.members.find(x => x.id === +b.dataset.fire);
    if (!(await confirmBox(`Fire ${m.name}? You'll pay ${money(m.wage * 2)} severance and chemistry will drop.`, 'Fire them'))) return;
    try { await api('fire', { member: m.id }); render(); } catch {}
  }));
  try {
    const { recruits } = await api('recruits', {}, { quiet: true });
    const box = $('#recruits', main); if (!box) return;
    box.innerHTML = recruits.map(c => `<div class="member-card">${Avatar.svg(c.appearance, { anim: 'idle', title: c.name })}
      <div><b>${esc(c.name)}</b><small>${esc(c.roleName)} · ${esc(c.pronouns)} · ${esc(c.personalityName)}</small>
      <small class="muted">${esc(c.personalityDesc)}</small>${meter('Skill', c.skill, 'compact')}
      <small>Wage ${money(c.wage)}/gig</small>
      <button class="btn small primary" data-hire="${c.slot}" ${full ? 'disabled' : ''}>Sign (${money(c.signing)})</button></div></div>`).join('') || '<p>No one else today. Check back tomorrow.</p>';
    $$('[data-hire]', box).forEach(b => b.addEventListener('click', async () => { try { await api('hire', { slot: +b.dataset.hire }); render(); } catch {} }));
  } catch {}
}

/* ================================================================ GIGS */
function viewGigs(main) {
  const g = G.game;
  main.innerHTML = `<section class="card"><h2>Book a gig</h2><p class="muted">Bigger venues need more fame. You type every song live — the crowd feels every missed word.
    Shows cost ${g.costs.gig} energy and your bandmates' wages.</p>
    <div class="venues">${Object.entries(g.venues).map(([k, v]) => {
      const ok = venueUnlocked(v);
      return `<button class="venue ${ok ? '' : 'locked'}" data-venue="${k}" ${ok ? '' : 'disabled'} style="background-image:url('${VENUE_ART}${v.art}')">
        <span class="venue-info"><b>${esc(v.name)}</b><small>${esc(v.desc)}</small>
        <small>👥 ${num(v.cap)} · 🎟 ${v.ticket ? money(v.ticket) : 'tips'} · 🎵 ${v.songs[0]}–${v.songs[1]} songs</small>
        ${ok ? '' : `<small class="lock">🔒 ${num(v.fame)} fame</small>`}</span></button>`;
    }).join('')}</div></section>
    <section class="card"><h2>Recent shows</h2>${G.state.gigs.length ? `<ul class="news">${G.state.gigs.map(x => `<li>${esc(g.venues[x.venue].name)} — ${stars(+x.stars)} · ${num(x.attendance)} people · ${money(x.earnings)}</li>`).join('')}</ul>` : '<p class="muted">No shows yet.</p>'}</section>`;
  $$('[data-venue]', main).forEach(b => b.addEventListener('click', () => setlistDialog(b.dataset.venue)));
}

function setlistDialog(venueKey) {
  const v = G.game.venues[venueKey], songs = G.state.songs;
  if (songs.length < v.songs[0]) return toast(`You need at least ${v.songs[0]} song(s) for ${v.name}.`, 'bad');
  const b = modal(`<h2 id="modalTitle">Setlist for ${esc(v.name)}</h2>
    <p class="muted">Pick ${v.songs[0]}–${v.songs[1]} songs, in order. For each, choose <b>Live</b> (you play it: bonus XP, fans and a crowd boost) or <b>Auto</b> (learned songs only).</p>
    <div class="setlist">${songs.map(s => `<div class="set-song"><label><input type="checkbox" value="${s.id}"> <b>${esc(s.title)}</b></label>
      <small>Q ${s.quality} · Tight ${s.tightness} · ${s.bpm} BPM</small>
      <select data-mode="${s.id}" aria-label="How to play ${esc(s.title)}"><option value="live">🎸 Live</option><option value="auto" ${s.learned ? '' : 'disabled'}>🤖 Auto${s.learned ? '' : ' (learn first)'}</option></select></div>`).join('')}</div>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" id="goGig">Take the stage 🤘</button></div>`);
  $('#goGig', b).addEventListener('click', () => {
    const ids = $$('input:checked', b).map(x => +x.value);
    if (ids.length < v.songs[0] || ids.length > v.songs[1]) return toast(`Pick ${v.songs[0]}–${v.songs[1]} songs.`, 'bad');
    const modes = ids.map(id => $(`[data-mode="${id}"]`, b).value);
    closeModal(); runGig(venueKey, ids, modes);
  });
}

async function runGig(venueKey, ids, modes) {
  let start; try { start = await api('gig_start', { venue: venueKey, songs: ids, modes }); } catch { return; }
  const v = start.venue, r = R();
  const o = overlay(performanceScreen(v.art, v.name, Math.round(Math.log10(v.cap) * 12), { hype: true }));
  const hypeBar = $('.hype .meter div', o);
  const results = [], moves = [];
  for (let i = 0; i < start.charts.length; i++) {
    const label = `Song ${i + 1} of ${start.charts.length}`;
    if (start.modes[i] === 'auto') {
      await Stage.autoplay($('.perf-typer', o), start.charts[i], { label, onHit: k => avatarReact(o, k) });
      results.push(null);
    } else {
      const res = await Stage.play($('.perf-typer', o), start.charts[i], {
        label, instrument: r.instrument,
        onHype: h => { hypeBar.style.width = h + '%'; o.querySelector('.crowd')?.style.setProperty('--hype', (h / 100).toFixed(2)); },
        onHit: k => avatarReact(o, k),
      });
      if (!res) { closeOverlay(); toast('You walked off stage. The show was cancelled.', 'bad'); return; }
      results.push(res);
    }
    moves.push(await stageMoment($('.perf-typer', o), v, i, start.charts.length, res));
  }
  $('.perf-typer', o).innerHTML = '<p class="center big">The crowd is roaring… tallying the night.</p>';
  try {
    const out = await api('gig_finish', { token: start.token, results, moves }, { quiet: true });
    showResults(o, v, out.result);
  } catch (e) { closeOverlay(); toast(e.message, 'bad'); }
}

/** between songs: pick a stage move (or skip). Resolves the move key or ''. */
function stageMoment(box, v, i, total, res) {
  return new Promise(resolve => {
    const moves = Object.entries(G.game.moves).filter(([, m]) => !m.minTier || m.minTier <= v.tier);
    box.innerHTML = `<h3>${i + 1 < total ? 'Between songs' : 'Big finish'}${res ? ` — ${Math.round(res.accuracy)}% accuracy${res.wpm ? `, ${res.wpm} WPM` : ''}` : ' — the band nailed it on autopilot'}</h3>
      <p class="muted">Pull a stage move? Riskier moves pay off big… or flop.</p>
      <div class="moves">${moves.map(([k, m]) => `<button class="btn move" data-m="${k}"><b>${esc(m.name)}</b><small>${esc(m.desc)} · risk ${'🔥'.repeat(m.risk)}${m.cost ? ' · ' + money(m.cost) : ''} · ${esc(G.game.skills[m.skill])}</small></button>`).join('')}
      <button class="btn ghost move" data-m=""><b>Just play</b><small>No risk</small></button></div>`;
    $$('[data-m]', box).forEach(b => b.addEventListener('click', () => resolve(b.dataset.m)));
    $('[data-m]', box).focus();
  });
}

function showResults(o, v, x) {
  const box = $('.perf-typer', o);
  box.classList.add('results');
  box.innerHTML = `<h2>${stars(x.stars)} ${x.tierUp ? `<span class="tag gold">New tier: ${esc(x.tier)}!</span>` : ''} ${x.levelUp ? `<span class="tag gold">Level ${x.level}!</span>` : ''}</h2>
    <p class="review">“${esc(x.review)}”</p>
    <div class="result-grid">
      <div><b>${x.perf}</b><small>Performance</small></div><div><b>${num(x.attendance)}</b><small>Crowd</small></div>
      <div><b>+${num(x.fans)}</b><small>New fans</small></div><div><b>+${num(x.fame)}</b><small>Fame</small></div>
      <div><b>${x.accuracy}%</b><small>Accuracy</small></div><div><b>+${num(x.xp)}</b><small>XP${x.xpMult > 1 ? ` (live ×${x.xpMult})` : ''}</small></div>
    </div>
    <p class="muted">${x.liveSongs} song(s) played live, ${x.autoSongs} on autopilot.${x.learned?.length ? ` Learned: ${x.learned.map(esc).join(', ')}!` : ''}</p>
    <p>Gross ${money(x.gross)} − wages ${money(x.wages)}${x.moveCost ? ` − effects ${money(x.moveCost)}` : ''} = <b>${money(x.net)}</b></p>
    ${x.moves.length ? `<ul>${x.moves.map(m => `<li>${m.ok ? '✅' : '💥'} ${esc(m.move)}</li>`).join('')}</ul>` : ''}
    <div class="row end"><button class="btn primary" id="doneGig">Back to the garage</button></div>`;
  announce(`${x.stars} stars. ${x.review}`);
  $('.lineup', o)?.classList.add('cheer');
  $('#doneGig', box).focus();
  $('#doneGig', box).addEventListener('click', () => { closeOverlay(); render(); });
}

/* ================================================================ WARDROBE */
function viewWardrobe(main) {
  const L = Avatar.catalog, owned = new Set(G.state.owned), fame = R().fame;
  const groups = [
    ['hair', 'Hairstyles', L.hair], ['makeup.paint', 'Face paint', L.makeup.paint], ['tattoo', 'Tattoo designs', L.tattoos.designs],
    ...Object.entries(L.outfit).map(([k, list]) => [`outfit.${k}`, { top: 'Tops', bottom: 'Bottoms', legwear: 'Legwear', shoes: 'Shoes', outer: 'Jackets', hat: 'Hats', glasses: 'Glasses', neck: 'Neckwear', wrist: 'Wristwear' }[k], list]),
    ...Object.entries(L.instruments).filter(([k]) => k !== 'finishes').map(([k, ins]) => [`instrument.${k}`, `${ins.name} models`, ins.models]),
    ['finish', 'Instrument finishes', L.instruments.finishes],
  ];
  main.innerHTML = `<section class="card wardrobe-head"><div class="mini-me">${Avatar.svg(R().appearance, { anim: 'idle' })}</div>
      <div><h2>Wardrobe</h2><p class="muted">Everything free is already yours. Buy premium gear here, then put it on in the editor.</p>
      <button class="btn primary" id="editLook">🎨 Edit my look</button></div></section>
    ${groups.map(([key, label, list]) => {
      const paid = list.filter(i => i.price > 0);
      if (!paid.length) return '';
      return `<section class="card"><h3>${esc(label)}</h3><div class="shop">${paid.map(i => {
        const have = owned.has(`${key}.${i.id}`), lock = i.fame > fame;
        return `<div class="shop-item ${have ? 'have' : ''}"><b>${esc(i.name)}</b>
          <small>${have ? 'Owned ✓' : lock ? `🔒 ${num(i.fame)} fame` : money(i.price)}</small>
          ${have ? '' : `<button class="btn small" data-buy="${key}|${i.id}" ${lock ? 'disabled' : ''}>Buy</button>`}</div>`;
      }).join('')}</div></section>`;
    }).join('')}`;
  $('#editLook').addEventListener('click', openLookEditor);
  $$('[data-buy]', main).forEach(b => b.addEventListener('click', async () => {
    const [group, id] = b.dataset.buy.split('|');
    try { await api('buy', { group, id }); render(); } catch {}
  }));
}

function openLookEditor() {
  const o = overlay(`<div class="overlay-page"><div class="row between"><h1>Edit your look</h1><button class="btn ghost" id="closeEd">Close</button></div><div id="edRoot"></div></div>`);
  $('#closeEd', o).addEventListener('click', closeOverlay);
  Creator.open($('#edRoot', o), {
    mode: 'edit', look: R().appearance, owned: G.state.owned, fame: R().fame, game: G.game,
    onSubmit: async data => { await api('update_look', data); closeOverlay(); render(); },
  });
}

/* ================================================================ PROFILE */
function viewProfile(main) {
  const r = R(), g = G.game, b = r.backstory, B = g.backstory;
  const customGender = !g.genders[r.genderKey];
  const customPron = !g.pronouns.includes(r.pronouns);
  main.innerHTML = `<div class="grid2">
    <section class="card profile-card"><div class="mini-me big">${Avatar.svg(r.appearance, { anim: 'idle' })}</div>
      <h2>${esc(r.stageName)}</h2><p>${esc(r.gender)} · ${esc(r.pronouns)} · ${r.age} · ${esc(r.hometown || 'Hometown unknown')}</p>
      <p><b>Backstory:</b> ${esc(B.origin[b.origin].name)}, ${esc(B.upbringing[b.upbringing].name.toLowerCase())}, raised on ${esc(B.influence[b.influence].name)}.
        Plays for ${esc(B.motivation[b.motivation].name.toLowerCase())}. ${esc(B.trait[b.trait].name)}: ${esc(B.trait[b.trait].desc)}</p>
      ${r.bio ? `<blockquote>${esc(r.bio)}</blockquote>` : ''}</section>
    <section class="card"><h2>Edit profile</h2><form class="stack" id="profForm">
      <label class="ctl">Stage name <input name="stageName" value="${esc(r.stageName)}" maxlength="30"></label>
      <label class="ctl">Real name <input name="realName" value="${esc(r.realName)}" maxlength="40"></label>
      <label class="ctl">Band name <input name="bandName" value="${esc(G.state.band.name)}" maxlength="30"></label>
      <div class="grid2">
        <label class="ctl">Gender identity <select name="gender">${Object.entries(g.genders).map(([k, v]) => `<option value="${k}" ${(customGender ? 'custom' : r.genderKey) === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <label class="ctl">Self-described <input name="genderCustom" value="${customGender ? esc(r.gender) : ''}" maxlength="40"></label>
        <label class="ctl">Pronouns <select name="pronouns">${g.pronouns.map(p => `<option value="${p}" ${(customPron ? 'custom' : r.pronouns) === p ? 'selected' : ''}>${p === 'custom' ? 'Write my own' : p}</option>`).join('')}</select></label>
        <label class="ctl">Custom pronouns <input name="pronounsCustom" value="${customPron ? esc(r.pronouns) : ''}" maxlength="30"></label>
      </div>
      <label class="ctl">Hometown <input name="hometown" value="${esc(r.hometown)}" maxlength="60"></label>
      <label class="ctl">Bio <textarea name="bio" rows="4" maxlength="600">${esc(r.bio || '')}</textarea></label>
      <div class="row end"><button class="btn primary">Save profile</button></div></form></section></div>`;
  $('#profForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('update_profile', Object.fromEntries(new FormData(e.target))); render(); } catch {}
  });
}

/* ================================================================ CHARTS */
async function viewCharts(main) {
  main.innerHTML = '<section class="card"><h2>The Charts</h2><ol class="charts"><li>Loading…</li></ol></section>';
  try {
    const { leaders } = await api('leaderboard', {}, { quiet: true });
    $('.charts', main).innerHTML = leaders.map((l, i) => `<li><span class="chart-pos">${i + 1}</span><span class="chart-face">${Avatar.svg({ ...l.appearance, showInstrument: false }, { anim: 'none' })}</span>
      <span><b>${esc(l.stage_name)}</b> — ${esc(l.band)}<small>${esc(l.tier)} · ${num(l.fame)} fame · ${num(l.fans)} fans · ${l.best_wpm} WPM</small></span></li>`).join('');
  } catch {}
}

/* ================================================================ AUTH & CREATE */
function viewAuth() {
  $('#topbar').hidden = true;
  const main = $('#main');
  const demo = [0, 1, 2].map(() => Avatar.random(Avatar.catalog));
  main.innerHTML = `<section class="auth">
    <div class="auth-hero" style="background-image:url('${VENUE_ART}garage.jpg')">
      <h1 class="logo">My Little <b>Rockstar</b></h1><p>Raise your rockstar from garage nobody to stadium legend.</p>
      <div class="hero-band">${demo.map((d, i) => `<div style="--i:${i}">${Avatar.svg(d, { anim: 'play' })}</div>`).join('')}</div>
    </div>
    <div class="card auth-card">
      <div class="seg" role="tablist"><button role="tab" aria-selected="true" data-t="login">Log in</button><button role="tab" aria-selected="false" data-t="register">New rockstar</button></div>
      <form id="authForm" class="stack"><label class="ctl">Username <input name="username" autocomplete="username" required></label>
        <label class="ctl">Password <input name="password" type="password" autocomplete="current-password" required minlength="6"></label>
        <button class="btn primary">Let's rock</button></form>
      <p class="form-error" role="alert"></p></div></section>`;
  let mode = 'login';
  $$('[data-t]', main).forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.t; $$('[data-t]', main).forEach(x => x.setAttribute('aria-selected', x === b));
    $('#authForm button').textContent = mode === 'login' ? "Let's rock" : 'Create account';
  }));
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api(mode, Object.fromEntries(new FormData(e.target)), { quiet: true }); route(); }
    catch (err) { $('.form-error', main).textContent = err.message; announce(err.message); }
  });
}

function viewCreate() {
  $('#topbar').hidden = true;
  const main = $('#main');
  main.innerHTML = `<h1 class="logo center">Create your <b>Rockstar</b></h1><div id="createRoot"></div>`;
  Creator.open($('#createRoot'), {
    mode: 'create', game: G.game,
    onSubmit: async data => { await api('create', data); G.tab = 'home'; route(); },
  });
}

function route() {
  if (!G.state) return viewAuth();
  if (!G.state.rockstar) return viewCreate();
  render();
}

/* ================================================================ boot */
(async function boot() {
  const [cat, game] = await Promise.all([fetch('assets/data/catalog.json').then(r => r.json()), fetch('api.php?action=catalog').then(r => r.json())]);
  Avatar.catalog = cat; G.game = game;
  try { await api('state', {}, { quiet: true }); } catch { G.state = null; }
  route();
  setInterval(async () => {   // keep energy / streams ticking
    if (!G.state?.rockstar || !$('#overlay').hidden || $('#modal').open) return;
    try { await api('state', {}, { quiet: true }); renderShell(); } catch {}
  }, 60000);
})();
