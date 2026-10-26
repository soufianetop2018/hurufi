/*
 * Voix et petits effets sonores.
 * Toutes les phrases sont enregistrées d'avance (voix naturelles, dossier audio/, table window.AUDIO
 * fabriquée par tools/build.py) : l'application parle même sans Internet. Si un son manque,
 * on utilise la voix du navigateur.
 */

const BROWSER_LANG = { ar: "ar-SA", fr: "fr-FR", en: "en-US" };

const Speech = {
  token: 0,
  current: null,      // <audio> en cours
  settle: null,       // termine la promesse du son en cours
  blobs: new Map(),   // adresse du MP3 → URL blob (déjà téléchargé)

  file(text, lang = "ar") {
    const table = window.AUDIO && AUDIO[lang];
    const name = table && table[String(text || "").replace(/\s+/g, " ").trim()];
    return name ? `audio/${lang}/${name}.mp3` : null;
  },

  has(text, lang = "ar") { return !!this.file(text, lang); },

  /* Le son est chargé avec fetch puis joué depuis un blob : marche aussi dans l'appli Android. */
  async blob(url) {
    if (this.blobs.has(url)) return this.blobs.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error("audio " + res.status);
    const u = URL.createObjectURL(await res.blob());
    this.blobs.set(url, u);
    return u;
  },

  preload(texts, lang = "ar") {
    texts.forEach(x => { const f = this.file(x, lang); if (f) this.blob(f).catch(() => {}); });
  },

  /* Dit un texte ; la promesse vaut true si le son est allé jusqu'au bout. */
  say(text, { lang = "ar", slow = false } = {}) {
    if (!text) return Promise.resolve(false);
    const my = ++this.token;
    this.halt();
    return this.speak(text, lang, slow, my);
  },

  speak(text, lang, slow, my) {
    const file = this.file(text, lang);
    if (!file) return this.browser(text, lang, slow, my);
    return this.play(file, slow, my).catch(() => (my === this.token ? this.browser(text, lang, slow, my) : false));
  },

  /* Plusieurs phrases à la suite : [[texte, langue], …] ; s'arrête si un autre son commence. */
  async seq(list, { slow = false } = {}) {
    const my = ++this.token;
    this.halt();
    for (const [text, lang] of list) {
      if (my !== this.token) return false;
      const ok = await this.speak(text, lang || "ar", slow, my);
      if (!ok || my !== this.token) return false;
      await wait(200);
    }
    return true;
  },

  async play(file, slow, my) {
    const src = await this.blob(file);
    if (my !== this.token) return false;
    return new Promise((resolve, reject) => {
      const a = new Audio(src);
      a.playbackRate = Math.min(1.3, Math.max(0.6, (Settings.get("rate") || 1) * (slow ? 0.72 : 1)));
      let done = false;
      const guard = setTimeout(() => finish(false), 25000);
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        if (this.settle === finish) this.settle = null;
        resolve(ok);
      };
      this.current = a;
      this.settle = finish;
      a.onended = () => finish(my === this.token);
      a.onerror = () => { if (!done) { done = true; clearTimeout(guard); reject(new Error("audio")); } };
      a.play().catch(err => {
        // Pas encore de geste de l'utilisateur, ou son interrompu : on reste silencieux.
        if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) finish(false);
        else if (!done) { done = true; clearTimeout(guard); reject(err); }
      });
    });
  },

  browser(text, lang, slow, my) {
    if (!("speechSynthesis" in window)) return Promise.resolve(false);
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BROWSER_LANG[lang] || lang;
      const v = speechSynthesis.getVoices().find(x => x.lang.replace("_", "-").startsWith(lang));
      if (v) u.voice = v;
      u.rate = (Settings.get("rate") || 1) * (slow ? 0.65 : 0.9);
      let done = false;
      const end = () => { if (!done) { done = true; resolve(my === this.token); } };
      u.onend = end;
      u.onerror = end;
      setTimeout(end, 2500 + String(text).length * 150);
      setTimeout(() => { if (my === this.token) speechSynthesis.speak(u); else end(); }, 60);
    });
  },

  /* Coupe le son en cours sans changer de jeton. */
  halt() {
    if (this.current) { this.current.pause(); this.current = null; }
    if (this.settle) this.settle(false);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  },

  stop() { this.token++; this.halt(); },

  /* Consigne d'une activité, dans la langue de l'interface. */
  instruction(key) {
    const tr = DATA.ui.instructions[key];
    return tr ? this.say(tr[lang()], { lang: lang() }) : Promise.resolve(false);
  },

  /* Encouragement au hasard (« good », « bad », « stars3 »…) ; renvoie le texte affiché. */
  feedback(kind, speak = true) {
    const list = DATA.ui.feedback[kind];
    if (!list) return "";
    const tr = pick(list);
    if (speak) this.say(tr[lang()], { lang: lang() });
    return tr[lang()];
  },

  /* Dit un texte traduit {ar, fr, en} dans la langue de l'interface. */
  sayT(tr) { return tr ? this.say(tr[lang()], { lang: lang() }) : Promise.resolve(false); },
};

const Sfx = {
  ctx: null,
  audio() {
    if (!Settings.get("sfx")) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone(freq, start, dur, type = "sine", vol = 0.16) {
    const ctx = this.audio();
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },
  click() { this.tone(660, 0, 0.08, "triangle", 0.07); },
  correct() { this.tone(660, 0, 0.14, "triangle"); this.tone(990, 0.1, 0.22, "triangle"); },
  wrong() { this.tone(220, 0, 0.18, "sawtooth", 0.06); this.tone(180, 0.12, 0.22, "sawtooth", 0.05); },
  flip() { this.tone(520, 0, 0.06, "sine", 0.07); },
  pop() { this.tone(900, 0, 0.05, "square", 0.05); this.tone(1400, 0.03, 0.08, "sine", 0.09); },
  star(i = 0) { this.tone(880 + i * 220, 0, 0.25, "triangle", 0.14); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.12, 0.3, "triangle", 0.15)); },
  unlock() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.25, "sine", 0.14)); },
};
