/* Démarrage et navigation (adresses #/…). */

const APP_VERSION = "1.0.0";
const IN_APP = / HurufiApp\//.test(navigator.userAgent);

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  Speech.stop();
  closeModal();
  readToken++;
  window.onSyncChange = null;
  const h = location.hash.replace(/^#\/?/, "");
  const [name, ...rest] = h.split("/");
  const arg = rest.join("/");
  if (Play.ctx && !Play.ctx.over && name !== "play") Play.ctx.over = true;

  if (!Settings.get("lang") && name !== "welcome") return Screens.welcome();
  // Le compte est obligatoire : sans compte, seuls la bienvenue et les écrans de connexion s'ouvrent.
  if (!Cloud.signedIn() && !["welcome", "account"].includes(name)) return Screens.account(Store.s.knownAccount ? "login" : "signup");
  const noLearner = !Store.learners().length;
  if (noLearner && !["welcome", "new", "helper", "account"].includes(name)) return Screens.newLearner();

  switch (name) {
    case "welcome": return Screens.welcome();
    case "new": return Screens.newLearner();
    case "edit": return Screens.newLearner(arg);
    case "profiles": return Screens.profiles();
    case "level": return Screens.level(arg);
    case "unit": return Screens.unit(arg);
    case "play": return Store.current() ? Play.start(arg) : Screens.profiles();
    case "badges": return Screens.badges();
    case "helper": return Screens.helper(arg);
    case "account": return Screens.account(arg);
    default: return Store.current() ? Screens.home() : Screens.profiles();
  }
}

/* Bouton « retour » du téléphone (appli Android) : vrai si la page s'en occupe. */
window.appBack = () => {
  if (modalOpen()) { openModal.close ? openModal.close() : closeModal(); return true; }
  const h = location.hash;
  if (h.startsWith("#/play/")) { Play.quit(); return true; }
  if (!h || h === "#/" || h === "#/home" || h === "#/welcome" || (h === "#/profiles" && !Store.current())) return false;
  history.back();
  return true;
};

function boot() {
  Store.load();
  buildIndex();
  applyLang();
  try { Cloud.init(); } catch (e) { console.warn("cloud", e); }
  if (window.HurufiNative && HurufiNative.setBars) HurufiNative.setBars("#f0fdfa", false);
  document.body.classList.toggle("in-app", IN_APP);
  // Dans l'appli, la reconnaissance vocale passe par le téléphone (native.js) ; sinon pas de micro.
  if (IN_APP && !window.AndroidSpeech) window.SpeechRecognition = window.webkitSpeechRecognition = undefined;
  document.addEventListener("visibilitychange", () => { if (document.hidden) Speech.stop(); });
  addEventListener("hashchange", route);
  // On attend (au plus 4 s) de savoir si une session existe, pour ne pas montrer la connexion par erreur.
  Promise.race([Cloud.ready, wait(4000)]).then(route);
}

boot();
