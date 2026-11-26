// My Little Rockstar — character creator / wardrobe editor.
// mode 'create': identity + looks + backstory + band.  mode 'edit': looks only, with owned shop items unlocked.
'use strict';

const Creator = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  function open(root, { mode = 'create', look, owned = [], fame = 0, game, onSubmit }) {
    const L = Avatar.catalog;
    const ownedSet = new Set(owned);
    const a = clone(look || Avatar.random(L, { instrument: 'guitar' }));
    const id = {   // identity + backstory (create mode)
      stageName: '', realName: '', pronouns: 'they/them', pronounsCustom: '', gender: 'unsaid', genderCustom: '', age: 21, hometown: '', bio: '',
      backstory: { origin: 'smalltown', upbringing: 'garage', influence: 'punk', motivation: 'fame', trait: 'wildchild' }, bandName: '', genre: 'punk',
    };
    let showInstrument = true;

    const STEPS = mode === 'create'
      ? ['Identity', 'Body & face', 'Hair & makeup', 'Outfit', 'Ink & piercings', 'Instrument', 'Backstory', 'Band']
      : ['Body & face', 'Hair & makeup', 'Outfit', 'Ink & piercings', 'Instrument'];
    let step = 0;

    root.innerHTML = `
      <div class="creator">
        <div class="creator-preview card">
          <div class="preview-stage"></div>
          <div class="row center wrap">
            <button class="btn small" data-act="rand-step">🎲 Shuffle this step</button>
            <button class="btn small" data-act="rand-all">🎲 Shuffle everything</button>
            <label class="toggle"><input type="checkbox" checked data-act="show-inst"> Show instrument</label>
          </div>
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

    const draw = () => { preview.innerHTML = Avatar.svg({ ...a, showInstrument }, { anim: 'idle', title: 'Your rockstar preview' }); };

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
      'Body & face'() {
        body.append(heading('Body'));
        body.append(chips('Build', L.builds, a.build, v => a.build = v));
        const h = field('Height', `<input type="range" min="0.88" max="1.12" step="0.01" value="${a.height}">`);
        h.querySelector('input').addEventListener('input', e => { a.height = +e.target.value; draw(); });
        body.append(h);
        body.append(colors('Skin tone', L.palettes.skin, a.skin, v => a.skin = v));
        body.append(heading('Face'));
        body.append(chips('Face shape', L.face.shape, a.face.shape, v => a.face.shape = v));
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
            if (def?.print) {
              const p = field('Shirt print (your band name, a word, anything)', `<input maxlength="12" value="${esc(it.print || '')}" placeholder="e.g. RIOT">`);
              p.querySelector('input').addEventListener('input', e => { it.print = e.target.value; draw(); });
              body.append(p);
            }
          }
        };
        slot('top', 'Top', { pattern: true });
        slot('outer', 'Jacket / vest', { pattern: true });
        slot('bottom', 'Bottoms', { pattern: true });
        slot('legwear', 'Legwear');
        slot('shoes', 'Shoes');
        slot('hat', 'Hat', { pattern: true });
        slot('glasses', 'Glasses');
        slot('neck', 'Neck');
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

    function renderStep() {
      const nav = $('.steps');
      nav.innerHTML = STEPS.map((s, i) => `<button type="button" class="${i === step ? 'on' : ''}" ${i === step ? 'aria-current="step"' : ''} data-step="${i}">${i + 1}. ${esc(s)}</button>`).join('');
      nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { step = +b.dataset.step; renderStep(); }));
      const keepScroll = body.scrollTop;
      body.innerHTML = '';
      steps[STEPS[step]]();
      body.scrollTop = keepScroll;
      $('[data-act=back]').disabled = step === 0;
      $('[data-act=next]').textContent = step === STEPS.length - 1 ? (mode === 'create' ? 'Start my career 🤘' : 'Save look') : 'Next';
      $('.form-error').textContent = '';
    }

    root.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'back' && step > 0) { step--; renderStep(); body.scrollTop = 0; }
      if (act === 'next') {
        if (step < STEPS.length - 1) { step++; renderStep(); body.scrollTop = 0; return; }
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
        if (name === 'Body & face') { a.build = r.build; a.height = r.height; a.skin = r.skin; a.face = r.face; }
        if (name === 'Hair & makeup') { a.hair = r.hair; a.makeup = r.makeup; }
        if (name === 'Outfit') a.outfit = r.outfit;
        if (name === 'Ink & piercings') { a.tattoos = r.tattoos; a.piercings = r.piercings; }
        if (name === 'Instrument') a.instrument = Avatar.random(L, {}).instrument;
        renderStep(); draw();
      }
    });
    root.querySelector('[data-act=show-inst]').addEventListener('change', e => { showInstrument = e.target.checked; draw(); });

    renderStep(); draw();
  }

  return { open };
})();
