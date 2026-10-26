/*
 * Compte (facultatif) et sauvegarde en ligne avec Supabase.
 * Sans compte, tout reste sur l'appareil. Avec un compte SYNTRIX FIKRA (le même que pour
 * « Petit Français »), chaque apprenant est une ligne de la table hurufi_learners ; la sécurité
 * RLS garantit que chacun ne voit que ses apprenants (voir supabase/schema.sql).
 */

const CLOUD = {
  url: "https://aouqeijefinznksaizig.supabase.co",
  key: "sb_publishable_WV3O2dovNw2Bvnc6ccJd9Q_Ns_TJoXx",   // clé publique (faite pour le navigateur)
  site: "https://soufianetop2018.github.io/hurufi/",       // les liens reçus par e-mail ouvrent le site
  table: "hurufi_learners",
};

const Cloud = {
  client: null,
  session: null,
  recovering: false,
  syncing: false,
  status: "local",       // local | ok | syncing | offline | error
  timer: null,

  init() {
    if (!window.supabase) return;
    this.client = supabase.createClient(CLOUD.url, CLOUD.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "hurufi-auth" },
    });
    this.client.auth.onAuthStateChange((event, session) => {
      const had = this.session;
      this.session = session;
      if (event === "PASSWORD_RECOVERY") { this.recovering = true; setTimeout(() => go("#/account/newpass")); }
      // setTimeout : ne jamais rappeler Supabase depuis ce rappel (blocage possible).
      if (session && !had) setTimeout(() => this.afterSignIn());
      if (event === "SIGNED_OUT") this.status = "local";
    });
    this.client.auth.getSession().then(({ data }) => {
      this.session = data.session;
      if (this.session) this.sync();
    });
    // Lien de confirmation reçu par e-mail : on nettoie l'adresse.
    const fromLink = new URLSearchParams(location.hash.replace(/^#\/?/, ""));
    if (fromLink.has("access_token") || fromLink.has("error")) {
      setTimeout(() => {
        history.replaceState(null, "", location.pathname + location.search);
        if (fromLink.has("error")) toast(t("link_invalid"), 5000);
        else toast(t("account_ready"), 4000);
        route();
      }, 300);
    }
    addEventListener("online", () => this.schedule(500));
    Store.listeners.push(() => this.schedule());
  },

  user() { return this.session ? this.session.user : null; },
  uid() { return this.session ? this.session.user.id : null; },
  email() { return this.session ? this.session.user.email : ""; },

  /* Adresse vers laquelle renvoient les e-mails (le site, même depuis l'appli Android). */
  redirect() {
    return /^https?:\/\/(127\.0\.0\.1|localhost)|app\.hurufi\.local/.test(location.href) ? CLOUD.site
      : location.origin + location.pathname;
  },

  async afterSignIn() {
    const uid = this.uid();
    // Les apprenants de cet appareil sans compte rejoignent le compte qui vient de se connecter.
    Store.learners().forEach(l => {
      if (!l.owner) { l.owner = uid; if (!Store.s.dirty.includes(l.id)) Store.s.dirty.push(l.id); }
    });
    Store.save();
    await this.sync();
    route();
  },

  schedule(ms = 1500) {
    if (!this.session) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), ms);
  },

  /* Envoie ce qui a changé, puis récupère les apprenants des autres appareils. */
  async sync() {
    if (!this.session || this.syncing) return;
    this.syncing = true;
    this.status = "syncing";
    const uid = this.uid();
    try {
      for (const id of Store.s.removed.slice()) {
        const { error } = await this.client.from(CLOUD.table).delete().eq("id", id);
        if (error) throw error;
        Store.s.removed = Store.s.removed.filter(x => x !== id);
      }
      const { data, error } = await this.client.from(CLOUD.table).select("*");
      if (error) throw error;
      (data || []).forEach(row => this.mergeRow(row, uid));
      const rows = Store.learners().filter(l => l.owner === uid && Store.s.dirty.includes(l.id)).map(l => this.toRow(l));
      if (rows.length) {
        const res = await this.client.from(CLOUD.table).upsert(rows);
        if (res.error) throw res.error;
      }
      Store.s.dirty = Store.s.dirty.filter(id => !rows.some(r => r.id === id));
      Store.save();
      this.status = "ok";
      this.lastSync = Date.now();
    } catch (e) {
      this.status = navigator.onLine === false || /fetch|network/i.test(String(e && e.message)) ? "offline" : "error";
      console.warn("sync", e);
    } finally {
      this.syncing = false;
      if (window.onSyncChange) onSyncChange();
    }
  },

  toRow(l) {
    const { id, name, kind, avatar, color, created, updated, owner, ...rest } = l;
    return { id, owner_id: owner, name, kind, avatar, color, data: rest, updated_at: updated || new Date().toISOString() };
  },

  /* Fusionne une ligne reçue avec l'apprenant local (on ne perd jamais d'étoiles). */
  mergeRow(row, uid) {
    const remote = { id: row.id, name: row.name, kind: row.kind, avatar: row.avatar, color: row.color,
                     owner: uid, updated: row.updated_at, ...(row.data || {}) };
    const local = Store.learner(row.id);
    if (!local) {
      if (!Store.s.removed.includes(row.id)) Store.s.learners.push(Object.assign(blankLearner(), remote));
      return;
    }
    const newer = (remote.updated || "") > (local.updated || "") ? remote : local;
    ["name", "kind", "avatar", "color", "arName"].forEach(k => { if (newer[k] !== undefined) local[k] = newer[k]; });
    local.xp = Math.max(local.xp || 0, remote.xp || 0);
    local.traced = Math.max(local.traced || 0, remote.traced || 0);
    const prog = Object.assign({}, remote.progress || {});
    Object.entries(local.progress || {}).forEach(([k, p]) => {
      const r = prog[k];
      prog[k] = !r ? p : { s: Math.max(p.s, r.s), b: Math.max(p.b, r.b), p: Math.max(p.p, r.p), t: Math.max(p.t || 0, r.t || 0) };
    });
    local.progress = prog;
    local.badges = Object.assign({}, remote.badges || {}, local.badges || {});
    local.mistakes = newer === remote ? (remote.mistakes || {}) : (local.mistakes || {});
    const seen = new Set();
    local.log = [...(remote.log || []), ...(local.log || [])].filter(x => {
      const k = x.a + x.t;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => a.t - b.t).slice(-200);
    local.days = Array.from(new Set([...(remote.days || []), ...(local.days || [])])).sort().slice(-120);
    local.flags = Object.assign({}, remote.flags || {}, local.flags || {});
    local.owner = uid;
    if (!Store.s.dirty.includes(local.id) && JSON.stringify(this.toRow(local).data) !== JSON.stringify(row.data)) {
      Store.s.dirty.push(local.id);
    }
  },

  /* Déconnexion : les apprenants du compte quittent cet appareil (ils restent en ligne). */
  async signOut() {
    const uid = this.uid();
    await this.sync();
    await this.client.auth.signOut({ scope: "local" });
    Store.s.learners = Store.learners().filter(l => l.owner !== uid);
    Store.s.dirty = [];
    if (!Store.learner(Store.s.current)) Store.s.current = null;
    Store.save();
  },

  /* Suppression définitive du compte et de toutes ses données (exigé par Google Play). */
  async deleteAccount() {
    const uid = this.uid();
    const { error } = await this.client.rpc("hurufi_delete_account");
    if (error) throw error;
    await this.client.auth.signOut({ scope: "local" }).catch(() => {});
    Store.s.learners = Store.learners().filter(l => l.owner !== uid);
    Store.s.dirty = [];
    Store.s.removed = [];
    if (!Store.learner(Store.s.current)) Store.s.current = null;
    Store.save();
  },
};

function blankLearner() {
  return { xp: 0, progress: {}, badges: {}, mistakes: {}, log: [], days: [], traced: 0 };
}
