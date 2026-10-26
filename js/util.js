/* Petits outils d'affichage : sélecteurs, échappement, hasard, toasts, fenêtres, confettis. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const app = () => $("#app");
const wait = ms => new Promise(r => setTimeout(r, ms));

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Texte arabe à LIRE (police naskh, toujours de droite à gauche, même dans l'interface fr/en). */
function ar(text, cls = "") {
  return `<span class="read ${cls}" lang="ar" dir="rtl">${esc(text)}</span>`;
}

/* Texte latin (chiffres, prix…) : toujours de gauche à droite. */
function ltr(text, cls = "") {
  return `<span class="ltr ${cls}" dir="ltr">${esc(text)}</span>`;
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = list => list[Math.floor(Math.random() * list.length)];
const sample = (list, n) => shuffle(list).slice(0, n);

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 3 | 8)).toString(16);
  });
}

function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Nombre de pictogrammes (un emoji composé compte pour un). */
function emojiLength(s) {
  s = s || "";
  if (window.Intl && Intl.Segmenter) return Array.from(new Intl.Segmenter().segment(s)).length;
  return Array.from(s).length;
}

function starsHtml(n, max = 3, cls = "") {
  let s = `<span class="stars ${cls}" aria-label="${n}/${max}">`;
  for (let i = 0; i < max; i++) s += `<span class="${i < n ? "on" : "off"}">★</span>`;
  return s + "</span>";
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/* Fenêtre modale ; renvoie l'élément de contenu. */
function openModal(html, { onClose, cls = "" } = {}) {
  closeModal();
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-back"><div class="modal ${cls}" role="dialog" aria-modal="true">
      <button class="modal-x" aria-label="${esc(t("close"))}">✕</button>${html}</div></div>`;
  const back = $(".modal-back", root);
  const close = () => { closeModal(); if (onClose) onClose(); };
  $(".modal-x", root).onclick = close;
  back.addEventListener("click", e => { if (e.target === back) close(); });
  requestAnimationFrame(() => back.classList.add("show"));
  openModal.close = close;
  return $(".modal", root);
}

function closeModal() {
  $("#modal-root").innerHTML = "";
  openModal.close = null;
}

function modalOpen() { return !!$("#modal-root .modal"); }

function confirmBox(message, { yes = t("yes"), no = t("no"), danger = true } = {}) {
  return new Promise(resolve => {
    const m = openModal(`<div class="confirm"><p>${esc(message)}</p>
      <div class="row center"><button class="btn ${danger ? "danger" : "primary"}" data-v="1">${esc(yes)}</button>
      <button class="btn ghost" data-v="0">${esc(no)}</button></div></div>`, { onClose: () => resolve(false) });
    $$("[data-v]", m).forEach(b => b.onclick = () => { closeModal(); resolve(b.dataset.v === "1"); });
  });
}

/* Confettis sur un canvas plein écran. */
const Confetti = {
  parts: [],
  running: false,
  burst(count = 120) {
    const c = $("#confetti");
    c.width = innerWidth;
    c.height = innerHeight;
    const colors = ["#0d9488", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#ec4899", "#a855f7"];
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.4, y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, color: colors[i % colors.length],
        life: 140 + Math.random() * 60,
      });
    }
    if (!this.running) { this.running = true; requestAnimationFrame(() => this.tick()); }
  },
  tick() {
    const c = $("#confetti");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    this.parts = this.parts.filter(p => p.life > 0 && p.y < c.height + 40);
    for (const p of this.parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
    }
    if (this.parts.length) requestAnimationFrame(() => this.tick());
    else { this.running = false; ctx.clearRect(0, 0, c.width, c.height); }
  },
};

/* Najma, la mascotte (un petit chameau) qui encourage. */
const Mascot = {
  timer: null,
  html() {
    return `<div class="mascot" id="mascot" aria-hidden="true"><div class="mascot-bubble" id="mascot-bubble"></div>
      <div class="mascot-face">🐪</div></div>`;
  },
  say(msg, mood = "") {
    const m = $("#mascot");
    if (!m) return;
    $("#mascot-bubble").textContent = msg;
    m.className = "mascot show " + mood;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => m.classList.remove("show"), 1600);
  },
};
