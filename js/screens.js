/* Les écrans : accueil, choix de l'apprenant, niveaux, unités, résultats, badges, espace accompagnant. */

const Screens = {};

const KIND_ICONS = {
  learn: "👀", learn_forms: "🔠", hear_pick: "👂", read_sound: "📖", word_pic: "🖼️", pic_word: "🔤",
  pic_sentence: "🖼️", first_letter: "🔍", bubbles: "🎈", memory: "🃏", match: "🔗", build: "🧩", missing: "❓",
  haraka: "🎵", trace: "✍️", trace_forms: "✍️", trace_words: "✍️", trace_digits: "✍️", trace_name: "📛",
  position: "🔎", sun_moon: "☀️", order: "🧱", order_story: "📜", order_list: "📅", order_letters: "🔡",
  truefalse: "✅", story: "📖", message: "📩", speak: "🎤", number: "🔢", number_word: "🔢", review: "🔁",
};

function fwdArrow() { return lang() === "ar" ? "⬅" : "➜"; }
function backArrow() { return lang() === "ar" ? "➜" : "⬅"; }

function titleOf(x) { return x.title[lang()] || x.title.ar; }
/* Texte d'interface sans harakat (les petites lignes restent lisibles). */
function plainAr(s) { return String(s || "").replace(/[\u064B-\u0652\u0670]/g, ""); }
function sayOf(x) { return (x.say || x.title)[lang()]; }

function kindName(a) {
  const k = a.kind === "story" && DATA.stories[a.story] && DATA.stories[a.story].kind === "message" ? "message" : a.kind;
  return DATA.ui.kinds[k] ? DATA.ui.kinds[k][lang()] : k;
}

/* Bouton « haut-parleur » qui dit un texte dans la langue de l'interface. */
function sayBtn(text, cls = "") {
  return `<button class="say-btn ${cls}" data-say="${esc(text)}" aria-label="${esc(t("listen"))}">🔊</button>`;
}
function bindSay(root = document) {
  $$("[data-say]", root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    Sfx.click();
    Speech.say(b.dataset.say, { lang: b.dataset.lang || lang() });
  });
}

function header({ back = null, title = "", say = null } = {}) {
  return `<header class="screen-head">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="${esc(t("back"))}">${backArrow()}</a>` : ""}
    <h1>${esc(title)}</h1>${say ? sayBtn(say) : ""}
  </header>`;
}

/* ------------------------------------------------------------------ Bienvenue */
Screens.welcome = () => {
  app().innerHTML = `<div class="welcome">
    <div class="logo-big">${logoSvg()}</div>
    <h1 class="brand">حُرُوفِي <span dir="ltr">Hurufi</span></h1>
    <p class="tagline">${esc(t("tagline"))}</p>
    <div class="lang-pick">
      ${[["ar", "🇲🇦", "العربية"], ["fr", "🇫🇷", "Français"], ["en", "🇬🇧", "English"]].map(([k, f, n]) =>
        `<button class="lang-btn" data-l="${k}"><span class="flag">${f}</span><span>${n}</span></button>`).join("")}
    </div>
    <p class="muted small">${esc(t("pick_lang"))}</p>
  </div>`;
  $$(".lang-btn").forEach(b => b.onclick = () => {
    Sfx.click();
    setLang(b.dataset.l);
    Speech.sayT(DATA.ui.feedback.welcome[0]);
    go("#/new");
  });
};

/* ------------------------------------------------------------------ Nouvel apprenant */
Screens.newLearner = (edit = null) => {
  const l = edit ? Store.learner(edit) : null;
  let kind = l ? l.kind : "child", avatar = l ? l.avatar : AVATARS[0];
  const first = !Store.learners().length;
  app().innerHTML = `<div class="page">
    ${header({ back: first ? "#/welcome" : (edit ? "#/helper/learners" : "#/profiles"), title: t(edit ? "edit_learner" : "new_learner") })}
    <section class="card form">
      <label class="field"><span>${esc(t("learner_name"))}</span>
        <input id="ln-name" maxlength="30" autocomplete="off" value="${esc(l ? l.name : "")}" placeholder="${esc(t("learner_name_ph"))}"></label>
      <div class="field"><span>${esc(t("who_learns"))}</span>
        <div class="seg big" id="ln-kind">
          <button data-k="child" class="${kind === "child" ? "on" : ""}">🧒 ${esc(t("child"))}</button>
          <button data-k="adult" class="${kind === "adult" ? "on" : ""}">🧑 ${esc(t("adult"))}</button>
        </div></div>
      <div class="field"><span>${esc(t("avatar"))}</span>
        <div class="avatars">${AVATARS.map(a => `<button class="av ${a === avatar ? "on" : ""}" data-a="${a}">${a}</button>`).join("")}</div></div>
      <button class="btn primary big wide" id="ln-ok">✔ ${esc(t(edit ? "save" : "start"))}</button>
      ${first ? `<p class="muted small center-text">${esc(t("no_account_needed"))}</p>` : ""}
    </section>
  </div>`;
  $$("#ln-kind button").forEach(b => b.onclick = () => {
    kind = b.dataset.k;
    $$("#ln-kind button").forEach(x => x.classList.toggle("on", x === b));
    Sfx.click();
  });
  $$(".av").forEach(b => b.onclick = () => {
    avatar = b.dataset.a;
    $$(".av").forEach(x => x.classList.toggle("on", x === b));
    Sfx.click();
  });
  $("#ln-ok").onclick = () => {
    const name = $("#ln-name").value.trim() || avatar;
    if (edit) {
      Store.updateLearner(edit, { name, kind, avatar });
      return go("#/helper/learners");
    }
    const nl = Store.addLearner({ name, kind, avatar });
    Store.select(nl.id);
    Sfx.win();
    go("#/home");
  };
};

/* ------------------------------------------------------------------ Qui apprend ? */
Screens.profiles = () => {
  const list = Store.learners();
  app().innerHTML = `<div class="page">
    <div class="profiles-head"><div class="logo-small">${logoSvg()}</div>
      <h1>${esc(t("who_now"))}</h1>${sayBtn(DATA.ui.feedback.choose_profile[0][lang()])}</div>
    <div class="profiles">
      ${list.map(l => `<button class="profile" data-id="${l.id}" style="--c:${l.color}">
        <span class="p-av">${esc(l.avatar)}</span><span class="p-name">${esc(l.name)}</span>
        <span class="p-xp">⭐ ${Store.totalStars(l)}</span></button>`).join("")}
      <button class="profile add" id="pf-add"><span class="p-av">➕</span><span class="p-name">${esc(t("add_learner"))}</span></button>
    </div>
    <div class="row center"><a class="btn ghost" href="#/helper">👥 ${esc(t("helper"))}</a></div>
  </div>`;
  bindSay();
  $$(".profile[data-id]").forEach(b => b.onclick = () => { Sfx.click(); Store.select(b.dataset.id); go("#/home"); });
  $("#pf-add").onclick = () => go("#/new");
  if (Settings.get("autoplay")) Speech.sayT(DATA.ui.feedback.choose_profile[0]);
};

/* ------------------------------------------------------------------ Accueil */
function nextActivity(l) {
  for (const lv of DATA.levels) {
    if (!Store.levelOpen(l, lv) || lv.id === "l7") continue;
    for (const u of lv.units) for (const a of u.acts) if (!Store.actStars(l, a.id)) return { lv, u, a };
  }
  return null;
}

Screens.home = () => {
  const l = Store.current();
  if (!l) return go("#/profiles");
  const rank = Store.rank(l);
  const streak = Store.streak(l);
  const next = nextActivity(l);
  const mistakes = Store.mistakeKeys(l, 10).length;
  const prog = rank.next ? Math.round((l.xp - rank.from) / (rank.next - rank.from) * 100) : 100;
  app().innerHTML = `<div class="page home">
    <header class="home-head">
      <a class="who" href="#/profiles" style="--c:${l.color}"><span class="w-av">${esc(l.avatar)}</span><b>${esc(l.name)}</b></a>
      <div class="chips"><span class="chip">⭐ ${Store.totalStars(l)}</span><span class="chip">💎 ${l.xp}</span>
        <span class="chip fire ${streak ? "" : "off"}">🔥 ${streak}</span></div>
      <nav class="tools">
        <a class="icon-btn" href="#/badges" aria-label="${esc(t("badges"))}">🏅</a>
        <button class="icon-btn" id="hm-lang" aria-label="${esc(t("language"))}">${langLabel()}</button>
        <a class="icon-btn" href="#/helper" aria-label="${esc(t("helper"))}">👥</a>
      </nav>
    </header>
    <section class="hero card">
      <div class="hero-mascot">🐪</div>
      <div class="hero-text"><h2>${esc(t("hello", { n: l.name }))}</h2>
        <div class="rank">${rank.emoji} ${esc(t(rank.key))} · ${l.xp} XP</div>
        <div class="bar"><span style="width:${prog}%"></span></div>
        ${rank.next ? `<small class="muted">${esc(t("to_next_rank", { n: rank.next - l.xp }))}</small>` : ""}</div>
    </section>
    ${next ? `<button class="continue card" id="hm-next" style="--c:${next.lv.color}">
        <span class="c-play">▶</span>
        <span class="c-text"><b>${esc(t("continue"))}</b><small>${esc(titleOf(next.u))} · ${esc(kindName(next.a))}</small></span>
        <span class="c-icon">${KIND_ICONS[next.a.kind] || "⭐"}</span></button>` : ""}
    ${mistakes >= 3 ? `<a class="review card" href="#/play/review"><span>🔁</span><b>${esc(t("review"))}</b>
        <small>${esc(t("review_sub", { n: mistakes }))}</small></a>` : ""}
    <h2 class="section-title">${esc(t("levels"))}</h2>
    <div class="levels">
      ${DATA.levels.map((lv, i) => {
        const open = Store.levelOpen(l, lv);
        const { got, max } = Store.levelStars(l, lv);
        return `<div class="level card ${open ? "" : "locked"}" data-id="${lv.id}" style="--c:${lv.color}" role="button" tabindex="0">
          <span class="lv-emoji" lang="ar">${open ? esc(lv.emoji) : "🔒"}</span>
          <span class="lv-text"><small>${esc(t("level_n", { n: i + 1 }))}</small><b>${esc(titleOf(lv))}</b>
            <span class="muted">${esc(plainAr(lv.desc[lang()]))}</span>
            <span class="bar"><span style="width:${Math.round(got / max * 100)}%"></span></span></span>
          <span class="lv-side">${sayBtn(lv.title[lang()])}<span class="lv-stars">⭐ ${got}/${max}</span></span>
        </div>`;
      }).join("")}
    </div>
  </div>`;
  bindSay();
  $("#hm-lang").onclick = cycleLang;
  if ($("#hm-next")) $("#hm-next").onclick = () => { Sfx.click(); go(`#/play/${next.a.id}`); };
  $$(".level").forEach(el => el.onclick = () => {
    const lv = Index.levels[el.dataset.id].level;
    if (!Store.levelOpen(l, lv)) {
      Sfx.wrong();
      el.classList.add("shake");
      setTimeout(() => el.classList.remove("shake"), 450);
      return toast(t("level_locked"));
    }
    Sfx.click();
    go(`#/level/${lv.id}`);
  });
  if (!Screens.greeted && Settings.get("autoplay")) {
    Screens.greeted = true;
    Speech.sayT(DATA.ui.feedback.welcome[0]);
  }
};

/* ------------------------------------------------------------------ Un niveau */
Screens.level = id => {
  const l = Store.current();
  const info = Index.levels[id];
  if (!l || !info) return go("#/home");
  const lv = info.level;
  if (!Store.levelOpen(l, lv)) return go("#/home");
  app().innerHTML = `<div class="page" style="--c:${lv.color}">
    ${header({ back: "#/home", title: `${lv.emoji} ${titleOf(lv)}`, say: lv.title[lang()] })}
    <div class="units">
      ${lv.units.map(u => {
        const got = Store.unitStars(l, u), max = u.acts.length * 3;
        return `<a class="unit card ${got === max ? "full" : ""}" href="#/unit/${u.id}">
          <span class="u-emoji" lang="ar">${esc(u.emoji)}</span>
          <b class="${/[؀-ۿ]/.test(titleOf(u)) ? "u-ar" : ""}">${esc(titleOf(u))}</b>
          <span class="u-foot">${sayBtn(u.say[lang()])}<span>⭐ ${got}/${max}</span></span>
          <span class="bar"><span style="width:${Math.round(got / max * 100)}%"></span></span></a>`;
      }).join("")}
    </div>
  </div>`;
  bindSay();
};

/* ------------------------------------------------------------------ Une unité */
Screens.unit = id => {
  const l = Store.current();
  const info = Index.units[id];
  if (!l || !info) return go("#/home");
  const { unit, level } = info;
  const nextAct = unit.acts.find(a => Store.actStars(l, a.id) < 3) || unit.acts[0];
  app().innerHTML = `<div class="page" style="--c:${level.color}">
    ${header({ back: `#/level/${level.id}`, title: `${unit.emoji} ${titleOf(unit)}`, say: unit.say[lang()] })}
    <button class="btn primary big wide start-btn" id="un-go">▶ ${esc(t("start"))} — ${KIND_ICONS[nextAct.kind] || ""} ${esc(kindName(nextAct))}</button>
    <div class="acts">
      ${unit.acts.map((a, i) => `<a class="act card" href="#/play/${a.id}">
        <span class="a-num">${i + 1}</span><span class="a-icon">${KIND_ICONS[a.kind] || "⭐"}</span>
        <b>${esc(kindName(a))}</b>${sayBtn(kindName(a))}${starsHtml(Store.actStars(l, a.id))}</a>`).join("")}
    </div>
  </div>`;
  bindSay();
  $("#un-go").onclick = () => go(`#/play/${nextAct.id}`);
};

/* ------------------------------------------------------------------ Résultat d'une partie */
Screens.result = (ctx, res) => {
  if (!res) return go("#/home");
  const info = Index.acts[ctx.actId];
  let nextId = null;
  if (info) {
    const acts = info.unit.acts;
    const i = acts.findIndex(a => a.id === ctx.actId);
    if (i < acts.length - 1) nextId = acts[i + 1].id;
    else {
      const units = info.level.units;
      const ui = units.findIndex(u => u.id === info.unit.id);
      if (ui < units.length - 1) nextId = units[ui + 1].acts[0].id;
    }
  }
  const msg = Speech.feedback("stars" + res.stars, false);
  app().innerHTML = `<div class="page result">
    <div class="res-stars">${[0, 1, 2].map(i => `<span class="rs ${i < res.stars ? "on" : ""}" style="animation-delay:${0.25 + i * 0.35}s">★</span>`).join("")}</div>
    <h1>${esc(msg)}</h1>
    <p class="res-score">${esc(t("score_of", { a: ctx.score, b: ctx.total }))}</p>
    <p class="res-xp">+${res.xp} XP 💎</p>
    ${res.badges.length ? `<div class="res-badges">${res.badges.map(b => `<div class="badge on"><span>${b.emoji}</span><small>${esc(t(b.key))}</small></div>`).join("")}</div>` : ""}
    ${res.unlocked.length ? `<p class="unlock-msg">🔓 ${esc(t("unlocked"))} ${res.unlocked.map(lv => esc(titleOf(lv))).join(" · ")}</p>` : ""}
    <div class="row center wrap">
      <a class="btn ghost" href="${backFrom(ctx)}">${backArrow()} ${esc(t("back"))}</a>
      <button class="btn secondary" id="rs-again">🔁 ${esc(t("again"))}</button>
      ${nextId ? `<a class="btn primary big" href="#/play/${nextId}">${esc(t("next"))} ${fwdArrow()}</a>` : ""}
    </div>
  </div>`;
  $("#rs-again").onclick = () => Play.start(ctx.actId);
  [0, 1, 2].forEach(i => { if (i < res.stars) setTimeout(() => Sfx.star(i), 250 + i * 350); });
  if (res.stars >= 2) setTimeout(() => Confetti.burst(res.stars === 3 ? 150 : 70), 900);
  (async () => {
    await wait(300);
    await Speech.sayT(DATA.ui.feedback["stars" + res.stars][0]);
    if (res.badges.length) { Sfx.unlock(); await Speech.sayT(DATA.ui.feedback.badge[0]); }
    if (res.unlocked.length) { Sfx.unlock(); await Speech.sayT(DATA.ui.feedback.unlocked[0]); }
  })();
};

/* ------------------------------------------------------------------ Badges */
Screens.badges = () => {
  const l = Store.current();
  if (!l) return go("#/home");
  app().innerHTML = `<div class="page">
    ${header({ back: "#/home", title: `🏅 ${t("badges")}` })}
    <p class="muted center-text">${esc(t("badges_count", { a: Object.keys(l.badges).length, b: BADGES.length }))}</p>
    <div class="badges">${BADGES.map(b => `<div class="badge ${l.badges[b.id] ? "on" : ""}"><span>${b.emoji}</span>
      <small>${esc(t(b.key))}</small></div>`).join("")}</div>
  </div>`;
};

/* ------------------------------------------------------------------ Espace accompagnant */
let helperUntil = 0;

Screens.helper = tab => {
  if (Date.now() > helperUntil) return helperGate(tab);
  tab = tab || "learners";
  const tabs = [["learners", "👥"], ["settings", "⚙️"], ["account", "☁️"], ["about", "ℹ️"]];
  app().innerHTML = `<div class="page helper">
    ${header({ back: Store.current() ? "#/home" : "#/profiles", title: `👥 ${t("helper")}` })}
    <nav class="tabs">${tabs.map(([k, e]) => `<a class="${k === tab ? "on" : ""}" href="#/helper/${k}">${e} ${esc(t("tab_" + k))}</a>`).join("")}</nav>
    <section id="hp-body"></section>
  </div>`;
  HelperTabs[tab]($("#hp-body"));
};

function helperGate(tab) {
  const a = 3 + Math.floor(Math.random() * 6), b = 2 + Math.floor(Math.random() * 7);
  const good = a * b;
  const opts = shuffle([good, good + a, good - b, good + 1 + Math.floor(Math.random() * 5)].filter((v, i, s) => s.indexOf(v) === i));
  app().innerHTML = `<div class="page">
    ${header({ back: Store.current() ? "#/home" : "#/profiles", title: `👥 ${t("helper")}` })}
    <section class="card center-text gate">
      <p>${esc(t("gate_text"))}</p>
      <div class="gate-q" dir="ltr">${a} × ${b} = ?</div>
      <div class="options row">${opts.map(v => `<button class="opt" data-v="${v}">${ltr(String(v), "digits")}</button>`).join("")}</div>
    </section>
  </div>`;
  $$(".gate .opt").forEach(o => o.onclick = () => {
    if (+o.dataset.v === good) {
      helperUntil = Date.now() + 10 * 60 * 1000;
      Screens.helper(tab);
    } else {
      Sfx.wrong();
      go(Store.current() ? "#/home" : "#/profiles");
    }
  });
}

const HelperTabs = {};

HelperTabs.learners = el => {
  const list = Store.learners();
  el.innerHTML = `${list.map(l => {
    const plays = l.log.length;
    const minutes = Math.round(l.log.reduce((n, x) => n + (x.d || 0), 0) / 60);
    const mistakes = Store.mistakeKeys(l, 8).map(k => DATA.items[k]).map(it => it.t === "L" ? it.ch : it.ar);
    return `<div class="card learner-report" style="--c:${l.color}">
      <div class="lr-head"><span class="w-av">${esc(l.avatar)}</span><div><b>${esc(l.name)}</b>
        <small class="muted">${esc(t(l.kind))} · ${l.owner ? "☁️ " + esc(t("synced")) : "📱 " + esc(t("this_device"))}</small></div></div>
      <div class="lr-stats">
        <span>⭐ ${Store.totalStars(l)}</span><span>💎 ${l.xp}</span><span>🔥 ${Store.streak(l)}</span>
        <span>🎮 ${plays}</span><span>⏱️ ${minutes} ${esc(t("minutes"))}</span><span>✍️ ${l.traced || 0}</span></div>
      <div class="lr-levels">${DATA.levels.map(lv => {
        const { got, max } = Store.levelStars(l, lv);
        return `<div class="lr-level"><span>${lv.emoji} ${esc(titleOf(lv))}</span><span class="bar"><span style="width:${Math.round(got / max * 100)}%;background:${lv.color}"></span></span><small>${got}/${max}</small></div>`;
      }).join("")}</div>
      ${mistakes.length ? `<p class="lr-hard"><b>${esc(t("hard_items"))}</b> ${mistakes.map(m => ar(m)).join(" · ")}</p>` : ""}
      <div class="row wrap">
        <a class="btn small ghost" href="#/edit/${l.id}">✏️ ${esc(t("edit"))}</a>
        <button class="btn small ghost" data-reset="${l.id}">♻️ ${esc(t("reset_progress"))}</button>
        <button class="btn small danger" data-del="${l.id}">🗑️ ${esc(t("delete_learner"))}</button>
      </div></div>`;
  }).join("")}
  <div class="row center"><a class="btn primary" href="#/new">➕ ${esc(t("add_learner"))}</a></div>`;
  $$("[data-del]", el).forEach(b => b.onclick = async () => {
    const l = Store.learner(b.dataset.del);
    if (await confirmBox(t("delete_learner_confirm", { n: l.name }))) { Store.removeLearner(l.id); Screens.helper("learners"); }
  });
  $$("[data-reset]", el).forEach(b => b.onclick = async () => {
    const l = Store.learner(b.dataset.reset);
    if (await confirmBox(t("reset_confirm", { n: l.name }))) { Store.resetLearner(l.id); Screens.helper("learners"); }
  });
};

HelperTabs.settings = el => {
  const check = (k, label) => `<label class="switch"><input type="checkbox" data-set="${k}" ${Settings.get(k) ? "checked" : ""}>
    <span>${esc(t(label))}</span></label>`;
  el.innerHTML = `<div class="card form">
    <div class="field"><span>${esc(t("language"))}</span><div class="seg" id="st-lang">
      ${[["ar", "العربية"], ["fr", "Français"], ["en", "English"]].map(([k, n]) => `<button data-l="${k}" class="${lang() === k ? "on" : ""}">${n}</button>`).join("")}</div></div>
    ${check("autoplay", "set_autoplay")}
    ${check("translate", "set_translate")}
    ${check("sfx", "set_sfx")}
    ${check("unlockAll", "set_unlock")}
    <label class="field"><span>${esc(t("set_rate"))} <b id="st-rate-v">${Settings.get("rate").toFixed(2)}×</b></span>
      <input type="range" id="st-rate" min="0.7" max="1.2" step="0.05" value="${Settings.get("rate")}"></label>
    <button class="btn secondary" id="st-test">🔊 ${esc(t("test_voice"))}</button>
  </div>`;
  $$("#st-lang button", el).forEach(b => b.onclick = () => { setLang(b.dataset.l); Screens.helper("settings"); });
  $$("[data-set]", el).forEach(i => i.onchange = () => Settings.set(i.dataset.set, i.checked));
  $("#st-rate").oninput = e => { Settings.set("rate", +e.target.value); $("#st-rate-v").textContent = (+e.target.value).toFixed(2) + "×"; };
  $("#st-test").onclick = () => Speech.say("بَطَّة");
};

HelperTabs.account = el => {
  if (!Cloud.client) { el.innerHTML = `<div class="card"><p>${esc(t("cloud_unavailable"))}</p></div>`; return; }
  if (!Cloud.session) {
    el.innerHTML = `<div class="card">
      <h2>☁️ ${esc(t("account_title"))}</h2>
      <p>${esc(t("account_why"))}</p>
      <ul class="perks"><li>${esc(t("perk_backup"))}</li><li>${esc(t("perk_devices"))}</li><li>${esc(t("perk_shared"))}</li></ul>
      <div class="row wrap center"><a class="btn primary" href="#/account/signup">✨ ${esc(t("create_account"))}</a>
        <a class="btn secondary" href="#/account/login">${esc(t("sign_in"))}</a></div>
      <p class="muted small">${esc(t("account_optional"))}</p></div>`;
    return;
  }
  const st = { ok: "✅ " + t("sync_ok"), syncing: "⏳ " + t("sync_running"), offline: "📴 " + t("sync_offline"),
               error: "⚠️ " + t("sync_error"), local: "" }[Cloud.status] || "";
  el.innerHTML = `<div class="card">
    <h2>☁️ ${esc(t("account_title"))}</h2>
    <p>${esc(t("signed_in_as"))} <b dir="ltr">${esc(Cloud.email())}</b></p>
    <p id="ac-status">${esc(st)}</p>
    <div class="row wrap"><button class="btn secondary" id="ac-sync">🔄 ${esc(t("sync_now"))}</button>
      <button class="btn ghost" id="ac-out">🚪 ${esc(t("sign_out"))}</button></div>
  </div>
  <div class="card danger-zone">
    <h3>${esc(t("delete_account"))}</h3>
    <p class="small">${esc(t("delete_account_text"))}</p>
    <button class="btn danger" id="ac-del">🗑️ ${esc(t("delete_account"))}</button>
  </div>`;
  window.onSyncChange = () => { if ($("#ac-status")) HelperTabs.account(el); };
  $("#ac-sync").onclick = () => { Cloud.sync(); HelperTabs.account(el); };
  $("#ac-out").onclick = async () => {
    if (!await confirmBox(t("sign_out_confirm"), { danger: false })) return;
    await Cloud.signOut();
    toast(t("signed_out"));
    route();
  };
  $("#ac-del").onclick = async () => {
    if (!await confirmBox(t("delete_account_confirm"))) return;
    if (!await confirmBox(t("delete_account_confirm2"), { yes: t("delete_forever") })) return;
    try {
      await Cloud.deleteAccount();
      toast(t("account_deleted"), 4000);
      route();
    } catch (e) {
      toast(t("err_generic"), 4000);
    }
  };
};

HelperTabs.about = el => {
  const version = window.HurufiNative && HurufiNative.version ? HurufiNative.version() : APP_VERSION;
  el.innerHTML = `<div class="card about">
    <div class="logo-small">${logoSvg()}</div>
    <h2>حُرُوفِي — Hurufi</h2>
    <p>${esc(t("about_text"))}</p>
    <p class="muted small">${esc(t("version"))} ${esc(version)} · SYNTRIX FIKRA</p>
    <ul class="links">
      <li><a href="privacy.html#${lang()}" target="_blank" rel="noopener">🔒 ${esc(t("privacy"))}</a></li>
      <li><a href="delete-account.html#${lang()}" target="_blank" rel="noopener">🗑️ ${esc(t("delete_page"))}</a></li>
      <li><a href="mailto:syntrix.fikra@gmail.com">✉️ syntrix.fikra@gmail.com</a></li>
    </ul>
    ${window.HurufiNative && HurufiNative.share ? `<button class="btn secondary" id="ab-share">📤 ${esc(t("share_app"))}</button>` : ""}
    <p class="muted small">${esc(t("credits"))}</p>
  </div>`;
  if ($("#ab-share")) $("#ab-share").onclick = () => HurufiNative.share(`${t("share_text")} ${CLOUD.site}`);
};

/* Logo : la lettre ح sur une tuile turquoise. */
function logoSvg() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>
    <rect x="4" y="4" width="92" height="92" rx="26" fill="url(#lg)"/>
    <text x="50" y="62" text-anchor="middle" font-size="58" font-family="'Noto Naskh Arabic', serif" font-weight="700" fill="#fff">ح</text>
    <path d="M24 13l2.6 7.4 7.8.2-6.2 4.8 2.2 7.5-6.4-4.4-6.4 4.4 2.2-7.5-6.2-4.8 7.8-.2z" fill="#fdba74"/></svg>`;
}
