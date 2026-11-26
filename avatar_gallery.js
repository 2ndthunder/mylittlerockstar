// Dev page: the hand-built "style target" look first, then random rockstars. Refresh for new ones.
fetch('assets/data/catalog.json').then(r => r.json()).then(cat => {
  Avatar.catalog = cat;
  const target = {
    build: 'slim', height: 1, skin: '#f2c9a0', stance: 'wide',
    body: { head: 10, shoulders: 5, chest: 0, waist: 0, hips: 0, arms: 5, legs: 10, muscle: 10 },
    face: { shape: 'pointed', eyes: 'toon', eyeColor: '#5a1a4a', brows: 'slab', nose: 'triangle', mouth: 'fangs', marks: 'none',
      eyeSize: 25, eyeGap: 5, browTilt: 30, noseSize: 0, mouthWidth: 20, jaw: -5 },
    hair: { style: 'spiky', color: '#a8237a', color2: '', facial: 'none' },
    makeup: { liner: false, shadow: '', lips: '', paint: 'none' },
    outfit: { top: { id: 'tee', color: '#4a2a63' }, outer: { id: 'studvest', color: '#1d1a22' }, bottom: { id: 'cargo', color: '#6b6e70', fit: 'baggy' },
      legwear: { id: 'none' }, shoes: { id: 'hightops', color: '#2a2833' }, hat: { id: 'none' }, glasses: { id: 'none' }, neck: { id: 'none' },
      wrist: { id: 'gloves', color: '#141218' }, belt: { id: 'chain' } },
    piercings: [], tattoos: [], instrument: { type: 'guitar', model: 'vee', color: '#9b72c8', finish: 'gloss' },
  };
  const big = location.search.includes('big');
  const show = (a, opt = {}) => { const d = document.createElement('div'); d.style.width = big ? '420px' : '210px'; d.innerHTML = Avatar.svg(a, { anim: 'none', ...opt }); document.body.appendChild(d); };
  show(target); show(target, { view: 'face' }); show(target, { expression: 'shout' });
  ['guitar', 'bass', 'vocals', 'drums', 'keys', 'violin', 'guitar', 'none', 'bass'].forEach(t => {
    const a = Avatar.random(cat, { instrument: t === 'none' ? 'guitar' : t, freeOnly: false });
    if (t === 'none') a.showInstrument = false;
    show(a);
  });
  window.done = true;
});
