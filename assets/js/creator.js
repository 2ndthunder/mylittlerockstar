// My Little Rockstar — character designer (creator + wardrobe editor).
// mode 'create': identity + looks + backstory + band.  mode 'edit': looks only, with owned shop items unlocked.
// Tools: body & face sliders, stances, clothing fit, face close-up, pose + expression preview,
// undo/redo (buttons or Ctrl+Z / Ctrl+Y), and saved looks (edit mode).
'use strict';

const Creator = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  function open(root, { mode = 'create', look, owned = [], fame = 0, game, onSubmit, presets = null, onPreset = null }) {
    const L = Avatar.catalog;
    const ownedSet = new Set(owned);
    const a = clone(look || Avatar.random(L, { instrument: 'guitar' }));
    // older saves may predate sliders/stances
    a.body = Object.assign(Object.fromEntries(Avatar.BODY_KEYS.map(k => [k, 0])), a.body || {});
    Avatar.FACE_KEYS.forEach(k => { a.face[k] ??= 0; });
    a.stance ??= 'wide';
    a.outfit.belt ??= { id: 'none' };
    const id = {   // identity + backstory (create mode)
      stageName: '', realName: '', pronouns: 'they/them', pronounsCustom: '', gender: 'unsaid', genderCustom: '', age: 21, hometown: '', bio: '',
      backstory: { origin: 'smalltown', upbringing: 'garage', influence: 'punk', motivation: 'fame', trait: 'wildchild' }, bandName: '', genre: 'punk',
    };
    let showInstrument = true, view = 'full', pose = 'idle', expression = '';
    let saved = presets ? clone(presets) : null;

    const STEPS = mode === 'create'
      ? ['Identity', 'Body', 'Face', 'Hair & makeup', 'Outfit', 'Ink & piercings', 'Instrument', 'Backstory', 'Band']
      : ['Body', 'Face', 'Hair & makeup', 'Outfit', 'Ink & piercings', 'Instrument', ...(saved ? ['Saved looks'] : [])];
    let step = 0;

    /* ---------- undo / redo: snapshot the look after every change (debounced so slider drags are one step) */
    const history = [JSON.stringify(a)];
    let hIdx = 0, hTimer = null, restoring = false;
    const commit = () => {
      clearTimeout(hTimer);
      hTimer = setTimeout(() => {
        const snap = JSON.stringify(a);
        if (snap === history[hIdx]) return;
        history.splice(hIdx + 1); history.push(snap);
        if (history.length > 80) history.shift();
        hIdx = history.length - 1; syncUndo();
      }, 350);
    };
    const restore = json => { restoring = true; const v = JSON.parse(json); Object.keys(a).forEach(k => delete a[k]); Object.assign(a, v); renderStep(); draw(); restoring = false; syncUndo(); };
    const undo = () => { clearTimeout(hTimer); if (hIdx > 0) { hIdx--; restore(history[hIdx]); say('Undone'); } };
    const redo = () => { clearTimeout(hTimer); if (hIdx < history.length - 1) { hIdx++; restore(history[hIdx]); say('Redone'); } };
    const syncUndo = () => { const u = root.querySelector('[data-act=undo]'), r = root.querySelector('[data-act=redo]'); if (u) u.disabled = hIdx === 0; if (r) r.disabled = hIdx >= history.length - 1; };
    const say = t => { const l = root.querySelector('.sr-live'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); } };

    root.innerHTML = `
      <div class="creator">
        <div class="creator-preview card">
          <div class="preview-tools" role="toolbar" aria-label="Preview">
            <div class="seg small" role="group" aria-label="View">
              <button type="button" data-view="full" aria-pressed="true">Full body</button><button type="button" data-view="face" aria-pressed="false">Face close-up</button>
            </div>
            <div class="row gap-s"><button type="button" class="btn small ghost" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled>↶ Undo</button>
              <button type="button" class="btn small ghost" data-act="redo" title="Redo (Ctrl+Y)" aria-label="Redo" disabled>↷ Redo</button></div>
          </div>
          <div class="preview-stage"></div>
          <div class="preview-tools">
            <label class="mini-ctl">Pose <select data-act="pose"><option value="idle">Idle</option><option value="play">Playing</option><option value="cheer">Cheering</option><option value="none">Still</option></select></label>
            <label class="mini-ctl">Expression <select data-act="expr"><option value="">Their own face</option>${Avatar.EXPRESSIONS.map(x => `<option value="${x}">${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></label>
          </div>
          <div class="row center wrap">
            <button class="btn small" data-act="rand-step">🎲 Shuffle this step</button>
            <button class="btn small" data-act="rand-all">🎲 Shuffle everything</button>
            <label class="toggle"><input type="checkbox" checked data-act="show-inst"> Show instrument</label>
          </div>
          <p class="sr-live visually-hidden" aria-live="polite"></p>
        </div>
        <div class="creator-panel card">
          <nav class="steps" aria-label="Creator steps"></nav>
          <div class="step-body"></div>
          <p class="form-error" role="alert"></p>
          <div class="row end">
            <button class="btn ghost" data-act="back">Back</button>
            <button class="btn primary" data-act="next">Next</button>
          </div>
        </div>
      </div>`;
    const $ = s => root.querySelector(s);
    const preview = $('.preview-stage'), body = $('.step-body');

    const draw = () => {
      preview.innerHTML = Avatar.svg({ ...a, showInstrument }, { anim: view === 'face' ? 'none' : pose, view, expression, title: 'Your rockstar preview' });
      if (!restoring) commit();
    };

    /* ---------- generic controls */
    const locked = (group, item) => {
      if (!item) return null;
      if ((item.fame || 0) > fame) return `Unlocks at ${item.fame.toLocaleString()} fame`;
      if ((item.price || 0) > 0 && !ownedSet.has(`${group}.${item.id}`)) return mode === 'create' ? `Shop item ($${item.price})` : `Buy in wardrobe ($${item.price})`;
      return null;
    };
    function chips(label, list, value, onPick, group = null) {
      const wrap = document.createElement('fieldset');
      wrap.className = 'ctl';
      wrap.innerHTML = `<legend>${esc(label)}</legend><div class="chips"></div>`;
      const box = wrap.querySelector('.chips');
      list.forEach(item => {
        const lock = group ? locked(group, item) : null;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (item.id === value ? ' on' : '') + (lock ? ' locked' : '');
        b.setAttribute('aria-pressed', item.id === value);
        b.innerHTML = esc(item.name) + (lock ? ' <span aria-hidden="true">🔒</span>' : '');
        if (lock) { b.title = lock; b.setAttribute('aria-label', `${item.name}, locked: ${lock}`); b.disabled = true; }
        b.addEventListener('click', () => { onPick(item.id); renderStep(); draw(); });
        box.append(b);
      });
      return wrap;
    }
    function colors(label, palette, value, onPick, { allowNone = false } = {}) {
      const wrap = document.createElement('fieldset');
      wrap.className = 'ctl';
      wrap.innerHTML = `<legend>${esc(label)}</legend><div class="swatches"></div>`;
      const box = wrap.querySelector('.swatches');
      if (allowNone) {
        const n = document.createElement('button');
        n.type = 'button'; n.className = 'swatch none' + (!value ? ' on' : ''); n.setAttribute('aria-label', 'None'); n.textContent = '∅';
        n.addEventListener('click', () => { onPick(''); renderStep(); draw(); });
        box.append(n);
      }
      palette.forEach(c => {
        const s = document.createElement('button');
        s.type = 'button'; s.className = 'swatch' + (c === value ? ' on' : ''); s.style.background = c;
        s.setAttribute('aria-label', `Colour ${c}`); s.setAttribute('aria-pressed', c === value);
        s.addEventListener('click', () => { onPick(c); renderStep(); draw(); });
        box.append(s);
      });
      const pick = document.createElement('label');
      pick.className = 'custom-color';
      pick.innerHTML = `<input type="color" value="${/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ff3b6b'}" aria-label="${esc(label)}: any colour"> Any`;
      pick.querySelector('input').addEventListener('input', e => { onPick(e.target.value); draw(); });
      pick.querySelector('input').addEventListener('change', () => renderStep());
      box.append(pick);
      return wrap;
    }
    /** A -50..50 slider with a live value, keyboard friendly, double-click (or the ↺ button) to reset. */
    function slider(label, obj, key) {
      const w = document.createElement('div');
      w.className = 'slider-row';
      const id = `sl-${key}-${Math.random().toString(36).slice(2, 7)}`;
      const txt = v => (v === 0 ? 'default' : v > 0 ? `+${v}` : `${v}`);
      w.innerHTML = `<label for="${id}">${esc(label)}</label>
        <input id="${id}" type="range" min="-50" max="50" step="1" value="${obj[key] || 0}" aria-valuetext="${txt(obj[key] || 0)}">
        <output>${txt(obj[key] || 0)}</output><button type="button" class="btn tiny ghost" aria-label="Reset ${esc(label)}" title="Reset">↺</button>`;
      const inp = w.querySelector('input'), out = w.querySelector('output');
      const set = v => { obj[key] = v; inp.value = v; out.textContent = txt(v); inp.setAttribute('aria-valuetext', txt(v)); draw(); };
      inp.addEventListener('input', () => set(+inp.value));
      inp.addEventListener('dblclick', () => set(0));
      w.querySelector('button').addEventListener('click', () => set(0));
      return w;
    }
    function sliderGroup(title, group, obj) {
      const box = document.createElement('fieldset');
      box.className = 'ctl sliders';
      box.innerHTML = `<legend>${esc(title)}</legend>`;
      L.sliders[group].forEach(sd => box.append(slider(sd.name, obj, sd.id)));
      const row = document.createElement('div');
      row.className = 'row gap-s';
      row.innerHTML = `<button type="button" class="btn small ghost">Reset all</button><button type="button" class="btn small ghost">🎲 Randomise</button>`;
      const [reset, rnd] = row.querySelectorAll('button');
      reset.addEventListener('click', () => { L.sliders[group].forEach(sd => obj[sd.id] = 0); renderStep(); draw(); });
      rnd.addEventListener('click', () => { L.sliders[group].forEach(sd => obj[sd.id] = Math.round((Math.random() - 0.5) * 70)); renderStep(); draw(); });
      box.append(row);
      return box;
    }
    function field(label, html) { const w = document.createElement('label'); w.className = 'ctl'; w.innerHTML = `${esc(label)} ${html}`; return w; }
    function heading(t) { const h = document.createElement('h3'); h.textContent = t; return h; }

    /* ---------- steps */
    const steps = {
      'Identity'() {
        body.append(heading('Who are you?'));
        const f = document.createElement('div');
        f.className = 'grid2';
        f.innerHTML = `
          <label class="ctl">Stage name <input name="stageName" maxlength="30" required value="${esc(id.stageName)}" placeholder="e.g. Vex Voltage"></label>
          <label class="ctl">Real name <span class="muted">(optional)</span><input name="realName" maxlength="40" value="${esc(id.realName)}"></label>
          <label class="ctl">Gender identity <select name="gender">${Object.entries(game.genders).map(([k, v]) => `<option value="${k}" ${k === id.gender ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <label class="ctl" ${id.gender === 'custom' ? '' : 'hidden'}>Describe your gender <input name="genderCustom" maxlength="40" value="${esc(id.genderCustom)}"></label>
          <label class="ctl">Pronouns <select name="pronouns">${game.pronouns.map(p => `<option ${p === id.pronouns ? 'selected' : ''} value="${p}">${p === 'custom' ? 'Write my own' : p}</option>`).join('')}</select></label>
          <label class="ctl" ${id.pronouns === 'custom' ? '' : 'hidden'}>Your pronouns <input name="pronounsCustom" maxlength="30" value="${esc(id.pronounsCustom)}"></label>
          <label class="ctl">Age <input name="age" type="number" min="18" max="70" value="${id.age}"></label>
          <label class="ctl">Hometown <input name="hometown" maxlength="60" value="${esc(id.hometown)}" placeholder="Anywhere, real or imagined"></label>`;
        f.addEventListener('input', e => {
          const el = e.target; id[el.name] = el.type === 'number' ? +el.value : el.value;
          if (el.name === 'gender' || el.name === 'pronouns') renderStep();
        });
        body.append(f);
        body.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Gender and pronouns are just who you are — they never change your stats. Body type, voice and style are all chosen separately.' }));
      },
      'Body'() {
        body.append(heading('Body'));
        body.append(chips('Build (a starting point — fine-tune below)', L.builds, a.build, v => a.build = v));
        body.append(chips('Stance', L.stances, a.stance, v => a.stance = v));
        const h = field('Height', `<input type="range" min="0.88" max="1.12" step="0.01" value="${a.height}" aria-valuetext="${Math.round(a.height * 100)}%">`);
        h.querySelector('input').addEventListener('input', e => { a.height = +e.target.value; e.target.setAttribute('aria-valuetext', `${Math.round(a.height * 100)}%`); draw(); });
        body.append(h);
        body.append(sliderGroup('Proportions', 'body', a.body));
        body.append(colors('Skin tone', L.palettes.skin, a.skin, v => a.skin = v));
      },
      'Face'() {
        body.append(heading('Face'));
        body.append(chips('Face shape', L.face.shape, a.face.shape, v => a.face.shape = v));
        body.append(sliderGroup('Features', 'face', a.face));
        body.append(chips('Eyes', L.face.eyes, a.face.eyes, v => a.face.eyes = v));
        body.append(colors('Eye colour', L.palettes.eyes, a.face.eyeColor, v => a.face.eyeColor = v));
        body.append(chips('Eyebrows', L.face.brows, a.face.brows, v => a.face.brows = v));
        body.append(chips('Nose', L.face.nose, a.face.nose, v => a.face.nose = v));
        body.append(chips('Mouth', L.face.mouth, a.face.mouth, v => a.face.mouth = v));
        body.append(chips('Marks', L.face.marks, a.face.marks, v => a.face.marks = v));
      },
      'Hair & makeup'() {
        body.append(heading('Hair'));
        body.append(chips('Style', L.hair, a.hair.style, v => a.hair.style = v, 'hair'));
        body.append(colors('Hair colour', L.palettes.hair, a.hair.color, v => a.hair.color = v));
        body.append(colors('Dyed tips / accent', L.palettes.hair, a.hair.color2, v => a.hair.color2 = v, { allowNone: true }));
        body.append(chips('Facial hair', L.facialHair, a.hair.facial, v => a.hair.facial = v));
        body.append(heading('Makeup'));
        const liner = field('', `<span class="toggle"><input type="checkbox" ${a.makeup.liner ? 'checked' : ''}> Eyeliner</span>`);
        liner.querySelector('input').addEventListener('change', e => { a.makeup.liner = e.target.checked; draw(); });
        body.append(liner);
        body.append(colors('Eyeshadow', L.palettes.fabric, a.makeup.shadow, v => a.makeup.shadow = v, { allowNone: true }));
        body.append(colors('Lipstick', L.palettes.lips, a.makeup.lips, v => a.makeup.lips = v, { allowNone: true }));
        body.append(chips('Face paint', L.makeup.paint, a.makeup.paint, v => a.makeup.paint = v, 'makeup.paint'));
        if (a.makeup.paint !== 'none') body.append(colors('Paint colour', L.palettes.ink, a.makeup.paintColor, v => a.makeup.paintColor = v));
      },
      'Outfit'() {
        const slot = (key, label, opts = {}) => {
          a.outfit[key] ??= { id: 'none' };
          const it = a.outfit[key];
          body.append(heading(label));
          body.append(chips('Item', L.outfit[key], it.id, v => it.id = v, `outfit.${key}`));
          if (it.id !== 'none' && !(key === 'top' && it.id === 'none')) {
            body.append(colors('Colour', L.palettes.fabric, it.color, v => it.color = v));
            if (opts.pattern) {
              body.append(chips('Pattern', L.patterns, it.pattern || 'solid', v => it.pattern = v));
              if (it.pattern && it.pattern !== 'solid') body.append(colors('Pattern colour', L.palettes.fabric, it.color2, v => it.color2 = v));
            }
            const def = L.outfit[key].find(x => x.id === it.id);
            if (opts.fit && !['shorts', 'skirt', 'kilt', 'longskirt', 'tutu', 'flares', 'fishnet', 'mesh', 'corset', 'crop'].includes(it.id)) {
              body.append(chips('Fit', L.fits, it.fit || (it.id === 'cargo' ? 'baggy' : ['skinny', 'leather'].includes(it.id) ? 'skinny' : 'regular'), v => it.fit = v));
            }
            if (def?.print) {
              const p = field('Shirt print (your band name, a word, anything)', `<input maxlength="12" value="${esc(it.print || '')}" placeholder="e.g. RIOT">`);
              p.querySelector('input').addEventListener('input', e => { it.print = e.target.value; draw(); });
              body.append(p);
            }
          }
        };
        slot('top', 'Top', { pattern: true, fit: true });
        slot('outer', 'Jacket / vest', { pattern: true, fit: true });
        slot('bottom', 'Bottoms', { pattern: true, fit: true });
        slot('belt', 'Belt');
        slot('legwear', 'Legwear');
        slot('shoes', 'Shoes');
        slot('hat', 'Hat', { pattern: true });
        slot('glasses', 'Glasses');
        slot('neck', 'Neck');
        slot('wrist', 'Wrists & gloves');
      },
      'Saved looks'() {
        const max = L.presetsMax || 6;
        body.append(heading('Saved looks'));
        body.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: `Save up to ${max} complete looks and switch between them anytime. Loading a look puts it in the preview; press "Save look" to wear it.` }));
        const list = document.createElement('div');
        list.className = 'preset-list';
        for (let i = 0; i < max; i++) {
          const p = saved.find(x => x.slot === i);
          const row = document.createElement('div');
          row.className = 'preset' + (p ? '' : ' empty');
          row.innerHTML = `<div class="preset-thumb">${p ? Avatar.svg(p.appearance, { anim: 'none', title: p.name }) : '<span aria-hidden="true">＋</span>'}</div>
            <div class="preset-body"><label class="visually-hidden" for="pn${i}">Name for slot ${i + 1}</label>
              <input id="pn${i}" maxlength="30" value="${esc(p?.name || '')}" placeholder="Look ${i + 1}">
              <div class="row gap-s">
                ${p ? `<button type="button" class="btn small" data-load>Load</button>` : ''}
                <button type="button" class="btn small ${p ? 'ghost' : 'primary'}" data-save>${p ? 'Overwrite' : 'Save current look here'}</button>
                ${p ? `<button type="button" class="btn small ghost" data-del aria-label="Delete ${esc(p.name)}">✕</button>` : ''}
              </div></div>`;
          const name = () => row.querySelector('input').value.trim() || `Look ${i + 1}`;
          row.querySelector('[data-load]')?.addEventListener('click', () => { restore(JSON.stringify(Object.assign(clone(a), clone(p.appearance)))); commit(); say(`Loaded ${p.name}`); });
          row.querySelector('[data-save]').addEventListener('click', async () => {
            try { saved = await onPreset('save', { slot: i, name: name(), appearance: a }); renderStep(); say(`Saved as ${name()}`); }
            catch (err) { $('.form-error').textContent = err.message; }
          });
          row.querySelector('[data-del]')?.addEventListener('click', async () => {
            try { saved = await onPreset('delete', { slot: i }); renderStep(); } catch (err) { $('.form-error').textContent = err.message; }
          });
          list.append(row);
        }
        body.append(list);
      },
      'Ink & piercings'() {
        body.append(heading(`Tattoos (${a.tattoos.length}/${L.tattoos.max})`));
        body.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Tattoos sit under clothing — short sleeves, tank tops or shirtless show them off.' }));
        a.tattoos.forEach((t, i) => {
          const row = document.createElement('div');
          row.className = 'tattoo-row';
          row.innerHTML = `
            <label>Where <select data-k="slot">${L.tattoos.slots.map(s => `<option value="${s.id}" ${s.id === t.slot ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
            <label>Design <select data-k="design">${L.tattoos.designs.map(d => {
              const lk = locked('tattoo', d); return `<option value="${d.id}" ${d.id === t.design ? 'selected' : ''} ${lk ? 'disabled' : ''}>${esc(d.name)}${lk ? ' 🔒' : ''}</option>`;
            }).join('')}</select></label>
            <label>Ink <input type="color" data-k="color" value="${t.color}"></label>
            <button type="button" class="btn small ghost" aria-label="Remove tattoo ${i + 1}">✕</button>`;
          row.addEventListener('input', e => { if (e.target.dataset.k) { t[e.target.dataset.k] = e.target.value; draw(); } });
          row.querySelector('button').addEventListener('click', () => { a.tattoos.splice(i, 1); renderStep(); draw(); });
          body.append(row);
        });
        if (a.tattoos.length < L.tattoos.max) {
          const add = document.createElement('button');
          add.type = 'button'; add.className = 'btn small'; add.textContent = '+ Add tattoo';
          add.addEventListener('click', () => { a.tattoos.push({ slot: 'armR_upper', design: 'star', color: L.palettes.ink[0] }); renderStep(); draw(); });
          body.append(add);
        }
        body.append(heading('Piercings'));
        const box = document.createElement('div');
        box.className = 'chips';
        L.piercings.forEach(p => {
          const on = a.piercings.includes(p.id);
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'chip' + (on ? ' on' : ''); b.setAttribute('aria-pressed', on); b.textContent = p.name;
          b.addEventListener('click', () => { a.piercings = on ? a.piercings.filter(x => x !== p.id) : [...a.piercings, p.id]; renderStep(); draw(); });
          box.append(b);
        });
        body.append(box);
      },
      'Instrument'() {
        const types = Object.entries(L.instruments).filter(([k]) => k !== 'finishes').map(([k, v]) => ({ id: k, name: `${v.name} — ${v.role}` }));
        body.append(heading('Your instrument (your role in the band)'));
        body.append(chips('Instrument', types, a.instrument.type, v => {
          a.instrument.type = v; a.instrument.model = L.instruments[v].models[0].id;
        }));
        body.append(chips('Model', L.instruments[a.instrument.type].models, a.instrument.model, v => a.instrument.model = v, `instrument.${a.instrument.type}`));
        body.append(colors('Colour', L.palettes.fabric, a.instrument.color, v => a.instrument.color = v));
        body.append(chips('Finish', L.instruments.finishes, a.instrument.finish, v => a.instrument.finish = v, 'finish'));
      },
      'Backstory'() {
        const B = game.backstory;
        const section = (key, label) => {
          body.append(heading(label));
          const grid = document.createElement('div');
          grid.className = 'story-grid';
          Object.entries(B[key]).forEach(([k, v]) => {
            const on = id.backstory[key] === k;
            const mods = Object.entries(v.mods || {}).map(([s, n]) => `${n > 0 ? '+' : ''}${n} ${game.skills[s]}`).join(', ');
            const extra = [mods, v.cash ? `+$${v.cash} cash` : '', v.genre ? `Loves ${game.genres[v.genre].name}` : ''].filter(Boolean).join(' · ');
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'story-card' + (on ? ' on' : ''); b.setAttribute('aria-pressed', on);
            b.innerHTML = `<b>${esc(v.name)}</b>${v.desc ? `<span>${esc(v.desc)}</span>` : ''}${extra ? `<small>${esc(extra)}</small>` : ''}`;
            b.addEventListener('click', () => { id.backstory[key] = k; if (key === 'influence') id.genre = v.genre; renderStep(); });
            grid.append(b);
          });
          body.append(grid);
        };
        section('origin', 'Where you grew up');
        section('upbringing', 'How you found music');
        section('influence', 'Your biggest influence');
        section('motivation', 'Why you play');
        section('trait', 'Your defining trait');
        const bio = field('Your story in your own words (optional)', `<textarea maxlength="600" rows="4" placeholder="The night everything changed…">${esc(id.bio)}</textarea>`);
        bio.querySelector('textarea').addEventListener('input', e => id.bio = e.target.value);
        body.append(bio);
      },
      'Band'() {
        body.append(heading('Name your band'));
        const f = document.createElement('div');
        f.className = 'grid2';
        f.innerHTML = `
          <label class="ctl">Band name <input name="bandName" maxlength="30" value="${esc(id.bandName)}" placeholder="e.g. Static Bloom"></label>
          <label class="ctl">Genre <select name="genre">${Object.entries(game.genres).map(([k, g]) => `<option value="${k}" ${k === id.genre ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>`;
        f.addEventListener('input', e => { id[e.target.name] = e.target.value; });
        body.append(f);
        const sum = document.createElement('div');
        sum.className = 'summary';
        const B = game.backstory, s = id.backstory;
        sum.innerHTML = `<h3>${esc(id.stageName || 'Unnamed rockstar')}</h3>
          <p>${esc(game.genders[id.gender] || id.genderCustom)} · ${esc(id.pronouns === 'custom' ? id.pronounsCustom : id.pronouns)} · ${id.age} · ${esc(id.hometown || 'Somewhere loud')}</p>
          <p>${esc(B.origin[s.origin].name)} → ${esc(B.upbringing[s.upbringing].name)} · influenced by ${esc(B.influence[s.influence].name)} · plays for ${esc(B.motivation[s.motivation].name.toLowerCase())} · ${esc(B.trait[s.trait].name)}</p>
          <p class="muted">You start in the garage with a few hundred dollars. Recruit bandmates, write songs, rehearse, and climb from open mics to stadiums.</p>`;
        body.append(sum);
      },
    };

    let prevStep = null;
    function renderStep() {
      // the Face step opens on the close-up; leaving it goes back to full body
      if (STEPS[step] !== prevStep) {
        if (STEPS[step] === 'Face') view = 'face'; else if (prevStep === 'Face') view = 'full';
        prevStep = STEPS[step];
        root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));
        if (preview.innerHTML) draw();
      }
      const nav = $('.steps');
      nav.innerHTML = STEPS.map((s, i) => `<button type="button" class="${i === step ? 'on' : ''}" ${i === step ? 'aria-current="step"' : ''} data-step="${i}">${i + 1}. ${esc(s)}</button>`).join('');
      nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { step = +b.dataset.step; renderStep(); }));
      const keepScroll = body.scrollTop;
      body.innerHTML = '';
      steps[STEPS[step]]();
      body.scrollTop = keepScroll;
      $('[data-act=back]').disabled = step === 0;
      $('[data-act=next]').textContent = step === STEPS.length - 1 || (mode === 'edit' && STEPS[step + 1] === 'Saved looks') ? (mode === 'create' ? 'Start my career 🤘' : 'Save look') : 'Next';
      $('.form-error').textContent = '';
    }

    root.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'back' && step > 0) { step--; renderStep(); body.scrollTop = 0; }
      if (act === 'undo') return undo();
      if (act === 'redo') return redo();
      if (act === 'next') {
        const last = step === STEPS.length - 1 || (mode === 'edit' && STEPS[step + 1] === 'Saved looks');
        if (!last) { step++; renderStep(); body.scrollTop = 0; return; }
        if (mode === 'create' && (!id.stageName.trim() || id.stageName.trim().length < 2)) { step = 0; renderStep(); $('.form-error').textContent = 'Give your rockstar a stage name.'; return; }
        if (mode === 'create' && id.bandName.trim().length < 2) { $('.form-error').textContent = 'Give your band a name.'; return; }
        try { await onSubmit(mode === 'create' ? { ...id, appearance: a } : { appearance: a }); }
        catch (err) { $('.form-error').textContent = err.message; }
      }
      if (act === 'rand-all') {
        Object.assign(a, Avatar.random(L, { instrument: a.instrument.type })); renderStep(); draw();
      }
      if (act === 'rand-step') {
        const r = Avatar.random(L, { instrument: a.instrument.type }), name = STEPS[step];
        if (name === 'Body') { a.build = r.build; a.height = r.height; a.skin = r.skin; a.body = r.body; a.stance = r.stance; }
        if (name === 'Face') a.face = r.face;
        if (name === 'Hair & makeup') { a.hair = r.hair; a.makeup = r.makeup; }
        if (name === 'Outfit') a.outfit = r.outfit;
        if (name === 'Ink & piercings') { a.tattoos = r.tattoos; a.piercings = r.piercings; }
        if (name === 'Instrument') a.instrument = Avatar.random(L, {}).instrument;
        renderStep(); draw();
      }
    });
    root.querySelector('[data-act=show-inst]').addEventListener('change', e => { showInstrument = e.target.checked; draw(); });
    const syncView = () => root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));
    root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; syncView(); draw(); }));
    root.querySelector('[data-act=pose]').addEventListener('change', e => { pose = e.target.value; if (view === 'face' && pose !== 'none') { view = 'full'; syncView(); } draw(); });
    root.querySelector('[data-act=expr]').addEventListener('change', e => { expression = e.target.value; draw(); });
    // keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo (not while typing in a text box)
    const onKey = e => {
      if (!root.isConnected) return document.removeEventListener('keydown', onKey);
      if (!(e.ctrlKey || e.metaKey) || e.target.matches('input[type=text], input:not([type]), textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKey);

    renderStep(); draw();
  }

  return { open };
})();
