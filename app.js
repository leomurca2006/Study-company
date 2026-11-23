const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// ---------- Équilibrage (toutes les valeurs de gains, plafonds et seuils) ----------
const CFG = {
  minSession: 5,        // min : en dessous, une session abandonnée ne compte pas
  chronoFull: 25,       // min : un chrono terminé compte comme session complète à partir de là
  coinsFull: 10,        // pièces bonus par session complète
  coinsPerStreakDay: 5, coinsStreakMax: 50,
  coinsPerDay: 300,     // plafond de pièces gagnées en révisant, par jour
  paFull: 10, paFirst: 5, paPerStreakDay: 3, paStreakMax: 30,
  paPerDay: 100,        // plafond de points d'amitié par jour
  graceDays: 2, decayPerDay: 5, // absence : -5 PA par jour après 2 jours de grâce
  streakMin: 15,        // min de révision pour valider un jour de série
  freezeMax: 2, freezePrice: 150, // gels de série
  txMax: 200,           // lignes gardées dans l'historique des pièces
  examSoon: 14,         // jours : le compagnon parle de l'examen à partir de là
};
const LEVELS = [0, 50, 120, 220, 350, 520, 720, 950, 1200, 1500]; // PA cumulés pour atteindre les niveaux 1 à 10
const levelOf = pa => LEVELS.filter(x => pa >= x).length;
const PRESETS = { classique: [25, 5, 15], long: [50, 10, 20], intense: [90, 20, 30] }; // travail, pause, grande pause

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
const dayOffset = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv'); }; // setDate : juste même aux changements d'heure
const priceOf = P => Math.ceil(P.price * (eventOf(today()).priceMult || 1));
const fmt = s => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60, p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};
const fmtMin = m => (m = Math.round(m)) >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;

// ---------- Stockage ----------
// Seul endroit qui touche localStorage : pour un backend (Supabase, Firebase…), remplacer ces deux fonctions.
const store = {
  raw: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

// ---------- Sauvegarde ----------
const DEFAULT = {
  version: 1, // à incrémenter avec une migration quand la forme des données change
  coins: 15, inv: { marguerite: 1 }, plots: Array(9).fill(null),
  subjects: [{ id: 1, name: 'Maths', color: '#FF8FE6', min: 0 }],
  carry: 0, totalMin: 0, cfg: { preset: 'classique', work: 25, short: 5, long: 15, libre: 45 }, day: null,
  friend: {}, lastStudy: today(), decayed: 0, streak: { cur: 0, best: 0, last: null }, sessions: [], alertVol: 0.5,
  owned: [], equip: { tete: null, yeux: null, cou: null }, partnerEquip: { tete: null, yeux: null, cou: null },
  species: 'pingouin', pets: ['pingouin'], names: {}, partner: false,
  decor: { owned: ['etagere', 'plante', 'tapisLav'], on: ['etagere', 'plante', 'tapisLav'] },
  night: matchMedia('(prefers-color-scheme: dark)').matches, vol: { lofi: 0, rain: 0, wind: 0, cars: 0, cafe: 0, foret: 0 },
  eggs: [], hatched: 0, ach: [], freezes: 0, harvested: 0, bought: 0,
  sounds: ['lofi', 'rain', 'wind', 'cars'], theme: 'lavande', themes: ['lavande'],
  room: 'douce', rooms: ['douce'], view: 'ciel', views: ['ciel'],
  tx: [], weekGoal: 5, exams: [], todos: [], cards: [], notes: '', font: 1, reviewSeen: null,
};
let S;
const rawSave = store.raw('jardin'), firstRun = !rawSave;
try { S = { ...structuredClone(DEFAULT), ...JSON.parse(rawSave || '{}') }; }
catch { S = structuredClone(DEFAULT); store.set('jardin_corrompu', rawSave); } // garde une copie avant d'écraser
S.cfg = { ...DEFAULT.cfg, ...S.cfg }; S.vol = { ...DEFAULT.vol, ...S.vol }; delete S.mood; delete S.moodAt; // anciens formats de sauvegarde
let saveWarned = false;
const save = () => { // localStorage peut être plein ou indisponible (navigation privée…) : on prévient une fois
  if (!store.set('jardin', JSON.stringify(S)) && !saveWarned) { saveWarned = true; toast('⚠️ Sauvegarde impossible dans ce navigateur : pense à exporter tes données (Réglages)'); }
};
function dayStats() {
  const d = today();
  if (!S.day || S.day.date !== d) S.day = { date: d, minutes: 0, pomos: 0, subjects: [], harvests: 0, plants: 0, claimed: [] };
  S.day.pa ??= 0; S.day.coins ??= 0; S.day.sessions ??= 0;
  return S.day;
}

// ---------- Pingouin & cosmétiques ----------
const heart = (x, y) => `M${x} ${y + 8}C${x - 14} ${y - 2} ${x - 8} ${y - 14} ${x} ${y - 5}C${x + 8} ${y - 14} ${x + 14} ${y - 2} ${x} ${y + 8}Z`;
const star = (x, y, r) => 'M' + Array.from({ length: 10 }, (_, i) => {
  const a = Math.PI * i / 5 - Math.PI / 2, d = i % 2 ? r / 2.4 : r;
  return `${(x + d * Math.cos(a)).toFixed(1)} ${(y + d * Math.sin(a)).toFixed(1)}`;
}).join('L') + 'Z';
const flowers = pts => pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="7" fill="${['#FF8FE6', '#FFD99A', '#E7CFF5', '#BFF6FF'][i % 4]}"/><circle cx="${x}" cy="${y}" r="2.5" fill="#fff" stroke="none"/>`).join('');
const SLOTS = { tete: '🎩 Chapeaux', yeux: '👓 Lunettes', cou: '🎀 Accessoires' };
const COSMETICS = {
  bonnet: { slot: 'tete', name: 'Bonnet rose', price: 60, svg: `<path d="M56 80Q100 18 144 80Z" fill="#f9cdd9"/><rect x="52" y="72" width="96" height="14" rx="7" fill="#f2a3bb"/><circle cx="100" cy="44" r="10" fill="#fff"/>` },
  noeud: { slot: 'tete', name: 'Gros nœud', price: 50, svg: `<path d="M128 66L108 50L110 80ZM128 66L148 50L146 80Z" fill="#f2a3bb"/><circle cx="128" cy="66" r="6" fill="#f9cdd9"/>` },
  paille: { slot: 'tete', name: 'Chapeau de paille', price: 90, svg: `<ellipse cx="100" cy="72" rx="74" ry="12" fill="#f3d9a0"/><path d="M64 72Q100 10 136 72Z" fill="#f8e4b4"/><rect x="66" y="60" width="68" height="9" fill="#c4ead8"/>` },
  grenouille: { slot: 'tete', name: 'Chapeau grenouille', price: 140, svg: `<path d="M54 82Q100 14 146 82Z" fill="#b5e0a8"/><circle cx="78" cy="46" r="13" fill="#b5e0a8"/><circle cx="122" cy="46" r="13" fill="#b5e0a8"/><circle cx="78" cy="46" r="7" fill="#fff"/><circle cx="122" cy="46" r="7" fill="#fff"/><circle cx="79" cy="47" r="3.5" fill="#3b3550"/><circle cx="123" cy="47" r="3.5" fill="#3b3550"/>` },
  couronne: { slot: 'tete', name: 'Couronne', price: 300, svg: `<path d="M72 76L70 40L86 56L100 34L114 56L130 40L128 76Z" fill="#fde49a" stroke="#f3c95e" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="64" r="5" fill="#f2a3bb"/><circle cx="84" cy="66" r="4" fill="#93d0b4"/><circle cx="116" cy="66" r="4" fill="#bba9ea"/>` },
  rondes: { slot: 'yeux', name: 'Lunettes rondes', price: 60, svg: `<g fill="#ffffff44" stroke="#5b5372" stroke-width="3"><circle cx="84" cy="104" r="12"/><circle cx="116" cy="104" r="12"/><path d="M96 104Q100 100 104 104" fill="none"/></g>` },
  soleil: { slot: 'yeux', name: 'Lunettes de soleil', price: 90, svg: `<g fill="#3b3550"><rect x="70" y="96" width="27" height="16" rx="7"/><rect x="103" y="96" width="27" height="16" rx="7"/><rect x="96" y="100" width="8" height="3"/></g><rect x="74" y="99" width="8" height="3" rx="1.5" fill="#fff8"/>` },
  coeurs: { slot: 'yeux', name: 'Lunettes cœur', price: 120, svg: `<g fill="#f2a3bbdd" stroke="#e57f9f" stroke-width="2"><path d="${heart(84, 104)}"/><path d="${heart(116, 104)}"/></g><path d="M96 102L104 102" stroke="#e57f9f" stroke-width="2"/>` },
  echarpe: { slot: 'cou', name: 'Écharpe menthe', price: 70, svg: `<path d="M46 126Q100 146 154 126L152 144Q100 164 48 144Z" fill="#c4ead8"/><rect x="116" y="140" width="17" height="42" rx="7" fill="#93d0b4"/>` },
  papillon: { slot: 'cou', name: 'Nœud papillon', price: 50, svg: `<path d="M100 138L80 127L80 149ZM100 138L120 127L120 149Z" fill="#bba9ea"/><circle cx="100" cy="138" r="5" fill="#e0d6f7"/>` },
  fleurs: { slot: 'cou', name: 'Collier de fleurs', price: 110, svg: flowers([[56, 124], [68, 132], [83, 137], [100, 139], [117, 137], [132, 132], [144, 124]]) },
  // exclusifs : pas en vente, débloqués par l'amitié ou les succès (lock = comment les obtenir)
  fleursTete: { slot: 'tete', name: 'Couronne de fleurs', lock: 'Amitié niveau 6', svg: flowers([[64, 80], [72, 67], [85, 59], [100, 56], [115, 59], [128, 67], [136, 80]]) },
  aureole: { slot: 'tete', name: 'Auréole étoilée', lock: 'Amitié niveau 9', svg: `<ellipse cx="100" cy="36" rx="34" ry="9" fill="none" stroke="#f3c95e" stroke-width="6"/><path d="${star(60, 48, 9)}" fill="#fde49a"/><path d="${star(142, 44, 7)}" fill="#fde49a"/>` },
  amitie: { slot: 'cou', name: "Écharpe de l'amitié", lock: 'Amitié niveau 3', svg: `<path d="M46 126Q100 146 154 126L152 144Q100 164 48 144Z" fill="#f9cdd9"/><path d="M100 152V160" stroke-width="2"/><path d="${heart(100, 168)}" fill="#f2a3bb"/>` },
  colEtoile: { slot: 'cou', name: 'Col étoilé', lock: 'Succès « Un mois de constance »', svg: `<path d="M50 124Q100 150 150 124L146 140Q100 166 54 140Z" fill="#7d89c9"/><path d="${star(76, 141, 6)}" fill="#fde49a"/><path d="${star(100, 148, 7)}" fill="#fde49a"/><path d="${star(124, 141, 6)}" fill="#fde49a"/>` },
  arcEnCiel: { slot: 'yeux', name: 'Lunettes arc-en-ciel', lock: 'Succès « Collection complète »', svg: `<g fill="#ffffff33" stroke-width="4"><circle cx="84" cy="104" r="12" stroke="#f2a3bb"/><circle cx="116" cy="104" r="12" stroke="#93d0b4"/></g><path d="M96 104Q100 99 104 104" stroke="#bba9ea" stroke-width="3" fill="none"/>` },
};

// ---------- Animaux (style doodle : contour dessiné) ----------
// Tous partagent la même silhouette, donc les cosmétiques vont à tout le monde.
const LINE = '#2D1A62';
const beak = '<path d="M93 114Q100 109 107 114Q100 124 93 114Z" fill="#f9c9a0" stroke="#2D1A62" stroke-width="3" stroke-linejoin="round"/>';
const pengBelly = '<path d="M100 90C126 90 142 118 142 148C142 180 124 198 100 198C76 198 58 180 58 148C58 118 74 90 100 90Z" fill="#fffdf8"/>';
const tummy = fill => `<ellipse cx="100" cy="166" rx="36" ry="36" fill="${fill}"/>`;
const SPECIES = {
  pingouin: { name: 'Pingouin', dflt: 'Plume', price: 0, rarity: 'commun',
    story: ["Plume vient d'une banquise où il faisait trop froid pour lire dehors.", "Il a traversé l'océan sur un glaçon, un livre de poésie sous l'aile.", 'Depuis, il rêve d\'ouvrir une bibliothèque pour tous les animaux du jardin.'], body: '#a9b4d4', feet: '#f9c9a0', belly: pengBelly, face: beak },
  chat: { name: 'Chat', dflt: 'Mochi', price: 120, rarity: 'commun',
    story: ["Mochi dormait sur les piles de copies d'une vieille prof de maths.", 'À force de siestes sur les cahiers, il a appris les tables de multiplication par cœur.', "Il ne l'avouera jamais, mais il adore quand tu réussis un exercice difficile."], body: '#f8d6ad', feet: '#f8d6ad',
    back: '<path d="M140 190Q190 194 184 146Q182 130 170 134Q174 172 138 176Z" fill="#f8d6ad"/>',
    ears: '<path d="M52 96L56 40L96 64ZM148 96L144 40L104 64Z" fill="#f8d6ad"/><path d="M62 84L63 56L84 68ZM138 84L137 56L116 68Z" fill="#f9cdd9"/>',
    belly: tummy('#fff6ea'),
    face: '<path d="M88 64Q100 70 112 64M91 74Q100 78 109 74" stroke="#e2a874" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="118" rx="16" ry="10" fill="#fff6ea"/><path d="M96 112H104L100 117Z" fill="#f2a3bb" stroke="#2D1A62" stroke-width="2" stroke-linejoin="round"/><path d="M100 117Q96 123 91 120M100 117Q104 123 109 120M56 110L74 113M56 120L74 117M144 110L126 113M144 120L126 117" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  lapin: { name: 'Lapin', dflt: 'Praline', price: 150, rarity: 'commun',
    story: ['Praline a grandi dans un potager rempli de carottes et de dictionnaires.', "Elle collectionne les mots compliqués comme d'autres collectionnent les trèfles.", 'Son mot préféré du moment : « persévérance ». Elle trouve qu\'il te va bien.'], body: '#e4d6ee', feet: '#e4d6ee',
    back: '<circle cx="160" cy="186" r="13" fill="#fff"/>',
    ears: '<ellipse cx="78" cy="42" rx="14" ry="38" transform="rotate(-12 78 42)" fill="#e4d6ee"/><ellipse cx="122" cy="42" rx="14" ry="38" transform="rotate(12 122 42)" fill="#e4d6ee"/><ellipse cx="78" cy="44" rx="6" ry="26" transform="rotate(-12 78 44)" fill="#f9cdd9" stroke-width="2"/><ellipse cx="122" cy="44" rx="6" ry="26" transform="rotate(12 122 44)" fill="#f9cdd9" stroke-width="2"/>',
    belly: tummy('#fdf8fc'),
    face: '<ellipse cx="100" cy="114" rx="5" ry="3.5" fill="#f2a3bb" stroke="#2D1A62" stroke-width="2"/><path d="M100 117Q96 123 91 120M100 117Q104 123 109 120" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  renard: { name: 'Renard', dflt: 'Caramel', price: 200, rarity: 'commun',
    story: ['Caramel connaît tous les raccourcis de la forêt, mais aucun pour les devoirs.', 'Petit, il voulait tout réussir sans effort… et ça n\'a jamais marché.', "Aujourd'hui, il préfère réviser avec toi, un petit pas à la fois."], body: '#f7c19c', feet: '#8a6a7e',
    back: '<path d="M140 198Q198 198 188 138Q178 108 160 138Q160 178 140 188Z" fill="#f7c19c"/><path d="M188 138Q178 108 165 128Q174 138 188 138Z" fill="#fff6ec" stroke-width="2.5"/>',
    ears: '<path d="M52 96L52 34L96 64ZM148 96L148 34L104 64Z" fill="#f7c19c"/><path d="M52 54L52 34L69 46ZM148 54L148 34L131 46Z" fill="#8a6a7e" stroke-width="2.5"/>',
    belly: tummy('#fff6ec'),
    face: '<path d="M62 110Q100 152 138 110Q100 128 62 110Z" fill="#fff6ec" stroke="#2D1A62" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="100" cy="115" rx="5" ry="3.5" fill="#2D1A62"/>' },
  hamster: { name: 'Hamster', dflt: 'Noisette', rarity: 'rare', body: '#f3c58f', feet: '#f9c9a0',
    story: ['Noisette range ses graines par ordre alphabétique dans ses joues.', "Elle a déjà couru l'équivalent de trois tours du monde dans sa roue.", 'Son secret, dit-elle : un petit tour de roue chaque jour.'],
    ears: '<circle cx="62" cy="70" r="16" fill="#f3c58f"/><circle cx="138" cy="70" r="16" fill="#f3c58f"/><circle cx="62" cy="70" r="8" fill="#f9cdd9" stroke-width="2"/><circle cx="138" cy="70" r="8" fill="#f9cdd9" stroke-width="2"/>',
    belly: tummy('#fff4e4'),
    face: '<ellipse cx="68" cy="124" rx="13" ry="10" fill="#fff4e4"/><ellipse cx="132" cy="124" rx="13" ry="10" fill="#fff4e4"/><ellipse cx="100" cy="114" rx="5" ry="3.5" fill="#f2a3bb" stroke="#2D1A62" stroke-width="2"/><path d="M100 117Q96 123 91 120M100 117Q104 123 109 120" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  ours: { name: 'Ourson', dflt: 'Cannelle', rarity: 'rare', body: '#c9a07a', feet: '#b88a64',
    story: ['Cannelle hiberne tout l\'hiver, mais garde toujours un livre près de son oreiller.', 'Il prépare le meilleur chocolat chaud de la forêt, idéal pour les soirs de révision.', "Pour lui, une bonne pause vaut autant qu'une heure de travail."],
    ears: '<circle cx="64" cy="66" r="17" fill="#c9a07a"/><circle cx="136" cy="66" r="17" fill="#c9a07a"/><circle cx="64" cy="66" r="8" fill="#ecd3b8" stroke-width="2"/><circle cx="136" cy="66" r="8" fill="#ecd3b8" stroke-width="2"/>',
    belly: tummy('#ecd3b8'),
    face: '<ellipse cx="100" cy="121" rx="17" ry="12" fill="#ecd3b8" stroke="#2D1A62" stroke-width="2.5"/><ellipse cx="100" cy="115" rx="6" ry="4" fill="#2D1A62"/><path d="M100 119V124M94 126Q100 130 106 126" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  rainette: { name: 'Rainette', dflt: 'Pistache', rarity: 'rare', body: '#a8d89a', feet: '#a8d89a',
    story: ['Pistache vit sur un nénuphar et compte les gouttes de pluie pour s\'entraîner au calcul.', 'Elle chante une petite chanson chaque fois qu\'elle apprend quelque chose.', "Son rêve : sauter d'un nénuphar à l'autre jusqu'à la lune."],
    ears: '<circle cx="72" cy="64" r="18" fill="#a8d89a"/><circle cx="128" cy="64" r="18" fill="#a8d89a"/>',
    belly: tummy('#eaf6d8') + '<circle cx="62" cy="88" r="4" fill="#8cc27c" stroke="none"/><circle cx="140" cy="94" r="5" fill="#8cc27c" stroke="none"/>',
    face: '<path d="M80 118Q100 134 120 118" stroke="#2D1A62" stroke-width="3" fill="none" stroke-linecap="round"/>' },
  panda: { name: 'Panda', dflt: 'Bambou', rarity: 'rare', body: '#fbfaf7', feet: '#2D1A62',
    story: ['Bambou mâche lentement : il dit que ça l\'aide à réfléchir.', "Il a appris la calligraphie avec une tige de bambou trempée dans l'encre.", 'Il trouve que tu avances à ton rythme, et que c\'est le meilleur.'],
    ears: '<circle cx="62" cy="68" r="16" fill="#2D1A62"/><circle cx="138" cy="68" r="16" fill="#2D1A62"/>',
    belly: '<ellipse cx="84" cy="105" rx="11" ry="13" transform="rotate(20 84 105)" fill="#2D1A62" stroke="none"/><ellipse cx="116" cy="105" rx="11" ry="13" transform="rotate(-20 116 105)" fill="#2D1A62" stroke="none"/>',
    face: '<circle cx="85.5" cy="102.5" r="1.8" fill="#fff"/><circle cx="117.5" cy="102.5" r="1.8" fill="#fff"/><ellipse cx="100" cy="117" rx="5" ry="3.5" fill="#2D1A62"/><path d="M100 120Q96 126 91 123M100 120Q104 126 109 123" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  axolotl: { name: 'Axolotl', dflt: 'Corail', rarity: 'epique', body: '#f7bfd6', feet: '#f7bfd6',
    story: ["Corail vient d'un lac caché où l'eau brille comme du verre.", 'Elle peut faire repousser ses nageoires, mais elle préfère faire pousser des idées.', 'Elle sourit tout le temps, même quand les exercices sont difficiles.'],
    back: '<path d="M140 192Q186 202 192 168Q172 178 150 174Z" fill="#f7bfd6"/>',
    ears: '<g fill="#f08fb4"><ellipse cx="44" cy="84" rx="16" ry="6" transform="rotate(-30 44 84)"/><ellipse cx="40" cy="102" rx="16" ry="6"/><ellipse cx="44" cy="120" rx="16" ry="6" transform="rotate(30 44 120)"/><ellipse cx="156" cy="84" rx="16" ry="6" transform="rotate(30 156 84)"/><ellipse cx="160" cy="102" rx="16" ry="6"/><ellipse cx="156" cy="120" rx="16" ry="6" transform="rotate(-30 156 120)"/></g>',
    belly: tummy('#fde3ee'),
    face: '<path d="M88 118Q100 127 112 118" stroke="#2D1A62" stroke-width="3" fill="none" stroke-linecap="round"/>' },
  koala: { name: 'Koala', dflt: 'Eucalyptus', rarity: 'epique', body: '#b9bfcc', feet: '#a3a9b8',
    story: ['Eucalyptus dort vingt heures par jour, mais les quatre autres sont très productives.', "Il a lu tous les livres de la bibliothèque de son arbre, deux fois.", 'Il dit que se reposer fait partie du travail, et il a bien raison.'],
    ears: '<circle cx="54" cy="76" r="24" fill="#b9bfcc"/><circle cx="146" cy="76" r="24" fill="#b9bfcc"/><circle cx="54" cy="78" r="13" fill="#f3e6ef" stroke-width="2"/><circle cx="146" cy="78" r="13" fill="#f3e6ef" stroke-width="2"/>',
    belly: tummy('#eceef3'),
    face: '<ellipse cx="100" cy="118" rx="9" ry="12" fill="#5b5372" stroke="#2D1A62" stroke-width="2"/><path d="M92 135Q100 139 108 135" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  hibou: { name: 'Hibou', dflt: 'Sage', rarity: 'epique', egg: false, body: '#b99a7e', feet: '#f3c95e',
    story: ["Sage n'apparaît qu'aux élèves qui reviennent jour après jour.", 'Il a veillé sur des générations d\'élèves pendant leurs soirées de révision.', 'Son conseil le plus précieux : « Dors bien la veille de l\'examen. »'],
    ears: '<path d="M58 90L54 44L86 66ZM142 90L146 44L114 66Z" fill="#b99a7e"/>',
    belly: tummy('#f3e4cf') + '<circle cx="84" cy="104" r="15" fill="#fffaf0" stroke-width="2.5"/><circle cx="116" cy="104" r="15" fill="#fffaf0" stroke-width="2.5"/><path d="M86 158l6 6 6-6M102 158l6 6 6-6M94 174l6 6 6-6" fill="none" stroke="#c9ab8c" stroke-width="2.5"/>',
    face: '<path d="M94 116L106 116L100 128Z" fill="#f3c95e" stroke="#2D1A62" stroke-width="2.5" stroke-linejoin="round"/>' },
  dragonnet: { name: 'Dragonnet', dflt: 'Braise', rarity: 'legendaire', body: '#a8dcc0', feet: '#8cc9a8',
    story: ["Braise est née d'un œuf tombé d'une étoile filante.", 'Ses flammes sont tièdes et sentent la cannelle, parfaites pour réchauffer le thé.', 'On raconte qu\'elle ne choisit que les élèves au cœur patient.'],
    back: '<path d="M52 110Q8 80 14 130Q30 120 44 138Z" fill="#d9ccf5"/><path d="M148 110Q192 80 186 130Q170 120 156 138Z" fill="#d9ccf5"/><path d="M140 196Q192 204 192 168L180 176L176 164L166 178Q160 190 140 186Z" fill="#a8dcc0"/>',
    ears: '<path d="M76 66L70 34L90 60ZM124 66L130 34L110 60Z" fill="#fdeaa9"/>',
    belly: tummy('#fdeaa9') + '<path d="M72 150H128M66 166H134M72 182H128" stroke="#f3d47e" stroke-width="2.5"/>',
    face: '<circle cx="94" cy="116" r="2" fill="#2D1A62"/><circle cx="106" cy="116" r="2" fill="#2D1A62"/><path d="M90 124Q100 132 110 124" stroke="#2D1A62" stroke-width="2.5" fill="none" stroke-linecap="round"/>' },
  // la petite amie du pingouin (pas adoptable, se débloque à part)
  pingouine: { name: 'Pingouine', dflt: 'Perle', body: '#cbbde6', feet: '#f9c9a0', belly: pengBelly,
    face: beak + '<path d="M78 100L74 96M81 98L79 93M122 100L126 96M119 98L121 93" stroke="#3b3550" stroke-width="2.2" stroke-linecap="round"/>',
    hair: '<g transform="translate(128 68)" fill="#f9cdd9" stroke="#2D1A62" stroke-width="2.5"><circle cx="-7" r="7"/><circle cx="7" r="7"/><circle cy="-7" r="7"/><circle cy="7" r="7"/><circle r="5" fill="#fde49a"/></g>' },
};
const PARTNER_PRICE = 250;
const COLL = Object.keys(SPECIES).filter(k => SPECIES[k].rarity); // la collection (sans Perle)
const RARITY = {
  commun: { name: 'Commun', color: '#BFF6FF' }, rare: { name: 'Rare', color: '#4FE3FF' },
  epique: { name: 'Épique', color: '#FF4FD8' }, legendaire: { name: 'Légendaire', color: '#FFC46B' },
};
// Un œuf éclot après min minutes de révision ; odds = probabilité de chaque rareté
const EGGS = {
  commun: { name: 'Œuf commun', price: 150, min: 120, color: '#D9F7FF', odds: { commun: 0.7, rare: 0.25, epique: 0.05 } },
  rare: { name: 'Œuf rare', price: 350, min: 300, color: '#BFF6FF', odds: { rare: 0.7, epique: 0.25, legendaire: 0.05 } },
  epique: { name: 'Œuf épique', price: 600, min: 480, color: '#FFB8EE', odds: { epique: 0.8, legendaire: 0.2 } },
};
// Chaque niveau d'amitié ajoute une réplique, et un souvenir (histoire), un accessoire ou une animation
const LEVEL_UNLOCKS = {
  2: { story: 0, line: 'Tu veux connaître mon histoire ? Regarde ma fiche 📖' },
  3: { cos: 'amitie', line: 'On forme une super équipe, toi et moi 🤝' },
  4: { anim: 'calin', line: "Clique sur moi, j'ai un câlin pour toi 🤗" },
  5: { story: 1, line: 'Je me sens tellement bien ici avec toi 🏡' },
  6: { cos: 'fleursTete', line: "J'ai cueilli des fleurs pour fêter notre amitié 🌸" },
  7: { anim: 'danse', line: "J'ai inventé une danse de la réussite, clique pour voir ! 💃" },
  8: { story: 2, line: "Je ne t'ai jamais raconté la fin de mon histoire… 📖" },
  9: { cos: 'aureole', line: 'Tu brilles plus fort que mon auréole ✨' },
  10: { anim: 'etoiles', line: 'Meilleurs amis pour toujours 💗' },
};
const ANIMS = { calin: 'Câlin', danse: 'Danse', etoiles: "Pluie d'étoiles" };
const unlockText = u => u.story != null ? 'un souvenir dans sa fiche' : u.cos ? COSMETICS[u.cos].name : `l'animation « ${ANIMS[u.anim]} »`;
const animOf = sp => Object.entries(LEVEL_UNLOCKS).filter(([l, u]) => u.anim && levelOf(S.friend[sp] || 0) >= l).map(([, u]) => u.anim).pop();
const storyLevel = i => +Object.keys(LEVEL_UNLOCKS).find(l => LEVEL_UNLOCKS[l].story === i);
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

// ---------- Amitié (points d'amitié = PA, par compagnon) ----------
const absentDays = () => dayNum(today()) - dayNum(S.lastStudy);
function addPA(n) { // respecte le plafond quotidien, annonce les nouveaux niveaux
  const d = dayStats(), sp = S.species, pa = S.friend[sp] || 0;
  n = Math.max(0, Math.min(n, CFG.paPerDay - d.pa));
  d.pa += n; S.friend[sp] = pa + n;
  const lv = levelOf(pa + n);
  if (lv > levelOf(pa)) { say('level'); toast(`💗 Niveau ${lv} d'amitié avec ${nameOf(sp)} ! Débloqué : ${unlockText(LEVEL_UNLOCKS[lv])}`); }
  return n;
}
function applyDecay() { // baisse douce, jamais sous le palier déjà atteint
  const due = Math.max(0, absentDays() - 1 - CFG.graceDays) - S.decayed;
  if (due <= 0) return;
  S.decayed += due;
  const pa = S.friend[S.species] || 0;
  S.friend[S.species] = Math.max(LEVELS[levelOf(pa) - 1], pa - due * CFG.decayPerDay);
  save();
}
const daysTo = d => dayNum(d) - dayNum(today());
const subName = id => S.subjects.find(s => s.id === id)?.name || 'Sans matière';
const nextExam = () => S.exams.filter(x => daysTo(x.date) >= 1).sort((a, b) => a.date.localeCompare(b.date))[0];
const curStreak = () => S.streak.last && dayNum(today()) - dayNum(S.streak.last) <= 1 + S.freezes ? S.streak.cur : 0; // les gels couvrent les jours manqués

// Répliques : au moins 5 par situation, {n} = nom du compagnon, {p} = nom de Perle
const LINES = {
  idle: ['Coucou, c\'est {n} !', 'On révise ensemble ? 📚', 'Tu vas tout déchirer 💪', 'Une petite tisane et on s\'y remet 🍵',
    'N\'oublie pas d\'arroser le jardin 🌷', 'J\'aime bien quand il pleut dehors 🌧️', 'Chaque minute compte ✨'],
  partner: ['{p} est trop fière de toi 💕', '{p} et moi, on t\'encourage !'],
  start: ['C\'est parti ! Je révise avec toi 📚', 'On se concentre ensemble, tu vas gérer ✨', 'Je sors mon livre aussi, allez !',
    'Un pas après l\'autre, on y va 🌱', 'Respire, installe-toi… et c\'est parti 🍵'],
  mid: ['Déjà la moitié ! Continue comme ça 💪', 'Tu avances super bien 🌼', 'La moitié est faite, le plus dur est derrière toi ✨',
    'On garde le cap, encore un peu 🌱', 'Petite gorgée d\'eau et on continue 💧'],
  end: ['Session terminée ! Bravo 🎉', 'Et voilà, du beau travail 🌸', 'Une session de plus dans la poche ✨',
    'Bravo ! Ton cerveau mérite une pause 🧠', 'Super boulot, c\'était chouette de réviser ensemble 💕'],
  pause: ['Pause ! On s\'étire un peu 🙆', 'Un petit goûter ? 🍪', 'Je fais une roulade, et toi ? 🤸',
    'Va boire un verre d\'eau, je t\'attends 💧', 'Regarde au loin, ça repose les yeux 👀'],
  back: ['Te revoilà ! Ça me fait trop plaisir 💕', 'Coucou ! Tu m\'as manqué, on reprend doucement ?',
    'Pas de souci pour ces quelques jours, on recommence tranquille 🌱', 'Je t\'ai gardé ta place 🪑 On s\'y remet ?',
    'Même 5 minutes aujourd\'hui, ce serait super ✨'],
  exam: ["Ton examen de {e} est {quand}, on révise un peu ensemble ? 📅", '{e}, c\'est {quand}. Un petit peu chaque jour, et ça va le faire 💪',
    "L'examen de {e} approche ({quand}) : je crois en toi 🌟", 'Pour {e} ({quand}), on avance pas à pas. Une session ? 🍅',
    "J'ai entouré {e} dans mon calendrier : c'est {quand} ✨"],
  level: ['On devient vraiment proches, toi et moi 💗', 'Nouveau niveau d\'amitié ! Trop d\'émotion 🥹',
    'Merci de réviser avec moi, ça compte beaucoup 💕', 'Notre amitié grandit comme ton jardin 🌷',
    'Je crois que tu es mon meilleur binôme de révision ✨'],
};
let bubble = '', bubbleAt = 0;
function say(kind) { // tirage au hasard, jamais deux fois la même réplique d'affilée
  const lv = levelOf(S.friend[S.species] || 0);
  const ex = nextExam(), j = ex ? daysTo(ex.date) : Infinity;
  const extra = kind !== 'idle' ? [] : [...(S.partner ? LINES.partner : []), ...Object.entries(LEVEL_UNLOCKS).filter(([l]) => lv >= l).map(([, u]) => u.line),
    ...(j <= CFG.examSoon ? LINES.exam : [])];
  const pool = [...LINES[kind], ...extra]
    .map(l => l.replace('{n}', nameOf(S.species)).replace('{p}', nameOf('pingouine'))
      .replace('{e}', ex ? subName(ex.sub) : '').replace('{quand}', j === 1 ? 'demain' : `dans ${j} jours`)).filter(l => l !== bubble);
  bubble = pool[Math.floor(Math.random() * pool.length)]; bubbleAt = Date.now();
}
const talk = () => say('idle');

// ---------- Décoration de la pièce ----------
const DECOR = {
  etagere:     { name: 'Étagère', icon: '📚', price: 0, html: '<div class="d shelf"><span>📚</span><span>🕯️</span><span>🌵</span></div>' },
  plante:      { name: 'Grande plante', icon: '🪴', price: 0, html: '<span class="d" style="right:6%;bottom:40px;font-size:2.8rem">🪴</span>' },
  tapisLav:    { name: 'Tapis lavande', price: 0, rug: '#E7CFF5' },
  tapisRose:   { name: 'Tapis rose', price: 100, rug: '#FFB8EE' },
  tapisMenthe: { name: 'Tapis menthe', price: 100, rug: '#B8F5E0' },
  tapisSoleil: { name: 'Tapis soleil', price: 100, rug: '#FFD99A' },
  suspendue:   { name: 'Plante suspendue', icon: '🌿', price: 120, html: '<span class="d hang">🌿</span>' },
  cadre:       { name: 'Cadre', icon: '🖼️', price: 140, html: '<span class="d" style="right:6%;top:120px;font-size:2.2rem">🖼️</span>' },
  nounours:    { name: 'Nounours', icon: '🧸', price: 150, html: '<span class="d" style="left:7%;bottom:22px;font-size:2.4rem">🧸</span>' },
  horloge:     { name: 'Horloge', icon: '🕰️', price: 180, html: '<span class="d" style="left:8%;top:118px;font-size:2rem">🕰️</span>' },
  guirlande:   { name: 'Guirlande lumineuse', icon: '✨', price: 220, html: '<div class="d garland"></div>' },
  aquarium:    { name: 'Bocal à poisson', icon: '🐠', price: 260, html: '<span class="d bowl">🐠</span>' },
  rideaux:     { name: 'Rideaux roses', icon: '🎀', price: 300, html: '<div class="d curtain l"></div><div class="d curtain r"></div>' },
  poster:      { name: 'Poster lune', icon: '🌙', price: 130, html: '<span class="d poster">🌙</span>' },
  lampe:       { name: 'Lanterne', icon: '🏮', price: 160, html: '<span class="d hang" style="right:auto;left:16%">🏮</span>' },
};

// ---------- Boutique : ambiances et thèmes ----------
const AMBIANCES = {
  lofi: { name: 'Musique lofi', icon: '🎵', price: 0, desc: 'Accords doux et petit rythme' },
  rain: { name: 'Pluie', icon: '🌧️', price: 0, desc: 'Pluie fine sur la fenêtre' },
  wind: { name: 'Vent', icon: '🍃', price: 0, desc: 'Un souffle léger' },
  cars: { name: 'Voitures', icon: '🚗', price: 0, desc: 'La ville au loin' },
  cafe: { name: 'Café animé', icon: '☕', price: 150, desc: 'Brouhaha et tasses qui tintent' },
  foret: { name: 'Forêt', icon: '🌲', price: 200, desc: "Feuillage et chants d'oiseaux" },
};
const THEMES = {
  lavande: { name: 'Lavande', price: 0, color: '#C9A6E4' }, peche: { name: 'Pêche', price: 200, color: '#FFC46B' },
  menthe: { name: 'Menthe', price: 250, color: '#4FE3B0' }, ciel: { name: 'Ciel', price: 300, color: '#4FE3FF' },
};

// ---------- Succès (val = progression actuelle, goal = objectif) ----------
const fullCount = () => S.sessions.filter(s => s.full).length;
const goalRun = () => { // objectifs atteints d'affilée (sessions avec objectif et bilan)
  let n = 0;
  for (const s of [...S.sessions].reverse()) if (s.goal && s.result) { if (s.result !== 'oui') break; n++; }
  return n;
};
const weekMin = () => {
  const monday = dayNum(today()) - (new Date().getDay() + 6) % 7;
  return S.sessions.filter(s => dayNum(s.date) >= monday).reduce((a, s) => a + s.sec, 0) / 60;
};
const maxLevel = () => Math.max(1, ...S.pets.map(k => levelOf(S.friend[k] || 0)));
const ACH = [
  { id: 'first', icon: '🌱', name: 'Premier pas', desc: 'Terminer ta première session', val: () => S.sessions.length, goal: 1, reward: { coins: 20 } },
  { id: 'goal1', icon: '🎯', name: 'Dans le mille', desc: 'Atteindre un objectif de session', val: () => S.sessions.filter(s => s.result === 'oui').length, goal: 1, reward: { coins: 20 } },
  { id: 'goal5', icon: '🏹', name: 'Sans fausse note', desc: "Atteindre 5 objectifs d'affilée", val: goalRun, goal: 5, reward: { coins: 60 } },
  { id: 'full10', icon: '🍅', name: 'Rythme trouvé', desc: 'Terminer 10 sessions complètes', val: fullCount, goal: 10, reward: { coins: 50 } },
  { id: 'full50', icon: '🧺', name: 'Panier bien rempli', desc: 'Terminer 50 sessions complètes', val: fullCount, goal: 50, reward: { egg: 'rare' } },
  { id: 'h10', icon: '⏳', name: '10 heures', desc: 'Réviser 10 h au total', val: () => S.totalMin / 60, goal: 10, reward: { egg: 'commun' } },
  { id: 'h50', icon: '📚', name: '50 heures', desc: 'Réviser 50 h au total', val: () => S.totalMin / 60, goal: 50, reward: { egg: 'rare' } },
  { id: 'h100', icon: '🏆', name: '100 heures', desc: 'Réviser 100 h au total', val: () => S.totalMin / 60, goal: 100, reward: { egg: 'epique' } },
  { id: 'week5', icon: '📅', name: 'Belle semaine', desc: 'Réviser 5 h dans la même semaine', val: () => weekMin() / 60, goal: 5, reward: { coins: 80 } },
  { id: 'long90', icon: '🧘', name: 'Marathon zen', desc: 'Faire une session de 90 min', val: () => Math.max(0, ...S.sessions.map(s => s.sec)) / 60, goal: 90, reward: { coins: 60 } },
  { id: 'early', icon: '🌅', name: 'Lève-tôt', desc: 'Commencer une session avant 8 h', val: () => +S.sessions.some(s => new Date(s.at - s.sec * 1000).getHours() < 8), goal: 1, reward: { coins: 40 } },
  { id: 'night', icon: '🌙', name: 'Oiseau de nuit', desc: 'Finir une session après 22 h', val: () => +S.sessions.some(s => new Date(s.at).getHours() >= 22), goal: 1, reward: { coins: 40 } },
  { id: 'subj5', icon: '🎨', name: 'Curiosité', desc: 'Réviser 5 matières différentes', val: () => S.subjects.filter(s => s.min > 0).length, goal: 5, reward: { coins: 50 } },
  { id: 'streak3', icon: '🔥', name: 'Ça chauffe', desc: 'Série de 3 jours', val: () => S.streak.best, goal: 3, reward: { coins: 30 } },
  { id: 'streak7', icon: '🦉', name: 'Une semaine entière', desc: 'Série de 7 jours', val: () => S.streak.best, goal: 7, reward: { pet: 'hibou' } },
  { id: 'streak30', icon: '🌟', name: 'Un mois de constance', desc: 'Série de 30 jours', val: () => S.streak.best, goal: 30, reward: { cos: 'colEtoile' } },
  { id: 'hatch1', icon: '🐣', name: 'Première éclosion', desc: 'Faire éclore un œuf', val: () => S.hatched, goal: 1, reward: { coins: 30 } },
  { id: 'coll6', icon: '🗂️', name: 'Mi-collection', desc: 'Réunir 6 compagnons', val: () => S.pets.length, goal: 6, reward: { egg: 'rare' } },
  { id: 'coll12', icon: '💯', name: 'Collection complète', desc: 'Réunir les 12 compagnons', val: () => S.pets.length, goal: 12, reward: { cos: 'arcEnCiel' } },
  { id: 'friend5', icon: '💗', name: 'Grands amis', desc: "Atteindre le niveau 5 d'amitié", val: maxLevel, goal: 5, reward: { coins: 80 } },
  { id: 'friend10', icon: '💞', name: 'Amis pour la vie', desc: "Atteindre le niveau 10 d'amitié", val: maxLevel, goal: 10, reward: { egg: 'epique' } },
  { id: 'harvest', icon: '🌷', name: 'Main verte', desc: 'Récolter 10 plantes', val: () => S.harvested, goal: 10, reward: { coins: 40 } },
  { id: 'shop', icon: '🛍️', name: 'Première emplette', desc: 'Acheter un objet en boutique', val: () => S.bought, goal: 1, reward: { coins: 20 } },
];
const rewardText = r => r.coins ? `${r.coins} 🪙` : r.egg ? EGGS[r.egg].name : r.pet ? `Compagnon : ${SPECIES[r.pet].name}` : `Accessoire : ${COSMETICS[r.cos].name}`;
function grant(r, why) {
  if (r.coins) addCoins(r.coins, why);
  if (r.egg) S.eggs.push({ type: r.egg, min: 0 });
  if (r.pet && !S.pets.includes(r.pet)) S.pets.push(r.pet);
  if (r.cos && !S.owned.includes(r.cos)) S.owned.push(r.cos);
}
function checkAch() { // appelé à chaque rendu : débloque succès et accessoires d'amitié
  const lv = maxLevel(), before = S.ach.length + S.owned.length;
  Object.entries(LEVEL_UNLOCKS).forEach(([l, u]) => u.cos && lv >= l && !S.owned.includes(u.cos) && S.owned.push(u.cos));
  ACH.forEach(a => {
    if (S.ach.includes(a.id) || a.val() < a.goal) return;
    S.ach.push(a.id); grant(a.reward, `Succès « ${a.name} »`); toast(`🏆 Succès : ${a.name} ! 🎁 ${rewardText(a.reward)}`);
  });
  if (S.ach.length + S.owned.length !== before) save();
}
// Chambres : le motif des murs et du sol est en CSS ([data-chambre=…] .wall / .floor)
const ROOMS = {
  douce: { name: 'Chambre douce', price: 0, desc: 'Murs pastel, tout simplement' },
  fleurie: { name: 'Papier peint fleuri', price: 200, desc: 'Petits pois roses et menthe' },
  bois: { name: 'Cabane en bois', price: 250, desc: 'Des planches chaleureuses' },
  serre: { name: 'Véranda', price: 300, desc: 'Lattes vertes et carrelage' },
  zen: { name: 'Chambre zen', price: 350, desc: 'Cloisons de papier et nattes' },
  grenier: { name: 'Grenier étoilé', price: 450, desc: 'Un ciel peint au mur' },
};
// Vues de la fenêtre
const VIEWS = {
  ciel: { name: 'Ciel changeant', icon: '⛅', price: 0, desc: 'Soleil le jour, lune la nuit',
    html: () => '<div class="sky"><span class="stars"></span><span class="sun"></span><span class="moon"></span><span class="cloud c1"></span><span class="cloud c2"></span></div>' },
  neige: { name: 'Neige', icon: '❄️', price: 200, desc: 'Des flocons qui tombent doucement',
    html: () => `<div class="sky v-neige">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-duration:${4 + (i % 4)}s;animation-delay:-${(i * 0.7).toFixed(1)}s"></i>`).join('')}</div>` },
  etoiles: { name: 'Nuit étoilée', icon: '🌌', price: 250, desc: 'Étoiles qui scintillent et étoiles filantes',
    html: () => '<div class="sky v-etoiles"><span class="stars"></span><span class="stars s2"></span><span class="moon"></span><i class="shoot"></i><i class="shoot s2"></i></div>' },
  orage: { name: 'Orage', icon: '⛈️', price: 300, desc: 'Pluie battante et éclairs',
    html: () => '<div class="sky v-orage"><span class="cloud c1"></span><span class="cloud c2"></span><span class="cloud c3"></span><svg class="bolt" viewBox="0 0 20 40" aria-hidden="true"><path d="M12 0L2 22h7L5 40l13-25h-7z" fill="#FFD99A"/></svg><span class="flash"></span></div>' },
  ville: { name: 'Mini ville', icon: '🌃', price: 450, desc: 'Une ville en pixels qui vit la nuit. Clique sur un immeuble !',
    html: () => `<canvas class="ville" width="${VILLE.W}" height="${VILLE.H}" aria-hidden="true"></canvas>` },
};
function roomHTML(trying, eqMain = S.equip, eqPartner = S.partnerEquip, view = S.view) { // trying : objet affiché à l'essai, sans l'acheter
  let on = Object.keys(DECOR).filter(id => S.decor.on.includes(id));
  if (trying && !on.includes(trying)) on = [...on.filter(id => !(DECOR[trying].rug && DECOR[id].rug)), trying];
  const rug = on.map(id => DECOR[id].rug).find(Boolean);
  return `<div class="wall"></div><div class="floor"></div>
    <div class="window">${VIEWS[view].html()}<div class="rain"${view === 'orage' ? ' style="--rain:.9"' : ''}></div><div class="frame"></div></div>
    ${on.map(id => DECOR[id].html || '').join('')}
    ${rug ? `<div class="rug" style="background:${rug}"></div>` : ''}${petsHTML(S.species, S.partner, eqMain, eqPartner)}`;
}

// ---------- Vue « Mini ville » : la ville en pixel-art du portfolio, en petit ----------
// Dessinée dans un canvas hors écran de W×H pixels, puis copiée dans chaque fenêtre qui affiche cette vue.
const VILLE = (() => {
  const W = 160, H = 66;
  const FEN = ['#FFC46B', '#FFC46B', '#FFC46B', '#FFD99A', '#FF8FE6', '#8FF0FF'], NEONS = ['#FF4FD8', '#4FE3FF'];
  const COUCHES = [ // du fond vers le premier plan
    { corps: '#2D1A62', eteinte: '#35206F', hMin: 0.3, hMax: 0.62, lMin: 9, lMax: 20, fw: 1, fh: 1, px: 3, py: 3, densite: 0.16, brume: [120, 40, 150, 0.32] },
    { corps: '#201246', eteinte: '#2A1957', hMin: 0.24, hMax: 0.5, lMin: 13, lMax: 26, fw: 2, fh: 2, px: 4, py: 4, densite: 0.28, brume: [60, 18, 96, 0.38] },
    { corps: '#150B31', eteinte: '#1F1243', hMin: 0.16, hMax: 0.38, lMin: 18, lMax: 34, fw: 2, fh: 3, px: 5, py: 5, densite: 0.36, neon: true },
  ];
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const c = off.getContext('2d', { alpha: false });
  const reduit = matchMedia('(prefers-reduced-motion: reduce)');
  const entre = (a, b) => a + Math.random() * (b - a);
  let couches, fenetres, etoiles, gouttes, filantes = [], t = 0, dernier = 0, raf = 0, prochaine = 200;

  function generer() { // toujours la même ville (graine fixe)
    let g = 2026;
    const al = () => (g = (Math.imul(g, 1664525) + 1013904223) >>> 0) / 4294967296, en = (a, b) => a + al() * (b - a);
    fenetres = [];
    couches = COUCHES.map((d, idx) => {
      const bats = [];
      for (let x = Math.floor(al() * 6) - 4; x < W + 4;) {
        const w = Math.round(en(d.lMin, d.lMax)), h = Math.round(H * en(d.hMin, d.hMax));
        const b = { x, w, h, fen: [], etages: 0, cascade: null, toit: null, enseigne: null }, r = al();
        if (r < 0.28 && idx > 0) b.toit = { type: 'antenne', h: Math.round(en(3, 7)), dx: Math.floor(en(2, w - 2)), phase: Math.floor(al() * 90) };
        else if (r < 0.55) { const lw = Math.max(4, Math.round(w * en(0.35, 0.6))); b.toit = { type: 'marche', w: lw, h: Math.round(en(2, 4)), dx: Math.floor(en(1, w - lw)) }; }
        const mx = idx ? 2 : 1, dy = idx ? 4 : 3;
        const cols = Math.max(1, Math.floor((w - mx * 2 + (d.px - d.fw)) / d.px)), decal = Math.floor((w - (cols * d.px - (d.px - d.fw))) / 2);
        b.etages = Math.max(0, Math.floor((h - dy - 3) / d.py));
        for (let ly = 0; ly < b.etages; ly++) for (let cx = 0; cx < cols; cx++) {
          const f = { b, x: decal + cx * d.px, y: dy + ly * d.py, etage: b.etages - 1 - ly, on: al() < d.densite, coul: FEN[Math.floor(al() * FEN.length)] };
          b.fen.push(f); fenetres.push(f);
        }
        if (d.neon && w >= 22 && al() < 0.38) b.enseigne = { x: al() < 0.5 ? 1 : w - 4, y: Math.round(en(4, Math.max(5, h * 0.3))), w: 3, h: Math.round(en(6, 10)), coul: NEONS[Math.floor(al() * 2)], panne: 0 };
        bats.push(b); x += w + Math.round(en(idx ? 1 : 0, idx ? 5 : 3));
      }
      return { d, bats };
    });
    etoiles = Array.from({ length: 40 }, () => ({ x: Math.floor(al() * W), y: Math.floor(al() * H * 0.62), v: en(0.01, 0.05), p: al() * 6.28, b: al() < 0.12 }));
    gouttes = Array.from({ length: 50 }, () => goutte(true));
  }
  const goutte = partout => ({ x: entre(-20, W + 40), y: partout ? entre(-H, H) : entre(-30, -4), l: Math.round(entre(3, 6)), v: entre(1.6, 2.8), a: entre(0.12, 0.3) });
  const filante = (x = entre(W * 0.2, W * 0.9), y = entre(3, H * 0.3)) => filantes.push({ x, y, vx: -entre(1.4, 2.1), vy: entre(0.45, 0.75), vie: 1 });

  function mettreAJour(dt) {
    if (Math.random() < dt * 0.06) { // une fenêtre s'allume ou s'éteint
      const f = fenetres[Math.floor(Math.random() * fenetres.length)];
      if (f && !f.b.cascade) { f.on = !f.on; if (f.on) f.coul = FEN[Math.floor(Math.random() * FEN.length)]; }
    }
    for (const { bats } of couches) for (const b of bats) {
      const e = b.enseigne;
      if (e) { if (e.panne > 0) e.panne -= dt; else if (Math.random() < 0.0025 * dt) e.panne = entre(6, 26); } // néon en panne
      if (b.cascade) cascade(b, Math.floor((t - b.cascade.debut) / 2.5));
    }
    if ((prochaine -= dt) <= 0) { filante(); prochaine = entre(360, 820); }
  }
  function cascade(b, n) { // les étages s'allument (ou s'éteignent) un par un
    for (const f of b.fen) {
      if (b.cascade.mode === 'on' && f.etage <= n && !f.on) { f.on = true; f.coul = b.cascade.coul; }
      else if (b.cascade.mode === 'off' && b.etages - 1 - f.etage <= n) f.on = false;
    }
    if (n >= b.etages) b.cascade = null;
  }

  function dessiner(dt, anime) {
    const g = c.createLinearGradient(0, 0, 0, H);
    [[0, '#110927'], [0.45, '#241050'], [0.75, '#4B1A72'], [1, '#7A2380']].forEach(([o, k]) => g.addColorStop(o, k));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const lueur = c.createRadialGradient(W * 0.35, H * 1.05, 0, W * 0.35, H * 1.05, W * 0.7);
    lueur.addColorStop(0, 'rgba(255, 79, 216, 0.35)'); lueur.addColorStop(1, 'rgba(255, 79, 216, 0)');
    c.fillStyle = lueur; c.fillRect(0, 0, W, H);
    for (const e of etoiles) {
      c.globalAlpha = anime ? 0.35 + 0.65 * Math.abs(Math.sin(t * e.v + e.p)) : 0.7;
      c.fillStyle = e.b ? '#BFF6FF' : '#FFFFFF'; c.fillRect(e.x, e.y, 1, 1);
    }
    c.globalAlpha = 1;
    const lx = Math.round(W * 0.82), ly = Math.round(H * 0.2), r = 5; // lune
    const halo = c.createRadialGradient(lx, ly, r * 0.5, lx, ly, r * 5);
    halo.addColorStop(0, 'rgba(255, 220, 255, 0.28)'); halo.addColorStop(1, 'rgba(255, 220, 255, 0)');
    c.fillStyle = halo; c.fillRect(lx - r * 5, ly - r * 5, r * 10, r * 10);
    c.fillStyle = '#FBE9FF'; c.beginPath(); c.arc(lx, ly, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#E7CFF5'; c.fillRect(lx - 2, ly - 1, 2, 2); c.fillRect(lx + 1, ly + 2, 1, 1);
    if (anime) for (let i = filantes.length - 1; i >= 0; i--) {
      const f = filantes[i];
      f.x += f.vx * dt; f.y += f.vy * dt; f.vie -= 0.012 * dt;
      if (f.vie <= 0 || f.x < -20) { filantes.splice(i, 1); continue; }
      for (let k = 0; k < 8; k++) {
        c.globalAlpha = f.vie * (1 - k / 8); c.fillStyle = k ? '#BFF6FF' : '#FFFFFF';
        c.fillRect(Math.round(f.x - f.vx * k * 0.9), Math.round(f.y - f.vy * k * 0.9), 1, 1);
      }
    }
    c.globalAlpha = 1;
    for (const { d, bats } of couches) {
      for (const b of bats) {
        const by = H - b.h;
        c.fillStyle = d.corps; c.fillRect(b.x, by, b.w, b.h);
        if (b.toit?.type === 'marche') c.fillRect(b.x + b.toit.dx, by - b.toit.h, b.toit.w, b.toit.h);
        if (b.toit?.type === 'antenne') {
          c.fillRect(b.x + b.toit.dx, by - b.toit.h, 1, b.toit.h);
          if (!anime || (t + b.toit.phase) % 90 < 40) { c.fillStyle = '#FF5A7A'; c.fillRect(b.x + b.toit.dx, by - b.toit.h - 1, 1, 1); }
        }
        for (const f of b.fen) { c.fillStyle = f.on ? f.coul : d.eteinte; c.fillRect(b.x + f.x, by + f.y, d.fw, d.fh); }
        const e = b.enseigne;
        if (!e) continue;
        if (anime && e.panne > 0 && Math.random() < 0.5) { c.fillStyle = '#3A2357'; c.fillRect(b.x + e.x, by + e.y, e.w, e.h); continue; }
        c.fillStyle = e.coul;
        c.globalAlpha = 0.22; c.fillRect(b.x + e.x - 2, by + e.y - 2, e.w + 4, e.h + 4);
        c.globalAlpha = 0.45; c.fillRect(b.x + e.x - 1, by + e.y - 1, e.w + 2, e.h + 2);
        c.globalAlpha = 1; c.fillRect(b.x + e.x, by + e.y, e.w, e.h);
        c.fillStyle = '#FFFFFF'; c.fillRect(b.x + e.x + 1, by + e.y + 1, 1, e.h - 2);
      }
      if (d.brume) { // brume entre les plans
        const [rr, gg, bb, a] = d.brume, haut = H * 0.35, gr = c.createLinearGradient(0, haut, 0, H);
        gr.addColorStop(0, `rgba(${rr},${gg},${bb},0)`); gr.addColorStop(1, `rgba(${rr},${gg},${bb},${a})`);
        c.fillStyle = gr; c.fillRect(0, haut, W, H - haut);
      }
    }
    if (!anime) return;
    c.strokeStyle = 'rgb(190, 200, 255)'; c.lineWidth = 1;
    gouttes.forEach((g, i) => {
      g.y += g.v * dt; g.x -= g.v * 0.22 * dt;
      if (g.y > H + 8) return (gouttes[i] = goutte(false));
      c.globalAlpha = g.a; c.beginPath();
      c.moveTo(Math.round(g.x) + 0.5, Math.round(g.y)); c.lineTo(Math.round(g.x + g.l * 0.22) + 0.5, Math.round(g.y - g.l)); c.stroke();
    });
    c.globalAlpha = 1;
  }
  const copier = cvs => cvs.forEach(k => k.getContext('2d').drawImage(off, 0, 0));
  function image(now) {
    const cvs = document.querySelectorAll('canvas.ville');
    if (!cvs.length) { raf = 0; return; } // plus aucune fenêtre avec la ville : on s'arrête
    const dt = dernier ? Math.min(3, (now - dernier) / 16.667) : 1;
    dernier = now; t += dt;
    mettreAJour(dt); dessiner(dt, true); copier(cvs);
    raf = requestAnimationFrame(image);
  }
  return {
    W, H,
    sync() { // à appeler après chaque rendu d'une pièce
      const cvs = document.querySelectorAll('canvas.ville');
      if (!cvs.length) return;
      if (!couches) generer();
      if (reduit.matches) { dessiner(0, false); copier(cvs); }
      else if (!raf) { dernier = 0; raf = requestAnimationFrame(image); }
    },
    click(e) { // clic sur un immeuble : cascade d'étages ; dans le ciel : étoile filante
      const rect = e.target.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * W, y = (e.clientY - rect.top) / rect.height * H;
      for (let i = couches.length - 1; i >= 0; i--) for (const b of couches[i].bats) {
        if (x < b.x || x >= b.x + b.w || y < H - b.h || !b.fen.length) continue;
        const mode = b.fen.filter(f => f.on).length / b.fen.length > 0.55 ? 'off' : 'on';
        b.cascade = { debut: t, mode, coul: FEN[Math.floor(Math.random() * FEN.length)] };
        if (reduit.matches) { cascade(b, b.etages); this.sync(); }
        return;
      }
      if (!reduit.matches) filante(x + 12, y - 4);
    },
  };
})();

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
  cafe: { gain: 1.2, build: out => {
    const a = ctx(), g = a.createGain(); g.gain.value = 0.6;
    noise(true).connect(filt('bandpass', 500, 0.8)).connect(g).connect(out); lfo(0.3, 0.2, g.gain); // brouhaha
    const clink = () => { // tasse qui tinte de temps en temps
      const t = a.currentTime, o = a.createOscillator(), e = a.createGain();
      o.frequency.value = 2400 + Math.random() * 1600;
      e.gain.setValueAtTime(0.04, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(e).connect(out); o.start(t); o.stop(t + 0.45);
      setTimeout(clink, 1500 + Math.random() * 5000);
    };
    clink();
  } },
  foret: { gain: 1, build: out => {
    const a = ctx(), f = filt('bandpass', 800, 0.5), g = a.createGain(); g.gain.value = 0.25;
    noise(true).connect(f).connect(g).connect(out); lfo(0.1, 150, f.frequency); // feuillage
    const chirp = () => { // quelques notes d'oiseau qui montent
      const t = a.currentTime;
      for (let i = 0, n = 2 + Math.random() * 3; i < n; i++) {
        const o = a.createOscillator(), e = a.createGain(), s = t + i * 0.13, base = 2500 + Math.random() * 1500;
        o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * 1.4, s + 0.08);
        e.gain.setValueAtTime(0.0001, s); e.gain.linearRampToValueAtTime(0.03, s + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
        o.connect(e).connect(out); o.start(s); o.stop(s + 0.12);
      }
      setTimeout(chirp, 2000 + Math.random() * 5000);
    };
    chirp();
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
function addCoins(n, why) { // toute variation de pièces passe par ici (historique dans Réglages)
  if (!n) return;
  S.coins += n; S.tx.unshift({ at: Date.now(), n, why });
  S.tx.length = Math.min(S.tx.length, CFG.txMax);
}
function earn(n, why) { // pièces gagnées en révisant, plafonnées par jour
  const d = dayStats(); n = Math.max(0, Math.min(Math.round(n), CFG.coinsPerDay - d.coins));
  d.coins += n; addCoins(n, why); return n;
}
function credit(sec, full, subId) { // full : session complète (bonus)
  S.carry += sec;
  const m = Math.floor(S.carry / 60);
  S.carry -= m * 60;
  const ev = eventOf(today()), d = dayStats(), sub = S.subjects.find(s => s.id == subId);
  let coins = earn(m * (ev.coinMult || 1) + (full ? CFG.coinsFull : 0), full ? 'Session complète' : 'Révision');
  let pa = addPA((full ? CFG.paFull : 0) + (d.sessions ? 0 : CFG.paFirst));
  d.sessions++; S.totalMin += m; d.minutes += m;
  S.lastStudy = today(); S.decayed = 0;
  if (sub) { sub.min += m; if (!d.subjects.includes(sub.id)) d.subjects.push(sub.id); }
  S.plots.forEach(p => p && (p.g += m * (ev.growMult || 1)));
  S.eggs.forEach(e => e.min += m);
  if (!d.streakDone && d.minutes >= CFG.streakMin) { // jour de série validé
    d.streakDone = true;
    const st = S.streak;
    const missed = st.last ? dayNum(today()) - dayNum(st.last) - 1 : Infinity; // jours sans révision depuis le dernier jour validé
    if (missed <= S.freezes) {
      S.freezes -= missed; st.cur++;
      if (missed) toast(`🧊 Gel de série utilisé (${missed}) : ta série continue !`);
    } else st.cur = 1;
    st.last = today(); st.best = Math.max(st.best, st.cur);
    coins += earn(Math.min(st.cur * CFG.coinsPerStreakDay, CFG.coinsStreakMax), `Bonus de série (${st.cur} j)`);
    pa += addPA(Math.min(st.cur * CFG.paPerStreakDay, CFG.paStreakMax));
  }
  toast(`+${m} min révisées · +${coins} 🪙${pa ? ` · +${pa} 💗` : ''}${d.coins >= CFG.coinsPerDay ? ' (plafond du jour atteint)' : ''}`);
}

// ---------- Minuteur ----------
// État sauvegardé à part (clé 'jardin_timer') pour survivre à un rechargement de page.
const T = { mode: 'pomodoro', phase: 'work', running: false, started: false, left: 0, total: 0, elapsed: 0, pending: 0, count: 0, last: 0, id: null, sub: '', goal: '', midSaid: false };
const PHASE_LABEL = { work: 'Concentration', short: 'Petite pause', long: 'Grande pause' };
const saveTimer = () => store.set('jardin_timer', JSON.stringify({ ...T, id: null }));
const minutesOf = p => { // durée d'une phase selon le rythme choisi
  const c = S.cfg;
  if (p === 'work' && T.mode === 'libre') return c.libre;
  return (PRESETS[c.preset] || [c.work, c.short, c.long])[['work', 'short', 'long'].indexOf(p)];
};

function setPhase(p) {
  T.phase = p; T.started = false;
  T.total = T.mode === 'chrono' ? 0 : 60 * minutesOf(p);
  T.left = T.total; T.elapsed = 0;
  saveTimer(); renderTimer();
}
function start() {
  if (T.running) return pause();
  if (!T.started) {
    if (T.phase === 'work') { T.sub = $('#subjectSelect').value; T.goal = $('#goalInput').value.trim(); T.midSaid = false; }
    say(T.phase === 'work' ? 'start' : 'pause');
    if (window.Notification?.permission === 'default') Notification.requestPermission().catch(() => {}); // demandé seulement après un clic
  }
  T.running = T.started = true; T.last = Date.now();
  T.id = setInterval(tick, 250);
  saveTimer(); renderAll();
}
function pause() { T.running = false; clearInterval(T.id); saveTimer(); renderTimer(); }
function tick() {
  const now = Date.now(); let dt = (now - T.last) / 1000; T.last = now; // Date.now : reste juste même si l'onglet est en arrière-plan
  if (T.mode !== 'chrono') dt = Math.min(dt, T.left);
  if (T.phase === 'work') T.pending += dt;
  if (T.mode === 'chrono') T.elapsed += dt;
  else {
    T.left -= dt;
    if (T.left <= 0) return phaseEnd();
    if (T.phase === 'work' && !T.midSaid && T.left <= T.total / 2) { T.midSaid = true; say('mid'); }
  }
  saveTimer(); renderTimer();
}
function phaseEnd() {
  pause(); beep();
  if (T.phase === 'work') {
    endFocus(true);
    if (T.mode === 'pomodoro') { T.count++; dayStats().pomos++; setPhase(T.count % 4 ? 'short' : 'long'); }
    else setPhase('work');
    notify('Session terminée ! Pause bien méritée 🌼');
  } else { setPhase('work'); notify('Fin de la pause. On s\'y remet quand tu veux 🍅'); }
  save(); renderAll();
}
// Abandonner (travail), Terminer (chrono) ou Passer la pause
function finish() {
  pause();
  if (T.phase === 'work' && T.pending > 0) endFocus(T.mode === 'chrono' && T.pending >= CFG.chronoFull * 60);
  setPhase('work'); save(); renderAll();
}
let happyUntil = 0;
function endFocus(full) { // fin d'une session de concentration : gains, historique, bilan
  const sec = T.pending; T.pending = 0;
  const long = sec >= CFG.minSession * 60;
  if (!full && !long) return toast('Moins de 5 min : cette session ne compte pas. Pas grave, on recommence quand tu veux 🌱');
  credit(sec, full && long, T.sub);
  S.sessions.push({ at: Date.now(), date: today(), sec: Math.round(sec), sub: +T.sub || null, goal: T.goal, full, result: null, feel: null });
  $('#goalInput').value = '';
  happyUntil = Date.now() + 8000; say('end'); openDebrief();
}
function notify(msg) {
  if (!document.hidden || window.Notification?.permission !== 'granted') return;
  try { new Notification('Jardin d\'Étude', { body: msg }); } catch {}
}
function beep() {
  if (!S.alertVol) return;
  try {
    const a = ctx();
    [0, 0.25].forEach((dt, i) => {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + dt;
      o.connect(g).connect(a.destination); o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.4 * S.alertVol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1);
      o.start(t); o.stop(t + 1);
    });
  } catch {}
}
function openDebrief() {
  const s = S.sessions.at(-1), dlg = $('#debrief');
  $('#debriefGoal').hidden = !s.goal;
  $('#debriefGoal p').textContent = `Objectif atteint ? « ${s.goal} »`;
  dlg.querySelectorAll('[data-result],[data-feel]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  if (!dlg.open) dlg.showModal();
}

// ---------- Affichage ----------
let selSeed = null;
const toastQ = [];
function toast(msg) { // file d'attente : succès, niveaux et gains s'affichent l'un après l'autre
  if (toastQ.at(-1) === msg) return;
  if (toastQ.push(msg) === 1) showToast();
}
function showToast() {
  const t = $('#toast'); t.textContent = toastQ[0]; t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => { toastQ.shift(); if (toastQ.length) showToast(); }, 300); }, 2600);
}

function renderTimer() {
  const chrono = T.mode === 'chrono';
  const shown = chrono ? T.elapsed : T.left;
  const ratio = chrono ? (T.elapsed % 3600) / 3600 : 1 - T.left / (T.total || 1);
  $('#time').textContent = fmt(shown);
  $('#phase').textContent = chrono ? 'Chronomètre' : PHASE_LABEL[T.phase];
  $('#tbar').style.width = `${ratio * 100}%`;
  $('#tbar').parentElement.setAttribute('aria-valuenow', Math.round(ratio * 100));
  $('#tbar').parentElement.classList.toggle('break', T.phase !== 'work');
  const studying = T.running && T.phase === 'work';
  $$('.pet.main').forEach(p => p.dataset.state = petState());
  const st = curStreak();
  $('#streakBadge').textContent = st ? `🔥 ${st} j de série` : '🌱 Pas encore de série';
  $('#bubble').textContent = studying && Date.now() - bubbleAt > 10000 ? '' : bubble; // pendant le travail, la bulle s'efface vite
  $('#startBtn').textContent = T.running ? 'Pause' : T.started ? 'Reprendre' : 'Démarrer';
  $('#stopBtn').textContent = T.phase !== 'work' ? 'Passer la pause' : chrono ? 'Terminer' : 'Abandonner';
  $('#stopBtn').disabled = T.phase === 'work' && !T.started;
  $('#subjectSelect').disabled = $('#goalInput').disabled = T.started && T.phase === 'work';
  const label = T.phase !== 'work' ? 'Pause' : S.subjects.find(s => s.id == T.sub)?.name || 'Révision';
  document.title = T.started ? `${fmt(shown)} – ${label}` : "Jardin d'Étude";
}
function petState() { // repos, révise, pause, content, endormi, triste doux
  if (T.running) return T.phase === 'work' ? 'studying' : 'resting';
  if (Date.now() < happyUntil) return 'happy';
  if (absentDays() >= 3) return 'sad';
  const h = new Date().getHours();
  return h >= 23 || h < 6 ? 'sleeping' : 'idle';
}
function renderFriend() {
  const pa = S.friend[S.species] || 0, lv = levelOf(pa), lo = LEVELS[lv - 1], hi = LEVELS[lv];
  const r = hi ? (pa - lo) / (hi - lo) : 1;
  $$('.friend').forEach(f => {
    f.querySelector('b').textContent = `💗 Amitié avec ${nameOf(S.species)}`;
    f.querySelector('span').textContent = `Niveau ${lv}`;
    f.querySelector('.progress').setAttribute('aria-valuenow', Math.round(r * 100));
    f.querySelector('i').style.width = `${r * 100}%`;
    f.querySelector('small').textContent = hi ? `${pa - lo} / ${hi - lo} PA avant le niveau ${lv + 1}` : 'Amitié maximale ✨';
  });
}

function renderHeader() {
  $('#coins').textContent = S.coins;
  document.documentElement.style.fontSize = `${S.font * 100}%`;
  document.body.classList.toggle('night', S.night);
  Object.keys(THEMES).forEach(t => document.body.classList.toggle(`theme-${t}`, (tryTheme || S.theme) === t));
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
  $('#presetSelect').value = S.cfg.preset;
  $$('[data-vol]').forEach(r => r.closest('label').hidden = !S.sounds.includes(r.dataset.vol));
  const shown = [T.mode, T.mode === 'pomodoro' && S.cfg.preset === 'perso' && 'perso'];
  $$('[data-for]').forEach(el => el.hidden = !shown.includes(el.dataset.for));
  $$('[data-mode]').forEach(x => x.classList.toggle('active', x.dataset.mode === T.mode));
}

const setOptions = (sel, html) => { const v = sel.value; sel.innerHTML = html; sel.value = v; if (sel.selectedIndex < 0) sel.selectedIndex = 0; }; // garde le choix en cours
let statRange = 7; // 7 ou 30 jours dans le graphique
function renderStats() {
  const month = today().slice(0, 7), byDay = {};
  for (const x of S.sessions) byDay[x.date] = (byDay[x.date] || 0) + x.sec / 60;
  const goals = S.sessions.filter(x => x.goal && x.result), best = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  const dayLabel = (d, o) => new Date(d + 'T12:00').toLocaleDateString('fr', o);
  $('#statTiles').innerHTML = [
    [fmtMin(dayStats().minutes), 'aujourd\'hui'], [fmtMin(weekMin()), 'cette semaine'],
    [fmtMin(Object.entries(byDay).filter(([d]) => d.startsWith(month)).reduce((a, [, v]) => a + v, 0)), 'ce mois-ci'], [fmtMin(S.totalMin), 'au total'],
    [`${curStreak()} j`, 'série actuelle'], [`${S.streak.best} j`, 'meilleure série'],
    [best ? fmtMin(best[1]) : '–', best ? `meilleur jour (${dayLabel(best[0], { day: 'numeric', month: 'short' })})` : 'meilleur jour'],
    [S.sessions.length ? fmtMin(S.sessions.reduce((a, x) => a + x.sec, 0) / 60 / S.sessions.length) : '–', 'par session en moyenne'],
    [S.sessions.filter(x => x.full).length, 'sessions complètes'],
    [goals.length ? `${Math.round(goals.filter(x => x.result === 'oui').length / goals.length * 100)} %` : '–', 'objectifs atteints'],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('');

  // objectif hebdomadaire
  const wr = Math.min(1, weekMin() / 60 / S.weekGoal);
  if (document.activeElement !== $('#weekGoal')) $('#weekGoal').value = S.weekGoal;
  $('#weekGoalBar').setAttribute('aria-valuenow', Math.round(wr * 100));
  $('#weekGoalBar i').style.width = `${wr * 100}%`;
  $('#weekGoalTxt').textContent = wr >= 1 ? 'Objectif atteint, bravo ! 🎉' : `${fmtMin(weekMin())} sur ${S.weekGoal} h · encore ${fmtMin(S.weekGoal * 60 - weekMin())}`;

  // graphique 7 / 30 jours
  $$('[data-range]').forEach(b => b.classList.toggle('active', +b.dataset.range === statRange));
  const days = Array.from({ length: statRange }, (_, i) => dayOffset(i - statRange + 1)).map(d => [d, byDay[d] || 0]);
  const max = Math.max(1, ...days.map(([, v]) => v));
  $('#weekBars').classList.toggle('r30', statRange === 30);
  $('#weekBars').innerHTML = days.map(([d, v]) => `<div class="col" title="${dayLabel(d, { day: 'numeric', month: 'short' })} : ${fmtMin(v)}" aria-label="${dayLabel(d, { weekday: 'long', day: 'numeric' })} : ${fmtMin(v)}"><i style="height:${v / max * 100}%"></i>
    <small>${statRange === 7 ? dayLabel(d, { weekday: 'short' }) : d.slice(8)}</small></div>`).join('');

  // heatmap : 53 colonnes de 7 jours (lundi en haut), 4 niveaux d'intensité
  const n = 52 * 7 + (new Date().getDay() + 6) % 7 + 1;
  const cells = Array.from({ length: n }, (_, i) => dayOffset(i - n + 1));
  const lvl = v => !v ? 0 : v < 30 ? 1 : v < 60 ? 2 : v < 120 ? 3 : 4;
  $('#heatmap').setAttribute('aria-label', `${cells.filter(d => byDay[d]).length} jours de révision sur les 12 derniers mois`);
  $('#heatmap').innerHTML = cells.map(d => `<i class="l${lvl(byDay[d])}" title="${dayLabel(d, { day: 'numeric', month: 'long' })} : ${fmtMin(byDay[d] || 0)}"></i>`).join('');

  const subMax = Math.max(1, ...S.subjects.map(x => x.min));
  $('#subjectBars').innerHTML = S.subjects.length ? S.subjects.map(x => `<div class="hbar"><span>${esc(x.name)}</span>
    <div class="progress"><i style="width:${x.min / subMax * 100}%;background:${esc(x.color)}"></i></div><small>${fmtMin(x.min)}</small></div>`).join('')
    : '<p class="empty-msg">Aucune matière pour l\'instant.</p>';

  // examens
  const opts = S.subjects.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  setOptions($('#examSub'), opts);
  $('#examDate').min = dayOffset(1);
  $('#examList').innerHTML = S.exams.length ? [...S.exams].sort((a, b) => a.date.localeCompare(b.date)).map(x => {
    const j = daysTo(x.date), goal = x.hours * 60;
    const done = S.sessions.filter(y => y.sub === x.sub && y.date >= x.from && y.date <= x.date).reduce((a, y) => a + y.sec, 0) / 60;
    const left = Math.max(0, goal - done), r = Math.min(1, done / goal);
    const advice = j < 0 ? 'Examen passé. Bravo pour tout ce travail 💪' : !left ? 'Objectif atteint ! Garde un rythme doux jusqu\'au jour J ✨'
      : !j ? 'C\'est aujourd\'hui ! Respire un grand coup, tout va bien se passer 🍀'
      : `Il te reste ${j} jour${j > 1 ? 's' : ''} et ${fmtMin(left)} de révision prévues pour atteindre ton objectif, soit environ ${fmtMin(left / j)} par jour.`;
    return `<div class="mission"><span class="countdown">${j > 1 ? `J-${j}` : j === 1 ? 'Demain' : !j ? 'Jour J' : 'Passé'}</span><div class="info">
      <b>${esc(subName(x.sub))}</b> · <small>${dayLabel(x.date, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
      <div class="progress" role="progressbar" aria-label="Révision pour l'examen" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r * 100)}"><i style="width:${r * 100}%"></i></div>
      <small>${fmtMin(done)} / ${x.hours} h · ${advice}</small></div>
      <button class="del" data-exam-del="${x.id}" aria-label="Supprimer l'examen">🗑️</button></div>`;
  }).join('') : '<p class="empty-msg">Aucun examen prévu.</p>';

  $('#reviewTitle').textContent = `📝 Le bilan de la semaine, par ${nameOf(S.species)}`;
  $('#reviewPet').innerHTML = petSVG(S.species, S.equip);
  $('#reviewText').textContent = weekReview(byDay);
}
function weekReview(byDay) { // texte du compagnon à partir des stats de la semaine dernière
  const monday = dayNum(today()) - (new Date().getDay() + 6) % 7, inWeek = (x, from) => dayNum(x.date) >= from && dayNum(x.date) < from + 7;
  const ss = S.sessions.filter(x => inWeek(x, monday - 7)), min = ss.reduce((a, x) => a + x.sec, 0) / 60;
  const prev = S.sessions.filter(x => inWeek(x, monday - 14)).reduce((a, x) => a + x.sec, 0) / 60;
  if (!ss.length) return 'La semaine dernière, on n\'a pas révisé ensemble. Ce n\'est pas grave du tout : cette semaine est toute neuve, on commence quand tu veux 🌱';
  const [bestDay] = Object.entries(byDay).filter(([d]) => inWeek({ date: d }, monday - 7)).sort((a, b) => b[1] - a[1]);
  const bySub = {}; ss.forEach(x => x.sub && (bySub[x.sub] = (bySub[x.sub] || 0) + x.sec));
  const top = Object.entries(bySub).sort((a, b) => b[1] - a[1])[0];
  const goals = ss.filter(x => x.goal && x.result), ok = goals.filter(x => x.result === 'oui').length;
  const end = ['J\'adore faire équipe avec toi 💕', 'On continue tranquillement cette semaine ? 🍵', 'Chaque minute compte, et tu en as fait beaucoup ✨', 'Prends soin de toi, et on se retrouve pour réviser 🌷'];
  return [`La semaine dernière, tu as révisé ${fmtMin(min)} en ${ss.length} session${ss.length > 1 ? 's' : ''}`
      + (min > prev ? ', c\'est plus que la semaine d\'avant 📈' : prev ? '. Un peu moins que la semaine d\'avant, et c\'est très bien aussi 🌱' : ' 🎉') + '.',
    `Ton meilleur jour, c'était ${new Date(bestDay[0] + 'T12:00').toLocaleDateString('fr', { weekday: 'long' })} (${fmtMin(bestDay[1])}).`,
    top && `Tu as surtout travaillé : ${subName(+top[0])}.`,
    goals.length && `Objectifs atteints : ${ok} sur ${goals.length}.`,
    end[monday % end.length]].filter(Boolean).join(' ');
}

// ---------- Outils : à faire, fiches, bloc-notes ----------
let flash = null, flashShow = false; // fiche en cours de révision
function nextCard() { // révise d'abord les fiches des petites boîtes, sans répéter la même
  const others = S.cards.filter(c => c.id !== flash), cand = others.length ? others : S.cards;
  const min = Math.min(...cand.map(c => c.box)), pool = cand.filter(c => c.box === min);
  flash = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null; flashShow = false;
}
function renderTools() {
  $('#todoList').innerHTML = S.todos.length ? S.todos.map(t => `<div class="todo ${t.done ? 'done' : ''}">
      <button class="check" data-todo="${t.id}" aria-pressed="${t.done}" aria-label="${t.done ? 'Décocher' : 'Cocher'} : ${esc(t.text)}">${t.done ? '✅' : '⬜'}</button>
      <span>${esc(t.text)}</span>
      ${t.done ? '' : `<button class="del" data-todo-goal="${t.id}" title="En faire l'objectif de la session" aria-label="En faire l'objectif de la session : ${esc(t.text)}">🎯</button>`}
      <button class="del" data-todo-del="${t.id}" aria-label="Supprimer : ${esc(t.text)}">🗑️</button></div>`).join('')
    : '<p class="empty-msg">Rien à faire pour l\'instant.</p>';
  const opts = '<option value="">Sans matière</option>' + S.subjects.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  setOptions($('#cardSub'), opts);
  if (!S.cards.some(c => c.id === flash)) nextCard();
  const c = S.cards.find(c => c.id === flash);
  $('#cardReview').innerHTML = !c ? '<p class="empty-msg">Ajoute ta première fiche : une question d\'un côté, la réponse de l\'autre.</p>'
    : `<div class="flash"><small>${esc(subName(c.sub))} · boîte ${c.box + 1} / 5</small><p class="q">${esc(c.q)}</p>
      ${flashShow ? `<p class="a">${esc(c.a)}</p><div class="row choice"><button class="btn" data-flash="ko">🔁 À revoir</button><button class="btn primary" data-flash="ok">✅ Je savais</button></div>`
        : '<button class="btn wide" data-flash="show">Voir la réponse</button>'}</div>`;
  $('#cardCount').textContent = `Mes fiches (${S.cards.length})`;
  $('#cardList').innerHTML = S.cards.map(c => `<div class="subject"><span class="name">${esc(c.q)}<br><small>${esc(c.a)}</small></span>
    <button class="del" data-card-del="${c.id}" aria-label="Supprimer la fiche : ${esc(c.q)}">🗑️</button></div>`).join('');
  if (document.activeElement !== $('#notes')) $('#notes').value = S.notes;
}

// ---------- Réglages ----------
function renderSettings() {
  $('#fontSize').value = S.font;
  $('#txList').innerHTML = S.tx.length ? S.tx.slice(0, 100).map(t => `<div class="tx"><small>${new Date(t.at).toLocaleString('fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
    <span>${esc(t.why)}</span><b>${t.n > 0 ? '+' : '−'}${Math.abs(t.n)} 🪙</b></div>`).join('')
    : '<p class="empty-msg">Aucune transaction pour l\'instant.</p>';
}
function exportSave() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  a.download = `jardin-etude-${today()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importSave(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch {}
  const arrays = ['subjects', 'sessions', 'pets', 'eggs', 'ach', 'owned', 'todos', 'cards', 'exams', 'tx', 'rooms', 'views'];
  if (!data || typeof data !== 'object' || typeof data.coins !== 'number' || !Array.isArray(data.subjects) || arrays.some(k => k in data && !Array.isArray(data[k])))
    return toast('Ce fichier ne ressemble pas à une sauvegarde du Jardin 🤔');
  if (!confirm('Remplacer toutes tes données actuelles par cette sauvegarde ?')) return;
  if (!store.set('jardin', JSON.stringify(data))) return toast('⚠️ Impossible d\'enregistrer dans ce navigateur');
  store.set('jardin_timer', 'null');
  location.reload();
}

// ---------- Premier lancement ----------
const tuto = { step: 0, pick: 'pingouin', name: null };
const PALETTE = ['#FF8FE6', '#4FE3FF', '#C9A6E4', '#FFC46B', '#8FF0FF', '#FF4FD8'];
function renderTuto() {
  $('#tutoBody').innerHTML = `<p class="hint">Étape ${tuto.step + 1} / 3</p>` + [
    `<h2 id="tutoTitle">🌷 Bienvenue au Jardin d'Étude</h2>
      <p>Ici, tu révises avec un minuteur et un petit compagnon qui t'encourage.</p>
      <p>⏱️ Chaque minute de révision rapporte des pièces 🪙, fait pousser ton jardin et renforce votre amitié 💗.</p>
      <p>🌱 Aucune pression : si tu fais une pause de quelques jours, ton compagnon t'attend, tout simplement.</p>`,
    `<h2 id="tutoTitle">🐾 Choisis ton premier compagnon</h2>
      <div class="grid tuto-picks">${['pingouin', 'chat', 'lapin'].map(k => `<button class="coll ${tuto.pick === k ? 'sel' : ''}" data-tuto-pick="${k}" aria-pressed="${tuto.pick === k}" style="--r:${RARITY.commun.color}">${petSVG(k)}<b>${SPECIES[k].name}</b></button>`).join('')}</div>
      <label class="field">Son nom <input id="tutoName" maxlength="20" value="${esc(tuto.name || SPECIES[tuto.pick].dflt)}"></label>`,
    `<h2 id="tutoTitle">📚 Tes matières</h2>
      <p>Écris les matières que tu révises, séparées par des virgules. Tu pourras les changer plus tard.</p>
      <input id="tutoSubs" class="wide-input" maxlength="300" value="Maths, Français, Histoire" aria-label="Matières">`,
  ][tuto.step] + `<button class="btn primary wide" data-tuto-next>${tuto.step < 2 ? 'Suivant' : "C'est parti ! 🌸"}</button>`;
}
function finishTuto() {
  const subs = $('#tutoSubs').value.split(',').map(x => x.trim().slice(0, 30)).filter(Boolean).slice(0, 12);
  if (subs.length) S.subjects = subs.map((name, i) => ({ id: Date.now() + i, name, color: PALETTE[i % PALETTE.length], min: 0 }));
  S.pets = [tuto.pick]; S.species = tuto.pick;
  if (tuto.name) S.names[tuto.pick] = tuto.name;
  $('#tuto').close(); say('idle'); save(); renderAll();
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
  const d = dayStats(), ev = eventOf(today()), tomorrow = eventOf(dayOffset(1));
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
    ? S.subjects.map(s => `<div class="subject"><input type="color" data-sub-color="${s.id}" value="${esc(s.color)}" aria-label="Couleur de ${esc(s.name)}">
        <input class="name" data-sub-name="${s.id}" value="${esc(s.name)}" maxlength="30" aria-label="Renommer ${esc(s.name)}"><span>${fmtMin(s.min)}</span>
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

let tryTheme = null;    // thème essayé depuis la boutique
let shopCat = 'oeufs';  // catégorie affichée dans la boutique
const selPet = () => preview && SPECIES[preview]?.rarity ? preview : S.species; // compagnon affiché dans la fiche
const card = (pv, name, desc, action, cls = '') => `<div class="item ${cls}">${pv}<b>${name}</b>${desc ? `<small>${desc}</small>` : ''}${action}</div>`;
const buyBtn = (attr, price) => `<button class="btn primary" ${attr} ${S.coins < price ? 'disabled' : ''}>${price} 🪙</button>`;
function howToGet(k) {
  const P = SPECIES[k], a = ACH.find(a => a.reward.pet === k);
  if (a) return `succès « ${a.name} »`;
  const eggs = Object.keys(EGGS).filter(e => EGGS[e].odds[P.rarity]).map(e => EGGS[e].name.toLowerCase());
  return [P.price != null && `${P.price} 🪙`, ...eggs].filter(Boolean).join(' ou ');
}

function renderCompanions() {
  $$('.scene').forEach(s => s.classList.toggle('has-partner', S.partner));
  $('#scene').dataset.chambre = S.room;
  $('#scene .room').innerHTML = roomHTML();
  VILLE.sync();
  const sel = selPet(), owned = S.pets.includes(sel), pvPartner = S.partner || preview === 'pingouine';
  $('#bigStage').classList.toggle('has-partner', pvPartner);
  $('#bigStage').classList.toggle('locked', !owned);
  $('#bigStage').innerHTML = petsHTML(sel, pvPartner, sel === S.species ? S.equip : {}, S.partnerEquip);
  $('#previewNote').innerHTML = preview === 'pingouine' && !S.partner
    ? `👀 Aperçu : ${nameOf('pingouine')} · à débloquer pour ${PARTNER_PRICE} 🪙 <button class="link" data-preview="">Revenir</button>` : '';
  $('#nameField').hidden = !owned;
  if (document.activeElement !== $('#petName')) $('#petName').value = nameOf(sel);

  // fiche du compagnon
  const P = SPECIES[sel], Rr = RARITY[P.rarity], pa = S.friend[sel] || 0, lv = levelOf(pa), hi = LEVELS[lv];
  const story = P.story.map((t, i) => lv >= storyLevel(i) ? `<p>📖 ${t}</p>` : `<p class="hint">🔒 Souvenir débloqué au niveau ${storyLevel(i)} d'amitié</p>`).join('');
  const worn = Object.values(S.equip).filter(Boolean).map(id => COSMETICS[id].name).join(', ') || 'aucun accessoire';
  $('#petDetail').innerHTML = `<h2>${owned ? esc(nameOf(sel)) : '???'} <span class="rarity" style="--r:${Rr.color}">${Rr.name}</span></h2>` + (owned
    ? `<p class="hint">${P.name} · Niveau ${lv} d'amitié</p>
      <div class="progress" role="progressbar" aria-label="Amitié" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${hi ? Math.round((pa - LEVELS[lv - 1]) / (hi - LEVELS[lv - 1]) * 100) : 100}"><i style="width:${hi ? (pa - LEVELS[lv - 1]) / (hi - LEVELS[lv - 1]) * 100 : 100}%"></i></div>
      <small class="hint">${hi ? `${pa - LEVELS[lv - 1]} / ${hi - LEVELS[lv - 1]} PA avant le niveau ${lv + 1}` : 'Amitié maximale ✨'}</small>${story}
      ${sel === S.species ? `<p>👗 Porte : ${esc(worn)}</p><p class="active-tag">✓ Compagnon actif</p>` : `<button class="btn primary wide" data-adopt="${sel}">Choisir comme compagnon actif</button>`}`
    : `<p>Obtenu avec : ${howToGet(sel)}</p>` + (P.price != null ? `<button class="btn primary wide" data-adopt="${sel}" ${S.coins < P.price ? 'disabled' : ''}>Adopter · ${P.price} 🪙</button>` : ''));

  $('#collCount').textContent = `${S.pets.length} / ${COLL.length}`;
  $('#adopt').innerHTML = COLL.map(k => {
    const own = S.pets.includes(k), Rk = RARITY[SPECIES[k].rarity];
    return `<button class="coll ${own ? '' : 'locked'} ${k === sel ? 'sel' : ''}" data-preview="${k}" style="--r:${Rk.color}" aria-label="${own ? esc(nameOf(k)) : 'Compagnon mystère'}, ${Rk.name}">
      ${petSVG(k, k === S.species ? S.equip : {})}<b>${own ? esc(nameOf(k)) : '???'}</b>
      <small>${own ? (k === S.species ? '✓ Actif' : Rk.name) : `Obtenu avec : ${howToGet(k)}`}</small></button>`;
  }).join('');

  $('#eggs').innerHTML = S.eggs.length ? S.eggs.map((e, i) => {
    const E = EGGS[e.type], r = Math.min(1, e.min / E.min);
    return `<div class="mission"><span class="egg-icon" style="--r:${E.color}">🥚</span><div class="info"><b>${E.name}</b>
      <div class="progress" role="progressbar" aria-label="Éclosion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r * 100)}"><i style="width:${r * 100}%"></i></div>
      <small>${Math.floor(Math.min(e.min, E.min))} / ${E.min} min de révision</small></div>
      <button class="btn primary" data-hatch="${i}" ${r < 1 ? 'disabled' : ''}>${r < 1 ? 'En couvaison' : 'Faire éclore ✨'}</button></div>`;
  }).join('') : '<p class="empty-msg">Aucun œuf pour l\'instant. Tu peux en acheter à la boutique ou en gagner avec les succès.</p>';

  const pn = nameOf('pingouine');
  $('#partnerCard').innerHTML = `<div class="partner-row"><div class="partner-preview">${previewBtn('pingouine', petSVG('pingouine', S.partnerEquip), pn)}</div><div>
    <p><b>${pn}</b>, la petite amie du pingouin, vient s'installer dans ta pièce et t'encourage pendant tes révisions 💕</p>
    ${S.partner ? `<label class="field left">Son nom <input id="partnerName" maxlength="20" value="${esc(pn)}"></label>`
      : `<button class="btn primary" data-partner ${S.coins < PARTNER_PRICE ? 'disabled' : ''}>Débloquer · ${PARTNER_PRICE} 🪙</button>`}
    </div></div>`;
}

let tryRoom = null, tryView = null; // chambre et vue essayées dans la boutique
// thèmes, chambres, vues : « ✓ Actif », « Utiliser » ou le prix
const useBtn = (owned, active, attr, price) => active ? '<span class="owned">✓ Actif</span>' : owned ? `<button class="btn" ${attr}>Utiliser</button>` : buyBtn(attr, price);
const SHOP_CATS = { oeufs: '🥚 Œufs', accessoires: '👗 Accessoires', decor: '🏠 Décor', chambres: '🛏️ Chambres', vues: '🪟 Vues', ambiances: '🎧 Ambiances', utilitaires: '🧰 Utilitaires' };
const SHOP = {
  oeufs: () => `<p class="hint">Un œuf éclot après un temps de révision et donne un compagnon que tu n'as pas encore. Il se couve dans l'onglet Collection.</p><div class="grid">` +
    Object.entries(EGGS).map(([k, E]) => card(`<span class="egg-icon" style="--r:${E.color}">🥚</span>`, E.name,
      `Éclot après ${E.min / 60} h de révision<br>${Object.entries(E.odds).map(([r, p]) => `${RARITY[r].name} ${Math.round(p * 100)} %`).join(' · ')}`,
      buyBtn(`data-egg="${k}"`, E.price))).join('') + '</div>',
  accessoires: () => {
    if (!S.partner) dressing = 'main';
    const eq = dressing === 'partner' ? S.partnerEquip : S.equip, wearer = dressing === 'partner' ? 'pingouine' : S.species;
    return (S.partner ? `<div class="modes who">Habiller :
        <button data-dress="main" class="${dressing === 'main' ? 'active' : ''}">${esc(nameOf(S.species))}</button>
        <button data-dress="partner" class="${dressing === 'partner' ? 'active' : ''}">${esc(nameOf('pingouine'))}</button></div>` : '') +
      Object.entries(SLOTS).map(([slot, title]) => `<h3 class="slot-title">${title}</h3><div class="grid">` +
        Object.entries(COSMETICS).filter(([, c]) => c.slot === slot).map(([id, c]) => {
          const pv = `<button class="preview-btn ${tryOn?.id === id && tryOn.who === dressing ? 'trying' : ''}" data-try="${id}" aria-label="Essayer : ${c.name}">${petSVG(wearer, { [slot]: id })}</button>`;
          return c.lock && !S.owned.includes(id) ? card(pv, c.name, `🔒 ${c.lock}`, '', 'locked-item')
            : shopItem(pv, c.name, `data-cos="${id}"`, S.owned.includes(id), eq[slot] === id, c.price, 'Retirer', 'Porter');
        }).join('') + '</div>').join('');
  },
  decor: () => '<div class="grid">' + Object.entries(DECOR).map(([id, d]) =>
    shopItem(`<button class="preview-btn ${tryDecor === id ? 'trying' : ''}" data-try-decor="${id}" aria-label="Essayer : ${d.name}">${d.rug ? `<span class="rug-swatch" style="background:${d.rug}"></span>` : `<span class="emoji">${d.icon}</span>`}</button>`,
      d.name, `data-decor="${id}"`, S.decor.owned.includes(id), S.decor.on.includes(id), d.price, 'Ranger', 'Placer')).join('') + '</div>',
  ambiances: () => '<p class="hint">Clique sur une icône pour écouter un extrait. Le volume se règle dans l\'onglet Réviser.</p><div class="grid">' +
    Object.entries(AMBIANCES).map(([k, a]) => card(`<button class="preview-btn" data-listen="${k}" aria-label="Écouter : ${a.name}"><span class="emoji">${a.icon}</span></button>`,
      a.name, a.desc, S.sounds.includes(k) ? '<span class="owned">✓ Possédé</span>' : buyBtn(`data-sound="${k}"`, a.price))).join('') + '</div>',
  utilitaires: () => '<div class="grid">' + card('<span class="emoji">🧊</span>', 'Gel de série', `Protège ta série un jour sans révision. Réserve : ${S.freezes} / ${CFG.freezeMax}`,
      S.freezes >= CFG.freezeMax ? '<span class="owned">✓ Réserve pleine</span>' : buyBtn('data-freeze', CFG.freezePrice)) + '</div>' +
    '<h3 class="slot-title">🎨 Thèmes de couleurs</h3><p class="hint">Clique sur une pastille pour essayer. Le mode nuit reste gratuit (bouton 🌙 en haut).</p><div class="grid">' +
    Object.entries(THEMES).map(([k, t]) => card(`<button class="preview-btn ${tryTheme === k ? 'trying' : ''}" data-try-theme="${k}" aria-label="Essayer le thème ${t.name}"><span class="swatch" style="--r:${t.color}"></span></button>`, t.name, '',
      useBtn(S.themes.includes(k), S.theme === k, `data-theme="${k}"`, t.price))).join('') + '</div>',
  chambres: () => '<p class="hint">Clique sur une chambre pour l\'essayer dans l\'aperçu.</p><div class="grid">' + Object.entries(ROOMS).map(([k, r]) =>
    card(`<button class="preview-btn ${tryRoom === k ? 'trying' : ''}" data-try-room="${k}" aria-label="Essayer : ${r.name}"><span class="room-swatch" data-chambre="${k}"><span class="wall"></span><span class="floor"></span></span></button>`,
      r.name, r.desc, useBtn(S.rooms.includes(k), S.room === k, `data-room="${k}"`, r.price))).join('') + '</div>',
  vues: () => '<p class="hint">Clique sur une vue pour la voir dans la fenêtre de l\'aperçu.</p><div class="grid">' + Object.entries(VIEWS).map(([k, v]) =>
    card(`<button class="preview-btn ${tryView === k ? 'trying' : ''}" data-try-view="${k}" aria-label="Essayer : ${v.name}"><span class="emoji">${v.icon}</span></button>`,
      v.name, v.desc, useBtn(S.views.includes(k), S.view === k, `data-view="${k}"`, v.price))).join('') + '</div>',
};
function equipOrBuy(listKey, curKey, id, item) { // achète si besoin, puis utilise (thèmes, chambres, vues)
  if (!S[listKey].includes(id)) { if (!buy(item.price, item.name)) return; S[listKey].push(id); }
  S[curKey] = id; save(); renderAll();
}
function renderShop() {
  const tc = tryOn && COSMETICS[tryOn.id], withTry = (eq, who) => tc && tryOn.who === who ? { ...eq, [tc.slot]: tryOn.id } : eq;
  $('#decoScene').dataset.chambre = tryRoom || S.room;
  $('#decoScene .room').innerHTML = roomHTML(tryDecor, withTry(S.equip, 'main'), withTry(S.partnerEquip, 'partner'), tryView || S.view);
  VILLE.sync();
  const td = tryDecor && DECOR[tryDecor];
  $('#decoNote').innerHTML = [td && `🏠 Essai : ${td.name} <button class="link" data-try-decor="${tryDecor}">Retirer l'essai</button>`,
    tryRoom && `🛏️ Essai : ${ROOMS[tryRoom].name} <button class="link" data-try-room="${tryRoom}">Retirer l'essai</button>`,
    tryView && `🪟 Essai : ${VIEWS[tryView].name} <button class="link" data-try-view="${tryView}">Retirer l'essai</button>`,
    tc && `👗 Essai : ${tc.name} <button class="link" data-try="${tryOn.id}">Retirer l'essai</button>`].filter(Boolean).join('<br>');
  $('#shopCats').innerHTML = Object.entries(SHOP_CATS).map(([k, l]) => `<button data-cat="${k}" class="${shopCat === k ? 'active' : ''}">${l}</button>`).join('');
  $('#shopItems').innerHTML = SHOP[shopCat]();
}

function renderAch() {
  $('#achCount').textContent = `${S.ach.length} / ${ACH.length}`;
  $('#achList').innerHTML = ACH.map(a => {
    const done = S.ach.includes(a.id), v = Math.min(a.val(), a.goal), r = done ? 1 : v / a.goal;
    return `<div class="ach ${done ? 'done' : ''}"><span class="ach-icon" aria-hidden="true">${a.icon}</span><div class="info"><b>${a.name}</b> · <small>${a.desc}</small>
      <div class="progress" role="progressbar" aria-label="${a.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r * 100)}"><i style="width:${r * 100}%"></i></div>
      <small>${done ? '✅ Débloqué' : `${Math.floor(v)} / ${a.goal}`} · 🎁 ${rewardText(a.reward)}</small></div></div>`;
  }).join('');
}

// achat : confirmation, débit, petite animation de la bourse
function buy(price, name) {
  if (S.coins < price || !confirm(`Acheter « ${name} » pour ${price} 🪙 ?`)) return false;
  addCoins(-price, `Achat : ${name}`); S.bought++;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) $('.coins').animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], { duration: 450, easing: 'ease-out' });
  return true;
}
function hatch(i) { // tire une rareté, puis un compagnon pas encore possédé
  const e = S.eggs[i], E = EGGS[e?.type];
  if (!e || e.min < E.min) return;
  const free = r => COLL.filter(k => SPECIES[k].rarity === r && SPECIES[k].egg !== false && !S.pets.includes(k));
  let roll = Math.random();
  const rar = Object.keys(E.odds).find(r => (roll -= E.odds[r]) < 0) ?? Object.keys(E.odds).at(-1);
  const pool = free(rar).length ? free(rar) : Object.keys(E.odds).flatMap(free); // rareté complète : une autre de l'œuf
  const k = pool[Math.floor(Math.random() * pool.length)];
  S.eggs.splice(i, 1); S.hatched++;
  let msg;
  if (k) { S.pets.push(k); msg = `Bienvenue à ${nameOf(k)} ! (${SPECIES[k].name}, ${RARITY[SPECIES[k].rarity].name})`; }
  else { const back = Math.round(E.price / 2); addCoins(back, `${E.name} : doublon remboursé`); msg = `Tous les compagnons de cet œuf sont déjà avec toi : +${back} 🪙`; }
  save(); renderAll();
  $('#hatchStage').innerHTML = `<span class="egg-icon big shake" style="--r:${E.color}">🥚</span>`;
  $('#hatchMsg').textContent = 'Il se passe quelque chose…';
  $('#hatchDlg').showModal();
  setTimeout(() => {
    $('#hatchStage').innerHTML = k ? `<div class="pop">${petSVG(k)}</div>` : '<span class="pop">🪙</span>';
    $('#hatchMsg').textContent = msg;
  }, 1600);
}

function renderAll() { checkAch(); renderHeader(); renderStudy(); renderCompanions(); renderShop(); renderGarden(); renderMissions(); renderSubjects(); renderStats(); renderAch(); renderTools(); renderSettings(); renderFriend(); renderTimer(); }

// ---------- Actions ----------
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const ds = b.dataset;

  if (ds.tab) {
    if (tryTheme) { tryTheme = null; renderHeader(); }
    $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === ds.tab));
  }
  if (ds.mode && ds.mode !== T.mode) {
    finish(); T.mode = ds.mode; T.count = 0;
    setPhase('work'); renderStudy();
  }
  if (b.id === 'startBtn') start();
  if (b.id === 'stopBtn') finish();
  if (b.id === 'focusBtn') {
    const on = document.body.classList.toggle('focus');
    b.textContent = on ? '↩️ Quitter la concentration' : '🎯 Concentration';
  }
  if (ds.result || ds.feel) { // bilan de fin de session
    const key = ds.result ? 'result' : 'feel', s = S.sessions.at(-1);
    s[key] = s[key] === ds[key] ? null : ds[key];
    const todo = s.result === 'oui' && S.todos.find(t => !t.done && t.text === s.goal);
    if (todo) { todo.done = true; toast(`✅ Tâche cochée : ${todo.text}`); renderTools(); }
    b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b && s[key] !== null));
    save(); renderStats();
  }
  if ('debriefOk' in ds) $('#debrief').close();
  if (b.id.startsWith('nightBtn')) { S.night = !S.night; save(); renderHeader(); }
  if ('talk' in ds) {
    talk(); renderTimer();
    const a = animOf(S.species); // animation débloquée par l'amitié
    if (a) { b.classList.remove(`anim-${a}`); void b.offsetWidth; b.classList.add(`anim-${a}`); setTimeout(() => b.classList.remove(`anim-${a}`), 1300); }
  }

  if ('preview' in ds) { preview = ds.preview || null; renderCompanions(); }
  if (ds.try) { tryOn = tryOn?.id === ds.try && tryOn.who === dressing ? null : { id: ds.try, who: dressing }; renderShop(); }
  if (ds.dress) { dressing = ds.dress; tryOn = null; renderShop(); }
  if (ds.cat) { shopCat = ds.cat; renderShop(); }
  if (ds.range) { statRange = +ds.range; renderStats(); }
  if (ds.examDel) { S.exams = S.exams.filter(x => x.id != ds.examDel); save(); renderAll(); }
  if (ds.todo) { const t = S.todos.find(t => t.id == ds.todo); t.done = !t.done; save(); renderTools(); }
  if (ds.todoDel) { S.todos = S.todos.filter(t => t.id != ds.todoDel); save(); renderTools(); }
  if (ds.todoGoal) {
    if (T.started && T.phase === 'work') return toast('Une session est déjà en cours : termine-la d\'abord 🍅');
    $('#goalInput').value = S.todos.find(t => t.id == ds.todoGoal).text;
    $('[data-tab=study]').click(); toast('🎯 Objectif prêt, il ne reste qu\'à démarrer !');
  }
  if (ds.flash) {
    const c = S.cards.find(c => c.id === flash);
    if (ds.flash === 'show') flashShow = true;
    else { c.box = ds.flash === 'ok' ? Math.min(c.box + 1, 4) : 0; nextCard(); save(); }
    renderTools();
  }
  if (ds.cardDel) { S.cards = S.cards.filter(c => c.id != ds.cardDel); save(); renderTools(); }
  if (b.id === 'exportBtn') exportSave();
  if (b.id === 'importBtn') $('#importFile').click();
  if (ds.tutoPick) { tuto.pick = ds.tutoPick; tuto.name = null; renderTuto(); }
  if ('tutoNext' in ds) {
    if (tuto.step === 1) tuto.name = $('#tutoName').value.trim();
    if (tuto.step < 2) { tuto.step++; renderTuto(); } else finishTuto();
  }
  if (ds.egg) {
    const E = EGGS[ds.egg];
    if (!buy(E.price, E.name)) return;
    S.eggs.push({ type: ds.egg, min: 0 }); toast(`🥚 ${E.name} ajouté à ta couveuse (onglet Collection)`); save(); renderAll();
  }
  if (ds.hatch) hatch(+ds.hatch);
  if ('hatchOk' in ds) $('#hatchDlg').close();
  if (ds.listen) { const k = ds.listen, v = S.vol[k] || 0; setVol(k, 0.6); setTimeout(() => setVol(k, v), 4000); }
  if (ds.sound) {
    const a = AMBIANCES[ds.sound];
    if (S.sounds.includes(ds.sound) || !buy(a.price, a.name)) return;
    S.sounds.push(ds.sound); toast(`${a.icon} ${a.name} : règle son volume dans l'onglet Réviser`); save(); renderAll();
  }
  if ('freeze' in ds) {
    if (S.freezes >= CFG.freezeMax || !buy(CFG.freezePrice, 'Gel de série')) return;
    S.freezes++; toast('🧊 Gel de série en réserve'); save(); renderAll();
  }
  if (ds.tryTheme) { tryTheme = tryTheme === ds.tryTheme ? null : ds.tryTheme; renderHeader(); renderShop(); }
  if (ds.theme) { tryTheme = null; equipOrBuy('themes', 'theme', ds.theme, { ...THEMES[ds.theme], name: `Thème ${THEMES[ds.theme].name}` }); }
  if (ds.tryRoom) { tryRoom = tryRoom === ds.tryRoom ? null : ds.tryRoom; renderShop(); }
  if (ds.tryView) { tryView = tryView === ds.tryView ? null : ds.tryView; renderShop(); }
  if (ds.room) { tryRoom = null; equipOrBuy('rooms', 'room', ds.room, ROOMS[ds.room]); }
  if (ds.view) { tryView = null; equipOrBuy('views', 'view', ds.view, VIEWS[ds.view]); }
  if (ds.cos) {
    const c = COSMETICS[ds.cos], eq = dressing === 'partner' ? S.partnerEquip : S.equip;
    if (!S.owned.includes(ds.cos)) {
      if (c.lock || !buy(c.price, c.name)) return;
      S.owned.push(ds.cos); eq[c.slot] = ds.cos; tryOn = null;
      bubble = dressing === 'partner' ? `${nameOf('pingouine')} adore ${c.name.toLowerCase()} 💕` : `Merci pour ${c.name.toLowerCase()} ! 💕`;
      toast(`${c.name} acheté !`);
    } else eq[c.slot] = eq[c.slot] === ds.cos ? null : ds.cos;
    save(); renderAll();
  }
  if (ds.adopt) {
    const k = ds.adopt, P = SPECIES[k];
    if (!S.pets.includes(k)) {
      if (P.price == null || !buy(P.price, P.name)) return;
      S.pets.push(k); toast(`Bienvenue à ${nameOf(k)} ! 🎉`);
    }
    S.species = k; preview = null; talk(); save(); renderAll();
  }
  if ('partner' in ds && !S.partner) {
    if (!buy(PARTNER_PRICE, nameOf('pingouine'))) return;
    S.partner = true; preview = null;
    bubble = `${nameOf('pingouine')} est là ! Je suis trop content 💕`; toast(`${nameOf('pingouine')} a rejoint ta pièce 💕`);
    save(); renderAll();
  }
  if (ds.tryDecor) { tryDecor = tryDecor === ds.tryDecor ? null : ds.tryDecor; renderShop(); }
  if (ds.decor) {
    tryDecor = null;
    const id = ds.decor, d = DECOR[id];
    if (!S.decor.owned.includes(id)) {
      if (!buy(d.price, d.name)) return;
      S.decor.owned.push(id); toast(`${d.name} acheté !`);
    } else if (S.decor.on.includes(id)) { S.decor.on = S.decor.on.filter(x => x !== id); save(); return renderAll(); }
    if (d.rug) S.decor.on = S.decor.on.filter(x => !DECOR[x].rug); // un seul tapis à la fois
    S.decor.on.push(id); save(); renderAll();
  }

  if (ds.seed) { selSeed = selSeed === ds.seed ? null : ds.seed; renderGarden(); }
  if (ds.buy) {
    const price = priceOf(PLANTS[ds.buy]);
    if (S.coins < price) return;
    addCoins(-price, `Graine : ${PLANTS[ds.buy].name}`); S.inv[ds.buy] = (S.inv[ds.buy] || 0) + 1;
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
      addCoins(gain, `Récolte : ${P.name}`); S.plots[i] = null; dayStats().harvests++; S.harvested++;
      toast(`${P.stages[2]} Récolte : +${gain} 🪙`);
    }
    save(); renderAll();
  }
  if (ds.claim) {
    const d = dayStats(), m = MISSION_POOL.find(x => x.id === ds.claim);
    if (d.claimed.includes(m.id)) return;
    const gain = m.reward * (eventOf(today()).missionMult || 1);
    addCoins(gain, `Mission : ${m.text}`); d.claimed.push(m.id);
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

$('#examForm').addEventListener('submit', e => {
  e.preventDefault();
  const date = $('#examDate').value, hours = Math.round(+$('#examHours').value), sub = +$('#examSub').value;
  if (!sub) return toast('Ajoute d\'abord une matière (onglet Matières) 📚');
  if (!date || daysTo(date) < 1) return toast('Choisis une date à partir de demain 📅');
  if (!(hours >= 1 && hours <= 200)) return toast('Objectif : entre 1 et 200 heures');
  S.exams.push({ id: Date.now(), sub, date, hours, from: today() }); save(); renderAll();
});
$('#todoForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#todoText').value.trim(); if (!text) return;
  S.todos.push({ id: Date.now(), text, done: false }); $('#todoText').value = ''; save(); renderTools();
});
$('#cardForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#cardQ').value.trim(), a = $('#cardA').value.trim(); if (!q || !a) return;
  S.cards.push({ id: Date.now(), sub: +$('#cardSub').value || null, q, a, box: 0 });
  $('#cardQ').value = $('#cardA').value = ''; $('#cardQ').focus(); save(); renderTools();
});
let notesTimer;
$('#notes').addEventListener('input', e => { S.notes = e.target.value; clearTimeout(notesTimer); notesTimer = setTimeout(save, 400); });
$('#weekGoal').addEventListener('change', e => {
  const v = Math.round(+e.target.value);
  if (v >= 1 && v <= 80) { S.weekGoal = v; save(); }
  renderStats();
});
$('#fontSize').addEventListener('change', e => { S.font = +e.target.value; save(); renderHeader(); });
$('#importFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importSave(f); });
$('#tuto').addEventListener('cancel', e => e.preventDefault()); // le tutoriel se termine par ses boutons

$('#presetSelect').addEventListener('change', e => {
  S.cfg.preset = e.target.value; save(); renderStudy();
  if (!T.started) setPhase(T.phase);
});
$$('[data-cfg]').forEach(i => i.addEventListener('change', () => {
  const v = Math.round(+i.value);
  if (!(v >= +i.min && v <= +i.max)) return renderStudy();
  S.cfg[i.dataset.cfg] = v; save();
  if (!T.started) setPhase(T.phase);
}));

document.addEventListener('click', e => e.target.matches('canvas.ville') && VILLE.click(e));

document.addEventListener('change', e => {
  const ds = e.target.dataset, sub = S.subjects.find(s => s.id == (ds.subName || ds.subColor));
  if (sub) {
    if (ds.subName) sub.name = e.target.value.trim() || sub.name; else sub.color = e.target.value;
    save(); return renderAll();
  }
  const sp = e.target.id === 'petName' ? selPet() : e.target.id === 'partnerName' ? 'pingouine' : null;
  if (!sp) return;
  S.names[sp] = e.target.value.trim() || SPECIES[sp].dflt; talk(); save(); renderAll();
});
if (S.pet && !S.names.pingouin) S.names.pingouin = S.pet; // ancien format de sauvegarde
setInterval(() => { applyDecay(); renderTimer(); }, 60000); // passage de minuit, état du compagnon

// ambiance : le navigateur n'autorise le son qu'après un clic, on relance les volumes sauvegardés à ce moment-là
$$('[data-vol]').forEach(r => {
  r.value = S.vol[r.dataset.vol];
  r.addEventListener('input', () => { setVol(r.dataset.vol, +r.value); save(); });
});
document.body.style.setProperty('--rain', S.vol.rain ? 0.4 + S.vol.rain * 0.6 : 0);
$('#alertVol').value = S.alertVol;
$('#alertVol').addEventListener('change', e => { S.alertVol = +e.target.value; save(); beep(); });
addEventListener('pointerdown', () => Object.entries(S.vol).forEach(([k, v]) => setVol(k, v)), { once: true });


// pétales décoratifs
$('.petals').innerHTML = Array.from({ length: 14 }, (_, i) =>
  `<span style="left:${Math.random() * 100}vw;font-size:${14 + Math.random() * 14}px;animation-duration:${12 + Math.random() * 14}s;animation-delay:-${Math.random() * 20}s">${['🌸', '🍃', '🌼', '🍀'][i % 4]}</span>`).join('');

// vérifications rapides
console.assert(new Set(missionsOf('2026-11-23').map(m => m.id)).size === 3, 'missions distinctes');
console.assert(fmt(65) === '01:05' && fmt(3661) === '1:01:01', 'fmt');
console.assert(levelOf(0) === 1 && levelOf(49) === 1 && levelOf(50) === 2 && levelOf(1500) === 10, 'levelOf');
console.assert(COLL.length === 12 && ACH.length >= 20 && new Set(ACH.map(a => a.id)).size === ACH.length, 'collection et succès');
console.assert(Object.values(EGGS).every(E => Math.abs(Object.values(E.odds).reduce((a, b) => a + b) - 1) < 1e-9), 'probabilités des œufs');
console.assert(fmtMin(59) === '59 min' && fmtMin(125) === '2 h 05', 'fmtMin');

// ids inconnus (sauvegarde importée ou ancienne) : on les retire plutôt que de planter
S.pets = S.pets.filter(k => SPECIES[k]?.rarity); if (!S.pets.length) S.pets = ['pingouin'];
if (!S.pets.includes(S.species)) S.species = S.pets[0];
S.owned = S.owned.filter(id => COSMETICS[id]);
for (const eq of [S.equip, S.partnerEquip]) for (const k in eq) if (eq[k] && !COSMETICS[eq[k]]) eq[k] = null;
S.decor.owned = S.decor.owned.filter(id => DECOR[id]); S.decor.on = S.decor.on.filter(id => DECOR[id]);
S.eggs = S.eggs.filter(e => EGGS[e?.type]); S.sounds = S.sounds.filter(k => AMBIANCES[k]);
S.plots = S.plots.map(p => p && PLANTS[p.type] ? p : null);
if (!THEMES[S.theme]) S.theme = 'lavande';
// anciennes couleurs pastel des matières -> palette de la ville
const OLD_PAL = ['#f29bb5', '#93d0b4', '#bba9ea', '#f6c177', '#8fb6ec', '#f5a888'];
S.subjects.forEach(x => { const i = OLD_PAL.indexOf(String(x.color).toLowerCase()); if (i >= 0) x.color = PALETTE[i]; });
S.rooms = S.rooms.filter(k => ROOMS[k]); if (!ROOMS[S.room]) S.room = 'douce';
S.views = S.views.filter(k => VIEWS[k]); if (!VIEWS[S.view]) S.view = 'ciel';

applyDecay(); // avant la reprise du minuteur, qui peut terminer une session et effacer l'absence
// reprise du minuteur après un rechargement
let savedT = null;
try { savedT = JSON.parse(store.raw('jardin_timer')); } catch {}
renderStudy(); // remplit la liste des matières avant de restaurer celle de la session
if (savedT) {
  Object.assign(T, savedT, { id: null });
  if (T.running && T.mode === 'chrono') T.running = false; // le chrono ne compte pas le temps où la page était fermée
  if (T.sub) $('#subjectSelect').value = T.sub;
  $('#goalInput').value = T.goal || '';
  if (T.running) { T.id = setInterval(tick, 250); tick(); } // le premier tick rattrape le temps écoulé
} else setPhase('work');
if (!bubble) say(absentDays() >= CFG.graceDays ? 'back' : nextExam() && daysTo(nextExam().date) <= 7 ? 'exam' : 'idle');
if (new Date().getDay() === 1 && S.reviewSeen !== today() && S.sessions.length) { // le lundi, le compagnon annonce son bilan
  S.reviewSeen = today(); bubble = 'J\'ai préparé ton bilan de la semaine, il t\'attend dans 📊 Stats !'; save();
}
renderAll();
if (firstRun) { renderTuto(); $('#tuto').showModal(); }
