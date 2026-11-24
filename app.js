const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// ---------- Équilibrage (toutes les valeurs de gains, plafonds et seuils) ----------
const CFG = {
  minSession: 5,        // min : en dessous, une session abandonnée garde ses pièces mais n'entre pas dans l'historique
  chronoFull: 25,       // min : un chrono terminé compte comme session complète à partir de là
  coinsFull: 10,        // pièces bonus par session complète (sans abandon)
  coinsPerDay: 300,     // plafond de pièces gagnées en révisant, par jour
  paPerMin: 1,          // 10 min de révision = 10 PA = 10 % d'un niveau d'amitié (100 PA)
  decayHours: 15, decayRate: 0.25, // absence : -25 % des PA toutes les 15 h sans réviser
  pauseFree: 10, pausePenalty: 1, // pause pendant le travail : au-delà de 10 min par session, -1 pièce par minute
  boostPrice: 60, boostMin: 60, // accélérateur d'œuf : 60 pièces = 1 h de couvaison
  eventDays: 7,         // un événement par mois, du 1er au 7
  freezeMax: 2, freezePrice: 150, // gels de série
  txMax: 200,           // lignes gardées dans l'historique des pièces
  examSoon: 14,         // jours : le compagnon parle de l'examen à partir de là
};
const LEVELS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]; // PA cumulés pour atteindre les niveaux 1 à 10 (100 PA = 100 min par niveau)
// Série = jours d'affilée où le joueur coche « Je suis là » ; récompenses quand la série atteint ces paliers
const STREAK_REWARDS = { 7: { coins: 50 }, 14: { boost: 1 }, 30: { pet: 'hibou' }, 90: { coins: 500 } };
const levelOf = pa => LEVELS.filter(x => pa >= x).length;
const PRESETS = { classique: [25, 5, 15], long: [50, 10, 20], intense: [90, 20, 30] }; // travail, pause, grande pause

// ---------- Données du jeu ----------
// Un événement par mois, qui dure une semaine (CFG.eventDays) ; le reste du mois, CALM
const CALM = { icon: '🍃', name: 'Semaine calme', desc: 'Rien de spécial… parfait pour se concentrer.', calm: true };
const EVENTS = [
  { icon: '🥚', name: 'Couvaison express', desc: 'Tes œufs couvent 2× plus vite.', eggMult: 2 },
  { icon: '☀️', name: 'Soleil doré', desc: '+50 % de pièces par minute révisée.', coinMult: 1.5 },
  { icon: '💗', name: 'Fête de l\'amitié', desc: 'Tu gagnes 2× plus d\'amitié.', paMult: 2 },
  { icon: '🌈', name: 'Arc-en-ciel', desc: 'Pièces ×1,5 et couvaison ×1,5 !', coinMult: 1.5, eggMult: 1.5 },
  { icon: '🌙', name: 'Nuit étoilée', desc: 'Les récompenses de missions sont doublées.', missionMult: 2 },
];

const MISSION_POOL = [
  { id: 'min25',  text: 'Réviser 25 minutes',              key: 'minutes',  goal: 25,  reward: 15 },
  { id: 'min60',  text: 'Réviser 1 heure',                 key: 'minutes',  goal: 60,  reward: 35 },
  { id: 'min120', text: 'Réviser 2 heures',                key: 'minutes',  goal: 120, reward: 70 },
  { id: 'pomo2',  text: 'Terminer 2 pomodoros',            key: 'pomos',    goal: 2,   reward: 20 },
  { id: 'pomo4',  text: 'Terminer 4 pomodoros',            key: 'pomos',    goal: 4,   reward: 40 },
  { id: 'subj2',  text: 'Réviser 2 matières différentes',  key: 'subjects', goal: 2,   reward: 25 },
];

const today = () => new Date().toLocaleDateString('sv'); // AAAA-MM-JJ, heure locale
const dayNum = d => Math.floor(Date.parse(d) / 864e5);
const monthEvent = d => { const [y, m] = d.split('-').map(Number); return EVENTS[(y * 12 + m) % EVENTS.length]; };
const eventOf = d => +d.slice(8) <= CFG.eventDays ? monthEvent(d) : CALM;
function missionsOf(d) { // 3 missions différentes, les mêmes toute la journée
  let n = dayNum(d); const pool = [...MISSION_POOL], out = [];
  for (let i = 0; i < 3; i++) { n = (n * 9301 + 49297) % 233280; out.push(pool.splice(n % pool.length, 1)[0]); }
  return out;
}
const dayOffset = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv'); }; // setDate : juste même aux changements d'heure
const fmt = s => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60, p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};
const fmtMin = m => (m = Math.round(m)) >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;

// ---------- Stockage ----------
// Seul endroit qui touche localStorage. La copie en ligne (compte Supabase) est gérée plus bas, dans « Compte en ligne ».
const store = {
  raw: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

// ---------- Sauvegarde ----------
const DEFAULT = {
  version: 1, // à incrémenter avec une migration quand la forme des données change
  coins: 15,
  subjects: [{ id: 1, name: 'Maths', color: '#FF8FE6', min: 0 }],
  carry: 0, totalMin: 0, cfg: { preset: 'classique', work: 25, short: 5, long: 15, libre: 45, rounds: 4 }, day: null,
  friend: {}, lastStudy: today(), lastStudyAt: null, decayed: 0, boosts: 0, streak: { cur: 0, best: 0, last: null }, sessions: [], alertVol: 0.5,
  owned: [], equip: { tete: null, yeux: null, cou: null }, partnerEquip: { tete: null, yeux: null, cou: null },
  species: 'pingouin', pets: ['pingouin'], names: {}, partner: false,
  decor: { owned: ['etagere', 'plante', 'tapisLav'], on: ['etagere', 'plante', 'tapisLav'] },
  night: matchMedia('(prefers-color-scheme: dark)').matches, vol: { lofi: 0, rain: 0, wind: 0, cars: 0, cafe: 0, foret: 0 },
  eggs: [], hatched: 0, ach: [], freezes: 0, bought: 0,
  sounds: ['lofi', 'rain', 'wind', 'cars'], theme: 'lavande', themes: ['lavande'],
  room: 'douce', rooms: ['douce'], season: '', view: 'ciel', views: ['ciel'],
  tx: [], weekGoal: 5, exams: [], todos: [], cards: [], notes: '', font: 1, reviewSeen: null, pos: {},
};
let S;
const rawSave = store.raw('jardin'), firstRun = !rawSave;
try { S = { ...structuredClone(DEFAULT), ...JSON.parse(rawSave || '{}') }; }
catch { S = structuredClone(DEFAULT); store.set('jardin_corrompu', rawSave); } // garde une copie avant d'écraser
S.cfg = { ...DEFAULT.cfg, ...S.cfg }; S.vol = { ...DEFAULT.vol, ...S.vol }; delete S.mood; delete S.moodAt; // anciens formats de sauvegarde
const loadedAt = S.savedAt || 0; // date de la copie chargée, avant toute modification au démarrage
let saveWarned = false;
const save = () => { // localStorage peut être plein ou indisponible (navigation privée…) : on prévient une fois
  S.savedAt = Date.now(); // sert à savoir quelle copie est la plus récente (cet appareil ou le compte en ligne)
  if (!store.set('jardin', JSON.stringify(S)) && !saveWarned) { saveWarned = true; toast('⚠️ Sauvegarde impossible dans ce navigateur : pense à exporter tes données (Réglages)'); }
  if (auth) { clearTimeout(pushT); pushT = setTimeout(pushCloud, 4000); } // envoi groupé vers le compte
};

// ---------- Compte en ligne (Supabase : comptes e-mail + table « saves », voir supabase.sql) ----------
// À remplir avec Project Settings › API de ton projet : l'URL et la clé publique (anon / publishable). Vide = pas de compte en ligne.
const CLOUD = { url: 'https://vyxgjihjbukpwoytomux.supabase.co', key: 'sb_publishable_ydN79sJDSeJltvu5yjneWw_GGN8B6aq' }; // clé publique : faite pour être visible
const cloudOn = () => !!(CLOUD.url && CLOUD.key);
let auth = null, pushT = null, cloudMsg = ''; // auth = session { access, refresh, exp, email, id }, gardée dans localStorage['jardin_auth']
let cloudReady = false; // aucun envoi avant d'avoir comparé avec la copie en ligne (sinon un appareil en retard l'écraserait)
try { auth = cloudOn() && JSON.parse(store.raw('jardin_auth')) || null; } catch {}
async function sb(path, opts = {}) { // requête vers Supabase ; le jeton de session est joint quand on est connecté
  const headers = { apikey: CLOUD.key, 'Content-Type': 'application/json', ...(auth && !opts.anon ? { Authorization: `Bearer ${auth.access}` } : {}), ...opts.headers };
  const r = await fetch(CLOUD.url.replace(/\/$/, '') + path, { ...opts, headers });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(body?.msg || body?.error_description || body?.message || `erreur ${r.status}`), { status: r.status });
  return body;
}
function setAuth(t) { // t = réponse de /auth/v1/token ou /auth/v1/signup ; null = déconnexion
  auth = t && { access: t.access_token, refresh: t.refresh_token, exp: Date.now() + t.expires_in * 1000, email: t.user.email, id: t.user.id };
  store.set('jardin_auth', JSON.stringify(auth));
}
async function freshAuth() { // le jeton dure 1 h : on le renouvelle une minute avant
  if (auth && Date.now() > auth.exp - 60e3)
    setAuth(await sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', anon: true, body: JSON.stringify({ refresh_token: auth.refresh }) }));
}
const AUTH_ERR = { 'Invalid login credentials': 'E-mail ou mot de passe incorrect', 'Email not confirmed': 'Confirme d\'abord ton e-mail avec le lien reçu',
  'User already registered': 'Un compte existe déjà avec cet e-mail : connecte-toi' };
async function login(email, password, signup) {
  try {
    const t = await sb(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { method: 'POST', anon: true, body: JSON.stringify({ email, password }) });
    if (!t.access_token) return toast('📧 Compte créé ! Clique sur le lien reçu par e-mail, puis connecte-toi.'); // confirmation d'e-mail activée
    setAuth(t); $('#loginPass').value = ''; toast(`☁️ Connecté : ${auth.email}`);
    await pullCloud(true);
  } catch (e) { toast(`⚠️ ${AUTH_ERR[e.message] || e.message}`); }
}
function logout() { setAuth(null); clearTimeout(pushT); cloudMsg = ''; cloudReady = false; renderCloud(); }
// La copie la plus récente gagne (base = date de la copie locale à comparer). À la connexion, on demande plutôt,
// car un appareil neuf a une sauvegarde « récente » mais vide.
// shortcut: le dernier qui écrit gagne, sans fusion ; à revoir si on joue sur deux appareils ouverts en même temps.
async function pullCloud(atLogin, base = S.savedAt || 0) {
  if (!auth || !cloudOn()) return;
  try {
    await freshAuth();
    const [row] = await sb('/rest/v1/saves?select=data');
    const useCloud = row && (atLogin
      ? confirm(`Une sauvegarde existe déjà sur ton compte (${row.data.coins} 🪙, ${fmtMin(row.data.totalMin || 0)} de révision).\n\nOK : la charger sur cet appareil.\nAnnuler : la remplacer par la progression de cet appareil.`)
      : (row.data.savedAt || 0) > base);
    if (useCloud) {
      store.set('jardin', JSON.stringify(row.data));
      if (atLogin) store.set('jardin_timer', 'null'); // le minuteur en cours appartenait à l'autre sauvegarde
      return location.reload();
    }
    cloudReady = true;
    await pushCloud();
  } catch (e) { cloudFail(e); }
}
async function pushCloud() {
  clearTimeout(pushT);
  if (!auth || !cloudOn()) return;
  if (!cloudReady) return pullCloud(false, loadedAt); // la vérification du démarrage n'a pas abouti (hors ligne…) : on la refait d'abord
  try {
    await freshAuth();
    await sb('/rest/v1/saves', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: auth.id, data: S, updated_at: new Date().toISOString() }) });
    cloudMsg = `✅ Synchronisé à ${new Date().toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (e) { cloudFail(e); }
  renderCloud();
}
function cloudFail(e) { // session refusée : on se déconnecte ; sinon (hors ligne…) on garde tout sur l'appareil
  if (e.status === 401 || /refresh token|JWT/i.test(e.message)) { logout(); toast('🔒 Ta session a expiré : reconnecte-toi dans Réglages ⚙️'); }
  else cloudMsg = `⚠️ Synchro impossible pour l'instant (${e.message}). Tes données restent sur cet appareil.`;
  renderCloud();
}
function renderCloud() {
  $('#cloudOff').hidden = cloudOn(); $('#loginForm').hidden = !cloudOn() || !!auth; $('#cloudIn').hidden = !auth;
  if (auth) { $('#cloudWho').textContent = `Connecté : ${auth.email}`; $('#cloudStatus').textContent = cloudMsg || 'Synchronisation…'; }
}
function dayStats() {
  const d = today();
  if (!S.day || S.day.date !== d) S.day = { date: d, minutes: 0, pomos: 0, subjects: [], claimed: [] };
  S.day.coins ??= 0; S.day.sessions ??= 0;
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
  souris: { name: 'Souris', dflt: 'Gruyère', rarity: 'commun', body: '#d6cfe0', feet: '#f9c9a0',
    story: ['Gruyère habite derrière les étagères de la bibliothèque municipale.', 'La nuit, elle lit les livres que personne n\'emprunte, pour qu\'ils ne se sentent pas seuls.', 'Elle dit que les petits efforts, comme les petites souris, vont très loin.'],
    back: '<path d="M150 192Q198 198 186 158" fill="none" stroke-width="4"/>',
    ears: '<circle cx="56" cy="64" r="25" fill="#d6cfe0"/><circle cx="144" cy="64" r="25" fill="#d6cfe0"/><circle cx="56" cy="64" r="13" fill="#F4B5E8" stroke-width="2"/><circle cx="144" cy="64" r="13" fill="#F4B5E8" stroke-width="2"/>',
    belly: tummy('#f6f1fa'),
    face: '<ellipse cx="100" cy="115" rx="5" ry="4" fill="#FF8FE6" stroke="#2D1A62" stroke-width="2"/><path d="M60 112L76 114M60 120L76 118M140 112L124 114M140 120L124 118" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  mouton: { name: 'Mouton', dflt: 'Nuage', rarity: 'peuCommun', body: '#fbf7ff', feet: '#5b5372',
    story: ['Nuage compte les étudiants pour s\'endormir, au lieu de l\'inverse.', 'Sa laine est si douce qu\'on en fait des coussins pour les longues soirées de révision.', 'Il croit que tout s\'apprend en douceur, une boucle après l\'autre.'],
    ears: '<ellipse cx="42" cy="98" rx="20" ry="9" transform="rotate(-20 42 98)" fill="#5b5372"/><ellipse cx="158" cy="98" rx="20" ry="9" transform="rotate(20 158 98)" fill="#5b5372"/>',
    hair: '<g fill="#fbf7ff"><circle cx="84" cy="62" r="11"/><circle cx="100" cy="55" r="12"/><circle cx="116" cy="62" r="11"/></g>',
    belly: '<ellipse cx="100" cy="112" rx="32" ry="26" fill="#E7CFF5"/>' + tummy('#fffdfd'),
    face: '<path d="M94 116Q100 122 106 116" stroke="#2D1A62" stroke-width="2.5" fill="none" stroke-linecap="round"/>' },
  cochon: { name: 'Cochon', dflt: 'Rosette', rarity: 'peuCommun', body: '#F4B5E8', feet: '#e48fc8',
    story: ['Rosette adore se rouler dans… les fiches de révision bien rangées.', 'Elle a une tirelire en forme d\'humain, pour changer.', 'Son astuce : récompenser chaque chapitre fini par une petite fraise.'],
    back: '<path d="M158 182q18 -2 14 -14q-4 -9 -11 -3q-5 6 6 9" fill="none" stroke-width="3"/>',
    ears: '<path d="M56 86L58 48L90 66ZM144 86L142 48L110 66Z" fill="#F4B5E8"/>',
    belly: tummy('#FBE9FF'),
    face: '<ellipse cx="100" cy="121" rx="15" ry="10" fill="#FF8FE6" stroke="#2D1A62" stroke-width="2.5"/><circle cx="95" cy="121" r="2.5" fill="#2D1A62"/><circle cx="105" cy="121" r="2.5" fill="#2D1A62"/>' },
  poussin: { name: 'Poussin', dflt: 'Citron', rarity: 'peuCommun', body: '#FFD99A', feet: '#FFC46B',
    story: ['Citron est sorti de sa coquille un lundi matin, déjà prêt à apprendre.', 'Il pépie l\'alphabet à l\'envers pour impressionner ses amis.', 'Il trouve que chaque jour est une petite éclosion.'],
    hair: '<path d="M100 58Q92 40 99 34Q103 46 108 38Q112 52 100 58Z" fill="#FFD99A"/>',
    belly: tummy('#fff3d6'),
    face: '<path d="M93 113L107 113L100 123Z" fill="#FFC46B" stroke="#2D1A62" stroke-width="2.5" stroke-linejoin="round"/>' },
  chien: { name: 'Chien', dflt: 'Biscuit', rarity: 'peuCommun', body: '#e8c39e', feet: '#e8c39e',
    story: ['Biscuit rapporte les stylos que tu fais tomber sous le bureau.', 'Il a suivi un cours d\'obéissance et a fini premier de sa promo.', 'Pour lui, réviser c\'est comme une balade : on y va tous les jours.'],
    back: '<path d="M150 186Q184 178 180 148" fill="none" stroke-width="5"/>',
    ears: '<ellipse cx="40" cy="104" rx="15" ry="32" transform="rotate(18 40 104)" fill="#a87a5a"/><ellipse cx="160" cy="104" rx="15" ry="32" transform="rotate(-18 160 104)" fill="#a87a5a"/>',
    belly: tummy('#fbeedd'),
    face: '<ellipse cx="100" cy="116" rx="6" ry="4.5" fill="#2D1A62"/><path d="M100 120V125M93 127Q100 132 107 127" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M97 129Q100 137 103 129Z" fill="#FF8FE6" stroke="#2D1A62" stroke-width="1.5"/>' },
  abeille: { name: 'Abeille', dflt: 'Miel', rarity: 'peuCommun', body: '#FFD99A', feet: '#2D1A62',
    story: ['Miel butine les fleurs du jardin et les idées de tes cahiers.', 'Elle connaît une danse pour dire où trouver les meilleures formules.', 'Sa devise : travailler ensemble, c\'est plus sucré.'],
    back: '<ellipse cx="38" cy="116" rx="26" ry="15" transform="rotate(-30 38 116)" fill="#D9F7FF"/><ellipse cx="162" cy="116" rx="26" ry="15" transform="rotate(30 162 116)" fill="#D9F7FF"/>',
    ears: '<path d="M86 60Q78 36 66 34M114 60Q122 36 134 34" fill="none" stroke-width="3"/><circle cx="66" cy="34" r="6" fill="#2D1A62"/><circle cx="134" cy="34" r="6" fill="#2D1A62"/>',
    belly: '<path d="M44 150Q100 162 156 150L158 166Q100 178 42 166Z" fill="#2D1A62" stroke="none"/><path d="M50 184Q100 196 150 184L144 196Q100 208 56 196Z" fill="#2D1A62" stroke="none"/>',
    face: '<path d="M90 118Q100 126 110 118" stroke="#2D1A62" stroke-width="3" fill="none" stroke-linecap="round"/>' },
  loutre: { name: 'Loutre', dflt: 'Galet', rarity: 'epique', body: '#b08a6e', feet: '#8e6a52',
    story: ['Galet garde toujours son caillou préféré dans sa poche de fourrure.', 'Il fait la planche sur la rivière en relisant ses notes.', 'Il te tient la main quand les révisions font des vagues.'],
    back: '<path d="M146 190Q192 196 190 168Q170 184 148 178Z" fill="#b08a6e"/>',
    ears: '<circle cx="64" cy="70" r="10" fill="#b08a6e"/><circle cx="136" cy="70" r="10" fill="#b08a6e"/>',
    belly: tummy('#f2e1cc'),
    face: '<ellipse cx="100" cy="121" rx="18" ry="12" fill="#f2e1cc" stroke="#2D1A62" stroke-width="2.5"/><ellipse cx="100" cy="116" rx="6" ry="4" fill="#2D1A62"/><path d="M66 118L80 120M66 126L80 124M134 118L120 120M134 126L120 124" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  raton: { name: 'Raton laveur', dflt: 'Filou', rarity: 'epique', body: '#a9a3b8', feet: '#5b5372',
    story: ['Filou lave soigneusement chaque idée avant de la ranger dans sa tête.', 'Son masque n\'est pas pour se cacher : c\'est pour réviser incognito.', 'Il ne vole qu\'une chose : les minutes perdues, pour te les rendre.'],
    back: '<path d="M142 192Q194 200 190 156L176 162Q178 184 146 180Z" fill="#a9a3b8"/><path d="M178 166L190 164M176 180L190 182" stroke-width="5"/>',
    ears: '<path d="M54 92L58 46L92 66ZM146 92L142 46L108 66Z" fill="#a9a3b8"/><path d="M62 80L64 58L80 68ZM138 80L136 58L120 68Z" fill="#5b5372" stroke-width="2"/>',
    belly: tummy('#ecebf1') + '<path d="M62 102Q84 86 100 100Q116 86 138 102Q130 116 116 113Q100 106 84 113Q70 116 62 102Z" fill="#4B1A72" stroke="none"/>',
    face: '<circle cx="85.5" cy="102.5" r="1.8" fill="#fff"/><circle cx="117.5" cy="102.5" r="1.8" fill="#fff"/><ellipse cx="100" cy="120" rx="5" ry="3.5" fill="#2D1A62"/><path d="M100 123Q96 129 91 126M100 123Q104 129 109 126" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  licorne: { name: 'Licorne', dflt: 'Opaline', rarity: 'legendaire', body: '#FBE9FF', feet: '#E7CFF5',
    story: ['Opaline est née au bout d\'un arc-en-ciel, entre deux nuages de craie.', 'Sa corne s\'allume doucement quand quelqu\'un comprend enfin un exercice.', 'Elle n\'apparaît qu\'à ceux qui croient en leurs rêves… et en leurs fiches.'],
    ears: '<path d="M60 86L60 50L88 66ZM140 86L140 50L112 66Z" fill="#FBE9FF"/>',
    hair: '<path d="M94 60L100 20L106 60Z" fill="#FFD99A"/><path d="M96 48L104 44M95 55L105 51" stroke="#FFC46B" stroke-width="2"/><path d="M114 58Q140 50 142 74Q152 72 154 88Q138 86 130 76Z" fill="#FF8FE6"/>',
    belly: tummy('#fff7fd'),
    face: '<path d="M90 120Q100 128 110 120" stroke="#2D1A62" stroke-width="3" fill="none" stroke-linecap="round"/>' },
  phenix: { name: 'Phénix', dflt: 'Étincelle', rarity: 'legendaire', body: '#FFC46B', feet: '#FF8FE6',
    story: ['Étincelle renaît de ses cendres, et toi de tes mauvaises notes.', 'Ses plumes réchauffent la chambre les soirs d\'hiver.', 'Il sait qu\'un échec n\'est qu\'un nouveau départ, plus fort.'],
    back: '<path d="M48 112Q2 68 10 138Q26 124 40 144Z" fill="#FF8FE6"/><path d="M152 112Q198 68 190 138Q174 124 160 144Z" fill="#FF8FE6"/><path d="M140 196Q186 206 196 176Q178 182 168 172Q162 190 140 186Z" fill="#FF4FD8"/>',
    hair: '<path d="M92 58Q84 34 95 26Q98 42 104 30Q114 44 108 58Z" fill="#FF8FE6"/>',
    belly: tummy('#FFD99A'),
    face: '<path d="M94 115L106 115L100 127Z" fill="#FFD99A" stroke="#2D1A62" stroke-width="2.5" stroke-linejoin="round"/>' },
  kitsune: { name: 'Kitsune', dflt: 'Lumen', rarity: 'mythique', body: '#FBE9FF', feet: '#BFF6FF',
    story: ['Lumen est un esprit-renard qui veille sur les lanternes des bibliothèques.', 'Chaque queue représente cent ans de sagesse… et elle en a déjà trois.', 'Elle te prête un peu de sa lumière quand tes yeux fatiguent.'],
    back: '<g fill="#FBE9FF"><path d="M140 196Q200 196 194 140Q184 120 168 144Q166 180 140 186Z"/><path d="M140 196Q206 176 182 120Q168 104 160 132Q170 170 140 186Z" transform="rotate(-24 150 190)"/></g><path d="M194 140Q184 120 172 136Q182 142 194 140Z" fill="#4FE3FF" stroke-width="2.5"/>',
    ears: '<path d="M52 96L52 32L96 64ZM148 96L148 32L104 64Z" fill="#FBE9FF"/><path d="M58 80L58 46L80 62ZM142 80L142 46L120 62Z" fill="#8FF0FF" stroke-width="2"/>',
    belly: tummy('#ffffff'),
    face: '<path d="M74 92L66 86M126 92L134 86" stroke="#FF4FD8" stroke-width="3" stroke-linecap="round"/><ellipse cx="100" cy="116" rx="5" ry="3.5" fill="#2D1A62"/><path d="M100 119Q96 125 91 122M100 119Q104 125 109 122" stroke="#2D1A62" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  nebuleuse: { name: 'Chat cosmique', dflt: 'Nébuleuse', rarity: 'mythique', body: '#4B1A72', feet: '#7A2380',
    story: ['Nébuleuse est tombée d\'une étoile filante, un soir de grande révision.', 'Elle ronronne à la fréquence exacte de la concentration.', 'Dans sa fourrure, on peut voir toutes les constellations que tu as apprises.'],
    back: '<path d="M140 190Q190 194 184 146Q182 130 170 134Q174 172 138 176Z" fill="#4B1A72"/>',
    ears: '<path d="M52 96L56 40L96 64ZM148 96L144 40L104 64Z" fill="#4B1A72"/><path d="M62 84L63 56L84 68ZM138 84L137 56L116 68Z" fill="#FF4FD8"/>',
    belly: tummy('#7A2380') + `<path d="${star(82, 158, 6)}" fill="#FFD99A" stroke="none"/><path d="${star(116, 176, 5)}" fill="#FFD99A" stroke="none"/><circle cx="104" cy="148" r="2" fill="#BFF6FF" stroke="none"/><circle cx="88" cy="186" r="2" fill="#BFF6FF" stroke="none"/>`,
    face: '<circle cx="84" cy="104" r="7" fill="#4FE3FF"/><circle cx="116" cy="104" r="7" fill="#4FE3FF"/><circle cx="84" cy="104" r="3.5" fill="#110927"/><circle cx="116" cy="104" r="3.5" fill="#110927"/><path d="M96 113H104L100 118Z" fill="#FF8FE6"/><path d="M100 118Q96 124 91 121M100 118Q104 124 109 121M56 111L74 114M56 121L74 118M144 111L126 114M144 121L126 118" stroke="#D9BDEE" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  sylve: { name: 'Esprit du jardin', dflt: 'Sylve', rarity: 'mythique', body: '#BFF6FF', feet: '#8FF0FF',
    story: ['Sylve est née dans un pot de fleurs oublié sur le rebord de ta fenêtre.', 'Chaque minute de révision fait pousser une nouvelle feuille sur sa tête.', 'Le jour où tu réussiras ton examen, elle fleurira en entier.'],
    back: '<circle cx="30" cy="84" r="7" fill="#FFD99A"/><circle cx="172" cy="66" r="5" fill="#FFD99A"/><circle cx="182" cy="110" r="4" fill="#FFD99A"/>',
    hair: '<path d="M100 58V40" fill="none" stroke-width="3"/><path d="M100 44Q84 30 76 40Q88 50 100 44Z" fill="#a8d89a"/><path d="M100 40Q116 24 126 34Q112 46 100 40Z" fill="#a8d89a"/>',
    belly: tummy('#eafcff') + flowers([[100, 166]]),
    face: '<path d="M90 118Q100 126 110 118" stroke="#2D1A62" stroke-width="3" fill="none" stroke-linecap="round"/>' },
  // la petite amie du pingouin (pas adoptable, se débloque à part)
  pingouine: { name: 'Pingouine', dflt: 'Perle', body: '#cbbde6', feet: '#f9c9a0', belly: pengBelly,
    face: beak + '<path d="M78 100L74 96M81 98L79 93M122 100L126 96M119 98L121 93" stroke="#3b3550" stroke-width="2.2" stroke-linecap="round"/>',
    hair: '<g transform="translate(128 68)" fill="#f9cdd9" stroke="#2D1A62" stroke-width="2.5"><circle cx="-7" r="7"/><circle cx="7" r="7"/><circle cy="-7" r="7"/><circle cy="7" r="7"/><circle r="5" fill="#fde49a"/></g>' },
};
const PARTNER_PRICE = 250;
const RARITY = {
  commun: { name: 'Commun', color: '#D9F7FF' }, peuCommun: { name: 'Peu commun', color: '#8FF0FF' }, rare: { name: 'Rare', color: '#4FE3FF' },
  epique: { name: 'Épique', color: '#FF4FD8' }, legendaire: { name: 'Légendaire', color: '#FFC46B' }, mythique: { name: 'Mythique', color: '#FF8FE6' },
};
const RARITY_KEYS = Object.keys(RARITY);
const COLL = Object.keys(SPECIES).filter(k => SPECIES[k].rarity) // la collection (sans Perle), rangée par rareté
  .sort((a, b) => RARITY_KEYS.indexOf(SPECIES[a].rarity) - RARITY_KEYS.indexOf(SPECIES[b].rarity));
// Un œuf par rareté : il éclot après min minutes de révision (cumulées sur tous les œufs à la fois) et donne un compagnon de cette rareté
const EGGS = {
  commun:     { name: 'Œuf commun',     price: 100, min: 180,  color: RARITY.commun.color,     odds: { commun: 1 } },
  peuCommun:  { name: 'Œuf peu commun', price: 180, min: 360,  color: RARITY.peuCommun.color,  odds: { peuCommun: 1 } },
  rare:       { name: 'Œuf rare',       price: 300, min: 600,  color: RARITY.rare.color,       odds: { rare: 1 } },
  epique:     { name: 'Œuf épique',     price: 450, min: 900,  color: RARITY.epique.color,     odds: { epique: 1 } },
  legendaire: { name: 'Œuf légendaire', price: 650, min: 1200, color: RARITY.legendaire.color, odds: { legendaire: 1 } },
  mythique:   { name: 'Œuf mythique',   price: 900, min: 1440, color: RARITY.mythique.color,   odds: { mythique: 1 } },
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

// Dessin vectoriel d'une couche : 'base' (le corps et le visage, sans yeux ni joues), 'cos' (accessoires) ou 'book'.
// Le contour est tracé en MAGIC : pixPet() le reconnaît et le remplace par une teinte plus sombre de la couleur voisine.
const MAGIC = '#010203', PET_N = 32, PET_M = 35, PET_SS = 8; // 32 × 35 pixels, 8 × 8 points mesurés par pixel
function petVec(sp, eq, layer, wrap = true) {
  const P = SPECIES[sp], cos = s => eq[s] ? COSMETICS[eq[s]].svg : '', W = PET_N + 2, H = PET_M + 2;
  const g = {
    base: `<g stroke="${MAGIC}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">${P.back || ''}${P.ears || ''}
      <ellipse cx="78" cy="208" rx="15" ry="6" fill="${P.feet}"/><ellipse cx="122" cy="208" rx="15" ry="6" fill="${P.feet}"/>
      <path d="M46 118Q22 150 40 172Q52 160 56 140Z" fill="${P.body}"/><path d="M154 118Q178 150 160 172Q148 160 144 140Z" fill="${P.body}"/>
      <path d="M100 56C140 56 162 100 162 140C162 186 136 208 100 208C64 208 38 186 38 140C38 100 60 56 100 56Z" fill="${P.body}"/></g>
      <g stroke="none">${P.belly}</g>${P.face}<g stroke="${MAGIC}" stroke-width="4" stroke-linejoin="round">${eq.tete ? '' : P.hair || ''}</g>`,
    cos: `<g stroke="${MAGIC}" stroke-width="4" stroke-linejoin="round">${cos('cou')}${cos('yeux')}${cos('tete')}</g>`,
    book: `<path d="M62 170L100 178L138 170L138 198L100 206L62 198Z" fill="#fff" stroke="${MAGIC}" stroke-width="6" stroke-linejoin="round"/><path d="M100 178V206" stroke="#d6cbee" stroke-width="3"/>`,
  }[layer];
  if (!wrap) return g;
  // une case de marge autour des 200 × 220 du dessin, pour le contour
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * PET_SS}" height="${H * PET_SS}" viewBox="${-200 / PET_N} ${-220 / PET_M} ${200 * W / PET_N} ${220 * H / PET_M}" preserveAspectRatio="none">${g}</svg>`;
}
const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const luma = c => [1, 3, 5].reduce((s, i, k) => s + parseInt(c.slice(i, i + 2), 16) * [.3, .59, .11][k], 0);
const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
function petCells(img) { // chaque pixel prend la couleur la plus présente dans sa case ; le contour et l'encre du visage passent en priorité
  const W = PET_N + 2, H = PET_M + 2, k = PET_SS, cv = document.createElement('canvas');
  cv.width = W * k; cv.height = H * k;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, W * k, H * k).data, out = [], ink = LINE.toLowerCase();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const n = {}; let op = 0;
    for (let y = j * k; y < j * k + k; y++) for (let x = i * k; x < i * k + k; x++) {
      const o = (y * W * k + x) * 4;
      if (d[o + 3] < 128) continue;
      op++;
      if (d[o + 3] === 255) { const c = '#' + (1 << 24 | d[o] << 16 | d[o + 1] << 8 | d[o + 2]).toString(16).slice(1); n[c] = (n[c] || 0) + 1; }
    }
    const all = k * k, best = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    out.push(op < all / 2 ? null : (n[MAGIC] || 0) >= .4 * all ? MAGIC : (n[ink] || 0) >= .25 * all ? LINE : best || null);
  }
  return out;
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
function softPx(g, shade) { // style doux : pas de trait foncé, le bord prend une teinte plus sombre de sa couleur ; ombre violette en bas à droite
  const W = PET_N + 2, at = (i, j) => i < 0 || j < 0 || i >= W || j * W + i >= g.length ? null : g[j * W + i], count = {};
  g.forEach(c => c && (count[c] = (count[c] || 0) + 1));
  return g.map((c, n) => {
    if (!c || c === LINE) return c;
    const i = n % W, j = Math.floor(n / W), out = (a, b) => { const v = at(i + a, j + b); return !v || v === MAGIC; };
    if (c === MAGIC) {
      const near = {};
      N8.forEach(([a, b]) => { const v = at(i + a, j + b); if (v && v !== MAGIC && v !== LINE) near[v] = (near[v] || 0) + 1; });
      const base = Object.keys(near).sort((a, b) => near[b] - near[a])[0];
      return base ? mixHex(base, LINE, .45) : '#4B1A72';
    }
    if (N4.some(([a, b]) => !at(i + a, j + b))) return mixHex(c, LINE, .45);
    if (!shade || count[c] < 16) return c;
    if (out(2, 2) || out(1, 1)) return mixHex(c, '#4B1A72', .3);
    if (out(-1, -1)) return mixHex(c, '#FFFFFF', .5);
    return c;
  });
}
function pxRects(g) { // une <rect> par suite de pixels identiques sur une ligne
  const W = PET_N + 2; let s = '';
  for (let n = 0; n < g.length;) {
    let r = 1; while (g[n + r] === g[n] && (n + r) % W) r++;
    if (g[n]) s += `<rect x="${n % W}" y="${Math.floor(n / W)}" width="${r}" height="1" fill="${g[n]}"/>`;
    n += r;
  }
  return s;
}
async function pixPet(sp, eq) {
  const [base, cos, book] = await Promise.all(['base', 'cos', 'book'].map(async l =>
    petCells(await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(petVec(sp, eq, l))))));
  const W = PET_N + 2, g = softPx(base, true), set = (i, j, c) => { if (g[j * W + i]) g[j * W + i] = c; };
  const px = X => 1 + Math.floor(X * PET_N / 200), py = Y => 1 + Math.floor(Y * PET_M / 220);
  const ex = px(84), ey = py(104), kx = px(68), ky = py(122);
  for (const x0 of [ex - 1, W - 1 - ex]) { // yeux 2 × 2 avec un reflet ; clairs sur une tache foncée (panda, raton)
    const under = g[ey * W + x0], dark = under && luma(under) < 90;
    [[0, -1], [1, -1], [0, 0], [1, 0]].forEach(([a, b]) => set(x0 + a, ey + b, dark ? '#FFF7FE' : LINE));
    if (!dark) set(x0, ey - 1, '#FFF7FE');
  }
  for (const x0 of [kx, W - 2 - kx]) { set(x0, ky, '#FF8FE6'); set(x0 + 1, ky, '#FF8FE6'); } // joues
  return `<svg viewBox="0 0 ${W} ${PET_M + 2}" shape-rendering="crispEdges" aria-hidden="true">${pxRects(g)}${pxRects(softPx(cos))}<g class="book">${pxRects(softPx(book))}</g></svg>`;
}
// Les compagnons sont dessinés une fois pour toutes (en tâche de fond) : en attendant, une case vide de la même taille.
const pxPets = {}, pxWait = new Set();
function petSVG(sp, eq = {}) {
  const key = [sp, eq.tete, eq.yeux, eq.cou].join('|');
  if (pxPets[key]) return pxPets[key];
  if (!pxWait.has(key)) {
    pxWait.add(key);
    pixPet(sp, eq).catch(() => // navigateur qui refuse de relire le canvas : le dessin vectoriel d'origine
      `<svg viewBox="0 0 200 220" aria-hidden="true">${(petVec(sp, eq, 'base', false) + petVec(sp, eq, 'cos', false)).replaceAll(MAGIC, LINE)}<circle cx="84" cy="104" r="4.5" fill="${LINE}"/><circle cx="116" cy="104" r="4.5" fill="${LINE}"/><g class="book">${petVec(sp, eq, 'book', false).replaceAll(MAGIC, LINE)}</g></svg>`).then(svg => {
      pxPets[key] = svg; pxWait.delete(key);
      document.querySelectorAll(`svg[data-pk="${CSS.escape(key)}"]`).forEach(el => { el.outerHTML = svg; });
    });
  }
  return `<svg data-pk="${esc(key)}" viewBox="0 0 ${PET_N + 2} ${PET_M + 2}" aria-hidden="true"></svg>`;
}
const petsHTML = (sp = S.species, partner = S.partner, eqMain = S.equip, eqPartner = S.partnerEquip) => `<button class="pet main" data-talk aria-label="Parler à ${esc(nameOf(sp))}">${petSVG(sp, eqMain)}</button>` +
  (partner ? `<div class="pet partner">${petSVG('pingouine', eqPartner)}</div><span class="love" aria-hidden="true">💕</span>` : '');

// ---------- Amitié (points d'amitié = PA, par compagnon) ----------
const absentDays = () => dayNum(today()) - dayNum(S.lastStudy);
function addPA(n) { // annonce les nouveaux niveaux
  const sp = S.species, pa = S.friend[sp] || 0;
  n = Math.max(0, n); S.friend[sp] = pa + n;
  const lv = levelOf(pa + n);
  if (lv > levelOf(pa)) { say('level'); toast(`💗 Niveau ${lv} d'amitié avec ${nameOf(sp)} ! Débloqué : ${unlockText(LEVEL_UNLOCKS[lv])}`); }
  return n;
}
// -25 % des PA du compagnon actif par tranche de 15 h sans réviser (S.decayed = tranches déjà retirées)
const decayAfter = (pa, n) => Math.floor(pa * (1 - CFG.decayRate) ** n);
function applyDecay() {
  const due = Math.floor((Date.now() - S.lastStudyAt) / (CFG.decayHours * 36e5)) - S.decayed;
  if (!(due > 0)) return false;
  S.decayed += due;
  const pa = S.friend[S.species] || 0;
  S.friend[S.species] = decayAfter(pa, due);
  if (pa) toast(`💔 ${nameOf(S.species)} se sentait seul : l'amitié a baissé de ${pa - S.friend[S.species]} PA. Une session et ça repart !`);
  save(); return true;
}
const daysTo = d => dayNum(d) - dayNum(today());
const subName = id => S.subjects.find(s => s.id === id)?.name || 'Sans matière';
const nextExam = () => S.exams.filter(x => daysTo(x.date) >= 1).sort((a, b) => a.date.localeCompare(b.date))[0];
const curStreak = () => S.streak.last && dayNum(today()) - dayNum(S.streak.last) <= 1 + S.freezes ? S.streak.cur : 0; // les gels couvrent les jours manqués

// Répliques : au moins 5 par situation, {n} = nom du compagnon, {p} = nom de Perle
const LINES = {
  hello: ['Bienvenue ! Je suis tellement content de te voir 🌷', 'Coucou ! Prêt·e pour une belle session ? ✨', 'Te voilà ! J\'avais gardé ton livre au chaud 📚',
    'Bonjour toi ! On fait éclore un œuf aujourd\'hui ? 🥚', 'Bienvenue au jardin ! Installe-toi, je prépare le thé 🍵'],
  idle:['Coucou, c\'est {n} !', 'On révise ensemble ? 📚', 'Tu vas tout déchirer 💪', 'Une petite tisane et on s\'y remet 🍵',
    'N\'oublie pas de valider ta journée 🔥', 'J\'aime bien quand il pleut dehors 🌧️', 'Chaque minute compte ✨'],
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
    'Merci de réviser avec moi, ça compte beaucoup 💕', 'Notre amitié grandit à chaque session 🌷',
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

// ---------- Pixel art de la déco ----------
// Chaque dessin est une grille : une lettre = une couleur de PXC, '.' = transparent.
// pix() la transforme en SVG (une <rect> par suite de pixels identiques), k = taille d'un pixel à l'écran.
const PXC = {
  k: '#2D1A62', K: '#150B31', u: '#4B1A72', v: '#8E5BB5', V: '#74449B', L: '#C9A6E4', l: '#E7CFF5', w: '#FFF7FE',
  p: '#FF8FE6', P: '#FF4FD8', r: '#FFB8EE', R: '#FF4F6D', c: '#8FF0FF', C: '#4FE3FF', b: '#BFF6FF',
  y: '#FFD99A', o: '#FFC46B', O: '#E8943A', g: '#4FE3B0', G: '#22A783', h: '#B8F5E0', s: '#FFE3D3',
};
const SPR = {
  livres: ['kkk......', 'kpkkkk...', 'kpkcck...', 'kwkcckkkk', 'kpkwwkyyk', 'kpkcckyyk', 'kpkcckwwk', 'kwkcckyyk', 'kpkcckyyk', 'kkkkkkkkk'],
  bougie: ['..o..', '.oyo.', '.oyo.', '..k..', '.kkk.', '.kwk.', '.kwk.', '.klk.', '.kwk.', 'kkkkk'],
  cactus: ['...kkk...', '..kghgk..', '.kkgGgk..', 'kgkgggkk.', 'kggggGkgk', '.kkgggggk', '..kgGgkk.', '..kgggk..', '.kkkkkkk.', '.kpppppk.', '.kpPPPpk.', '..kpppk..', '..kkkkk..'],
  plante: ['....k...k....', '...kgk.kgk...', '..kggk.kggk..', 'k.kgGgkgGgk.k', 'kgkggGgGggkgk', 'kggkgggggkggk', '.kgGkgGgkGgk.', '..kggkgkggk..', '...kkgggkk...', '....kkGkk....', '..kkkkkkkkk..', '..kvvvvvvvk..', '..kLLLLLLLk..', '...kvvvvvk...', '...kvvvvvk...', '....kkkkk....'],
  suspendue: ['...kkkkk...', '..kvvvvvk..', '..kLLLLLk..', '.kgkvvvkgk.', 'kggkkkkkggk', 'kgk.kgk.kgk', '.kgkgGgkgk.', '.kgk.kgk.k.', '..k..kgk...', '.....kk....'],
  lanterne: ['...kkk...', '..kyyyk..', '.kkkkkkk.', 'kPPPPPPPk', 'kPpPPPpPk', 'kPPPPPPPk', 'kPpPPPpPk', 'kPPPPPPPk', '.kkkkkkk.', '..kyyyk..', '...kok...', '....o....'],
  cadre: ['kkkkkkkkkkkkkk', 'kook', 'kokkkkkkkkkkok', 'kokbbbbbbyykok', 'kokbbbbbbyykok', 'kokbbbbbbbbkok', 'kokbhhbbbbbkok', 'kokhhhhbbhhkok', 'kokhhghhhhhkok', 'kokkkkkkkkkkok', 'kook', 'kkkkkkkkkkkkkk'],
  nounours: ['.kk......kk.', 'kook....kook', 'koyokkkkoyok', '.kooooooook.', '.koKooooKok.', '.kooyyyyook.', '.kooykkyook.', '..kooyyook..', '.kkooooookk.', 'kookyyyykook', '.kkoyyyyokk.', '.kooooooook.', 'kyyok..koyyk', 'kkkk....kkkk'],
  horloge: ['...kkkkkk...', '..kooooook..', '.kowwwwwwok.', 'kowwwkwwwwok', 'kowwwkwwwwok', 'kowwwkwwwwok', 'kowwwkkkkwok', 'kowwwwwwwwok', 'kowwwwwwwwok', '.kowwwwwwok.', '..kooooook..', '...kkkkkk...'],
  lune: ['..kkk..', '.kyyk..', 'kyyk...', 'kyyk...', 'kyyk...', 'kyyyk..', '.kyyykk', '..kkkk.'],
  bocal: ['..kkkkkkkkkk..', '...kwwwwwwk...', '..kbbbbbbbbk..', '.kbbbbbbbbbbk.', 'kbbbbbppbbbbbk', 'kbbbbppppbpbbk', 'kbbbbpKppppbbk', 'kbbbbppppbpbbk', 'kccbbbppbbbbck', 'kcccccccccccck', '.kcgcccccgcck.', '..kkkkkkkkkk..'],
  ampoule: ['.kkk.', 'kyyyk', 'kyoyk', 'kyyyk', '.kyk.', '.kuk.', '..k..'],
  rideau: ['kkkkkkkkkk', 'kpPpkkpPpk', 'kpPpkkpPpk', 'kpPpkkpPpk', 'kpPk..kPpk', 'kpk....kpk', 'kpk....kpk', 'kk......kk'],
  // saisons
  fleur: ['.p.p.', 'ppppp', '.pyp.', 'ppppp', '.p.p.'],
  tulipeMini: ['p.p.p', 'ppppp', 'pPppp', '.ppp.', '..g..', '.g.g.'],
  petale: ['.rr.', 'rppr', '.rp.'],
  tulipe: ['.k..k..k.', 'kpkkpkkpk', 'kpppppppk', 'kppPpPppk', '.kpppppk.', '..kkkkk..', '....g....', 'kk..g..kk', 'kgk.g.kgk', '.kgkgkgk.', '..kgggk..', '...kgk...', '..kkkkk..', '.kvvvvvk.', '.kLLLLLk.', '..kvvvk..', '..kkkkk..'],
  pousse: ['.gg.gg.', 'gGgkgGg', '.ggkgg.', '...g...', '...g...', '.vvvvv.', 'vVVVVVv'],
  poussin: ['...kkkk...', '..kyyyyk..', '.kyKyyKyk.', '.kyyooyyk.', '.kyyyyyyk.', 'kwkwkwkwkk', 'kwwwwwwwwk', 'kwwlwwwwwk', '.kwwwwwwk.', '..kkkkkk..'],
  panier: ['...kkkkkk...', '..k......k..', '.k..kpkck.k.', 'kkkkkkkkkkkk', 'kyoyoyoyoyok', 'koyoyoyoyoyk', '.kyoyoyoyok.', '.koyoyoyoyk.', '..kkkkkkkk..'],
  theiere: ['.....kk.....', '....kPPk....', '..kkkkkkkk..', 'kkkppppppk.k', 'k.kprpppppkk', 'kkkppppppPk.', '..kpppppppk.', '...kkkkkkk..'],
  fraise: ['..gkg..', '.kgggk.', 'kRRRRRk', 'kRyRRyk', 'kRRRyRk', '.kRyRk.', '..kRk..', '...k...'],
  papillon: ['kk.....kk', 'kPk...kPk', 'kPPk.kPPk', '.kPPkPPk.', '.kcckcck.', 'kcck.kcck', 'kkk...kkk'],
  fanion: ['kkkkkkk', 'kPPPPPk', '.kPPPk.', '.kPPPk.', '..kPk..', '..kPk..', '...k...'],
  palmier: ['.....ggg..ggg.....', '...ggGGGggGGGgg...', '..gGGggGGGGggGGg..', '.gGg..gGGGGg..gGg.', 'gGg..gG.oo.Gg..gGg', 'gg..gG.oooo.Gg..gg', 'g...g..ovvo..g...g', '........vV........', '........vv........', '........VV........', '.......vv.........', '.......VV.........', '.......vv.........', '.......VV.........', '.......vv.........', '.......VVv........', '.......vvv........', '......vVVVv.......', '....yyyyyyyyy.....', '..yyyyyyyyyyyyy...'],
  ballon: ['..kkk..', '.kwcck.', 'kwwcwwk', 'kcccwwk', 'kwwcwck', '.kwcck.', '..kkk..'],
  bouee: ['....kkkk....', '..kkPPwwkk..', '.kPPPPwwwwk.', '.kPPkkkkwwk.', 'kPPk....kwwk', 'kPPk....kwwk', 'kwwk....kPPk', 'kwwk....kPPk', '.kwwkkkkPPk.', '.kwwwwPPPPk.', '..kkwwPPkk..', '....kkkk....'],
  coquillage: ['...kkk...', '..krrrk..', '.krkrkrk.', 'krrkrkrrk', 'krkrrrkrk', 'krrkrkrrk', '.kkrrrkk.', '...kkk...'],
  tong: ['.kkkk.', 'kcccck', 'kcPPck', 'kPccPk', 'kcccck', 'kcccck', 'kcccck', 'kcccck', '.kcck.', '..kk..'],
  cocktail: ['.....k...', '....k....', 'kkkkkkkkk', 'kwppppppk', '.kwppppk.', '.koooook.', '..kooook.', '...kook..', '....k....', '....k....', '..kkkkk..'],
  pasteque: ['kkkkkkkkkk', 'kRRKRRKRRk', 'kwRRRKRRwk', '.kgwwwwgk.', '..kggggk..', '...kkkk...'],
  erable: ['...R...', '.R.R.R.', 'RRRRRRR', '.RRRRR.', 'RRRRRRR', '...v...', '...v...'],
  feuille: ['....oO', '..oooO', '.oooO.', 'ooOo..', 'oOo...', 'v.....'],
  citrouille: ['.....kk.....', '.....gk.....', '..kkkkkkkk..', '.kooOooOook.', 'kooKKooKKook', 'kooOooooOook', 'kooKoKKoKook', 'kooOKKKKOook', '.koOooooOok.', '..kkkkkkkk..'],
  champignon: ['..kkkk..', '.kRRwRk.', 'kRwRRRRk', 'kRRRRwRk', 'kkkkkkkk', '..kwwk..', '..kwwk..', '..kkkk..'],
  herisson: ['...k.k.k.k....', '..kVkVkVkVk...', '.kVVVVVVVVVk..', 'kVVVVVVVVVkkk.', 'kVVVVVVVVkyyyk', 'kVVVVVVVVkyKyk', '.kVVVVVVVkyyyK', '..kkkkkkkkkkk.', '...kk....kk...'],
  pomme: ['...kgg..', '...k....', '.kkkkkk.', 'kRRwRRRk', 'kRRRRRRk', 'kRRRRRRk', '.kRRRRk.', '..kkkk..'],
  tasse: ['kkkkkkk..', 'kvvvvvk..', 'kwwwwwkkk', 'kwPwPwk.k', 'kwwwwwkkk', '.kwwwk...', 'kkkkkkk..'],
  tarte: ['..kkkkkkkk..', '.kyoyoyoyok.', 'kyoyoyoyoyok', 'kkkkkkkkkkkk', '.kLLLLLLLLk.', '..kkkkkkkk..'],
  sapin: ['.......y.......', '......yyy......', '.......y.......', '......kGk......', '.....kGgGk.....', '....kGGPGGk....', '...kGgGGGgGk...', '....kkGGGkk....', '....kGgGGGk....', '...kGGcGGgGk...', '..kGgGGGGoGGk..', '.kkkGGGGGgGkkk.', '...kGGGPGGGk...', '..kGGoGGgGcGk..', '.kGgGGGGGGGgGk.', 'kGGGcGGGPGGGgGk', 'kkkkkkkkkkkkkkk', '......kvk......', '......kvk......', '....kkkkkkk....', '....kLLLLLk....', '.....kkkkk.....'],
  cadeau: ['..kk.kk..', '.kPkkkPk.', 'kkkkkkkkk', 'kcccPccck', 'kcccPccck', 'kPPPPPPPk', 'kcccPccck', 'kcccPccck', 'kkkkkkkkk'],
  pereNoel: ['.....kkkk.....', '...kkRRRRk....', '..kRRRRRRRk.kk', '.kRRRRRRRRRkwk', 'kwwwwwwwwwwwkk', 'kwwwwwwwwwwwk.', '.ksssssssssk..', '.ksKssssKssk..', '.kssrsssrsskk.', 'kwwwwRRwwwwwk.', 'kwwwwwwwwwwwk.', '.kwwwwwwwwwk..', '..kwwwwwwwk...', '...kkkkkkk....'],
  bonhomme: ['...kkkk...', '..kKKKKk..', '..kKKKKk..', '.kkkkkkkk.', '..kwwwwk..', '.kwKwwKwk.', '.kwwoowwk.', '..kwwwwk..', '.kPPPPPPk.', 'kwwwPwwwwk', 'kwwwwKwwwk', 'kwwwwwwwwk', 'kwwwwKwwwk', '.kkkkkkkk.'],
  chaussette: ['kkkkk..', 'kwwwk..', 'kkkkk..', 'kRRRk..', 'kRwRk..', 'kRRRk..', 'kRRRRkk', 'kRwRRRk', 'kRRRRRk', '.kkkkk.'],
  cloche: ['....k....', '...kok...', '..kyyok..', '.kyyyyok.', '.kyyyyok.', '.kyyyyok.', 'kyyyyyyok', 'kkkkkkkkk', '...kok...', '....k....'],
  cookie: ['..kkk..', '.kooKk.', 'kKooook', 'kooKook', 'koooKok', '.kKook.', '..kkk..'],
};
SPR.cadre[1] = SPR.cadre[10] = 'k' + 'o'.repeat(12) + 'k';
SPR.cadeau2 = SPR.cadeau.map(r => r.replace(/c/g, 'y').replace(/P/g, 'g'));
// ciel de la fenêtre (taille fixée en CSS : .sun, .moon, .cloud)
SPR.soleil = ['...oooo...', '.ooyyyyoo.', '.oyywyyyo.', 'oyywyyyyyo', 'oyyyyyyyyo', 'oyyyyyyyyo', 'oyyyyyyyyo', '.oyyyyyyo.', '.ooyyyyoo.', '...oooo...'];
SPR.croissant = ['...wwww...', '.wwlll....', '.wll......', 'wll.......', 'wll.......', 'wll.......', 'wll.......', '.wll......', '.wwlll....', '...wwww...'];
SPR.nuage = ['.....wwww.......', '...wwwwwwww.ww..', '..wwwwwwwwwwwwww', '.wwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', '.llllllllllllll.'];
SPR.perle = ['.k.', 'kkk', 'PPP', 'PwP', 'PPP', '.P.']; // ampoule de la guirlande
SPR.nuageOrage =SPR.nuage.map(r => r.replace(/w/g, 'u').replace(/l/g, 'K'));
const pxCache = {};
function pix(name, k = 3, swap = '') { // swap = 'ab' : la couleur a devient b (ex. fanions, chaussettes)
  const key = `${name}|${k}|${swap}`;
  if (pxCache[key]) return pxCache[key];
  const rows = SPR[name].map(r => swap ? r.split(swap[0]).join(swap[1]) : r);
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      let n = 1; while (row[x + n] === row[x]) n++;
      if (PXC[row[x]]) rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PXC[row[x]]}"/>`;
      x += n;
    }
  });
  return pxCache[key] = `<svg class="px" style="width:${w * k / 16}em;height:${h * k / 16}em" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
const thumb = name => { const r = SPR[name]; return pix(name, Math.max(1, Math.floor(48 / Math.max(r.length, ...r.map(x => x.length))))); };
// lit = source de lumière : un halo s'allume la nuit (CSS .lit ; lantern / fish = autre couleur)
const lit = (html, cls = '') => `<span class="lit ${cls}">${html}</span>`;
const sp = (name, style, k = 3, cls = '', swap = '') => `<span class="sd ${cls}" style="${style}">${pix(name, k, swap)}</span>`;
// posé sur le rebord de la fenêtre (--winL = marge entre le mur et la fenêtre, voir .room) ; em = taille d'un dessin
const SILL = 'top:calc(59% - 6px);transform:translateY(-100%)';
const sillL = (i = 0) => `left:calc(var(--winL) + ${2.5 + i * 2.2}em);${SILL}`, sillR = (i = 0) => `right:calc(var(--winL) + ${1 + i * 2.2}em);${SILL}`;

// ---------- Saisons : base (murs, sol, ce qui tombe) choisie avec les flèches de la scène ----------
// '' = la chambre achetée, sans saison. Les murs et sols sont en CSS (.scene[data-saison=…]).
const bunting = (cls, items) => `<div class="sd bunting ${cls}">${items.map((x, i) => `<i style="--i:${i}">${x}</i>`).join('')}</div>`;
const falling = (items, n) => Array.from({ length: n }, (_, i) =>
  `<span class="sd fall" style="left:${8 + i * 84 / n}%;animation-duration:${7 + i % 3 * 2}s;animation-delay:-${(i * 2.3).toFixed(1)}s">${items[i % items.length]}</span>`).join(''); // .sd ne capte pas les clics
const LIGHTS = ['#FF4FD8', '#4FE3FF', '#FFC46B', '#4FE3B0'];
const SEASONS = {
  '':        { name: 'Ma chambre', icon: '🛏️', base: '' },
  printemps: { name: 'Printemps', icon: '🌸', base: falling([pix('petale'), pix('petale', 3, 'pw'), pix('petale')], 5) },
  ete:       { name: 'Été', icon: '☀️', base: '' },
  automne:   { name: 'Automne', icon: '🍂', base: falling([pix('feuille', 2), pix('erable', 2), pix('feuille', 2, 'oR')], 6) },
  hiver:     { name: 'Hiver', icon: '❄️', base: '' },
};
const SEASON_KEYS = Object.keys(SEASONS);

// ---------- Décoration de la pièce ----------
// season : l'objet ne s'affiche que pendant cette saison (catégorie Saisons de la boutique)
const DECOR = {
  etagere:     { name: 'Étagère', icon: 'livres', price: 0, html: `<div class="d shelf">${pix('livres', 2)}${lit(pix('bougie', 2))}${pix('cactus', 2)}</div>` },
  plante:      { name: 'Grande plante', icon: 'plante', price: 0, html: sp('plante', 'right:18.5%;bottom:30px') },
  tapisLav:    { name: 'Tapis lavande', price: 0, rug: '#E7CFF5' },
  tapisRose:   { name: 'Tapis rose', price: 100, rug: '#FFB8EE' },
  tapisMenthe: { name: 'Tapis menthe', price: 100, rug: '#B8F5E0' },
  tapisSoleil: { name: 'Tapis soleil', price: 100, rug: '#FFD99A' },
  suspendue:   { name: 'Plante suspendue', icon: 'suspendue', price: 120, html: `<span class="d hang">${pix('suspendue')}</span>` },
  cadre:       { name: 'Cadre', icon: 'cadre', price: 140, html: sp('cadre', 'right:6%;top:30%') },
  nounours:    { name: 'Nounours', icon: 'nounours', price: 150, html: sp('nounours', 'left:24%;bottom:22px') },
  horloge:     { name: 'Horloge', icon: 'horloge', price: 180, html: sp('horloge', 'left:8%;top:29%') },
  guirlande:   { name: 'Guirlande lumineuse', icon: 'ampoule', price: 220, html: `<div class="d garland">${Array.from({ length: 10 }, (_, i) => pix('perle', 2, i % 2 ? 'Po' : '')).join('')}</div>` },
  aquarium:    { name: 'Bocal à poisson', icon: 'bocal', price: 260, html: `<div class="d ledge">${lit(pix('bocal'), 'fish')}</div>` }, // sur une tablette au mur : au sol, il cachait Perle ; sur le rebord, la bulle
  rideaux:     { name: 'Rideaux roses', icon: 'rideau', price: 300, html: '<div class="d curtain l"></div><div class="d curtain r"></div>' },
  poster:      { name: 'Poster lune', icon: 'lune', price: 130, html: `<span class="d poster">${pix('lune')}</span>` },
  lampe:       { name: 'Lanterne', icon: 'lanterne', price: 160, html: `<span class="d hang" style="right:auto;left:16%">${lit(pix('lanterne'), 'lantern')}</span>` },
  fleursGuir:  { season: 'printemps', name: 'Guirlande de fleurs', icon: 'fleur', price: 90, html: bunting('', [0, 1, 0, 2, 0, 1, 0, 2].map(i => [pix('fleur'), pix('fleur', 3, 'pw'), pix('tulipeMini')][i])) },
  tulipes:     { season: 'printemps', name: 'Grande tulipe', icon: 'tulipe', price: 80, html: sp('tulipe', 'left:2%;bottom:20px') + sp('pousse', 'left:10%;bottom:10px') },
  poussin:     { season: 'printemps', name: 'Poussin et panier', icon: 'poussin', price: 70, html: sp('poussin', 'right:3%;bottom:20px') + sp('panier', 'right:12%;bottom:12px', 2) },
  the:         { season: 'printemps', name: 'Thé et fraise', icon: 'theiere', price: 60, html: sp('theiere', sillL()) + sp('fraise', sillR()) },
  papillon:    { season: 'printemps', name: 'Papillon', icon: 'papillon', price: 50, html: sp('papillon', 'left:30%;top:13%', 3, 'flutter') },
  fanions:     { season: 'ete', name: 'Fanions', icon: 'fanion', price: 90, html: bunting('', Array.from({ length: 10 }, (_, i) => pix('fanion', 2, 'P' + 'PCog'[i % 4]))) },
  palmier:     { season: 'ete', name: 'Palmier', icon: 'palmier', price: 120, html: sp('palmier', 'left:1%;bottom:12px') + sp('ballon', 'left:15%;bottom:8px') },
  bouee:       { season: 'ete', name: 'Bouée', icon: 'bouee', price: 60, html: sp('bouee', 'right:6%;top:46%') },
  plage:       { season: 'ete', name: 'Coquillage et tongs', icon: 'coquillage', price: 50, html: sp('coquillage', 'right:3%;bottom:16px') + sp('tong', 'right:12%;bottom:10px', 2) },
  cocktail:    { season: 'ete', name: 'Cocktail et pastèque', icon: 'cocktail', price: 60, html: sp('cocktail', sillL()) + sp('pasteque', sillR()) },
  feuillesGuir:{ season: 'automne', name: 'Guirlande de feuilles', icon: 'erable', price: 90, html: bunting('', Array.from({ length: 8 }, (_, i) => i % 2 ? pix('feuille') : pix('erable'))) },
  citrouilles: { season: 'automne', name: 'Citrouilles', icon: 'citrouille', price: 100, html: sp('citrouille', 'left:1%;bottom:12px', 4) + sp('citrouille', 'left:12.5%;bottom:8px') + sp('champignon', 'left:20%;bottom:10px', 2) },
  herisson:    { season: 'automne', name: 'Hérisson', icon: 'herisson', price: 80, html: sp('herisson', 'right:2%;bottom:16px') + sp('pomme', 'right:12.5%;bottom:10px') },
  gouter:      { season: 'automne', name: 'Goûter d\'automne', icon: 'tarte', price: 70, html: sp('tasse', sillL(), 3, 'cup') + sp('tarte', sillR()) + sp('bougie', sillR(1), 2, 'lit') },
  noelGuir:    { season: 'hiver', name: 'Guirlande de Noël', icon: 'ampoule', price: 110, html: bunting('lights', LIGHTS.concat(LIGHTS, LIGHTS).map(c => `<b style="--c:${c}"></b>`)) },
  sapin:       { season: 'hiver', name: 'Sapin et cadeaux', icon: 'sapin', price: 150, html: sp('sapin', 'left:1%;bottom:14px', 4) + sp('cadeau', 'left:16%;bottom:8px') + sp('cadeau2', 'left:4%;bottom:2px') },
  pereNoel:    { season: 'hiver', name: 'Père Noël', icon: 'pereNoel', price: 130, html: sp('pereNoel', 'right:2%;bottom:20px') },
  bonhomme:    { season: 'hiver', name: 'Bonhomme de neige', icon: 'bonhomme', price: 70, html: sp('bonhomme', 'right:13%;bottom:10px', 2) },
  chaussettes: { season: 'hiver', name: 'Chaussettes et cloche', icon: 'chaussette', price: 60, html: sp('chaussette', 'right:20.5%;top:5%', 2) + sp('chaussette', 'right:17.5%;top:6%', 2, '', 'Rc') + sp('cloche', 'right:7%;top:46%') },
  chocolat:    { season: 'hiver', name: 'Chocolat chaud', icon: 'tasse', price: 80, html: sp('tasse', sillL(), 3, 'cup') + sp('cookie', sillL(1)) + sp('bougie', sillR(), 2, 'lit') },
};

// ---------- Boutique : ambiances et thèmes ----------
const AMBIANCES = {
  lofi: { name: 'Musique lofi', icon: '🎵', price: 0, desc: '4 morceaux lofi qui s\'enchaînent' },
  rain: { name: 'Pluie', icon: '🌧️', price: 0, desc: 'Pluie et orage au loin' },
  wind: { name: 'Vent', icon: '🍃', price: 0, desc: 'Le vent qui souffle dehors' },
  cars: { name: 'Voitures', icon: '🚗', price: 0, desc: 'La circulation en ville' },
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
  { id: 'streak7', icon: '📆', name: 'Une semaine entière', desc: 'Série de 7 jours', val: () => S.streak.best, goal: 7, reward: { egg: 'commun' } },
  { id: 'streak30', icon: '🌟', name: 'Un mois de constance', desc: 'Série de 30 jours', val: () => S.streak.best, goal: 30, reward: { cos: 'colEtoile' } },
  { id: 'hatch1', icon: '🐣', name: 'Première éclosion', desc: 'Faire éclore un œuf', val: () => S.hatched, goal: 1, reward: { coins: 30 } },
  { id: 'coll6', icon: '🗂️', name: 'Mi-collection', desc: 'Réunir 6 compagnons', val: () => S.pets.length, goal: 6, reward: { egg: 'rare' } },
  { id: 'coll12', icon: '💯', name: 'Collection complète', desc: `Réunir les ${COLL.length} compagnons`, val: () => S.pets.length, goal: COLL.length, reward: { cos: 'arcEnCiel' } },
  { id: 'friend5', icon: '💗', name: 'Grands amis', desc: "Atteindre le niveau 5 d'amitié", val: maxLevel, goal: 5, reward: { coins: 80 } },
  { id: 'friend10', icon: '💞', name: 'Amis pour la vie', desc: "Atteindre le niveau 10 d'amitié", val: maxLevel, goal: 10, reward: { egg: 'epique' } },
  { id: 'shop', icon: '🛍️', name: 'Première emplette', desc: 'Acheter un objet en boutique', val: () => S.bought, goal: 1, reward: { coins: 20 } },
];
const rewardText = r => r.coins ? `${r.coins} 🪙` : r.egg ? EGGS[r.egg].name : r.boost ? `${r.boost} accélérateur d'œuf ⚡` : r.pet ? `Compagnon exclusif : ${SPECIES[r.pet].name}` : `Accessoire : ${COSMETICS[r.cos].name}`;
function grant(r, why) {
  if (r.coins) addCoins(r.coins, why);
  if (r.egg) S.eggs.push({ type: r.egg, min: 0 });
  if (r.boost) S.boosts += r.boost;
  if (r.pet) S.pets.includes(r.pet) ? addCoins(150, `${why} (compagnon déjà là)`) : S.pets.push(r.pet);
  if (r.cos && !S.owned.includes(r.cos)) S.owned.push(r.cos);
}
// Série : le joueur coche « Je suis là » une fois par jour ; les gels de série couvrent les jours manqués
function checkIn() {
  const st = S.streak;
  if (st.last === today()) return;
  const missed = st.last ? dayNum(today()) - dayNum(st.last) - 1 : Infinity;
  if (missed <= S.freezes) {
    S.freezes -= missed; st.cur++;
    if (missed) toast(`🧊 Gel de série utilisé (${missed}) : ta série continue !`);
  } else st.cur = 1;
  st.last = today(); st.best = Math.max(st.best, st.cur);
  const r = STREAK_REWARDS[st.cur];
  if (r) { grant(r, `Série de ${st.cur} jours`); toast(`🔥 ${st.cur} jours de série ! 🎁 ${rewardText(r)}`); }
  else toast(`🔥 Journée validée : ${st.cur} j de série`);
  save(); renderAll();
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
// Chambres : le motif des murs et du sol est en CSS ([data-chambre=…] .wall / .floor) ; celles de ROOM_PX sont en pixel art
const ROOMS = {
  douce: { name: 'Chambre douce', price: 0, desc: 'Murs à pois et parquet clair' },
  fleurie: { name: 'Papier peint fleuri', price: 200, desc: 'Petits pois roses et menthe' },
  bois: { name: 'Cabane en bois', price: 250, desc: 'Planches ambrées, violettes la nuit' },
  serre: { name: 'Véranda', price: 300, desc: 'Lattes vertes et carrelage' },
  zen: { name: 'Chambre zen', price: 350, desc: 'Cloisons de papier et nattes' },
  neon: { name: 'Studio néon', price: 400, desc: 'Carrelage, cœur lumineux et fenêtre en néon' },
  grenier: { name: 'Grenier étoilé', price: 450, desc: 'Plafond en pente et plinthe néon la nuit' },
};
// Pixel art des chambres : chaque tuile est dessinée au chargement (t(x, y) = couleur d'un pixel) puis répétée en CSS.
// Un pixel vaut PX_EM, comme les dessins de la déco (k = 3), donc tout grandit avec la pièce.
const PX_EM = 3 / 16;
function pxURL(w, h, t) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = t(x, y); if (c) { cx.fillStyle = c; cx.fillRect(x, y, 1, 1); } }
  return `url(${cv.toDataURL()})`;
}
const pxTile = (w, h, t) => `${pxURL(w, h, t)} 0 0 / ${w * PX_EM}em ${h * PX_EM}em`;
const boards = (step, base, seam) => pxTile(28, step * 2, (x, y) => y % step === step - 1 || x === (y < step ? 0 : 13) ? seam : base); // lattes décalées
const HEART = ['.PP.PP.', 'P..P..P', 'P.....P', '.P...P.', '..P.P..', '...P...']; // tube néon
const ROOM_PX = { // n = nuit : couleurs de nuit explicites, jamais de filtre
  douce: n => ({
    wall: pxTile(16, 16, (x, y) => x === 4 && y === 4 || x === 12 && y === 12 ? (n ? '#4B1A72' : '#F4B5E8') : n ? '#35206F' : '#FBE9FF'),
    floor: boards(6, n ? '#241050' : '#E7CFF5', n ? '#201246' : '#D9BDEE'), plinthe: n ? '#4B1A72' : '#FFF7FE',
  }),
  bois: n => ({
    wall: pxTile(20, 24, (x, y) => x % 10 === 0 ? (n ? '#201246' : '#E8943A') : x % 10 === 5 && y % 12 === 7 ? (n ? '#4B1A72' : '#E8943A') // nœuds du bois
      : (x / 10 | 0) ? (n ? '#35206F' : '#FFD99A') : (n ? '#2D1A62' : '#FFC46B')),
    floor: boards(5, n ? '#2D1A62' : '#FFC46B', n ? '#150B31' : '#E8943A'), plinthe: n ? '#201246' : '#E8943A',
  }),
  grenier: n => ({
    wall: pxTile(24, 24, (x, y) => {
      const plus = [[6, 6], [18, 17]].some(([a, b]) => Math.abs(x - a) + Math.abs(y - b) <= 1), dot = [[19, 4], [4, 18], [12, 12]].some(([a, b]) => x === a && y === b);
      return plus ? (n ? '#FFD99A' : '#FF8FE6') : dot ? (n ? '#BFF6FF' : '#F4B5E8') : n ? '#241050' : '#E7CFF5';
    }),
    floor: boards(6, n ? '#201246' : '#D9BDEE', n ? '#150B31' : '#C9A6E4'), plinthe: n ? '#FF4FD8' : '#F4B5E8', glow: n && 'rgba(255, 79, 216, .6)',
    // pentes du toit dans les coins du haut (cachées pendant une saison, qui change le mur)
    extra: sel => `${sel}[data-saison=""] .wall::before, ${sel}[data-saison=""] .wall::after { content: ""; position: absolute; top: 0; left: 0; width: ${50 * PX_EM}em; height: ${40 * PX_EM}em;
      background: ${pxURL(50, 40, (x, y) => { const d = (2000 - 40 * (x + .5) - 50 * (y + .5)) / 64; return d < 0 ? '' : d < 2 ? '#2D1A62' : (x * .8 + y) % 9 < 2 ? (n ? '#201246' : '#C9A6E4') : (n ? '#150B31' : '#D9BDEE'); })} 0 0 / 100% 100%; }
      ${sel}[data-saison=""] .wall::after { left: auto; right: 0; transform: scaleX(-1); }`,
  }),
  neon: n => ({
    wall: pxTile(8, 8, (x, y) => !x || !y ? (n ? '#2D1A62' : '#D9BDEE') : n ? '#201246' : '#E7CFF5'),
    floor: boards(6, n ? '#150B31' : '#D9BDEE', n ? '#201246' : '#C9A6E4'), plinthe: n ? '#4FE3FF' : '#FFF7FE', glow: n && 'rgba(79, 227, 255, .55)',
    extra: sel => `${sel}[data-saison=""] .wall::before { content: ""; position: absolute; right: calc(var(--winL) + 1em); top: 11%; width: ${7 * 4 / 16}em; height: ${6 * 4 / 16}em;
      background: ${pxURL(7, 6, (x, y) => HEART[y][x] === 'P' ? (n ? '#FF4FD8' : '#FF8FE6') : '')} 0 0 / 100% 100%; ${n ? 'filter: drop-shadow(0 0 .25em #FF4FD8) drop-shadow(0 0 .6em #FF4FD8);' : ''} }
      ${sel} .window { box-shadow: 0 0 0 6px ${n ? '#FF4FD8, 0 0 20px #FF4FD8' : '#FF8FE6'}; }`, /* 6 px : le néon dépasse du contour de 3 px */
  }),
};
// Les autres chambres et les saisons : tuiles de jour seulement, la nuit garde le voile violet (style.css).
// Les saisons gardent leur sélecteur .scene[data-saison=…], plus précis que les chambres, donc leur mur l'emporte.
const FLAT_PX = {
  '[data-chambre=fleurie]': {
    wall: pxTile(14, 14, (x, y) => x >= 2 && x < 4 && y >= 2 && y < 4 ? '#FF8FE6' : x >= 9 && x < 11 && y >= 9 && y < 11 ? '#8FF0FF' : '#FBE9FF'),
    floor: boards(6, '#E7CFF5', '#D9BDEE') },
  '[data-chambre=serre]': {
    wall: pxTile(16, 4, x => x >= 14 ? '#8FF0FF' : '#D9F7FF'),
    floor: pxTile(8, 8, (x, y) => (x + y >> 2) % 2 ? '#E7CFF5' : '#FBE9FF') },
  '[data-chambre=zen]': {
    wall: pxTile(14, 14, (x, y) => x === 13 || y === 13 ? '#F4B5E8' : '#FBE9FF'),
    floor: pxTile(24, 12, (x, y) => x === 23 || y === 11 ? '#8FF0FF' : '#BFF6FF') },
  '.scene[data-saison=printemps]': {
    wall: pxTile(16, 16, (x, y) => { // petites fleurs : cœur ambre, pétales roses
      for (const [a, b, c] of [[4, 4, '#FF8FE6'], [12, 12, '#FFB8EE']]) { const d = Math.abs(x - a) + Math.abs(y - b); if (!d) return '#FFD99A'; if (d === 1) return c; }
      return '#FBE9FF'; }),
    floor: boards(6, '#B8F5E0', '#4FE3B0') },
  '.scene[data-saison=ete]': {
    wall: pxTile(20, 4, x => x < 10 ? '#D9F7FF' : '#FFF7FE'),
    floor: pxTile(8, 6, (x, y) => x === 1 && y === 1 || x === 5 && y === 4 ? '#FFC46B' : '#FFE3D3') },
  '.scene[data-saison=automne]': {
    wall: pxTile(16, 16, (x, y) => x === 15 ? '#FFC46B' : y === 15 ? '#F4B5E8' : '#FFE3D3'),
    floor: boards(6, '#8E5BB5', '#74449B') },
  '.scene[data-saison=hiver]': {
    wall: pxTile(16, 16, (x, y) => x === 3 && y === 3 || x === 11 && y === 11 ? '#FFF7FE' : x === 12 && y === 4 ? '#BFF6FF' : '#D9F7FF'),
    floor: boards(6, '#C9A6E4', '#8E5BB5') },
};
function roomCSS() { // une feuille de style générée : jour, puis nuit (body.night, plus précis)
  let css = Object.entries(FLAT_PX).map(([sel, r]) => `${sel} .wall { background: ${r.wall}; } ${sel} .floor { background: ${r.floor}; box-shadow: none; }\n`).join('');
  for (const [id, f] of Object.entries(ROOM_PX)) for (const n of [false, true]) {
    const r = f(n), sel = `${n ? 'body.night ' : ''}[data-chambre=${id}]`;
    css += `${sel} .wall { background: ${r.wall}; } ${sel} .floor { background: linear-gradient(${r.plinthe} 0 0) 0 0 / 100% ${2 * PX_EM}em no-repeat, ${r.floor}; box-shadow: ${r.glow ? `0 -2px 12px ${r.glow}` : 'none'}; } ${r.extra ? r.extra(sel) : ''}\n`;
  }
  document.head.insertAdjacentHTML('beforeend', `<style id="pxRooms">${css}</style>`);
}
const rugCache = {};
const rugBg = c => `background: ${rugCache[c] ||= pxURL(60, 12, (x, y) => { // tapis rond en pixels : bord, liseré clair, centre
  const d = ((x + .5 - 30) / 30) ** 2 + ((y + .5 - 6) / 6) ** 2, e = ((x + .5 - 30) / 25) ** 2 + ((y + .5 - 6) / 4.2) ** 2, f = ((x + .5 - 30) / 22) ** 2 + ((y + .5 - 6) / 3.2) ** 2;
  return d > 1 ? '' : e > 1 ? mixHex(c, LINE, .35) : f > 1 ? mixHex(c, '#FFFFFF', .5) : c;
})} center / 100% 100% no-repeat`;
// Vues de la fenêtre
const VIEWS = {
  ciel: { name: 'Ciel changeant', icon: '⛅', price: 0, desc: 'Soleil le jour, lune la nuit',
    html: () => `<div class="sky"><span class="stars"></span><span class="sun">${pix('soleil')}</span><span class="moon">${pix('croissant')}</span><span class="cloud c1">${pix('nuage')}</span><span class="cloud c2">${pix('nuage')}</span></div>` },
  neige: { name: 'Neige', icon: '❄️', price: 200, desc: 'Des flocons qui tombent doucement',
    html: () => `<div class="sky v-neige">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-duration:${4 + (i % 4)}s;animation-delay:-${(i * 0.7).toFixed(1)}s"></i>`).join('')}</div>` },
  etoiles: { name: 'Nuit étoilée', icon: '🌌', price: 250, desc: 'Étoiles qui scintillent et étoiles filantes',
    html: () => `<div class="sky v-etoiles"><span class="stars"></span><span class="stars s2"></span><span class="moon">${pix('croissant')}</span><i class="shoot"></i><i class="shoot s2"></i></div>` },
  orage: { name: 'Orage', icon: '⛈️', price: 300, desc: 'Pluie battante et éclairs',
    html: () => `<div class="sky v-orage">${['c1', 'c2', 'c3'].map(c => `<span class="cloud ${c}">${pix('nuageOrage')}</span>`).join('')}<svg class="bolt" viewBox="0 0 20 40" aria-hidden="true"><path d="M12 0L2 22h7L5 40l13-25h-7z" fill="#FFD99A"/></svg><span class="flash"></span></div>` },
  ville: { name: 'Mini ville', icon: '🌃', price: 450, desc: 'Une ville en pixels qui vit la nuit. Clique sur un immeuble !',
    html: () => `<canvas class="ville" width="${VILLE.W}" height="${VILLE.H}" aria-hidden="true"></canvas>` },
};
function roomHTML(trying, eqMain = S.equip, eqPartner = S.partnerEquip, view = S.view, season = S.season) { // trying : objet affiché à l'essai, sans l'acheter
  let on = Object.keys(DECOR).filter(id => S.decor.on.includes(id) && (!DECOR[id].season || DECOR[id].season === season));
  if (trying && !on.includes(trying)) on = [...on.filter(id => !(DECOR[trying].rug && DECOR[id].rug)), trying];
  const rug = on.map(id => DECOR[id].rug).find(Boolean);
  // le tapis est posé sur le sol, sous tout le reste ; les objets posés au sol (placés avec bottom:) sont plus près de nous
  // que les compagnons, donc dessinés devant eux : un compagnon ne cache jamais le nounours ou le bocal
  const floor = id => /bottom:/.test(DECOR[id].html), deco = list => list.map(id => DECOR[id].html || '').join('');
  return `<div class="wall"></div><div class="floor"></div>${rug ? `<div class="rug" style="${rugBg(rug)}"></div>` : ''}
    <div class="window">${VIEWS[view].html()}<div class="rain"${view === 'orage' ? ' style="--rain:.9"' : ''}></div><div class="frame"></div></div>${SEASONS[season].base}
    ${deco(on.filter(id => !floor(id)))}${petsHTML(S.species, S.partner, eqMain, eqPartner)}${deco(on.filter(floor))}
    <button class="season-nav prev" data-season-step="-1" aria-label="Saison précédente">‹</button><button class="season-nav next" data-season-step="1" aria-label="Saison suivante">›</button>`;
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

// ---------- Ambiance sonore ----------
// Deux sortes de sons : des fichiers MP3 (dossier sons/, `files`) lus par un élément <audio> dont on règle le volume,
// et des sons générés en WebAudio (`build`). Les fichiers ne passent pas par WebAudio : ouverts en file://,
// createMediaElementSource les rendrait muets (restriction d'origine).
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
const SOUNDS = {
  // fichiers de Pixabay (licence Pixabay : usage libre, sans attribution obligatoire)
  lofi: { gain: 0.8, files: ['sons/lofi-1.mp3', 'sons/lofi-2.mp3', 'sons/lofi-3.mp3', 'sons/lofi-4.mp3'] }, // enchaînés au hasard
  rain: { gain: 1, files: ['sons/pluie.mp3'] },
  wind: { gain: 1, files: ['sons/vent.mp3'] },
  cars: { gain: 1, files: ['sons/voitures.mp3'] },
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
function track(files) { // un fichier en boucle, ou plusieurs enchaînés dans un ordre tiré au hasard
  const el = new Audio(), list = shuffle(files); let i = 0;
  el.src = list[0]; el.loop = list.length === 1;
  el.addEventListener('ended', () => { el.src = list[++i % list.length]; el.play().catch(() => {}); });
  return el;
}
function setVol(k, v) {
  S.vol[k] = v;
  if (k === 'rain') document.body.style.setProperty('--rain', v ? 0.4 + v * 0.6 : 0);
  if (SOUNDS[k].files) { // le fichier n'est chargé que la première fois qu'on monte son volume
    if (v > 0 && !MIX[k]) MIX[k] = track(SOUNDS[k].files);
    if (MIX[k]) { MIX[k].volume = Math.min(1, v * SOUNDS[k].gain); if (v) MIX[k].play().catch(() => {}); else MIX[k].pause(); }
    return;
  }
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
  const coins = earn(m * (ev.coinMult || 1) + (full ? CFG.coinsFull : 0), full ? 'Session complète' : 'Révision');
  const pa = addPA(m * CFG.paPerMin * (ev.paMult || 1));
  d.sessions++; S.totalMin += m; d.minutes += m;
  S.lastStudy = today(); S.lastStudyAt = Date.now(); S.decayed = 0;
  if (sub) { sub.min += m; if (!d.subjects.includes(sub.id)) d.subjects.push(sub.id); }
  S.eggs.forEach(e => e.min += m * (ev.eggMult || 1));
  if (m) toast(`+${m} min révisées · +${coins} 🪙${pa ? ` · +${pa} 💗` : ''}${d.coins >= CFG.coinsPerDay ? ' (plafond du jour atteint)' : ''}`);
}

// ---------- Minuteur ----------
// État sauvegardé à part (clé 'jardin_timer') pour survivre à un rechargement de page.
const T = { mode: 'pomodoro', phase: 'work', running: false, started: false, left: 0, total: 0, elapsed: 0, pending: 0, count: 0, last: 0, id: null, sub: '', goal: '', midSaid: false,
  pauseSec: 0, pausedAt: 0, charged: 0 }; // pauses prises pendant le travail de la session, et pièces déjà retirées pour elles
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
  T.left = T.total; T.elapsed = 0; T.pauseSec = T.pausedAt = T.charged = 0;
  saveTimer(); renderTimer();
}
const pauseTotal = () => T.pauseSec + (T.pausedAt ? (Date.now() - T.pausedAt) / 1000 : 0); // secondes de pause dans cette session de travail
function chargePause() { // au-delà de CFG.pauseFree min de pause dans la session : -1 pièce par minute, retirée au fil de l'eau
  const due = Math.floor(pauseTotal() / 60 - CFG.pauseFree) * CFG.pausePenalty - T.charged;
  if (!(due > 0)) return;
  T.charged += due; addCoins(-Math.min(due, S.coins), 'Pause trop longue');
  toast(`⏸️ Pause de plus de ${CFG.pauseFree} min : -${due} 🪙`); saveTimer(); save(); renderHeader();
}
function start() {
  if (T.running) return pause();
  if (T.pausedAt) { chargePause(); T.pauseSec = pauseTotal(); T.pausedAt = 0; }
  if (!T.started) {
    if (T.phase === 'work') { T.sub = $('#subjectSelect').value; T.goal = $('#goalInput').value.trim(); T.midSaid = false; }
    say(T.phase === 'work' ? 'start' : 'pause');
    if (window.Notification?.permission === 'default') Notification.requestPermission().catch(() => {}); // demandé seulement après un clic
  }
  T.running = T.started = true; T.last = Date.now();
  T.id = setInterval(tick, 250);
  saveTimer(); renderAll();
}
function pause() {
  if (T.running && T.phase === 'work') T.pausedAt = Date.now();
  T.running = false; clearInterval(T.id); saveTimer(); renderTimer();
}
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
    if (T.mode !== 'pomodoro') setPhase('work');
    else if (++T.count >= S.cfg.rounds) { // tous les pomodoros choisis sont faits : la série s'arrête là
      dayStats().pomos++; T.count = 0; setPhase('work');
      toast(`🎉 Tes ${S.cfg.rounds} pomodoros sont terminés, bravo !`);
    } else { dayStats().pomos++; setPhase(T.count % 4 ? 'short' : 'long'); }
    notify('Session terminée ! Pause bien méritée 🌼');
  } else { setPhase('work'); notify('Fin de la pause. On s\'y remet quand tu veux 🍅'); }
  save(); renderAll();
}
// Abandonner (travail), Terminer (chrono) ou Passer la pause
function finish() {
  pause(); chargePause();
  if (T.mode === 'pomodoro' && T.phase === 'work' && T.started) T.count = 0; // abandonner repart sur une nouvelle série
  if (T.phase === 'work' && T.pending > 0) endFocus(T.mode === 'chrono' && T.pending >= CFG.chronoFull * 60);
  setPhase('work'); save(); renderAll();
}
let happyUntil = 0;
function endFocus(full) { // fin d'une session de concentration : gains, historique, bilan
  const sec = T.pending; T.pending = 0;
  const long = sec >= CFG.minSession * 60;
  credit(sec, full && long, T.sub); // abandonner garde toujours ce qui a été gagné
  if (!full && !long) return; // trop court pour l'historique et le bilan
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
  const pausing = T.phase === 'work' && T.started && !T.running;
  $('#phase').textContent = (chrono ? 'Chronomètre' : T.mode === 'pomodoro' && T.phase === 'work' ? `Pomodoro ${T.count + 1} / ${S.cfg.rounds}` : PHASE_LABEL[T.phase])
    + (pausing ? ` · pause ${Math.floor(pauseTotal() / 60)} / ${CFG.pauseFree} min` : '');
  $('#tbar').style.width = `${ratio * 100}%`;
  $('#tbar').parentElement.setAttribute('aria-valuenow', Math.round(ratio * 100));
  $('#tbar').parentElement.classList.toggle('break', T.phase !== 'work');
  const studying = T.running && T.phase === 'work';
  $$('.pet.main').forEach(p => p.dataset.state = petState());
  const st = curStreak();
  const done = S.streak.last === today();
  $('#streakBadge').textContent = done ? `🔥 ${st} j de série ✓` : `☑️ Je suis là aujourd'hui${st ? ` · 🔥 ${st} j` : ''}`;
  $('#streakBadge').classList.toggle('todo', !done);
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
  const ev = eventOf(today()), mois = d => new Date(d + 'T12:00').toLocaleDateString('fr', { month: 'long' });
  const next = dayOffset(32 - +today().slice(8)).slice(0, 8) + '01', nx = monthEvent(next); // 1er du mois suivant
  $('#eventBanner').textContent = ev.calm ? `${CALM.icon} Pas d'événement en ce moment. Prochain : ${nx.icon} ${nx.name}, du 1er au ${CFG.eventDays} ${mois(next)}`
    : `${ev.icon} Événement de la semaine : ${ev.name} — ${ev.desc} (jusqu'au ${CFG.eventDays} ${mois(today())})`;
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
// Paquet en cours de révision (fenêtre #deckDlg) : ids = ordre des cartes, i = carte affichée,
// ko = cartes marquées 💔, ok = nombre de ❤️, flip = carte retournée, back = la réponse s'affiche au recto
let deck = null;
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const subOf = c => S.subjects.some(s => s.id === c.sub) ? c.sub : 0; // matière supprimée : la fiche passe dans « Sans matière »
const deckCards = sub => S.cards.filter(c => subOf(c) === sub);
function openDeck(sub, ids = deckCards(sub).map(c => c.id)) {
  deck = { sub, ids, i: 0, ko: [], ok: 0, flip: false, back: deck?.back || false };
  renderDeck(); if (!$('#deckDlg').open) $('#deckDlg').showModal();
}
function renderDeck() {
  const d = deck, c = S.cards.find(x => x.id === d.ids[d.i]);
  const head = `<button class="deck-close" data-deck-stop aria-label="Fermer les fiches">✕</button><h2 id="deckTitle">🃏 ${esc(d.sub ? subName(d.sub) : 'Sans matière')}`;
  $('#deckBody').innerHTML = !c
    ? `${head}</h2><p class="deck-end">Paquet terminé ! ❤️ ${d.ok} apprise${d.ok > 1 ? 's' : ''} · 💔 ${d.ko.length} à revoir</p>
      <div class="row choice">${d.ko.length ? `<button class="btn primary" data-deck-retry>💔 Réviser les cartes non apprises (${d.ko.length})</button>` : ''}
      <button class="btn" data-deck-stop>M'arrêter là</button></div>`
    : `${head} <small class="hint">${d.i + 1} / ${d.ids.length}</small></h2>
      <button class="flipcard" data-deck-flip aria-label="Retourner la carte">
        <span class="inner"><span class="face front"><small>${d.back ? 'Réponse' : 'Question'}</small>${esc(d.back ? c.a : c.q)}</span>
        <span class="face back" aria-hidden="true"><small>${d.back ? 'Question' : 'Réponse'}</small>${esc(d.back ? c.q : c.a)}</span></span></button>
      <div class="deck-row"><button class="heart ko" data-deck-mark="ko" aria-label="Pas encore apprise">💔</button>
        <span class="hint">Clique sur la carte pour la retourner</span>
        <button class="heart ok" data-deck-mark="ok" aria-label="Apprise">❤️</button></div>
      <div class="row choice"><button class="btn" data-deck-shuffle>🔀 Mélanger</button>
        <button class="btn" data-deck-face>🔄 ${d.back ? 'Question au recto' : 'Réponse au recto'}</button></div>`;
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
  const decks = [...S.subjects.map(s => [s.id, s.name, s.color]), [0, 'Sans matière', 'var(--lav-d)']]
    .map(([id, name, col]) => [id, name, col, deckCards(id).length]).filter(([id, , , n]) => id || n);
  $('#deckList').innerHTML = S.cards.length ? decks.map(([id, name, col, n]) =>
    `<button class="deck-btn" data-deck="${id}" style="--c:${col}" ${n ? '' : 'disabled'}><b>${esc(name)}</b><small>${n} carte${n > 1 ? 's' : ''}</small></button>`).join('')
    : '<p class="empty-msg">Ajoute ta première fiche : une question d\'un côté, la réponse de l\'autre.</p>';
  $('#cardCount').textContent = `Mes fiches (${S.cards.length})`;
  $('#cardList').innerHTML = S.cards.map(c => `<div class="subject"><span class="name">${esc(c.q)}<br><small>${esc(c.a)}</small></span>
    <button class="del" data-card-del="${c.id}" aria-label="Supprimer la fiche : ${esc(c.q)}">🗑️</button></div>`).join('');
  if (document.activeElement !== $('#notes')) $('#notes').value = S.notes;
}

// ---------- Réglages ----------
function renderSettings() {
  $('#fontSize').value = S.font; renderCloud();
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
  data.savedAt = Date.now(); // plus récente que la copie en ligne : c'est elle qui sera envoyée au compte
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
      <p>⏱️ Chaque minute de révision rapporte des pièces 🪙, fait couver tes œufs 🥚 et renforce votre amitié 💗.</p>
      <p>💗 10 min de révision = 10 % d'un niveau d'amitié. Mais attention : après ${CFG.decayHours} h sans réviser, ton compagnon perd ${CFG.decayRate * 100} % de son amitié.</p>
      <p>🔥 Coche « Je suis là » chaque jour pour faire grandir ta série et gagner des cadeaux.</p>`,
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

function renderMissions() {
  const d = dayStats(), ev = eventOf(today());
  $('#eventCard').innerHTML = `<p class="event-big">${ev.icon} ${ev.name}</p><p>${ev.desc}</p>
    <p class="hint">Un événement par mois, du 1er au ${CFG.eventDays}.</p>`;
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
  const P = SPECIES[k], a = ACH.find(a => a.reward.pet === k), st = Object.keys(STREAK_REWARDS).find(n => STREAK_REWARDS[n].pet === k);
  if (a) return `succès « ${a.name} »`;
  if (st) return `${st} jours de série (exclusif)`;
  const eggs = Object.keys(EGGS).filter(e => EGGS[e].odds[P.rarity]).map(e => EGGS[e].name.toLowerCase());
  return [P.price != null && `${P.price} 🪙`, ...eggs].filter(Boolean).join(' ou ');
}

// Dans l'onglet Réviser, la pièce mesure environ 900 px de large (--H de haut) et s'affiche à l'échelle --z :
// assez de place pour la déco, et une hauteur qui remplit l'écran (75 %). L'aperçu de la boutique reste à 400 px.
function fitScene() {
  for (const sc of [$('#scene'), $('#decoScene')]) {
    const w = sc.clientWidth;
    if (!w) continue; // onglet caché : refait quand il s'affiche (ResizeObserver)
    // l'aperçu de la boutique est la même chambre de 900 de large, simplement réduite (pas de minimum), pour que la déco y soit placée pareil
    const shop = sc.id === 'decoScene', z = shop ? w / 900 : Math.min(2, Math.max(0.75, w / 900));
    const h = shop ? Math.min(Math.max(260, w * 0.72), 520) : Math.max(400, Math.min(innerHeight * 0.75, w * 0.72, 800));
    sc.style.setProperty('--z', z.toFixed(3)); sc.style.setProperty('--H', `${(h / z).toFixed(1)}px`);
  }
}

function renderCompanions() {
  $$('.scene').forEach(s => s.classList.toggle('has-partner', S.partner));
  $('#scene').dataset.chambre = S.room; $('#scene').dataset.saison = S.season;
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
      ${r < 1 && S.boosts ? `<button class="btn" data-boost="${i}" aria-label="Utiliser un accélérateur (${S.boosts} en réserve)">⚡ +${CFG.boostMin / 60} h</button>` : ''}
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
const decorItem = ([id, d]) =>
  shopItem(`<button class="preview-btn ${tryDecor === id ? 'trying' : ''}" data-try-decor="${id}" aria-label="Essayer : ${d.name}">${d.rug ? `<span class="rug-swatch" style="${rugBg(d.rug)}"></span>` : `<span class="thumb">${thumb(d.icon)}</span>`}</button>`,
      d.name, `data-decor="${id}"`, S.decor.owned.includes(id), S.decor.on.includes(id), d.price, 'Ranger', 'Placer');
const SHOP_CATS = { oeufs: '🥚 Œufs', accessoires: '👗 Accessoires', decor: '🏠 Décor', saisons: '🍂 Saisons', chambres: '🛏️ Chambres', vues: '🪟 Vues', ambiances: '🎧 Ambiances', utilitaires: '🧰 Utilitaires' };
const SHOP = {
  oeufs: () => `<p class="hint">Un œuf éclot après un temps de révision et donne un compagnon de sa rareté que tu n'as pas encore. Il se couve dans l'onglet Collection, et tes heures de révision comptent pour tous tes œufs à la fois.</p><div class="grid">` +
    Object.entries(EGGS).map(([k, E]) => card(`<span class="egg-icon" style="--r:${E.color}">🥚</span>`, E.name,
      `Éclot après ${E.min / 60} h de révision<br>${Object.keys(E.odds).map(r => `Compagnon ${RARITY[r].name.toLowerCase()} (${COLL.filter(c => SPECIES[c].rarity === r && SPECIES[c].egg !== false).length})`).join(' · ')}`,
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
  decor: () => '<div class="grid">' + Object.entries(DECOR).filter(([, d]) => !d.season).map(decorItem).join('') + '</div>',
  saisons: () => '<p class="hint">Ces objets n\'apparaissent que pendant leur saison. Change de saison avec les flèches ‹ › de ta chambre.</p>' +
    SEASON_KEYS.filter(Boolean).map(k => `<h3 class="slot-title">${SEASONS[k].icon} ${SEASONS[k].name}</h3><div class="grid">` +
      Object.entries(DECOR).filter(([, d]) => d.season === k).map(decorItem).join('') + '</div>').join(''),
  ambiances: () => '<p class="hint">Clique sur une icône pour écouter un extrait. Le volume se règle dans l\'onglet Outils.</p><div class="grid">' +
    Object.entries(AMBIANCES).map(([k, a]) => card(`<button class="preview-btn" data-listen="${k}" aria-label="Écouter : ${a.name}"><span class="emoji">${a.icon}</span></button>`,
      a.name, a.desc, S.sounds.includes(k) ? '<span class="owned">✓ Possédé</span>' : buyBtn(`data-sound="${k}"`, a.price))).join('') + '</div>',
  utilitaires: () => '<div class="grid">' + card('<span class="emoji">⚡</span>', "Accélérateur d'œuf", `Ajoute ${CFG.boostMin / 60} h de couvaison à l'œuf de ton choix. En réserve : ${S.boosts}`,
      buyBtn('data-buy-boost', CFG.boostPrice)) + card('<span class="emoji">🧊</span>', 'Gel de série', `Protège ta série un jour sans révision. Réserve : ${S.freezes} / ${CFG.freezeMax}`,
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
  // essayer un objet de saison affiche sa saison ; essayer une chambre l'affiche sans saison (le mur de la saison la cacherait)
  const season = DECOR[tryDecor]?.season ?? (tryRoom ? '' : S.season);
  Object.assign($('#decoScene').dataset, { chambre: tryRoom || S.room, saison: season });
  $('#decoScene .room').innerHTML = roomHTML(tryDecor, withTry(S.equip, 'main'), withTry(S.partnerEquip, 'partner'), tryView || S.view, season);
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

function renderAll() { checkAch(); renderHeader(); renderStudy(); renderCompanions(); renderShop(); renderMissions(); renderSubjects(); renderStats(); renderAch(); renderTools(); renderSettings(); renderFriend(); renderTimer(); }

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
  if (b.id === 'stopBtn') T.phase !== 'work' || T.mode === 'chrono' ? finish() : $('#quitDlg').showModal(); // abandonner demande confirmation
  if ('quitYes' in ds) { $('#quitDlg').close(); finish(); }
  if ('quitNo' in ds) $('#quitDlg').close();
  if (b.id === 'streakBadge') checkIn();
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
  if ('notesClose' in ds) $('#notesDlg').close();
  if (b.id.startsWith('nightBtn')) { S.night = !S.night; save(); renderHeader(); }
  if ('talk' in ds && T.running && T.phase === 'work') { // fenêtre libre (pas modale) : la chambre et le minuteur restent utilisables
    const d = $('#notesDlg');
    if (d.open) d.close(); else { $('#notesQuick').value = S.notes; d.show(); $('#notesQuick').focus(); }
  }
  else if ('talk' in ds) {
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
  if ('deck' in ds) openDeck(+ds.deck);
  if ('deckFlip' in ds) { // on bascule la classe sans tout redessiner, pour garder l'animation
    deck.flip = !deck.flip; b.classList.toggle('flipped', deck.flip);
    b.querySelector('.front').setAttribute('aria-hidden', deck.flip); b.querySelector('.back').setAttribute('aria-hidden', !deck.flip);
  }
  if (ds.deckMark) {
    const c = S.cards.find(x => x.id === deck.ids[deck.i]);
    c.box = ds.deckMark === 'ok' ? Math.min(c.box + 1, 4) : 0; // boîtes de Leitner, gardées pour plus tard
    if (ds.deckMark === 'ok') deck.ok++; else deck.ko.push(c.id);
    deck.i++; deck.flip = false; save(); renderDeck();
  }
  if ('deckShuffle' in ds) { deck.ids = [...deck.ids.slice(0, deck.i), ...shuffle(deck.ids.slice(deck.i))]; deck.flip = false; renderDeck(); toast('🔀 Cartes mélangées'); }
  if ('deckFace' in ds) { deck.back = !deck.back; deck.flip = false; renderDeck(); }
  if ('deckRetry' in ds) openDeck(deck.sub, deck.ko);
  if ('deckStop' in ds) $('#deckDlg').close();
  if (ds.cardDel) { S.cards = S.cards.filter(c => c.id != ds.cardDel); save(); renderTools(); }
  if (b.id === 'signupBtn' && $('#loginForm').reportValidity()) login($('#loginEmail').value.trim(), $('#loginPass').value, true);
  if (b.id === 'syncBtn') { cloudMsg = ''; renderCloud(); cloudReady ? pullCloud(false) : pullCloud(false, loadedAt); }
  if (b.id === 'logoutBtn') { logout(); toast('Déconnecté. Tes données restent sur cet appareil.'); }
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
    S.sounds.push(ds.sound); toast(`${a.icon} ${a.name} : règle son volume dans l'onglet Outils`); save(); renderAll();
  }
  if ('buyBoost' in ds && buy(CFG.boostPrice, "Accélérateur d'œuf")) { S.boosts++; toast('⚡ Accélérateur rangé : utilise-le sur un œuf dans ta couveuse (Collection)'); save(); renderAll(); }
  if (ds.boost && S.boosts > 0 && S.eggs[ds.boost]) { S.boosts--; S.eggs[ds.boost].min += CFG.boostMin; toast(`⚡ +${CFG.boostMin / 60} h de couvaison`); save(); renderAll(); }
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
  if (ds.seasonStep) stepSeason(+ds.seasonStep);
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
$$('#notes, #notesQuick').forEach(t => t.addEventListener('input', e => { S.notes = e.target.value; clearTimeout(notesTimer); notesTimer = setTimeout(save, 400); }));
$('#notesDlg').addEventListener('close', () => { $('#notes').value = S.notes; });
$('#deckDlg').addEventListener('close', () => { deck = null; renderTools(); }); // ✕, « M'arrêter là » ou Échap
$('#loginForm').addEventListener('submit', e => { e.preventDefault(); login($('#loginEmail').value.trim(), $('#loginPass').value, false); });
addEventListener('visibilitychange', () => { if (document.hidden && pushT) pushCloud(); }); // envoie tout de suite ce qui attendait

// ---------- Bloc-notes déplaçable : on l'attrape n'importe où sur son cadre (position sauvegardée) ----------
if (!S.pos || typeof S.pos !== 'object') S.pos = {};
function movable(el, key) {
  const grip = el.querySelector('.grip'), handle = el, place = ([x, y]) => { S.pos[key] = [x, y]; el.style.translate = `${x}px ${y}px`; };
  let from = null;
  place(Array.isArray(S.pos[key]) ? S.pos[key] : [0, 0]);
  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('textarea, input, select, button:not(.grip)')) return; // on peut toujours écrire et cliquer
    from = [e.clientX - S.pos[key][0], e.clientY - S.pos[key][1]]; handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => { if (from) place([e.clientX - from[0], e.clientY - from[1]]); });
  handle.addEventListener('pointerup', () => { if (from) save(); from = null; });
  grip.addEventListener('dblclick', () => { place([0, 0]); save(); }); // ramène la fenêtre à sa place si elle est sortie de l'écran
  grip.addEventListener('keydown', e => {
    const d = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key]; if (!d) return;
    e.preventDefault(); place([S.pos[key][0] + d[0], S.pos[key][1] + d[1]]); save();
  });
}
delete S.pos.chambre; // ancienne position de la chambre, qui n'est plus déplaçable
movable($('#notesDlg'), 'notes');
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
{ const ro = new ResizeObserver(fitScene); ro.observe($('#scene')); ro.observe($('#decoScene')); } addEventListener('resize', fitScene);
function stepSeason(dir) {
  const i = SEASON_KEYS.indexOf(S.season), n = SEASON_KEYS.length;
  S.season = SEASON_KEYS[(i + dir + n) % n]; save(); renderAll();
  toast(`${SEASONS[S.season].icon} ${SEASONS[S.season].name}`);
}
// glisser à gauche / à droite sur une scène change de saison
let swipeX = null;
document.addEventListener('pointerdown', e => { swipeX = e.target.closest('.scene') ? e.clientX : null; });
document.addEventListener('pointerup', e => {
  if (swipeX === null) return;
  const dx = e.clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 60) stepSeason(dx < 0 ? 1 : -1);
});

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
console.assert(levelOf(0) === 1 && levelOf(99) === 1 && levelOf(100) === 2 && levelOf(900) === 10, 'levelOf');
console.assert(eventOf('2026-11-07') === monthEvent('2026-11-07') && eventOf('2026-11-08') === CALM && monthEvent('2026-11-01') !== monthEvent('2026-12-01'), 'événement mensuel');
console.assert(decayAfter(100, 1) === 75 && decayAfter(100, 2) === 56 && decayAfter(0, 3) === 0, 'baisse d\'amitié');
const perRarity = r => COLL.filter(k => SPECIES[k].rarity === r && SPECIES[k].egg !== false).length;
console.assert([['commun', 5], ['peuCommun', 5], ['rare', 4], ['epique', 4], ['legendaire', 3], ['mythique', 3]].every(([r, n]) => perRarity(r) === n) && SPECIES.hibou.egg === false, 'compagnons par rareté');
console.assert(Object.keys(EGGS).every(r => RARITY[r]) && Object.values(STREAK_REWARDS).every(r => !r.pet || SPECIES[r.pet]), 'œufs et paliers de série');
console.assert(COLL.length === 25 && ACH.length >= 20 && new Set(ACH.map(a => a.id)).size === ACH.length, 'collection et succès');
console.assert(Object.values(EGGS).every(E => Math.abs(Object.values(E.odds).reduce((a, b) => a + b) - 1) < 1e-9), 'probabilités des œufs');
console.assert(Object.values(DECOR).every(d => d.rug || SPR[d.icon]) && Object.values(SPR).every(r => r.join('').split('').every(ch => ch === '.' || PXC[ch])), 'dessins de la déco');
console.assert(Object.keys(ROOM_PX).every(k => ROOMS[k]) && mixHex('#000000', '#FFFFFF', .5) === '#808080' && luma('#FFFFFF') > 254, 'chambres en pixel art et couleurs');
console.assert(shuffle([1, 2, 3, 4, 5]).sort().join() === '1,2,3,4,5' && shuffle([]).length === 0, 'shuffle garde les cartes');
console.assert(fmtMin(59) === '59 min' && fmtMin(125) === '2 h 05', 'fmtMin');

// ids inconnus (sauvegarde importée ou ancienne) : on les retire plutôt que de planter
S.pets = S.pets.filter(k => SPECIES[k]?.rarity); if (!S.pets.length) S.pets = ['pingouin'];
if (!S.pets.includes(S.species)) S.species = S.pets[0];
S.owned = S.owned.filter(id => COSMETICS[id]);
for (const eq of [S.equip, S.partnerEquip]) for (const k in eq) if (eq[k] && !COSMETICS[eq[k]]) eq[k] = null;
if (!(S.season in SEASONS)) S.season = '';
S.decor.owned = S.decor.owned.filter(id => DECOR[id]); S.decor.on = S.decor.on.filter(id => DECOR[id]);
S.eggs = S.eggs.filter(e => EGGS[e?.type]); S.sounds = S.sounds.filter(k => AMBIANCES[k]);
delete S.plots; delete S.inv; delete S.harvested; // l'ancien jardin a été retiré
S.ach = S.ach.filter(id => ACH.some(a => a.id === id)); // succès retirés (ex. « Main verte » du jardin)
if (!THEMES[S.theme]) S.theme = 'lavande';
// anciennes couleurs pastel des matières -> palette de la ville
const OLD_PAL = ['#f29bb5', '#93d0b4', '#bba9ea', '#f6c177', '#8fb6ec', '#f5a888'];
S.subjects.forEach(x => { const i = OLD_PAL.indexOf(String(x.color).toLowerCase()); if (i >= 0) x.color = PALETTE[i]; });
S.rooms = S.rooms.filter(k => ROOMS[k]); if (!ROOMS[S.room]) S.room = 'douce';
S.views = S.views.filter(k => VIEWS[k]); if (!VIEWS[S.view]) S.view = 'ciel';

if (!S.lastStudyAt) { S.lastStudyAt = Date.now(); S.decayed = 0; } // anciennes sauvegardes : la baisse d'amitié par tranches de 15 h démarre maintenant
S.cfg.rounds ||= DEFAULT.cfg.rounds;
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
if (!bubble) say(absentDays() >= 2 ? 'back' : nextExam() && daysTo(nextExam().date) <= 7 ? 'exam' : 'hello');
// chaque demi-minute : baisse d'amitié si la page reste ouverte longtemps, et pénalité de pause en cours
setInterval(() => { if (applyDecay()) renderAll(); if (T.pausedAt) { chargePause(); renderTimer(); } }, 30e3);
if (new Date().getDay() === 1 && S.reviewSeen !== today() && S.sessions.length) { // le lundi, le compagnon annonce son bilan
  S.reviewSeen = today(); bubble = 'J\'ai préparé ton bilan de la semaine, il t\'attend dans 📊 Stats !'; save();
}
roomCSS();
renderAll();
if (firstRun) { renderTuto(); $('#tuto').showModal(); }
pullCloud(false, loadedAt); // connecté : récupère la copie en ligne si elle est plus récente que celle chargée, sinon envoie celle-ci
