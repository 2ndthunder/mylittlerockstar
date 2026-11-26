// My Little Rockstar — "Type the Riff": the keyboard performance engine used for practice, rehearsals and live shows.
// Lyric words slide toward the hit line on the beat. Type each word as it arrives; timing + accuracy = your performance.
// A backing track is synthesised live with WebAudio for the song's genre and tempo.
'use strict';

const Stage = (() => {
  const SETTINGS_KEY = 'mlr-settings';
  const DIFFICULTY = { chill: { bpw: 4, label: 'Chill (4 beats per word)' }, normal: { bpw: 2, label: 'Normal (2 beats per word)' }, shred: { bpw: 1, label: 'Shred (1 beat per word)' } };
  const SONG_SECONDS = 20;

  function settings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch {}
    return { difficulty: 'normal', callouts: false, volume: 0.7, ...s };
  }
  function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

  /* ------------------------------------------------------------- audio */
  class Band {
    constructor(bpm, genre, volume) {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain();
      this.master.gain.value = volume;
      this.master.connect(this.ac.destination);
      this.bpm = bpm; this.genre = genre; this.beat = 60 / bpm;
      this.minor = ['grunge', 'metal', 'emo', 'psych'].includes(genre);
      const root = 110 * Math.pow(2, ({ punk: 2, metal: -2, grunge: 0, glam: 5, indie: 7, poppunk: 4, classic: 2, emo: 3, psych: 0, altcountry: 7 }[genre] || 0) / 12);
      const prog = this.minor ? [0, 8, 3, 10] : [0, 7, 9, 5];   // i-VI-III-VII  or  I-V-vi-IV
      this.chords = prog.map(st => root * Math.pow(2, st / 12));
      this.noise = this.makeNoise();
    }
    makeNoise() {
      const b = this.ac.createBuffer(1, this.ac.sampleRate * 0.5, this.ac.sampleRate);
      const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    env(node, t, a, peak, dur) {
      node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a);
      node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    kick(t) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      this.env(g, t, 0.002, 0.9, 0.22); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.25);
    }
    snare(t) {
      const n = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 1200;
      this.env(g, t, 0.002, 0.45, 0.16); n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + 0.2);
    }
    hat(t, open = false) {
      const n = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000;
      this.env(g, t, 0.001, 0.12, open ? 0.18 : 0.05); n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + 0.2);
    }
    bass(t, freq, dur) {
      const o = this.ac.createOscillator(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = freq / 2; f.type = 'lowpass'; f.frequency.value = 500;
      this.env(g, t, 0.01, 0.3, dur); o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    }
    chord(t, freq, dur) {   // distorted power chord
      const g = this.ac.createGain(), f = this.ac.createBiquadFilter(), sh = this.ac.createWaveShaper();
      const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
      sh.curve = curve; f.type = 'lowpass'; f.frequency.value = this.genre === 'indie' || this.genre === 'altcountry' ? 1800 : 2600;
      this.env(g, t, 0.01, 0.09, dur);
      [1, 1.5, 2].forEach(m => { const o = this.ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq * m; o.connect(sh); o.start(t); o.stop(t + dur + 0.05); });
      sh.connect(f).connect(g).connect(this.master);
    }
    pluck(freq, vol = 0.18) {   // played when you nail a word
      const t = this.ac.currentTime, o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = 'triangle'; o.frequency.value = freq; this.env(g, t, 0.005, vol, 0.3); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.32);
    }
    thud() {
      const t = this.ac.currentTime, o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.2);
      this.env(g, t, 0.005, 0.12, 0.22); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.25);
    }
    click(t, hi) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.frequency.value = hi ? 1600 : 1000; this.env(g, t, 0.001, 0.25, 0.06); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.08);
    }
    /** schedule the whole groove from t0 for `beats` beats */
    schedule(t0, beats) {
      const b = this.beat, g = this.genre;
      for (let i = 0; i < beats; i++) {
        const t = t0 + i * b, inBar = i % 4, ch = this.chords[Math.floor(i / 4) % 4];
        if (g === 'metal') { this.kick(t); this.kick(t + b / 4); this.kick(t + b / 2); this.kick(t + 3 * b / 4); }
        else if (g === 'punk' || g === 'poppunk') { this.kick(t); this.kick(t + b / 2); }
        else if (inBar === 0 || inBar === 2 || (g === 'glam' && true)) this.kick(t);
        if (inBar === 1 || inBar === 3) this.snare(t);
        const swing = g === 'psych' || g === 'altcountry' ? b * 0.16 : 0;
        this.hat(t); this.hat(t + b / 2 + swing, g === 'grunge' && inBar === 3);
        this.bass(t, ch, b * 0.9);
        if (g === 'punk' || g === 'metal' || g === 'poppunk') { this.chord(t, ch, b * 0.45); this.chord(t + b / 2, ch, b * 0.45); }
        else if (inBar === 0) this.chord(t, ch, b * 3.8);
        else if (inBar === 2 && (g === 'classic' || g === 'glam')) this.chord(t + b / 2, ch, b * 1.4);
      }
    }
    noteFor(i) { const scale = this.minor ? [0, 3, 5, 7, 10, 12] : [0, 2, 4, 7, 9, 12]; return this.chords[0] * 2 * Math.pow(2, scale[i % scale.length] / 12); }
    close() { try { this.ac.close(); } catch {} }
  }

  /* ------------------------------------------------------------- the game */
  const norm = w => w.toLowerCase().replace(/[^a-z0-9']/g, '');

  /**
   * Play one song. Resolves { accuracy 0-100, wpm, combo, hits, misses } or null if quit.
   * opts: { onHype(h), onHit(kind), label, songIndex, songCount, actor }
   */
  function play(container, chart, opts = {}) {
    return new Promise(resolve => {
      const S = settings();
      const bpw = DIFFICULTY[S.difficulty]?.bpw || 2;
      const beat = 60 / chart.bpm, gap = beat * bpw;
      const allWords = chart.lyrics.join(' ').split(/\s+/).map(w => w.trim()).filter(w => norm(w));
      const need = Math.max(8, Math.min(48, Math.ceil(SONG_SECONDS / gap)));
      const words = [];
      while (words.length < need) words.push(...allWords);
      words.length = need;

      container.innerHTML = `
        <div class="typer" role="application" aria-roledescription="typing rhythm game">
          <div class="typer-head">
            <div><b>${esc(chart.title)}</b> <span class="muted">${chart.bpm} BPM · ${esc(opts.label || '')}</span></div>
            <div class="typer-stats"><span class="t-combo">Combo 0</span> <span class="t-acc">100%</span></div>
          </div>
          <div class="typer-lane" aria-hidden="true"><div class="typer-hit"></div><div class="typer-words"></div></div>
          <div class="typer-current" aria-live="assertive"></div>
          <div class="typer-progress"><div></div></div>
          <p class="typer-help muted">Type each word as it reaches the glowing line. Backspace fixes mistakes. <kbd>Esc</kbd> to stop.</p>
        </div>`;
      const lane = container.querySelector('.typer-words'), cur = container.querySelector('.typer-current');
      const comboEl = container.querySelector('.t-combo'), accEl = container.querySelector('.t-acc');
      const prog = container.querySelector('.typer-progress div');
      const laneW = () => container.querySelector('.typer-lane').clientWidth;
      const pxPerSec = 260 / bpw * (chart.bpm / 120);

      const els = words.map(w => { const e = document.createElement('span'); e.className = 'tw'; e.style.visibility = 'hidden'; e.textContent = w; lane.append(e); return e; });

      let band;
      try { band = new Band(chart.bpm, chart.genre, S.volume); } catch { band = null; }
      const now = () => (band ? band.ac.currentTime : performance.now() / 1000);
      const lead = beat * 4;                       // count-in bar
      const t0 = now() + 0.3;
      const times = words.map((_, i) => t0 + lead + gap * (i + 1));
      const endT = times[times.length - 1] + gap * 1.5;
      if (band) {
        for (let i = 0; i < 4; i++) band.click(t0 + i * beat, i === 0);
        band.schedule(t0 + lead, Math.ceil((endT - t0 - lead) / beat) + 2);
      }

      let idx = 0, typed = '', errors = 0, combo = 0, maxCombo = 0, hype = 50, done = false;
      const scores = [], startedTyping = { t: null }, correctChars = { n: 0 };
      const spoken = new Set();

      const render = () => {
        const w = words[idx] || '';
        cur.innerHTML = idx < words.length
          ? `<span class="ok">${esc(w.slice(0, typed.length))}</span><span class="todo">${esc(w.slice(typed.length))}</span>`
          : '';
        cur.setAttribute('aria-label', w ? `Type: ${w}` : '');
      };

      const judge = (score, kind) => {
        scores.push(score);
        els[idx].classList.add(kind);
        if (score >= 0.75) { combo++; maxCombo = Math.max(maxCombo, combo); band?.pluck(band.noteFor(combo), 0.16); }
        else if (score === 0) { combo = 0; band?.thud(); }
        else combo = Math.max(0, combo);
        hype = Math.max(0, Math.min(100, hype + (score >= 0.75 ? 4 : score > 0 ? 1 : -7)));
        opts.onHype?.(hype); opts.onHit?.(kind);
        comboEl.textContent = `Combo ${combo}`;
        accEl.textContent = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) + '%';
        idx++; typed = ''; errors = 0;
        render();
      };

      const onKey = e => {
        if (done) return;
        if (e.key === 'Escape') { e.preventDefault(); finish(true); return; }
        if (idx >= words.length) return;
        if (e.key === 'Backspace') { e.preventDefault(); typed = typed.slice(0, -1); render(); return; }
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (e.key === ' ') return;   // spaces are optional, words auto-advance
        startedTyping.t ??= now();
        const target = norm(words[idx]);
        const next = target[norm(typed).length];
        const ch = e.key.toLowerCase();
        if (ch === next) {
          typed = words[idx].slice(0, typed.length + 1);
          // skip punctuation in the display word
          while (typed.length < words[idx].length && !norm(words[idx][typed.length])) typed = words[idx].slice(0, typed.length + 1);
          correctChars.n++;
          if (norm(typed) === target) {
            const dt = now() - times[idx], a = Math.abs(dt);
            if (dt < -gap * 1.2) { /* way too early: count it but small */ judge(0.5 * Math.max(0.4, 1 - errors * 0.15), 'early'); return; }
            const base = a <= gap * 0.35 ? 1 : a <= gap * 0.7 ? 0.8 : 0.55;
            judge(base * Math.max(0.4, 1 - errors * 0.15), base === 1 ? 'perfect' : base > 0.7 ? 'good' : 'ok');
            return;
          }
        } else {
          errors++;
          cur.classList.remove('shake'); void cur.offsetWidth; cur.classList.add('shake');
        }
        render();
      };

      const frame = () => {
        if (done) return;
        const t = now(), W = laneW(), hitX = W * 0.22;
        for (let i = 0; i < words.length; i++) {
          const x = hitX + (times[i] - t) * pxPerSec;
          const visible = x > -120 && x < W + 120;
          els[i].style.visibility = visible ? 'visible' : 'hidden';
          if (!visible) continue;
          els[i].style.transform = `translateX(${x}px) translateX(-50%)`;
          els[i].classList.toggle('current', i === idx);
          els[i].style.opacity = i < idx ? 0.45 : 1;
        }
        // call-outs: speak the word one gap before it arrives (screen-free play)
        if (S.callouts && 'speechSynthesis' in window && idx < words.length && !spoken.has(idx) && times[idx] - t < gap * 1.1) {
          spoken.add(idx);
          const u = new SpeechSynthesisUtterance(words[idx]); u.rate = 1.3; speechSynthesis.speak(u);
        }
        // missed: word went past the window
        if (idx < words.length && t - times[idx] > gap * 0.85) judge(0, 'miss');
        prog.style.width = Math.min(100, (t - t0) / (endT - t0) * 100) + '%';
        if (t >= endT || idx >= words.length && t >= times[words.length - 1] + gap * 0.5) return finish(false);
        requestAnimationFrame(frame);
      };

      function finish(quit) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        try { speechSynthesis.cancel(); } catch {}
        setTimeout(() => band?.close(), 400);
        if (quit) return resolve(null);
        while (scores.length < words.length) scores.push(0);
        const minutes = Math.max(0.05, (now() - (startedTyping.t ?? now())) / 60);
        resolve({
          accuracy: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 1000) / 10,
          wpm: Math.round(correctChars.n / 5 / minutes),
          combo: maxCombo,
          hits: scores.filter(s => s > 0).length, misses: scores.filter(s => s === 0).length,
        });
      }

      document.addEventListener('keydown', onKey, true);
      render();
      requestAnimationFrame(frame);
    });
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return { play, settings, saveSettings, DIFFICULTY };
})();
