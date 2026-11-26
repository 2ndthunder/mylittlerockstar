// My Little Rockstar — live performance engine.
//  • Lyrics part:     words slide to a glowing line on the beat; type each word as it arrives.
//  • Instrument part: notes fall down lanes mapped to keys (A S D F G H J K = low → high); each key plays its real note.
//                     Drums get a kit: tom, kick, snare, hi-hat, crash.
//  • Autopilot:       learned songs can be played automatically (no input), shown as a short performance.
// A backing band is synthesised live with WebAudio for the song's genre and tempo.
'use strict';

const Stage = (() => {
  const SETTINGS_KEY = 'mlr-settings';
  const DIFFICULTY = {
    chill:  { bpw: 4, label: 'Chill — 4 note lanes, relaxed lyrics' },
    normal: { bpw: 2, label: 'Normal — 6 note lanes, 2 beats per word' },
    shred:  { bpw: 1, label: 'Shred — 8 note lanes, 1 beat per word' },
  };
  const LANES = { chill: 'DFJK', normal: 'SDFJKL', shred: 'ASDFGHJK' };
  const DRUM_LANES = {   // key → kit piece
    chill:  [['F', 'kick'], ['J', 'snare'], ['K', 'hat']],
    normal: [['D', 'tom'], ['F', 'kick'], ['J', 'snare'], ['K', 'hat']],
    shred:  [['D', 'tom'], ['F', 'kick'], ['J', 'snare'], ['K', 'hat'], ['L', 'crash']],
  };
  const PIECE_NAME = { kick: 'Kick', snare: 'Snare', hat: 'Hi-hat', tom: 'Tom', crash: 'Crash' };
  const SONG_SECONDS = 20;

  function settings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch {}
    return { difficulty: 'normal', callouts: false, volume: 0.7, part: 'instrument', ...s };
  }
  function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** seeded random so the same song always has the same part */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /* ============================================================= audio */
  class Band {
    constructor(bpm, genre, volume) {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain(); this.master.gain.value = volume; this.master.connect(this.ac.destination);
      this.bpm = bpm; this.genre = genre; this.beat = 60 / bpm;
      this.minor = ['grunge', 'metal', 'emo', 'psych'].includes(genre);
      this.root = 110 * Math.pow(2, ({ punk: 2, metal: -2, grunge: 0, glam: 5, indie: 7, poppunk: 4, classic: 2, emo: 3, psych: 0, altcountry: 7 }[genre] || 0) / 12);
      const prog = this.minor ? [0, 8, 3, 10] : [0, 7, 9, 5];
      this.chords = prog.map(st => this.root * Math.pow(2, st / 12));
      this.scale = this.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      const b = this.ac.createBuffer(1, this.ac.sampleRate * 0.6, this.ac.sampleRate);
      const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    }
    env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    osc(type, freq, t, dur, peak, dest, a = 0.005) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type; o.frequency.value = freq; this.env(g, t, a, peak, dur); o.connect(g).connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
      return o;
    }
    noiseHit(t, type, freq, peak, dur) {
      const n = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      n.buffer = this.noise; f.type = type; f.frequency.value = freq; this.env(g, t, 0.002, peak, dur);
      n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + dur + 0.05);
    }
    kick(t, v = 0.9) { const o = this.ac.createOscillator(), g = this.ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); this.env(g, t, 0.002, v, 0.22); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.25); }
    snare(t, v = 0.45) { this.noiseHit(t, 'highpass', 1200, v, 0.16); this.osc('triangle', 190, t, 0.08, v * 0.4); }
    hat(t, open = false, v = 0.12) { this.noiseHit(t, 'highpass', 7000, v, open ? 0.2 : 0.05); }
    tom(t, v = 0.6) { const o = this.ac.createOscillator(), g = this.ac.createGain(); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.25); this.env(g, t, 0.003, v, 0.3); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.32); }
    crash(t, v = 0.2) { this.noiseHit(t, 'highpass', 4500, v, 1.1); }
    bass(t, freq, dur) {
      const o = this.ac.createOscillator(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = freq / 2; f.type = 'lowpass'; f.frequency.value = 500;
      this.env(g, t, 0.01, 0.28, dur); o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    }
    distortion() {
      const sh = this.ac.createWaveShaper(), curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
      sh.curve = curve; return sh;
    }
    chord(t, freq, dur, vol = 0.08) {
      const g = this.ac.createGain(), f = this.ac.createBiquadFilter(), sh = this.distortion();
      f.type = 'lowpass'; f.frequency.value = this.genre === 'indie' || this.genre === 'altcountry' ? 1800 : 2600;
      this.env(g, t, 0.01, vol, dur);
      [1, 1.5, 2].forEach(m => { const o = this.ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq * m; o.connect(sh); o.start(t); o.stop(t + dur + 0.05); });
      sh.connect(f).connect(g).connect(this.master);
    }
    lp(freq) { const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.connect(this.master); return f; }
    vibrato(o, t, dur, rate, depth) {
      const lfo = this.ac.createOscillator(), lg = this.ac.createGain(); lfo.frequency.value = rate; lg.gain.value = depth;
      lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    /** The note YOU play, in your instrument's voice. */
    voice(instrument, freq, t = this.ac.currentTime, dur = 0.35) {
      switch (instrument) {
        case 'bass': { const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(this.master);
          this.osc('sawtooth', freq / 2, t, dur, 0.35, f); this.osc('sine', freq / 4, t, dur, 0.3); break; }
        case 'keys': this.osc('square', freq, t, dur, 0.12); this.osc('square', freq * 2.005, t, dur * 0.8, 0.05); break;
        case 'violin': { const o = this.osc('sawtooth', freq * 2, t, dur * 1.3, 0.12, null, 0.05);
          const lfo = this.ac.createOscillator(), lg = this.ac.createGain(); lfo.frequency.value = 6; lg.gain.value = 6;
          lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur * 1.3 + 0.05); break; }
        case 'vocals': this.osc('sine', freq * 2, t, dur, 0.2, null, 0.03); this.osc('triangle', freq * 4, t, dur, 0.04, null, 0.03); break;
        case 'cello': this.vibrato(this.osc('sawtooth', freq, t, dur * 1.4, 0.14, this.lp(1400), 0.06), t, dur * 1.4, 5, 4); break;
        case 'harp': case 'banjo': case 'sitar': {   // plucked: fast decay; sitar gets a buzzy twang
          const hi = key => key === 'banjo' ? 3 : 2;
          this.osc(instrument === 'sitar' ? 'sawtooth' : 'triangle', freq * hi(instrument), t, dur * 0.7, instrument === 'harp' ? 0.22 : 0.16, instrument === 'sitar' ? this.lp(2400) : null, 0.002);
          if (instrument === 'sitar') this.osc('sine', freq * 3.01, t, dur, 0.05); break; }
        case 'synth': this.osc('sawtooth', freq, t, dur, 0.1, this.lp(2200)); this.osc('sawtooth', freq * 1.007, t, dur, 0.1, this.lp(2200)); break;
        case 'piano': this.osc('triangle', freq * 2, t, dur * 1.2, 0.22, null, 0.002); this.osc('sine', freq * 4, t, dur * 0.5, 0.05, null, 0.002); break;
        case 'accordion': case 'harmonica': {
          const v = this.osc('square', freq * 2, t, dur, 0.08, this.lp(instrument === 'harmonica' ? 2600 : 1800), 0.02);
          this.osc('square', freq * 2.012, t, dur, 0.06, this.lp(1800), 0.02); this.vibrato(v, t, dur, 5.5, 3); break; }
        case 'trombone': case 'trumpet': {   // brass: filter opens as the note swells
          const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(instrument === 'trumpet' ? 3500 : 1800, t + 0.08); f.connect(this.master);
          this.osc('sawtooth', freq * (instrument === 'trumpet' ? 2 : 1), t, dur, 0.18, f, 0.03); break; }
        case 'sax': this.vibrato(this.osc('square', freq * 2, t, dur, 0.1, this.lp(1600), 0.03), t, dur, 5, 5); this.osc('sawtooth', freq * 2, t, dur, 0.05, this.lp(1200), 0.03); break;
        case 'dj': {   // a record scratch that lands on the note
          const o = this.osc('square', freq * 2, t, dur * 0.6, 0.1, this.lp(2000), 0.002);
          o.frequency.setValueAtTime(freq * 3, t); o.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.06); this.noiseHit(t, 'bandpass', 1800, 0.12, 0.06); break; }
        default: { // guitar: distorted lead
          const g = this.ac.createGain(), sh = this.distortion(), f = this.ac.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = 3200; this.env(g, t, 0.005, 0.16, dur);
          [1, 1.004].forEach(m => { const o = this.ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq * 2 * m; o.connect(sh); o.start(t); o.stop(t + dur + 0.05); });
          sh.connect(f).connect(g).connect(this.master);
        }
      }
    }
    drum(piece, t = this.ac.currentTime) { ({ kick: () => this.kick(t), snare: () => this.snare(t, 0.6), hat: () => this.hat(t, false, 0.2), tom: () => this.tom(t), crash: () => this.crash(t, 0.3) })[piece]?.(); }
    degreeFreq(deg) {   // scale degree (0 = root) → frequency
      const oct = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7;
      return this.root * Math.pow(2, (this.scale[i] + 12 * oct) / 12);
    }
    pluck(freq, vol = 0.18) { this.osc('triangle', freq, this.ac.currentTime, 0.3, vol); }
    thud() { const t = this.ac.currentTime, o = this.ac.createOscillator(), g = this.ac.createGain(); o.type = 'square'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.2); this.env(g, t, 0.005, 0.1, 0.22); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.25); }
    click(t, hi) { this.osc('sine', hi ? 1600 : 1000, t, 0.06, 0.25); }
    /** The groove. `skipDrums` when the player is the drummer; `light` keeps guitars back so your part cuts through. */
    schedule(t0, beats, { skipDrums = false, light = false } = {}) {
      const b = this.beat, g = this.genre;
      for (let i = 0; i < beats; i++) {
        const t = t0 + i * b, inBar = i % 4, ch = this.chords[Math.floor(i / 4) % 4];
        if (!skipDrums) {
          if (g === 'metal') { for (let k = 0; k < 4; k++) this.kick(t + k * b / 4); }
          else if (g === 'punk' || g === 'poppunk') { this.kick(t); this.kick(t + b / 2); }
          else if (inBar === 0 || inBar === 2 || g === 'glam') this.kick(t);
          if (inBar === 1 || inBar === 3) this.snare(t);
          const swing = g === 'psych' || g === 'altcountry' ? b * 0.16 : 0;
          this.hat(t); this.hat(t + b / 2 + swing, g === 'grunge' && inBar === 3);
        } else this.hat(t, false, 0.04);   // soft click track for drummers
        this.bass(t, ch, b * 0.9);
        const v = light ? 0.05 : 0.08;
        if (g === 'punk' || g === 'metal' || g === 'poppunk') { this.chord(t, ch, b * 0.45, v); this.chord(t + b / 2, ch, b * 0.45, v); }
        else if (inBar === 0) this.chord(t, ch, b * 3.8, v);
        else if (inBar === 2 && (g === 'classic' || g === 'glam')) this.chord(t + b / 2, ch, b * 1.4, v);
      }
    }
    close() { try { this.ac.close(); } catch {} }
  }

  /* ============================================================= charts */
  /** Melodic part (guitar/bass/keys/violin): a seeded melody that moves mostly by step. */
  function melodyChart(chart, diff, instrument) {
    const R = rng(chart.seed || 1), lanes = LANES[diff].length;
    const beat = 60 / chart.bpm;
    const step = { chill: 1, normal: 0.5, shred: 0.5 }[diff];
    const density = { chill: 0.85, normal: 0.62, shred: 0.8 }[diff];
    const minGap = { chill: 0.9, normal: 0.45, shred: 0.25 }[diff] * (chart.bpm > 160 ? 1.6 : 1);   // in beats
    const beats = Math.max(16, Math.round(SONG_SECONDS / beat));
    const notes = [];
    let lane = Math.floor(lanes / 2), lastBeat = -9;
    for (let pos = 0; pos < beats; pos += step) {
      const strong = Math.abs(pos % 1) < 0.01;
      if (!strong && R() > density) continue;
      if (strong && R() > 0.92) continue;
      if (pos - lastBeat < minGap) continue;
      const move = R() < 0.6 ? (R() < 0.5 ? -1 : 1) : (R() < 0.5 ? -2 : 2);
      lane = Math.max(0, Math.min(lanes - 1, lane + move));
      if (instrument === 'bass' && R() < 0.5) lane = Math.floor(R() * Math.ceil(lanes / 2));
      notes.push({ beat: pos, lane });
      lastBeat = pos;
      if (diff === 'shred' && R() < 0.12 && pos + 0.25 < beats && chart.bpm <= 160) { notes.push({ beat: pos + 0.25, lane: Math.min(lanes - 1, lane + 1) }); lastBeat = pos + 0.25; }
    }
    return notes;
  }
  /** Drum part: groove with fills, mapped onto kit lanes. */
  function drumChart(chart, diff) {
    const R = rng((chart.seed || 1) + 99), kit = DRUM_LANES[diff].map(k => k[1]);
    const beat = 60 / chart.bpm, beats = Math.max(16, Math.round(SONG_SECONDS / beat));
    const has = p => kit.indexOf(p), fast = chart.bpm > 150;
    const notes = [];
    for (let i = 0; i < beats; i++) {
      const inBar = i % 4, bar = Math.floor(i / 4), fill = bar % 4 === 3 && inBar >= 2 && has('tom') >= 0;
      if (fill) { notes.push({ beat: i, lane: has('tom') }); if (diff === 'shred' && !fast) notes.push({ beat: i + 0.5, lane: has('tom') }); continue; }
      if (inBar === 0 && bar % 4 === 0 && has('crash') >= 0 && i > 0) notes.push({ beat: i, lane: has('crash') });
      else if (inBar === 0 || inBar === 2) notes.push({ beat: i, lane: has('kick') });
      if (inBar === 1 || inBar === 3) notes.push({ beat: i, lane: has('snare') });
      if (diff !== 'chill' && !fast && has('hat') >= 0 && (inBar === 0 || inBar === 2)) notes.push({ beat: i + 0.5, lane: has('hat') });
      if (diff === 'chill' && inBar === 2 && R() < 0.5) notes.push({ beat: i + 0.5, lane: has('hat') });
    }
    return notes.sort((a, b) => a.beat - b.beat);
  }

  /* ============================================================= shared pieces */
  function header(chart, label, partLabel) {
    return `<div class="typer-head">
        <div><b>${esc(chart.title)}</b> <span class="muted">${chart.bpm} BPM · ${esc(label || '')} · ${esc(partLabel)}</span></div>
        <div class="typer-stats"><span class="t-combo">Combo 0</span> <span class="t-acc">100%</span></div></div>`;
  }
  function makeScorer(container, band, opts) {
    const comboEl = container.querySelector('.t-combo'), accEl = container.querySelector('.t-acc');
    const st = { scores: [], combo: 0, maxCombo: 0, hype: 50 };
    st.judge = (score, kind) => {
      st.scores.push(score);
      if (score >= 0.75) { st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo); }
      else if (score === 0) { st.combo = 0; band?.thud(); }
      st.hype = Math.max(0, Math.min(100, st.hype + (score >= 0.75 ? 4 : score > 0 ? 1 : -7)));
      opts.onHype?.(st.hype); opts.onHit?.(kind);
      comboEl.textContent = `Combo ${st.combo}`;
      accEl.textContent = Math.round(st.scores.reduce((a, b) => a + b, 0) / st.scores.length * 100) + '%';
    };
    st.accuracy = total => { while (st.scores.length < total) st.scores.push(0); return Math.round(st.scores.reduce((a, b) => a + b, 0) / Math.max(1, st.scores.length) * 1000) / 10; };
    return st;
  }

  /* ============================================================= LYRICS PART */
  const norm = w => w.toLowerCase().replace(/[^a-z0-9']/g, '');

  function playLyrics(container, chart, opts, S) {
    return new Promise(resolve => {
      const bpw = DIFFICULTY[S.difficulty]?.bpw || 2;
      const beat = 60 / chart.bpm, gap = beat * bpw;
      const allWords = chart.lyrics.join(' ').split(/\s+/).map(w => w.trim()).filter(w => norm(w));
      const need = Math.max(8, Math.min(48, Math.ceil(SONG_SECONDS / gap)));
      const words = []; while (words.length < need) words.push(...allWords); words.length = need;

      container.innerHTML = `<div class="typer" role="application" aria-roledescription="typing rhythm game">
          ${header(chart, opts.label, '🎤 Lyrics')}
          <div class="typer-lane" aria-hidden="true"><div class="typer-hit"></div><div class="typer-words"></div></div>
          <div class="typer-current" aria-live="assertive"></div>
          <div class="typer-progress"><div></div></div>
          <p class="typer-help muted">Type each word as it reaches the glowing line. Backspace fixes mistakes. <kbd>Esc</kbd> to stop.</p></div>`;
      const lane = container.querySelector('.typer-words'), cur = container.querySelector('.typer-current');
      const prog = container.querySelector('.typer-progress div');
      const laneW = () => container.querySelector('.typer-lane').clientWidth;
      const pxPerSec = 260 / bpw * (chart.bpm / 120);
      const els = words.map(w => { const e = document.createElement('span'); e.className = 'tw'; e.style.visibility = 'hidden'; e.textContent = w; lane.append(e); return e; });

      let band; try { band = new Band(chart.bpm, chart.genre, S.volume); } catch { band = null; }
      const now = () => (band ? band.ac.currentTime : performance.now() / 1000);
      const lead = beat * 4, t0 = now() + 0.3;
      const times = words.map((_, i) => t0 + lead + gap * (i + 1));
      const endT = times[times.length - 1] + gap * 1.5;
      if (band) { for (let i = 0; i < 4; i++) band.click(t0 + i * beat, i === 0); band.schedule(t0 + lead, Math.ceil((endT - t0 - lead) / beat) + 2); }

      const sc = makeScorer(container, band, opts);
      let idx = 0, typed = '', errors = 0, done = false, firstKey = null, chars = 0;
      const spoken = new Set();
      const render = () => {
        const w = words[idx] || '';
        cur.innerHTML = idx < words.length ? `<span class="ok">${esc(w.slice(0, typed.length))}</span><span class="todo">${esc(w.slice(typed.length))}</span>` : '';
        cur.setAttribute('aria-label', w ? `Type: ${w}` : '');
      };
      const judge = (score, kind) => {
        els[idx].classList.add(kind);
        if (score >= 0.75) band?.voice('vocals', band.degreeFreq(sc.combo % 7), undefined, 0.25);
        sc.judge(score, kind);
        idx++; typed = ''; errors = 0; render();
      };
      const onKey = e => {
        if (done) return;
        if (e.key === 'Escape') { e.preventDefault(); finish(true); return; }
        if (idx >= words.length) return;
        if (e.key === 'Backspace') { e.preventDefault(); typed = typed.slice(0, -1); render(); return; }
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (e.key === ' ') return;
        firstKey ??= now();
        const target = norm(words[idx]), next = target[norm(typed).length];
        if (e.key.toLowerCase() === next) {
          typed = words[idx].slice(0, typed.length + 1);
          while (typed.length < words[idx].length && !norm(words[idx][typed.length])) typed = words[idx].slice(0, typed.length + 1);
          chars++;
          if (norm(typed) === target) {
            const dt = now() - times[idx], a = Math.abs(dt);
            if (dt < -gap * 1.2) { judge(0.5 * Math.max(0.4, 1 - errors * 0.15), 'early'); return; }
            const base = a <= gap * 0.35 ? 1 : a <= gap * 0.7 ? 0.8 : 0.55;
            judge(base * Math.max(0.4, 1 - errors * 0.15), base === 1 ? 'perfect' : base > 0.7 ? 'good' : 'ok');
            return;
          }
        } else { errors++; cur.classList.remove('shake'); void cur.offsetWidth; cur.classList.add('shake'); }
        render();
      };
      const frame = () => {
        if (done) return;
        const t = now(), W = laneW(), hitX = W * 0.22;
        for (let i = 0; i < words.length; i++) {
          const x = hitX + (times[i] - t) * pxPerSec, vis = x > -120 && x < W + 120;
          els[i].style.visibility = vis ? 'visible' : 'hidden';
          if (!vis) continue;
          els[i].style.transform = `translateX(${x}px) translateX(-50%)`;
          els[i].classList.toggle('current', i === idx);
          els[i].style.opacity = i < idx ? 0.45 : 1;
        }
        if (S.callouts && 'speechSynthesis' in window && idx < words.length && !spoken.has(idx) && times[idx] - t < gap * 1.1) {
          spoken.add(idx); const u = new SpeechSynthesisUtterance(words[idx]); u.rate = 1.3; speechSynthesis.speak(u);
        }
        if (idx < words.length && t - times[idx] > gap * 0.85) judge(0, 'miss');
        prog.style.width = Math.min(100, (t - t0) / (endT - t0) * 100) + '%';
        if (t >= endT || (idx >= words.length && t >= times[words.length - 1] + gap * 0.5)) return finish(false);
        requestAnimationFrame(frame);
      };
      function finish(quit) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        try { speechSynthesis.cancel(); } catch {}
        setTimeout(() => band?.close(), 400);
        if (quit) return resolve(null);
        const minutes = Math.max(0.05, (now() - (firstKey ?? now())) / 60);
        resolve({ accuracy: sc.accuracy(words.length), wpm: Math.round(chars / 5 / minutes), combo: sc.maxCombo, part: 'lyrics' });
      }
      document.addEventListener('keydown', onKey, true);
      render(); requestAnimationFrame(frame);
    });
  }

  /* ============================================================= INSTRUMENT PART */
  function playNotes(container, chart, opts, S) {
    return new Promise(resolve => {
      const instrument = opts.instrument || 'guitar', drums = instrument === 'drums';
      const diff = S.difficulty in LANES ? S.difficulty : 'normal';
      const keys = drums ? DRUM_LANES[diff].map(k => k[0]) : LANES[diff].split('');
      const labels = drums ? DRUM_LANES[diff].map(k => PIECE_NAME[k[1]]) : keys.map((_, i) => i === 0 ? 'Low' : i === keys.length - 1 ? 'High' : '');
      const raw = drums ? drumChart(chart, diff) : melodyChart(chart, diff, instrument);
      const icon = { guitar: '🎸', bass: '🎸', keys: '🎹', synth: '🎹', piano: '🎹', accordion: '🪗', drums: '🥁', violin: '🎻', cello: '🎻', harp: '🎶', sitar: '🎶', banjo: '🪕',
        vocals: '🎤', harmonica: '🎶', trombone: '🎺', trumpet: '🎺', sax: '🎷', dj: '🎧' }[instrument] || '🎸';
      const partName = drums ? 'Drum part' : instrument === 'vocals' ? 'Vocal melody' : instrument[0].toUpperCase() + instrument.slice(1) + ' part';

      container.innerHTML = `<div class="notes-game" role="application" aria-roledescription="instrument rhythm game">
          ${header(chart, opts.label, `${icon} ${partName}`)}
          <div class="highway" style="--lanes:${keys.length}" aria-hidden="true">
            ${keys.map((k, i) => `<div class="hw-lane l${i % 8}"></div>`).join('')}
            <div class="hw-hit"></div><div class="hw-notes"></div>
          </div>
          <div class="hw-keys" style="--lanes:${keys.length}">${keys.map((k, i) => `<div class="hw-key l${i % 8}"><b>${k}</b><small>${esc(labels[i])}</small></div>`).join('')}</div>
          <div class="typer-progress"><div></div></div>
          <p class="typer-help muted">Press the key under each note as it reaches the line${drums ? '' : ' — left keys are low notes, right keys are high notes'}. <kbd>Esc</kbd> to stop.</p></div>`;
      const hw = container.querySelector('.highway'), box = container.querySelector('.hw-notes');
      const prog = container.querySelector('.typer-progress div');
      const keyEls = [...container.querySelectorAll('.hw-key')];

      let band; try { band = new Band(chart.bpm, chart.genre, S.volume); } catch { band = null; }
      const now = () => (band ? band.ac.currentTime : performance.now() / 1000);
      const beat = 60 / chart.bpm, lead = beat * 4, t0 = now() + 0.3;
      const notes = raw.map(n => ({ ...n, t: t0 + lead + n.beat * beat, done: false }));
      const endT = (notes.at(-1)?.t || t0 + lead) + beat * 2;
      if (band) { for (let i = 0; i < 4; i++) band.click(t0 + i * beat, i === 0); band.schedule(t0 + lead, Math.ceil((endT - t0 - lead) / beat) + 1, { skipDrums: drums, light: !drums }); }
      const degreeOf = lane => Math.round(lane * (keys.length > 4 ? 1 : 1.5));   // lanes walk up the scale
      const playLane = (lane, dur) => { if (!band) return; if (drums) band.drum(DRUM_LANES[diff][lane][1]); else band.voice(instrument, band.degreeFreq(degreeOf(lane)), undefined, dur); };

      notes.forEach(n => { const e = document.createElement('div'); e.className = `hw-note l${n.lane % 8}`; e.textContent = keys[n.lane]; e.style.left = `calc(${n.lane} * 100% / ${keys.length})`; e.style.visibility = 'hidden'; box.append(e); n.el = e; });
      const sc = makeScorer(container, band, opts);
      const W = { perfect: 0.075, good: 0.14, ok: 0.21 };
      let done = false, hits = 0;
      const spoken = new Set();

      const onKey = e => {
        if (done) return;
        if (e.key === 'Escape') { e.preventDefault(); finish(true); return; }
        const lane = keys.indexOf(e.key.toUpperCase());
        if (lane < 0 || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        keyEls[lane].classList.remove('press'); void keyEls[lane].offsetWidth; keyEls[lane].classList.add('press');
        const t = now();
        let best = null;
        for (const n of notes) {
          if (n.t - t > W.ok) break;
          if (n.done || n.lane !== lane) continue;
          const d = Math.abs(n.t - t);
          if (d <= W.ok && (!best || d < Math.abs(best.t - t))) best = n;
        }
        if (!best) { playLane(lane, 0.15); sc.combo = 0; return; }   // stray key: you hear it, combo breaks
        const d = Math.abs(best.t - t);
        const [score, kind] = d <= W.perfect ? [1, 'perfect'] : d <= W.good ? [0.8, 'good'] : [0.55, 'ok'];
        best.done = true; best.el.classList.add('hit', kind); hits++;
        playLane(lane);
        sc.judge(score, kind);
      };
      const frame = () => {
        if (done) return;
        const t = now(), H = hw.clientHeight, hitY = H - 34, pps = Math.max(240, H * 1.05);
        for (const n of notes) {
          const y = hitY - (n.t - t) * pps;
          const vis = y > -40 && y < H + 20 && !(n.done && t - n.t > 0.25);
          n.el.style.visibility = vis ? 'visible' : 'hidden';
          if (vis) n.el.style.transform = `translateY(${y - 16}px)`;
          if (!n.done && t - n.t > W.ok) { n.done = true; n.el.classList.add('miss'); sc.judge(0, 'miss'); }
        }
        if (S.callouts && 'speechSynthesis' in window) {   // speak the key letter (or drum piece) just before each note
          const i = notes.findIndex(x => !x.done && !spoken.has(x) && x.t - t < 0.85 && x.t - t > 0.25);
          if (i >= 0 && ((notes[i + 1]?.t ?? Infinity) - notes[i].t) > 0.4) {
            const n = notes[i]; spoken.add(n);
            const u = new SpeechSynthesisUtterance(drums ? PIECE_NAME[DRUM_LANES[diff][n.lane][1]] : keys[n.lane]); u.rate = 1.6; speechSynthesis.speak(u);
          }
        }
        prog.style.width = Math.min(100, (t - t0) / (endT - t0) * 100) + '%';
        if (t >= endT) return finish(false);
        requestAnimationFrame(frame);
      };
      function finish(quit) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        try { speechSynthesis.cancel(); } catch {}
        setTimeout(() => band?.close(), 600);
        if (quit) return resolve(null);
        resolve({ accuracy: sc.accuracy(notes.length), wpm: 0, combo: sc.maxCombo, part: drums ? 'drums' : instrument, notes: notes.length, hits });
      }
      document.addEventListener('keydown', onKey, true);
      requestAnimationFrame(frame);
    });
  }

  /* ============================================================= AUTOPILOT */
  /** A learned song on autopilot: the band plays a short excerpt by itself. Resolves when done or skipped. */
  function autoplay(container, chart, opts = {}) {
    return new Promise(resolve => {
      const S = settings(), secs = opts.seconds || 8;
      const words = chart.lyrics.join(' ').split(/\s+/).filter(Boolean);
      container.innerHTML = `<div class="autoplay">${header(chart, opts.label, '🤖 Autopilot')}
          <p class="auto-lyric" aria-live="off"></p><div class="typer-progress"><div></div></div>
          <div class="row end"><button class="btn small ghost auto-skip">Skip ⏭</button></div></div>`;
      container.querySelector('.t-combo').textContent = 'You know this one';
      container.querySelector('.t-acc').textContent = '';
      const lyr = container.querySelector('.auto-lyric'), prog = container.querySelector('.typer-progress div');
      let band; try { band = new Band(chart.bpm, chart.genre, S.volume * 0.8); } catch { band = null; }
      const now = () => (band ? band.ac.currentTime : performance.now() / 1000);
      const t0 = now() + 0.1, beat = 60 / chart.bpm;
      band?.schedule(t0, Math.ceil(secs / beat) + 1);
      let done = false, wi = 0, last = -9;
      const frame = () => {
        if (done) return;
        const t = now() - t0;
        if (t - last > beat * 2) { last = t; lyr.textContent = words.slice(wi, wi + 6).join(' '); wi = (wi + 3) % Math.max(1, words.length); opts.onHit?.('good'); }
        prog.style.width = Math.min(100, t / secs * 100) + '%';
        if (t >= secs) return end();
        requestAnimationFrame(frame);
      };
      const end = () => { if (done) return; done = true; setTimeout(() => band?.close(), 300); resolve(); };
      container.querySelector('.auto-skip').addEventListener('click', end);
      container.querySelector('.auto-skip').focus();
      requestAnimationFrame(frame);
    });
  }

  /**
   * Play one song live. opts.part: 'lyrics' or 'instrument' (default from settings);
   * opts.instrument: the player's instrument type. Vocalists on 'instrument' play the vocal melody on keys.
   * Resolves { accuracy, wpm, combo, part } or null if the player quit.
   */
  function play(container, chart, opts = {}) {
    const S = settings();
    const part = opts.part || S.part;
    return part === 'lyrics' ? playLyrics(container, chart, opts, S) : playNotes(container, chart, opts, S);
  }

  return { play, autoplay, settings, saveSettings, DIFFICULTY };
})();
