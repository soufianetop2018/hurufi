/*
 * Données gardées sur l'appareil (localStorage) : réglages, apprenants, progression.
 * Avec un compte, cloud.js recopie aussi les apprenants en ligne (Supabase).
 */

const STORE_KEY = "hurufi-v1";

const Settings = {
  defaults: { lang: null, sfx: true, rate: 1, translate: true, autoplay: true, unlockAll: false },
  get(k) { return k in Store.s.settings ? Store.s.settings[k] : this.defaults[k]; },
  set(k, v) { Store.s.settings[k] = v; Store.save(); },
};

/* Index du parcours : activité → unité → niveau. */
const Index = { acts: {}, units: {}, levels: {} };
function buildIndex() {
  DATA.levels.forEach((lv, li) => {
    Index.levels[lv.id] = { level: lv, i: li };
    lv.units.forEach((u, ui) => {
      Index.units[u.id] = { unit: u, level: lv, i: ui };
      u.acts.forEach((a, ai) => { Index.acts[a.id] = { act: a, unit: u, level: lv, i: ai }; });
    });
  });
}

const RANKS = {
  child: [[0, "🌱", "rank_seed"], [150, "🌿", "rank_bud"], [400, "🌼", "rank_flower"], [900, "🌳", "rank_tree"],
          [1800, "⭐", "rank_star"], [3200, "🌙", "rank_moon"], [5000, "☀️", "rank_sun"]],
  adult: [[0, "📗", "rank_beginner"], [150, "✏️", "rank_learner"], [400, "📖", "rank_reader"], [900, "🖋️", "rank_writer"],
          [1800, "🎓", "rank_skilled"], [3200, "🏅", "rank_excellent"], [5000, "👑", "rank_expert"]],
};

const AVATARS = ["🧒", "👧", "👦", "👩", "👨", "🧕", "👵", "👴", "🐱", "🦊", "🐼", "🦁", "🐰", "🐢", "🦄", "🌸"];
const COLORS = ["#0d9488", "#f97316", "#7c3aed", "#db2777", "#2563eb", "#65a30d", "#ca8a04", "#0891b2"];

const Store = {
  s: null,
  listeners: [],

  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
    this.s = Object.assign({ learners: [], current: null, settings: {}, dirty: [], removed: [] }, s || {});
  },

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.s)); } catch (e) { /* stockage plein ou bloqué */ }
  },

  /* Un apprenant a changé : on le sauvegarde et on prévient la synchronisation. */
  touch(learner) {
    learner.updated = new Date().toISOString();
    if (!this.s.dirty.includes(learner.id)) this.s.dirty.push(learner.id);
    this.save();
    this.listeners.forEach(f => f(learner));
  },

  learners() { return this.s.learners; },
  learner(id) { return this.s.learners.find(l => l.id === id) || null; },
  current() { return this.learner(this.s.current); },
  select(id) { this.s.current = id; this.save(); },

  addLearner({ name, kind, avatar }) {
    const l = {
      id: uuid(), name: String(name || "").trim().slice(0, 30) || "🙂", kind: kind === "adult" ? "adult" : "child",
      avatar: avatar || AVATARS[0], color: COLORS[this.s.learners.length % COLORS.length],
      owner: (window.Cloud && Cloud.uid()) || null, created: new Date().toISOString(),
      xp: 0, progress: {}, badges: {}, mistakes: {}, log: [], days: [], traced: 0,
    };
    this.s.learners.push(l);
    this.touch(l);
    return l;
  },

  updateLearner(id, patch) {
    const l = this.learner(id);
    if (!l) return;
    Object.assign(l, patch);
    this.touch(l);
  },

  removeLearner(id) {
    const l = this.learner(id);
    this.s.learners = this.s.learners.filter(x => x.id !== id);
    this.s.dirty = this.s.dirty.filter(x => x !== id);
    if (l && l.owner) this.s.removed.push(id);
    if (this.s.current === id) this.s.current = null;
    this.save();
    if (window.Cloud) Cloud.schedule();
  },

  resetLearner(id) {
    this.updateLearner(id, { xp: 0, progress: {}, badges: {}, mistakes: {}, log: [], days: [], traced: 0 });
  },

  /* ----------------------------------------------------------------- progression */
  actStars(l, actId) { return (l.progress[actId] || {}).s || 0; },

  unitStars(l, unit) {
    return unit.acts.reduce((n, a) => n + this.actStars(l, a.id), 0);
  },

  levelStars(l, lv) {
    let got = 0, max = 0;
    lv.units.forEach(u => { got += this.unitStars(l, u); max += u.acts.length * 3; });
    return { got, max };
  },

  /* Niveau ouvert : ouvert d'office, ou 40 % des étoiles du niveau précédent. */
  levelOpen(l, lv) {
    if (lv.open || Settings.get("unlockAll")) return true;
    const i = Index.levels[lv.id].i;
    if (i === 0) return true;
    const { got, max } = this.levelStars(l, DATA.levels[i - 1]);
    return got >= max * 0.4;
  },

  totalStars(l) { return Object.values(l.progress).reduce((n, p) => n + (p.s || 0), 0); },

  streak(l) {
    const days = new Set(l.days || []);
    let d = new Date();
    if (!days.has(today(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(today(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },

  rank(l) {
    const ladder = RANKS[l.kind] || RANKS.child;
    let cur = ladder[0], next = null;
    for (let i = 0; i < ladder.length; i++) {
      if (l.xp >= ladder[i][0]) { cur = ladder[i]; next = ladder[i + 1] || null; }
    }
    return { emoji: cur[1], key: cur[2], from: cur[0], next: next ? next[0] : null };
  },

  /* Enregistre une partie ; renvoie étoiles, XP gagnés, nouveaux badges et niveaux ouverts. */
  record(actId, r) {
    const l = this.current();
    if (!l) return null;
    const info = Index.acts[actId];
    const total = Math.max(1, r.total);
    const pct = Math.max(0, Math.min(1, r.score / total));
    const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0;
    const before = l.progress[actId] || { s: 0, b: 0, p: 0 };
    const openBefore = DATA.levels.filter(lv => this.levelOpen(l, lv)).map(lv => lv.id);
    const xp = Math.round(r.score * 4 + stars * 8 + (stars > before.s ? 15 : 0));

    l.progress[actId] = { s: Math.max(before.s, stars), b: Math.max(before.b, Math.round(pct * 100)),
                          p: before.p + 1, t: Date.now() };
    l.xp += xp;
    const day = today();
    if (!l.days.includes(day)) { l.days.push(day); l.days = l.days.slice(-120); }
    l.log.push({ a: actId, s: stars, c: r.score, n: r.total, x: xp, d: Math.round(r.duration || 0), t: Date.now() });
    l.log = l.log.slice(-200);
    (r.mistakes || []).forEach(k => {
      const m = l.mistakes[k] || { n: 0 };
      l.mistakes[k] = { n: m.n + 1, t: Date.now() };
    });
    (r.fixed || []).forEach(k => {
      if (!l.mistakes[k]) return;
      l.mistakes[k].n -= 1;
      if (l.mistakes[k].n <= 0) delete l.mistakes[k];
    });
    const keys = Object.keys(l.mistakes);
    if (keys.length > 60) keys.sort((a, b) => l.mistakes[a].t - l.mistakes[b].t).slice(0, keys.length - 60)
      .forEach(k => delete l.mistakes[k]);
    if (r.traced) l.traced = (l.traced || 0) + r.traced;
    if (r.flags) l.flags = Object.assign(l.flags || {}, r.flags);

    const badges = BADGES.filter(b => !l.badges[b.id] && b.test(l, { actId, stars, info, r }));
    badges.forEach(b => { l.badges[b.id] = Date.now(); });
    const unlocked = DATA.levels.filter(lv => !openBefore.includes(lv.id) && this.levelOpen(l, lv));
    this.touch(l);
    return { stars, pct, xp, best: Math.max(before.s, stars), badges, unlocked };
  },

  mistakeKeys(l, n = 10) {
    return Object.keys(l.mistakes || {}).filter(k => DATA.items[k])
      .sort((a, b) => l.mistakes[b].n - l.mistakes[a].n || l.mistakes[b].t - l.mistakes[a].t).slice(0, n);
  },
};

/* Badges : test(apprenant, partie) → vrai quand il est gagné. */
function levelDone(l, id) {
  const lv = Index.levels[id].level;
  return lv.units.every(u => u.acts.every(a => Store.actStars(l, a.id) > 0));
}
const playsCount = l => (l.log || []).length;
const BADGES = [
  { id: "first", emoji: "🎉", key: "b_first", test: l => playsCount(l) >= 1 },
  { id: "plays10", emoji: "🔟", key: "b_plays10", test: l => playsCount(l) >= 10 },
  { id: "plays50", emoji: "🏃", key: "b_plays50", test: l => playsCount(l) >= 50 },
  { id: "stars3", emoji: "⭐", key: "b_stars3", test: (l, g) => g.stars === 3 },
  { id: "perfect5", emoji: "💯", key: "b_perfect5", test: l => (l.log || []).filter(x => x.s === 3).length >= 5 },
  { id: "streak3", emoji: "🔥", key: "b_streak3", test: l => Store.streak(l) >= 3 },
  { id: "streak7", emoji: "🌟", key: "b_streak7", test: l => Store.streak(l) >= 7 },
  { id: "xp1000", emoji: "💎", key: "b_xp1000", test: l => l.xp >= 1000 },
  { id: "letters", emoji: "🔤", key: "b_letters", test: l => levelDone(l, "l1") },
  { id: "harakat", emoji: "🎵", key: "b_harakat", test: l => levelDone(l, "l2") },
  { id: "forms", emoji: "🔗", key: "b_forms", test: l => levelDone(l, "l3") },
  { id: "words", emoji: "📚", key: "b_words", test: l => levelDone(l, "l4") },
  { id: "reader", emoji: "📖", key: "b_reader", test: (l, g) => g.info && g.info.act.kind === "story" && g.stars > 0 },
  { id: "stories", emoji: "🏆", key: "b_stories", test: l => levelDone(l, "l5") },
  { id: "life", emoji: "🏙️", key: "b_life", test: l => levelDone(l, "l6") },
  { id: "writer", emoji: "✍️", key: "b_writer", test: l => (l.traced || 0) >= 10 },
  { id: "writer50", emoji: "🖋️", key: "b_writer50", test: l => (l.traced || 0) >= 50 },
  { id: "name", emoji: "🪪", key: "b_name", test: (l, g) => g.info && g.info.act.kind === "trace_name" && g.stars > 0 },
  { id: "speaker", emoji: "🎤", key: "b_speaker", test: (l, g) => g.info && g.info.act.kind === "speak" && g.stars > 0 },
  { id: "review", emoji: "🔁", key: "b_review", test: (l, g) => g.actId === "review" && g.stars > 0 },
];
