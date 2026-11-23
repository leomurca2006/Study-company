const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// ---------- Données du jeu ----------
// grow = minutes de révision nécessaires, reward = pièces à la récolte
const PLANTS = {
  marguerite: { name: 'Marguerite', price: 10, grow: 30,  reward: 20,  stages: ['🌱', '🌿', '🌼'] },
  tulipe:     { name: 'Tulipe',     price: 20, grow: 60,  reward: 45,  stages: ['🌱', '🌿', '🌷'] },
  tournesol:  { name: 'Tournesol',  price: 35, grow: 90,  reward: 80,  stages: ['🌱', '🌿', '🌻'] },
  rose:       { name: 'Rose',       price: 50, grow: 120, reward: 120, stages: ['🌱', '🌿', '🌹'] },
  hibiscus:   { name: 'Hibiscus',   price: 65, grow: 150, reward: 160, stages: ['🌱', '🌿', '🌺'] },
  cerisier:   { name: 'Cerisier',   price: 90, grow: 200, reward: 240, stages: ['🌱', '🪴', '🌸'] },
};

// Un événement par jour, en rotation
const EVENTS = [
  { icon: '🌧️', name: 'Pluie bienfaisante', desc: 'Tes plantes poussent 2× plus vite.', growMult: 2 },
  { icon: '🧺', name: 'Marché aux fleurs', desc: 'Toutes les graines sont à -50 %.', priceMult: 0.5 },
  { icon: '☀️', name: 'Soleil doré', desc: '+50 % de pièces par minute révisée.', coinMult: 1.5 },
  { icon: '🍃', name: 'Journée calme', desc: 'Rien de spécial… parfait pour se concentrer.' },
  { icon: '🐝', name: 'Abeilles butineuses', desc: 'Les récoltes rapportent 2× plus.', harvestMult: 2 },
  { icon: '🌈', name: 'Arc-en-ciel', desc: 'Pièces ×1,5 et croissance ×1,5 !', coinMult: 1.5, growMult: 1.5 },
  { icon: '🌙', name: 'Nuit étoilée', desc: 'Les récompenses de missions sont doublées.', missionMult: 2 },
];

const MISSION_POOL = [
  { id: 'min25',  text: 'Réviser 25 minutes',              key: 'minutes',  goal: 25,  reward: 15 },
  { id: 'min60',  text: 'Réviser 1 heure',                 key: 'minutes',  goal: 60,  reward: 35 },
  { id: 'min120', text: 'Réviser 2 heures',                key: 'minutes',  goal: 120, reward: 70 },
  { id: 'pomo2',  text: 'Terminer 2 pomodoros',            key: 'pomos',    goal: 2,   reward: 20 },
  { id: 'pomo4',  text: 'Terminer 4 pomodoros',            key: 'pomos',    goal: 4,   reward: 40 },
  { id: 'subj2',  text: 'Réviser 2 matières différentes',  key: 'subjects', goal: 2,   reward: 25 },
  { id: 'harv1',  text: 'Récolter une plante',             key: 'harvests', goal: 1,   reward: 15 },
  { id: 'plant2', text: 'Planter 2 graines',               key: 'plants',   goal: 2,   reward: 10 },
];

const today = () => new Date().toLocaleDateString('sv'); // AAAA-MM-JJ, heure locale
const dayNum = d => Math.floor(Date.parse(d) / 864e5);
const eventOf = d => EVENTS[dayNum(d) % EVENTS.length];
function missionsOf(d) { // 3 missions différentes, les mêmes toute la journée
  let n = dayNum(d); const pool = [...MISSION_POOL], out = [];
  for (let i = 0; i < 3; i++) { n = (n * 9301 + 49297) % 233280; out.push(pool.splice(n % pool.length, 1)[0]); }
  return out;
}
const priceOf = P => Math.ceil(P.price * (eventOf(today()).priceMult || 1));
const fmt = s => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60, p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};

// ---------- Sauvegarde ----------
const DEFAULT = {
  coins: 15, inv: { marguerite: 1 }, plots: Array(9).fill(null),
  subjects: [{ id: 1, name: 'Maths', color: '#f29bb5', min: 0 }],
  carry: 0, totalMin: 0, cfg: { work: 25, short: 5, long: 15, libre: 45 }, day: null,
  owned: [], equip: { tete: null, yeux: null, cou: null }, partnerEquip: { tete: null, yeux: null, cou: null },
  species: 'pingouin', pets: ['pingouin'], names: {}, partner: false, mood: 60, moodAt: Date.now(),
  decor: { owned: ['etagere', 'plante', 'tapisLav'], on: ['etagere', 'plante', 'tapisLav'] },
  night: false, vol: { lofi: 0, rain: 0, wind: 0, cars: 0 },
};
let S;
try { S = { ...structuredClone(DEFAULT), ...JSON.parse(localStorage.getItem('jardin') || '{}') }; }
catch { S = structuredClone(DEFAULT); }
const save = () => localStorage.setItem('jardin', JSON.stringify(S));
function dayStats() {
  const d = today();
  if (!S.day || S.day.date !== d) S.day = { date: d, minutes: 0, pomos: 0, subjects: [], harvests: 0, plants: 0, claimed: [] };
  return S.day;
}

// ---------- Pingouin & cosmétiques ----------
const heart = (x, y) => `M${x} ${y + 8}C${x - 14} ${y - 2} ${x - 8} ${y - 14} ${x} ${y - 5}C${x + 8} ${y - 14} ${x + 14} ${y - 2} ${x} ${y + 8}Z`;
const SLOTS = { tete: '🎩 Chapeaux', yeux: '👓 Lunettes', cou: '🎀 Accessoires' };
const COSMETICS = {
  bonnet: { slot: 'tete', name: 'Bonnet rose', price: 30, svg: `<path d="M56 80Q100 18 144 80Z" fill="#f9cdd9"/><rect x="52" y="72" width="96" height="14" rx="7" fill="#f2a3bb"/><circle cx="100" cy="44" r="10" fill="#fff"/>` },
  noeud: { slot: 'tete', name: 'Gros nœud', price: 25, svg: `<path d="M128 66L108 50L110 80ZM128 66L148 50L146 80Z" fill="#f2a3bb"/><circle cx="128" cy="66" r="6" fill="#f9cdd9"/>` },
  paille: { slot: 'tete', name: 'Chapeau de paille', price: 60, svg: `<ellipse cx="100" cy="72" rx="74" ry="12" fill="#f3d9a0"/><path d="M64 72Q100 10 136 72Z" fill="#f8e4b4"/><rect x="66" y="60" width="68" height="9" fill="#c4ead8"/>` },
  grenouille: { slot: 'tete', name: 'Chapeau grenouille', price: 90, svg: `<path d="M54 82Q100 14 146 82Z" fill="#b5e0a8"/><circle cx="78" cy="46" r="13" fill="#b5e0a8"/><circle cx="122" cy="46" r="13" fill="#b5e0a8"/><circle cx="78" cy="46" r="7" fill="#fff"/><circle cx="122" cy="46" r="7" fill="#fff"/><circle cx="79" cy="47" r="3.5" fill="#3b3550"/><circle cx="123" cy="47" r="3.5" fill="#3b3550"/>` },
  couronne: { slot: 'tete', name: 'Couronne', price: 150, svg: `<path d="M72 76L70 40L86 56L100 34L114 56L130 40L128 76Z" fill="#fde49a" stroke="#f3c95e" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="64" r="5" fill="#f2a3bb"/><circle cx="84" cy="66" r="4" fill="#93d0b4"/><circle cx="116" cy="66" r="4" fill="#bba9ea"/>` },
  rondes: { slot: 'yeux', name: 'Lunettes rondes', price: 35, svg: `<g fill="#ffffff44" stroke="#5b5372" stroke-width="3"><circle cx="84" cy="104" r="12"/><circle cx="116" cy="104" r="12"/><path d="M96 104Q100 100 104 104" fill="none"/></g>` },
  soleil: { slot: 'yeux', name: 'Lunettes de soleil', price: 55, svg: `<g fill="#3b3550"><rect x="70" y="96" width="27" height="16" rx="7"/><rect x="103" y="96" width="27" height="16" rx="7"/><rect x="96" y="100" width="8" height="3"/></g><rect x="74" y="99" width="8" height="3" rx="1.5" fill="#fff8"/>` },
  coeurs: { slot: 'yeux', name: 'Lunettes cœur', price: 80, svg: `<g fill="#f2a3bbdd" stroke="#e57f9f" stroke-width="2"><path d="${heart(84, 104)}"/><path d="${heart(116, 104)}"/></g><path d="M96 102L104 102" stroke="#e57f9f" stroke-width="2"/>` },
  echarpe: { slot: 'cou', name: 'Écharpe menthe', price: 40, svg: `<path d="M46 126Q100 146 154 126L152 144Q100 164 48 144Z" fill="#c4ead8"/><rect x="116" y="140" width="17" height="42" rx="7" fill="#93d0b4"/>` },
  papillon: { slot: 'cou', name: 'Nœud papillon', price: 30, svg: `<path d="M100 138L80 127L80 149ZM100 138L120 127L120 149Z" fill="#bba9ea"/><circle cx="100" cy="138" r="5" fill="#e0d6f7"/>` },
  fleurs: { slot: 'cou', name: 'Collier de fleurs', price: 70, svg: [[56, 124], [68, 132], [83, 137], [100, 139], [117, 137], [132, 132], [144, 124]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="7" fill="${['#f9cdd9', '#fdeaa9', '#e0d6f7', '#c4ead8'][i % 4]}"/><circle cx="${x}" cy="${y}" r="2.5" fill="#fff" stroke="none"/>`).join('') },
};

// ---------- Animaux (style doodle : contour dessiné) ----------
// Tous partagent la même silhouette, donc les cosmétiques vont à tout le monde.
const LINE = '#4a4266';
const beak = '<path d="M93 114Q100 109 107 114Q100 124 93 114Z" fill="#f9c9a0" stroke="#4a4266" stroke-width="3" stroke-linejoin="round"/>';
const pengBelly = '<path d="M100 90C126 90 142 118 142 148C142 180 124 198 100 198C76 198 58 180 58 148C58 118 74 90 100 90Z" fill="#fffdf8"/>';
const tummy = fill => `<ellipse cx="100" cy="166" rx="36" ry="36" fill="${fill}"/>`;
const SPECIES = {
  pingouin: { name: 'Pingouin', dflt: 'Plume', price: 0, body: '#a9b4d4', feet: '#f9c9a0', belly: pengBelly, face: beak },
  chat: { name: 'Chat', dflt: 'Mochi', price: 120, body: '#f8d6ad', feet: '#f8d6ad',
    back: '<path d="M140 190Q190 194 184 146Q182 130 170 134Q174 172 138 176Z" fill="#f8d6ad"/>',
    ears: '<path d="M52 96L56 40L96 64ZM148 96L144 40L104 64Z" fill="#f8d6ad"/><path d="M62 84L63 56L84 68ZM138 84L137 56L116 68Z" fill="#f9cdd9"/>',
    belly: tummy('#fff6ea'),
    face: '<path d="M88 64Q100 70 112 64M91 74Q100 78 109 74" stroke="#e2a874" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="118" rx="16" ry="10" fill="#fff6ea"/><path d="M96 112H104L100 117Z" fill="#f2a3bb" stroke="#4a4266" stroke-width="2" stroke-linejoin="round"/><path d="M100 117Q96 123 91 120M100 117Q104 123 109 120M56 110L74 113M56 120L74 117M144 110L126 113M144 120L126 117" stroke="#4a4266" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  lapin: { name: 'Lapin', dflt: 'Praline', price: 150, body: '#e4d6ee', feet: '#e4d6ee',
    back: '<circle cx="160" cy="186" r="13" fill="#fff"/>',
    ears: '<ellipse cx="78" cy="42" rx="14" ry="38" transform="rotate(-12 78 42)" fill="#e4d6ee"/><ellipse cx="122" cy="42" rx="14" ry="38" transform="rotate(12 122 42)" fill="#e4d6ee"/><ellipse cx="78" cy="44" rx="6" ry="26" transform="rotate(-12 78 44)" fill="#f9cdd9" stroke-width="2"/><ellipse cx="122" cy="44" rx="6" ry="26" transform="rotate(12 122 44)" fill="#f9cdd9" stroke-width="2"/>',
    belly: tummy('#fdf8fc'),
    face: '<ellipse cx="100" cy="114" rx="5" ry="3.5" fill="#f2a3bb" stroke="#4a4266" stroke-width="2"/><path d="M100 117Q96 123 91 120M100 117Q104 123 109 120" stroke="#4a4266" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  renard: { name: 'Renard', dflt: 'Caramel', price: 200, body: '#f7c19c', feet: '#8a6a7e',
    back: '<path d="M140 198Q198 198 188 138Q178 108 160 138Q160 178 140 188Z" fill="#f7c19c"/><path d="M188 138Q178 108 165 128Q174 138 188 138Z" fill="#fff6ec" stroke-width="2.5"/>',
    ears: '<path d="M52 96L52 34L96 64ZM148 96L148 34L104 64Z" fill="#f7c19c"/><path d="M52 54L52 34L69 46ZM148 54L148 34L131 46Z" fill="#8a6a7e" stroke-width="2.5"/>',
    belly: tummy('#fff6ec'),
    face: '<path d="M62 110Q100 152 138 110Q100 128 62 110Z" fill="#fff6ec" stroke="#4a4266" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="100" cy="115" rx="5" ry="3.5" fill="#4a4266"/>' },
  // la petite amie du pingouin (pas adoptable, se débloque à part)
  pingouine: { name: 'Pingouine', dflt: 'Perle', body: '#cbbde6', feet: '#f9c9a0', belly: pengBelly,
    face: beak + '<path d="M78 100L74 96M81 98L79 93M122 100L126 96M119 98L121 93" stroke="#3b3550" stroke-width="2.2" stroke-linecap="round"/>',
    hair: '<g transform="translate(128 68)" fill="#f9cdd9" stroke="#4a4266" stroke-width="2.5"><circle cx="-7" r="7"/><circle cx="7" r="7"/><circle cy="-7" r="7"/><circle cy="7" r="7"/><circle r="5" fill="#fde49a"/></g>' },
};
const PARTNER_PRICE = 250;
const nameOf = sp => S.names[sp] || SPECIES[sp].dflt;

function petSVG(sp, eq = {}) {
  const P = SPECIES[sp], layer = s => eq[s] ? COSMETICS[eq[s]].svg : '';
  // les oreilles passent derrière le corps pour que le contour reste propre
  return `<svg viewBox="0 0 200 220" aria-hidden="true">
    <g stroke="${LINE}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${P.back || ''}${P.ears || ''}
      <ellipse cx="78" cy="208" rx="15" ry="6" fill="${P.feet}"/><ellipse cx="122" cy="208" rx="15" ry="6" fill="${P.feet}"/>
      <path d="M46 118Q22 150 40 172Q52 160 56 140Z" fill="${P.body}"/><path d="M154 118Q178 150 160 172Q148 160 144 140Z" fill="${P.body}"/>
      <path d="M100 56C140 56 162 100 162 140C162 186 136 208 100 208C64 208 38 186 38 140C38 100 60 56 100 56Z" fill="${P.body}"/>${P.belly}
    </g>
    <circle cx="84" cy="104" r="4.5" fill="#3b3550"/><circle cx="116" cy="104" r="4.5" fill="#3b3550"/>
    <path d="M64 122l6-3M66 127l6-3M136 122l-6-3M134 127l-6-3" stroke="#f2a3bb" stroke-width="2.5" stroke-linecap="round"/>
    ${P.face}
    <g stroke="${LINE}" stroke-width="2" stroke-linejoin="round">${eq.tete ? '' : P.hair || ''}${layer('cou')}${layer('yeux')}${layer('tete')}</g>
    <g class="book"><path d="M62 170L100 178L138 170L138 198L100 206L62 198Z" fill="#fff" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/><path d="M100 178V206M72 180L92 184M108 184L128 180M72 188L92 192M108 192L128 188" stroke="#d6cbee" stroke-width="2"/></g>
  </svg>`;
}
const petsHTML = (sp = S.species, partner = S.partner, eqMain = S.equip, eqPartner = S.partnerEquip) => `<button class="pet main" data-talk aria-label="Parler à ${esc(nameOf(sp))}">${petSVG(sp, eqMain)}</button>` +
  (partner ? `<div class="pet partner">${petSVG('pingouine', eqPartner)}</div><span class="love" aria-hidden="true">💕</span>` : '');

// ---------- Humeur : +1,5 par minute révisée, -3 par heure ----------
const curMood = () => Math.max(0, Math.min(100, S.mood - (Date.now() - S.moodAt) / 36e5 * 3));
const addMood = n => { S.mood = Math.min(100, curMood() + n); S.moodAt = Date.now(); };
const moodLabel = v => v < 25 ? '😢 Triste' : v < 50 ? '😕 Un peu seul' : v < 80 ? '🙂 Content' : '🥰 Aux anges';

const petLines = () => {
  const n = nameOf(S.species);
  if (curMood() < 25) return [`${n} s'ennuie de toi… on révise ? 🥺`, 'Un petit pomodoro pour me remonter le moral ? 🍅'];
  return [`Coucou, c'est ${n} !`, 'On révise ensemble ? 📚', 'Tu vas tout déchirer 💪',
    'Une petite tisane et on s\'y remet 🍵', 'N\'oublie pas d\'arroser le jardin 🌷',
    'J\'aime bien quand il pleut dehors 🌧️', 'Chaque minute compte ✨',
    ...(S.partner ? [`${nameOf('pingouine')} est trop fière de toi 💕`, `${nameOf('pingouine')} et moi, on t'encourage !`] : [])];
};
let bubble = petLines()[0];
const talk = () => { const l = petLines(); bubble = l[Math.floor(Math.random() * l.length)]; };

// ---------- Décoration de la pièce ----------
const DECOR = {
  etagere:     { name: 'Étagère', icon: '📚', price: 0, html: '<div class="d shelf"><span>📚</span><span>🕯️</span><span>🌵</span></div>' },
  plante:      { name: 'Grande plante', icon: '🪴', price: 0, html: '<span class="d" style="right:6%;bottom:40px;font-size:2.8rem">🪴</span>' },
  tapisLav:    { name: 'Tapis lavande', price: 0, rug: '#e0d6f7' },
  tapisRose:   { name: 'Tapis rose', price: 30, rug: '#f9cdd9' },
  tapisMenthe: { name: 'Tapis menthe', price: 30, rug: '#c4ead8' },
  tapisSoleil: { name: 'Tapis soleil', price: 30, rug: '#fdeaa9' },
  suspendue:   { name: 'Plante suspendue', icon: '🌿', price: 35, html: '<span class="d hang">🌿</span>' },
  cadre:       { name: 'Cadre', icon: '🖼️', price: 40, html: '<span class="d" style="right:6%;top:120px;font-size:2.2rem">🖼️</span>' },
  nounours:    { name: 'Nounours', icon: '🧸', price: 45, html: '<span class="d" style="left:7%;bottom:22px;font-size:2.4rem">🧸</span>' },
  horloge:     { name: 'Horloge', icon: '🕰️', price: 50, html: '<span class="d" style="left:8%;top:118px;font-size:2rem">🕰️</span>' },
  guirlande:   { name: 'Guirlande lumineuse', icon: '✨', price: 60, html: '<div class="d garland"></div>' },
  aquarium:    { name: 'Bocal à poisson', icon: '🐠', price: 70, html: '<span class="d bowl">🐠</span>' },
  rideaux:     { name: 'Rideaux roses', icon: '🎀', price: 80, html: '<div class="d curtain l"></div><div class="d curtain r"></div>' },
};
function roomHTML(trying) { // trying : objet affiché à l'essai, sans l'acheter
  let on = Object.keys(DECOR).filter(id => S.decor.on.includes(id));
  if (trying && !on.includes(trying)) on = [...on.filter(id => !(DECOR[trying].rug && DECOR[id].rug)), trying];
  const rug = on.map(id => DECOR[id].rug).find(Boolean);
  return `<div class="window"><div class="sky"><span class="stars"></span><span class="sun"></span><span class="moon"></span><span class="cloud c1"></span><span class="cloud c2"></span></div><div class="rain"></div><div class="frame"></div></div>
    ${on.map(id => DECOR[id].html || '').join('')}
    ${rug ? `<div class="rug" style="background:${rug}"></div>` : ''}${petsHTML()}`;
}

// ---------- Ambiance sonore (générée, aucun fichier audio) ----------
let AC;
const MIX = {};
const ctx = () => { AC ||= new AudioContext(); if (AC.state === 'suspended') AC.resume(); return AC; };
function noise(brown) {
  const a = ctx(), n = a.sampleRate * 3, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  let l = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; d[i] = brown ? (l = (l + 0.02 * w) / 1.02) * 3.5 : w; }
  const s = a.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s;
}
const filt = (type, f, q = 1) => { const x = ctx().createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
const lfo = (rate, depth, param) => { const o = ctx().createOscillator(), g = ctx().createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(param); o.start(); };
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const SOUNDS = {
  rain: { gain: 0.35, build: out => noise().connect(filt('highpass', 900)).connect(filt('lowpass', 6000)).connect(out) },
  wind: { gain: 1.4, build: out => { const f = filt('bandpass', 450, 0.7); noise(true).connect(f).connect(out); lfo(0.07, 300, f.frequency); } },
  cars: { gain: 1.6, build: out => { const g = ctx().createGain(); g.gain.value = 0.5; noise(true).connect(filt('lowpass', 320)).connect(g).connect(out); lfo(0.05, 0.5, g.gain); } },
  lofi: { gain: 0.9, build: out => {
    const a = ctx(), lp = filt('lowpass', 1200); lp.connect(out);
    const hiss = a.createGain(); hiss.gain.value = 0.015; noise().connect(filt('highpass', 5000)).connect(hiss).connect(out); // grain de vinyle
    const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
    const SCALE = [72, 74, 76, 79, 81];
    const note = (type, f, t, len, vol) => {
      const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(lp); o.start(t); o.stop(t + len + 0.05);
    };
    const kick = t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(out); o.start(t); o.stop(t + 0.35); };
    let i = 0;
    const bar = () => {
      const t = a.currentTime + 0.05, ch = CHORDS[i++ % 4];
      ch.forEach(m => note('triangle', mtof(m), t, 3.1, 0.05));
      note('sine', mtof(ch[0] - 12), t, 1.4, 0.18); note('sine', mtof(ch[0] - 12), t + 1.5, 1.4, 0.14);
      kick(t); kick(t + 1.5);
      [0.75, 2.25].forEach(dt => Math.random() < 0.7 && note('sine', mtof(SCALE[Math.floor(Math.random() * 5)]), t + dt, 0.9, 0.04));
    };
    bar(); setInterval(bar, 3000);
  } },
};
function setVol(k, v) {
  S.vol[k] = v;
  if (k === 'rain') document.body.style.setProperty('--rain', v ? 0.4 + v * 0.6 : 0);
  if (!AC && !v) return;
  if (v > 0 && !MIX[k]) { const g = ctx().createGain(); g.gain.value = 0; g.connect(AC.destination); SOUNDS[k].build(g); MIX[k] = g; }
  if (MIX[k]) MIX[k].gain.setTargetAtTime(v * SOUNDS[k].gain, ctx().currentTime, 0.3);
}

// ---------- Gains ----------
function credit(sec) {
  S.carry += sec;
  const m = Math.floor(S.carry / 60);
  if (!m) return save();
  S.carry -= m * 60;
  const ev = eventOf(today()), d = dayStats(), sub = S.subjects.find(s => s.id == $('#subjectSelect').value);
  const coins = Math.round(m * (ev.coinMult || 1) * (curMood() >= 80 ? 1.1 : 1));
  addMood(m * 1.5);
  S.coins += coins; S.totalMin += m; d.minutes += m;
  if (sub) { sub.min += m; if (!d.subjects.includes(sub.id)) d.subjects.push(sub.id); }
  S.plots.forEach(p => p && (p.g += m * (ev.growMult || 1)));
  toast(`+${m} min révisées · +${coins} 🪙`);
  save(); renderAll();
}

// ---------- Minuteur ----------
const T = { mode: 'pomodoro', phase: 'work', running: false, started: false, left: 0, total: 0, elapsed: 0, pending: 0, count: 0, last: 0, id: null };
const PHASE_LABEL = { work: 'Concentration', short: 'Petite pause', long: 'Grande pause' };

function setPhase(p) {
  T.phase = p; T.started = false;
  const c = S.cfg;
  T.total = T.mode === 'chrono' ? 0 : 60 * (p === 'work' ? (T.mode === 'libre' ? c.libre : c.work) : p === 'long' ? c.long : c.short);
  T.left = T.total; T.elapsed = 0;
  renderTimer();
}
function start() {
  if (T.running) return pause();
  T.running = T.started = true; T.last = Date.now();
  T.id = setInterval(tick, 250);
  renderTimer();
}
function pause() { T.running = false; clearInterval(T.id); renderTimer(); }
function tick() {
  const now = Date.now(); let dt = (now - T.last) / 1000; T.last = now; // Date.now : reste juste même si l'onglet est en arrière-plan
  if (T.mode !== 'chrono') dt = Math.min(dt, T.left);
  if (T.phase === 'work') T.pending += dt;
  if (T.mode === 'chrono') T.elapsed += dt;
  else { T.left -= dt; if (T.left <= 0) return phaseEnd(); }
  renderTimer();
}
function phaseEnd() {
  pause(); beep();
  if (T.phase === 'work') {
    credit(T.pending); T.pending = 0;
    if (T.mode === 'pomodoro') {
      T.count++; dayStats().pomos++;
      setPhase(T.count % 4 ? 'short' : 'long');
      toast('Pomodoro terminé ! Pause bien méritée 🌼');
    } else { setPhase('work'); toast('Session terminée ! 🌸'); }
  } else { setPhase('work'); toast('Fin de la pause, au travail ! 🍅'); }
  save(); renderAll();
}
function finish() {
  pause();
  if (T.pending > 0) credit(T.pending);
  T.pending = 0;
  setPhase('work');
}
function beep() {
  try {
    const a = ctx();
    [0, 0.25].forEach((dt, i) => {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + dt;
      o.connect(g).connect(a.destination); o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1);
      o.start(t); o.stop(t + 1);
    });
  } catch {}
}

// ---------- Affichage ----------
let selSeed = null;
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function renderTimer() {
  const chrono = T.mode === 'chrono';
  const shown = chrono ? T.elapsed : T.left;
  const ratio = chrono ? (T.elapsed % 3600) / 3600 : 1 - T.left / (T.total || 1);
  $('#time').textContent = fmt(shown);
  $('#phase').textContent = chrono ? 'Chronomètre' : PHASE_LABEL[T.phase];
  $('#tbar').style.width = `${ratio * 100}%`;
  $('#tbar').parentElement.classList.toggle('break', T.phase !== 'work');
  const studying = T.running && T.phase === 'work';
  $('#scene .pet.main')?.classList.toggle('studying', studying);
  $('#moodBadge').textContent = `💗 ${Math.round(curMood())} %`;
  $('#bubble').textContent = studying ? '' : T.running ? 'Pause ! On souffle un peu 🍵' : bubble;
  $('#startBtn').textContent = T.running ? 'Pause' : T.started ? 'Reprendre' : 'Démarrer';
  $('#stopBtn').disabled = !T.started;
  document.title = T.started ? `${fmt(shown)} · Jardin d'Étude` : "Jardin d'Étude";
}

function renderHeader() {
  $('#coins').textContent = S.coins;
  document.body.classList.toggle('night', S.night);
  $('#nightBtn').textContent = S.night ? '☀️' : '🌙';
  $('#nightBtn2').textContent = S.night ? '☀️ Passer en mode jour' : '🌙 Passer en mode nuit';
  const ev = eventOf(today());
  $('#eventBanner').textContent = `${ev.icon} Événement du jour : ${ev.name} — ${ev.desc}`;
}

function renderStudy() {
  const sel = $('#subjectSelect'), cur = sel.value;
  sel.innerHTML = '<option value="">Sans matière</option>' +
    S.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = S.subjects.some(s => s.id == cur) ? cur : (S.subjects[0]?.id ?? '');
  const d = dayStats();
  $('#stats').innerHTML = [[d.minutes, 'min aujourd\'hui'], [d.pomos, 'pomodoros'], [S.totalMin, 'min au total']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('');
  $$('[data-cfg]').forEach(i => i.value = S.cfg[i.dataset.cfg]);
  $$('[data-for]').forEach(el => el.hidden = el.dataset.for !== T.mode);
}

function renderGarden() {
  const ev = eventOf(today());
  if (selSeed && !S.inv[selSeed]) selSeed = null;
  $('#gardenHint').textContent = selSeed
    ? `Clique sur une parcelle vide pour planter : ${PLANTS[selSeed].name}`
    : 'Choisis une graine dans ton sac, puis clique sur une parcelle. Les plantes prêtes ✨ se récoltent d\'un clic.';
  $('#plots').innerHTML = S.plots.map((p, i) => {
    if (!p) return `<button class="plot empty" data-plot="${i}" aria-label="Parcelle vide">${selSeed ? '＋' : ''}</button>`;
    const P = PLANTS[p.type], r = Math.min(1, p.g / P.grow);
    return `<button class="plot ${r >= 1 ? 'ready' : ''}" data-plot="${i}" title="${P.name}" aria-label="${P.name}, ${Math.round(r * 100)} %">
      <span class="plant">${P.stages[r >= 1 ? 2 : r >= 0.4 ? 1 : 0]}</span><span class="bar"><i style="width:${r * 100}%"></i></span></button>`;
  }).join('');
  const inv = Object.entries(S.inv).filter(([, n]) => n > 0);
  $('#inv').innerHTML = inv.length
    ? inv.map(([k, n]) => `<button class="seed ${selSeed === k ? 'selected' : ''}" data-seed="${k}">
        <span class="emoji">${PLANTS[k].stages[2]}</span><b>${PLANTS[k].name}</b><small>× ${n}</small></button>`).join('')
    : '<p class="empty-msg">Ton sac est vide, achète des graines à la boutique !</p>';
  $('#shop').innerHTML = Object.entries(PLANTS).map(([k, P]) => `<div class="seed">
      <span class="emoji">${P.stages[2]}</span><b>${P.name}</b>
      <small>${P.grow} min de révision<br>Récolte : ${Math.round(P.reward * (ev.harvestMult || 1))} 🪙</small>
      <button class="btn primary" data-buy="${k}" ${S.coins < priceOf(P) ? 'disabled' : ''}>${priceOf(P)} 🪙</button></div>`).join('');
}

function renderMissions() {
  const d = dayStats(), ev = eventOf(today()), tomorrow = eventOf(new Date(Date.now() + 864e5).toLocaleDateString('sv'));
  $('#eventCard').innerHTML = `<p class="event-big">${ev.icon} ${ev.name}</p><p>${ev.desc}</p>
    <p class="hint">Demain : ${tomorrow.icon} ${tomorrow.name}</p>`;
  $('#missionList').innerHTML = missionsOf(d.date).map(m => {
    const val = m.key === 'subjects' ? d.subjects.length : d[m.key];
    const done = val >= m.goal, claimed = d.claimed.includes(m.id);
    const reward = m.reward * (ev.missionMult || 1);
    return `<div class="mission"><div class="info"><b>${m.text}</b> · ${reward} 🪙
      <div class="progress"><i style="width:${Math.min(100, val / m.goal * 100)}%"></i></div>
      <small>${Math.min(val, m.goal)} / ${m.goal}</small></div>
      ${claimed ? '<span>✅ Réclamé</span>' : `<button class="btn primary" data-claim="${m.id}" ${done ? '' : 'disabled'}>Réclamer</button>`}</div>`;
  }).join('');
}

function renderSubjects() {
  $('#subjectList').innerHTML = S.subjects.length
    ? S.subjects.map(s => `<div class="subject"><span class="dot" style="background:${esc(s.color)}"></span>
        <span class="name">${esc(s.name)}</span><span>${fmt(s.min * 60)}</span>
        <button class="del" data-del="${s.id}" aria-label="Supprimer ${esc(s.name)}">🗑️</button></div>`).join('')
    : '<p class="empty-msg">Aucune matière pour l\'instant.</p>';
}

let tryDecor = null;    // objet de déco essayé dans l'aperçu de l'onglet Déco
let tryOn = null;       // cosmétique essayé sans l'acheter : { id, who }
let preview = null;     // espèce affichée en aperçu sur la page Compagnons ('pingouine' = Perle)
let dressing = 'main';  // 'main' ou 'partner' : à qui vont les cosmétiques
const previewBtn = (k, svg, label) => `<button class="preview-btn" data-preview="${k}" aria-label="Voir l'aperçu : ${label}">${svg}</button>`;

// carte de boutique : acheter si pas possédé, sinon activer / retirer
const shopItem = (preview, name, attr, owned, active, price, onLabel = 'Retirer', offLabel = 'Utiliser') =>
  `<div class="item ${active ? 'worn' : ''}">${preview}<b>${name}</b>
    <button class="btn ${owned ? '' : 'primary'}" ${attr} ${!owned && S.coins < price ? 'disabled' : ''}>${!owned ? `${price} 🪙` : active ? onLabel : offLabel}</button></div>`;

function renderCompanions() {
  $$('.scene').forEach(s => s.classList.toggle('has-partner', S.partner));
  $('#scene .room').innerHTML = roomHTML();
  $('#decoScene .room').innerHTML = roomHTML(tryDecor);
  const td = tryDecor && DECOR[tryDecor];
  $('#decoNote').innerHTML = td ? `🏠 Essai : ${td.name}${S.decor.owned.includes(tryDecor) ? '' : ` · ${td.price} 🪙`} <button class="link" data-try-decor="${tryDecor}">Retirer l'essai</button>` : '';
  const pvSp = preview && preview !== 'pingouine' ? preview : S.species, pvPartner = S.partner || preview === 'pingouine';
  $('#bigStage').classList.toggle('has-partner', pvPartner);
  const tc = tryOn && COSMETICS[tryOn.id];
  const withTry = (eq, who) => tc && tryOn.who === who ? { ...eq, [tc.slot]: tryOn.id } : eq;
  $('#bigStage').innerHTML = petsHTML(pvSp, pvPartner, withTry(S.equip, 'main'), withTry(S.partnerEquip, 'partner'));
  const pv = preview === 'pingouine' ? (S.partner ? null : `${nameOf('pingouine')} · à débloquer pour ${PARTNER_PRICE} 🪙`)
    : preview && preview !== S.species ? `${SPECIES[preview].name} · ${S.pets.includes(preview) ? "clique sur « Choisir » pour l'emmener" : `à adopter pour ${SPECIES[preview].price} 🪙`}` : null;
  const tryNote = tc ? `👗 Essayage : ${tc.name} sur ${esc(nameOf(tryOn.who === 'partner' ? 'pingouine' : pvSp))}${S.owned.includes(tryOn.id) ? '' : ` · ${tc.price} 🪙`}` : '';
  const note = [pv && `👀 Aperçu : ${pv}`, tryNote].filter(Boolean).join('<br>');
  $('#previewNote').innerHTML = note ? `${note} <button class="link" data-preview="">Revenir</button>` : '';
  if (document.activeElement !== $('#petName')) $('#petName').value = nameOf(S.species);
  const v = curMood();
  $('#moodText').textContent = `${moodLabel(v)} · ${Math.round(v)} %`;
  $('#moodBar').style.width = `${v}%`;
  $('#moodHint').textContent = v >= 80 ? '🎁 Bonus actif : +10 % de pièces quand tu révises !'
    : 'Révise pour remonter son humeur. À 80 % et plus : +10 % de pièces.';

  $('#adopt').innerHTML = Object.entries(SPECIES).filter(([k]) => k !== 'pingouine').map(([k, P]) =>
    shopItem(previewBtn(k, petSVG(k, S.equip), P.name), P.name, `data-adopt="${k}"`, S.pets.includes(k), S.species === k, P.price, '✓ Avec toi', 'Choisir')).join('');

  const pn = nameOf('pingouine');
  $('#partnerCard').innerHTML = `<div class="partner-row"><div class="partner-preview">${previewBtn('pingouine', petSVG('pingouine', S.partnerEquip), pn)}</div><div>
    <p><b>${pn}</b>, la petite amie du pingouin, vient s'installer dans ta pièce et t'encourage pendant tes révisions 💕</p>
    ${S.partner ? `<label class="field left">Son nom <input id="partnerName" maxlength="20" value="${esc(pn)}"></label>`
      : `<button class="btn primary" data-partner ${S.coins < PARTNER_PRICE ? 'disabled' : ''}>Débloquer · ${PARTNER_PRICE} 🪙</button>`}
    </div></div>`;

  if (!S.partner) dressing = 'main';
  const eq = dressing === 'partner' ? S.partnerEquip : S.equip, wearer = dressing === 'partner' ? 'pingouine' : S.species;
  $('#wardrobe').innerHTML = (S.partner ? `<div class="modes who">Habiller :
      <button data-dress="main" class="${dressing === 'main' ? 'active' : ''}">${esc(nameOf(S.species))}</button>
      <button data-dress="partner" class="${dressing === 'partner' ? 'active' : ''}">${esc(nameOf('pingouine'))}</button></div>` : '') +
    Object.entries(SLOTS).map(([slot, title]) => `<h3 class="slot-title">${title}</h3><div class="grid">` +
    Object.entries(COSMETICS).filter(([, c]) => c.slot === slot).map(([id, c]) =>
      shopItem(`<button class="preview-btn ${tryOn?.id === id && tryOn.who === dressing ? 'trying' : ''}" data-try="${id}" aria-label="Essayer : ${c.name}">${petSVG(wearer, { [slot]: id })}</button>`, c.name, `data-cos="${id}"`, S.owned.includes(id), eq[slot] === id, c.price, 'Retirer', 'Porter')).join('') + '</div>').join('');

  $('#decoShop').innerHTML = Object.entries(DECOR).map(([id, d]) =>
    shopItem(`<button class="preview-btn ${tryDecor === id ? 'trying' : ''}" data-try-decor="${id}" aria-label="Essayer : ${d.name}">${d.rug ? `<span class="rug-swatch" style="background:${d.rug}"></span>` : `<span class="emoji">${d.icon}</span>`}</button>`,
      d.name, `data-decor="${id}"`, S.decor.owned.includes(id), S.decor.on.includes(id), d.price, 'Ranger', 'Placer')).join('');
}

function renderAll() { renderHeader(); renderStudy(); renderCompanions(); renderGarden(); renderMissions(); renderSubjects(); renderTimer(); }

// ---------- Actions ----------
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const ds = b.dataset;

  if (ds.tab) {
    $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === ds.tab));
  }
  if (ds.mode && ds.mode !== T.mode) {
    finish(); T.mode = ds.mode; T.count = 0;
    $$('.modes button').forEach(x => x.classList.toggle('active', x === b));
    setPhase('work'); renderStudy();
  }
  if (b.id === 'startBtn') start();
  if (b.id === 'stopBtn') finish();
  if (b.id.startsWith('nightBtn')) { S.night = !S.night; save(); renderHeader(); }
  if ('talk' in ds) { talk(); renderTimer(); }

  if ('preview' in ds) { preview = ds.preview || null; if (!ds.preview) tryOn = null; renderCompanions(); }
  if (ds.try) { tryOn = tryOn?.id === ds.try && tryOn.who === dressing ? null : { id: ds.try, who: dressing }; renderCompanions(); }
  if (ds.dress) { dressing = ds.dress; preview = null; tryOn = null; renderCompanions(); }
  if (ds.cos) {
    const c = COSMETICS[ds.cos], eq = dressing === 'partner' ? S.partnerEquip : S.equip;
    if (!S.owned.includes(ds.cos)) {
      if (S.coins < c.price) return;
      S.coins -= c.price; S.owned.push(ds.cos); eq[c.slot] = ds.cos; tryOn = null;
      bubble = dressing === 'partner' ? `${nameOf('pingouine')} adore ${c.name.toLowerCase()} 💕` : `Merci pour ${c.name.toLowerCase()} ! 💕`;
      toast(`${c.name} acheté !`);
    } else eq[c.slot] = eq[c.slot] === ds.cos ? null : ds.cos;
    save(); renderAll();
  }
  if (ds.adopt) {
    const k = ds.adopt, P = SPECIES[k];
    if (!S.pets.includes(k)) {
      if (S.coins < P.price) return;
      S.coins -= P.price; S.pets.push(k); toast(`Bienvenue à ${nameOf(k)} ! 🎉`);
    }
    S.species = k; preview = null; talk(); save(); renderAll();
  }
  if ('partner' in ds && !S.partner) {
    if (S.coins < PARTNER_PRICE) return;
    S.coins -= PARTNER_PRICE; S.partner = true; preview = null; addMood(20);
    bubble = `${nameOf('pingouine')} est là ! Je suis trop content 💕`; toast(`${nameOf('pingouine')} a rejoint ta pièce 💕`);
    save(); renderAll();
  }
  if (ds.tryDecor) { tryDecor = tryDecor === ds.tryDecor ? null : ds.tryDecor; renderCompanions(); }
  if (ds.decor) {
    tryDecor = null;
    const id = ds.decor, d = DECOR[id];
    if (!S.decor.owned.includes(id)) {
      if (S.coins < d.price) return;
      S.coins -= d.price; S.decor.owned.push(id); toast(`${d.name} acheté !`);
    } else if (S.decor.on.includes(id)) { S.decor.on = S.decor.on.filter(x => x !== id); save(); return renderAll(); }
    if (d.rug) S.decor.on = S.decor.on.filter(x => !DECOR[x].rug); // un seul tapis à la fois
    S.decor.on.push(id); save(); renderAll();
  }

  if (ds.seed) { selSeed = selSeed === ds.seed ? null : ds.seed; renderGarden(); }
  if (ds.buy) {
    const price = priceOf(PLANTS[ds.buy]);
    if (S.coins < price) return;
    S.coins -= price; S.inv[ds.buy] = (S.inv[ds.buy] || 0) + 1;
    toast(`Graine de ${PLANTS[ds.buy].name} achetée !`); save(); renderAll();
  }
  if (ds.plot) {
    const i = +ds.plot, p = S.plots[i];
    if (!p) {
      if (!selSeed) return toast('Choisis d\'abord une graine dans ton sac 🌱');
      S.plots[i] = { type: selSeed, g: 0 }; S.inv[selSeed]--; dayStats().plants++;
      toast(`${PLANTS[selSeed].name} plantée ! Révise pour la faire pousser.`);
    } else {
      const P = PLANTS[p.type];
      if (p.g < P.grow) return toast(`${P.name} : encore ${Math.ceil((P.grow - p.g) / (eventOf(today()).growMult || 1))} min de révision`);
      const gain = Math.round(P.reward * (eventOf(today()).harvestMult || 1));
      S.coins += gain; S.plots[i] = null; dayStats().harvests++;
      toast(`${P.stages[2]} Récolte : +${gain} 🪙`);
    }
    save(); renderAll();
  }
  if (ds.claim) {
    const d = dayStats(), m = MISSION_POOL.find(x => x.id === ds.claim);
    if (d.claimed.includes(m.id)) return;
    const gain = m.reward * (eventOf(today()).missionMult || 1);
    S.coins += gain; d.claimed.push(m.id);
    toast(`Mission accomplie ! +${gain} 🪙`); save(); renderAll();
  }
  if (ds.del) {
    const s = S.subjects.find(x => x.id == ds.del);
    if (!confirm(`Supprimer « ${s.name} » ?`)) return;
    S.subjects = S.subjects.filter(x => x !== s); save(); renderAll();
  }
});

$('#subjectForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#subjectName').value.trim(); if (!name) return;
  S.subjects.push({ id: Date.now(), name, color: $('#subjectColor').value, min: 0 });
  $('#subjectName').value = ''; save(); renderAll();
});

$$('[data-cfg]').forEach(i => i.addEventListener('change', () => {
  const v = Math.round(+i.value);
  if (!(v >= +i.min && v <= +i.max)) return renderStudy();
  S.cfg[i.dataset.cfg] = v; save();
  if (!T.started) setPhase(T.phase);
}));

document.addEventListener('change', e => {
  const sp = e.target.id === 'petName' ? S.species : e.target.id === 'partnerName' ? 'pingouine' : null;
  if (!sp) return;
  S.names[sp] = e.target.value.trim() || SPECIES[sp].dflt; talk(); save(); renderAll();
});
if (S.pet && !S.names.pingouin) S.names.pingouin = S.pet; // ancien format de sauvegarde
setInterval(renderTimer, 60000); // l'humeur baisse doucement

// ambiance : le navigateur n'autorise le son qu'après un clic, on relance les volumes sauvegardés à ce moment-là
$$('[data-vol]').forEach(r => {
  r.value = S.vol[r.dataset.vol];
  r.addEventListener('input', () => { setVol(r.dataset.vol, +r.value); save(); });
});
document.body.style.setProperty('--rain', S.vol.rain ? 0.4 + S.vol.rain * 0.6 : 0);
addEventListener('pointerdown', () => Object.entries(S.vol).forEach(([k, v]) => setVol(k, v)), { once: true });

// ne pas perdre une session en cours si on ferme l'onglet
addEventListener('beforeunload', e => { if (T.started && T.phase === 'work' && T.pending >= 60) e.preventDefault(); });

// pétales décoratifs
$('.petals').innerHTML = Array.from({ length: 14 }, (_, i) =>
  `<span style="left:${Math.random() * 100}vw;font-size:${14 + Math.random() * 14}px;animation-duration:${12 + Math.random() * 14}s;animation-delay:-${Math.random() * 20}s">${['🌸', '🍃', '🌼', '🍀'][i % 4]}</span>`).join('');

// vérifications rapides
console.assert(new Set(missionsOf('2026-11-23').map(m => m.id)).size === 3, 'missions distinctes');
console.assert(fmt(65) === '01:05' && fmt(3661) === '1:01:01', 'fmt');

setPhase('work');
renderAll();
