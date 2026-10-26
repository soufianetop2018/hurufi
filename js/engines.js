/*
 * Les activités. Chaque type (kind) fabrique ses manches à partir des éléments de l'unité
 * (DATA.items), donc chaque partie est différente. Les quiz partagent un même moteur (runQuiz) ;
 * les jeux plus libres (bulles, mémoire, relier, construire, ranger, histoire, parler) ont le leur.
 * L'écriture au doigt est dans trace.js.
 */

const I = k => DATA.items[k];
const sayText = it => it.say || it.ar;
const speakItem = (it, slow = false) => Speech.say(sayText(it), { lang: "ar", slow });
const NON_JOINING = "اأإآدذرزوؤةءى";

/* Ce qu'on affiche pour un élément (lettre seule, syllabe, mot, phrase, nombre). */
function shown(it) { return it.t === "L" ? it.ch : it.ar; }

/* Traduction dans la langue de l'interface (rien en arabe : l'apprenant parle déjà arabe). */
function transl(it) {
  const L = lang();
  return L !== "ar" && Settings.get("translate") && it[L] ? it[L] : "";
}

function sizeCls(text) {
  const n = String(text).replace(/[ً-ْٰ]/g, "").length;
  return n <= 2 ? "xl" : n <= 6 ? "lg" : n <= 14 ? "md" : "sm";
}

function readHtml(it, extra = "") {
  const text = shown(it);
  return `<span class="read ${sizeCls(text)} ${extra}" lang="ar" dir="rtl">${esc(text)}</span>`;
}

function emojiHtml(e, cls = "") {
  const n = emojiLength(e);
  return `<span class="pic ${n > 2 ? "many" : ""} ${cls}">${esc(e)}</span>`;
}

function poolOf(ctx) { return (ctx.items || ctx.unit.items).map(k => ({ k, ...I(k) })); }

function allOf(types, filter = () => true) {
  return Object.entries(DATA.items).filter(([, v]) => types.includes(v.t) && filter(v)).map(([k, v]) => ({ k, ...v }));
}

/* n éléments : la liste mélangée, répétée si besoin, sans deux fois de suite le même. */
function cycle(list, n) {
  const out = [];
  while (out.length < n && list.length) {
    for (const x of shuffle(list)) {
      if (out.length >= n) break;
      if (out.length && out[out.length - 1].k === x.k && list.length > 1) continue;
      out.push(x);
    }
  }
  return out;
}

/* n distracteurs dont la « clé » (texte, image…) diffère de la cible et entre eux. */
function distract(target, candidates, n, keyFn) {
  const seen = new Set([keyFn(target)]);
  const out = [];
  for (const c of shuffle(candidates)) {
    const k = keyFn(c);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

function sameTypeGlobal(it) {
  if (it.t === "S") return allOf(["S"], v => v.long === it.long);
  if (it.t === "W") return allOf(["W"], v => !!v.emoji === !!it.emoji && !v.ar.includes(" ") === !it.ar.includes(" "));
  return allOf([it.t]);
}

function instrKey(ctx) {
  const k = ctx.kind;
  const first = ctx.unit && ctx.unit.items.length ? I(ctx.unit.items[0]) : null;
  const t = first ? (first.t === "P" ? "N" : first.t) : "W";
  if (k === "learn") return "learn_" + (["L", "S", "X", "N"].includes(t) ? t : "W");
  if (k === "hear_pick") return "hear_" + (["L", "S", "X"].includes(t) ? t : "W");
  if (k === "story" && ctx.story && ctx.story.kind === "message") return "message";
  if (k.startsWith("trace")) return k === "trace_name" ? "trace_name" : "trace";
  if (k === "order_letters" || k === "order_list") return k;
  return k;
}

/* ------------------------------------------------------------------------- */
/* Déroulement commun                                                          */
/* ------------------------------------------------------------------------- */
const Play = {
  ctx: null,

  start(actId) {
    Speech.stop();
    let act, unit;
    if (actId === "review") {
      const l = Store.current();
      const keys = l ? Store.mistakeKeys(l, 10) : [];
      if (keys.length < 2) { toast(t("review_empty")); return go("#/home"); }
      act = { id: "review", kind: "review" };
      unit = { id: "review", items: keys, acts: [act], title: { ar: t("review"), fr: t("review"), en: t("review") } };
    } else {
      const info = Index.acts[actId];
      if (!info) return go("#/home");
      ({ act, unit } = info);
    }
    const ctx = {
      actId, act, unit, kind: act.kind, score: 0, total: 0, mistakes: [], fixed: [], traced: 0, flags: null,
      start: Date.now(), over: false, first: true,
    };
    if (act.story) ctx.story = DATA.stories[act.story];
    this.ctx = ctx;
    const engine = Engines[act.kind];
    if (!engine) { toast("?"); return go("#/home"); }
    engine(ctx);
  },

  /* Cadre d'une activité : barre du haut, consigne, puis le contenu. */
  frame(ctx, body, { progress = null } = {}) {
    const kind = DATA.ui.kinds[ctx.kind === "story" && ctx.story && ctx.story.kind === "message" ? "message" : ctx.kind];
    const ins = DATA.ui.instructions[instrKey(ctx)];
    const pct = progress == null ? (ctx.rounds ? ctx.i / ctx.rounds.length : 0) : progress;
    app().innerHTML = `<div class="play kind-${ctx.kind}">
      <header class="play-top">
        <button class="icon-btn" id="pl-close" aria-label="${esc(t("close"))}">✕</button>
        <div class="bar"><span style="width:${Math.round(pct * 100)}%"></span></div>
        <div class="score-chip">⭐ <b id="pl-score">${ctx.score}</b></div>
      </header>
      <div class="instr">
        <button class="icon-btn small" id="pl-instr" aria-label="${esc(t("listen"))}">💬</button>
        <div><div class="instr-kind">${esc(kind ? kind[lang()] : "")}</div>
        <div class="instr-text">${esc(ins ? ins[lang()] : "")}</div></div>
      </div>
      <section class="play-body">${body}</section>
      ${Mascot.html()}
    </div>`;
    $("#pl-close").onclick = () => this.quit();
    $("#pl-instr").onclick = () => { Sfx.click(); Speech.instruction(instrKey(ctx)); };
  },

  /* Dit la consigne la première fois, puis lance « then » (le son de la manche). */
  async intro(ctx, then) {
    const my = ctx;
    if (ctx.first && Settings.get("autoplay")) {
      ctx.first = false;
      await Speech.instruction(instrKey(ctx));
      if (this.ctx !== my || ctx.over) return;
      await wait(250);
    }
    ctx.first = false;
    if (then && this.ctx === my && !ctx.over) then();
  },

  setScore(ctx) { const el = $("#pl-score"); if (el) el.textContent = ctx.score; },

  good(ctx, key, firstTry = true) {
    Sfx.correct();
    if (firstTry) { ctx.score++; if (key) ctx.fixed.push(key); }
    this.setScore(ctx);
    Mascot.say(Speech.feedback("good", false), "happy");
  },

  bad(ctx, key, speak = true) {
    Sfx.wrong();
    if (key && !ctx.mistakes.includes(key)) ctx.mistakes.push(key);
    Mascot.say(Speech.feedback("bad", speak), "sad");
  },

  async quit() {
    if (!this.ctx || this.ctx.over) return go(backFrom(this.ctx));
    if (this.ctx.score > 0 || (this.ctx.i || 0) > 0) {
      const ok = await confirmBox(t("quit_confirm"), { yes: t("quit"), no: t("stay") });
      if (!ok) return;
    }
    const ctx = this.ctx;
    ctx.over = true;
    Speech.stop();
    go(backFrom(ctx));
  },

  finish(ctx) {
    if (ctx.over) return;
    ctx.over = true;
    Speech.stop();
    const res = Store.record(ctx.actId, {
      score: ctx.score, total: ctx.total, duration: (Date.now() - ctx.start) / 1000,
      mistakes: ctx.mistakes, fixed: ctx.fixed, traced: ctx.traced, flags: ctx.flags,
    });
    Screens.result(ctx, res);
  },
};

function backFrom(ctx) {
  if (!ctx || ctx.actId === "review") return "#/home";
  return `#/unit/${ctx.unit.id}`;
}

/* ------------------------------------------------------------------------- */
/* Moteur de quiz : une invite (texte, image, son) et des choix                */
/* ------------------------------------------------------------------------- */
/*  round = { key, prompt: html, play: () => Promise, options: [{html, correct, play?}], layout,
 *            after: () => Promise (ce qu'on dit après la bonne réponse), audio: true (choix à écouter) } */
function runQuiz(ctx, rounds) {
  ctx.rounds = rounds;
  ctx.i = 0;
  ctx.total = rounds.length;
  showRound(ctx);
}

function showRound(ctx) {
  if (ctx.over) return;
  if (ctx.i >= ctx.rounds.length) return Play.finish(ctx);
  const r = ctx.rounds[ctx.i];
  r.tries = 0;
  r.locked = false;
  const layout = r.layout || "grid";
  const opts = r.options.map((o, i) => r.audio
    ? `<button class="opt audio-opt c${i}" data-i="${i}" aria-label="${i + 1}"><span class="ao-icon">🔊</span><span class="ao-n">${i + 1}</span></button>`
    : `<button class="opt ${o.cls || ""}" data-i="${i}">${o.html}</button>`).join("");
  Play.frame(ctx, `<div class="prompt">${r.prompt}
      ${r.play ? `<div class="prompt-audio"><button class="speak-btn" id="pr-say" aria-label="${esc(t("listen"))}">🔊</button>
        <button class="speak-btn slow" id="pr-slow" aria-label="${esc(t("slow"))}">🐢</button></div>` : ""}</div>
    <div class="options ${layout} n${r.options.length}">${opts}</div>
    ${r.audio ? `<div class="row center"><button class="btn primary big" id="pr-ok" disabled>✔ ${esc(t("check"))}</button></div>` : ""}`);

  if (r.play) {
    $("#pr-say").onclick = () => { Sfx.click(); r.play(false); };
    $("#pr-slow").onclick = () => { Sfx.click(); r.play(true); };
  }
  let selected = null;
  $$(".opt").forEach(el => el.onclick = () => {
    if (r.locked || el.disabled) return;
    const i = +el.dataset.i;
    if (r.audio) {
      Sfx.click();
      $$(".opt").forEach(x => x.classList.toggle("sel", x === el));
      selected = i;
      $("#pr-ok").disabled = false;
      r.options[i].play();
      return;
    }
    answer(ctx, r, i, el);
  });
  if (r.audio) $("#pr-ok").onclick = () => { if (selected != null) answer(ctx, r, selected, $(`.opt[data-i="${selected}"]`)); };
  Play.intro(ctx, () => { if (r.play && r.autoplay !== false) r.play(false); });
}

async function answer(ctx, r, i, el) {
  const o = r.options[i];
  if (o.correct) {
    r.locked = true;
    el.classList.add("good");
    Play.good(ctx, r.key, r.tries === 0);
    await Promise.race([r.after ? r.after() : wait(500), wait(3500)]);
    await wait(350);
    nextRound(ctx);
    return;
  }
  r.tries++;
  el.classList.add("bad", "shake");
  el.disabled = true;
  setTimeout(() => el.classList.remove("shake"), 450);
  if (r.audio) { $$(".opt").forEach(x => x.classList.remove("sel")); $("#pr-ok").disabled = true; }
  if (r.tries >= 2 || r.options.length <= 2) {
    r.locked = true;
    Play.bad(ctx, r.key, false);
    const ok = r.options.findIndex(x => x.correct);
    const okEl = $(`.opt[data-i="${ok}"]`);
    if (okEl) okEl.classList.add("reveal");
    await Promise.race([r.after ? r.after() : (r.play ? r.play(false) : wait(800)), wait(4000)]);
    await wait(700);
    nextRound(ctx);
  } else {
    Play.bad(ctx, r.key, true);
  }
}

function nextRound(ctx) {
  if (ctx.over || Play.ctx !== ctx) return;
  ctx.i++;
  showRound(ctx);
}

/* Fabrique une manche « choisir parmi ». */
function quizRound(target, others, { prompt, play, render, layout, after, audio, key } = {}) {
  const list = shuffle([target, ...others]);
  return {
    key: key === undefined ? target.k : key, prompt, play, layout, after, audio,
    options: list.map(x => ({
      html: render ? render(x) : readHtml(x), correct: x === target,
      play: audio ? () => speakItem(x) : null,
    })),
  };
}

function optionCount(it, max = 4) {
  if (it.t === "X") return 3;
  if (it.t === "S") return Math.min(max, 3);
  return max;
}

/* ------------------------------------------------------------------------- */
/* Les types d'activités                                                       */
/* ------------------------------------------------------------------------- */
const Engines = {};

/* Écoute et choisis : on entend l'élément, on choisit sa forme écrite. */
Engines.hear_pick = ctx => {
  const P = poolOf(ctx);
  const n = ctx.act.n || Math.min(8, Math.max(5, P.length));
  runQuiz(ctx, cycle(P, n).map(tg => {
    let cands = P.filter(x => x.k !== tg.k);
    if (ctx.act.same === "letter" && tg.t === "S") {
      const same = cands.filter(x => x.letter === tg.letter);
      if (same.length >= 2) cands = same;
    }
    const want = optionCount(tg, tg.t === "S" && ctx.act.same ? 4 : 4) - 1;
    let others = distract(tg, cands, want, shown);
    if (others.length < want) others = others.concat(distract(tg, sameTypeGlobal(tg).filter(x => !others.includes(x)), want - others.length, x => others.some(o => shown(o) === shown(x)) ? null : shown(x)));
    return quizRound(tg, others, {
      prompt: `<div class="big-speaker">👂</div>`, play: slow => speakItem(tg, slow),
      layout: tg.t === "X" ? "list" : "grid",
    });
  }));
};

/* Lis et choisis le bon son (choix à écouter). */
Engines.read_sound = ctx => {
  const P = poolOf(ctx);
  const n = ctx.act.n || Math.min(8, Math.max(5, P.length));
  runQuiz(ctx, cycle(P, n).map(tg => {
    let cands = P.filter(x => x.k !== tg.k);
    if (ctx.act.same === "letter" && tg.t === "S") {
      const same = cands.filter(x => x.letter === tg.letter);
      if (same.length >= 2) cands = same;
    }
    const others = distract(tg, cands, 2, shown);
    return quizRound(tg, others, {
      prompt: `<div class="card-read">${readHtml(tg)}</div>`, audio: true, layout: "row",
      after: () => speakItem(tg),
    });
  }));
};

/* Lis le mot, choisis l'image. */
Engines.word_pic = ctx => {
  const P = poolOf(ctx).filter(x => x.emoji);
  const n = ctx.act.n || Math.min(8, Math.max(5, P.length));
  runQuiz(ctx, cycle(P, n).map(tg => {
    let others = distract(tg, P.filter(x => x.k !== tg.k), 3, x => x.emoji);
    if (others.length < 2) others = others.concat(distract(tg, allOf(["W"], v => v.emoji), 3 - others.length, x => x.emoji));
    return quizRound(tg, others, {
      prompt: `<div class="card-read">${readHtml(tg)}</div>`, render: x => emojiHtml(x.emoji), layout: "pics",
      after: () => speakItem(tg),
    });
  }));
};

/* Regarde l'image, choisis le mot (ou la phrase). */
function picToText(ctx, types) {
  const P = poolOf(ctx).filter(x => x.emoji && types.includes(x.t));
  const n = ctx.act.n || Math.min(8, Math.max(5, P.length));
  runQuiz(ctx, cycle(P, n).map(tg => {
    const want = tg.t === "X" ? 2 : 3;
    const others = distract(tg, P.filter(x => x.k !== tg.k && x.emoji !== tg.emoji), want, shown);
    return quizRound(tg, others, {
      prompt: `<div class="card-pic">${emojiHtml(tg.emoji, "huge")}${transl(tg) ? `<div class="hint">${esc(transl(tg))}</div>` : ""}</div>`,
      layout: tg.t === "X" ? "list" : "grid", after: () => speakItem(tg),
    });
  }));
}
Engines.pic_word = ctx => picToText(ctx, ["W"]);
Engines.pic_sentence = ctx => picToText(ctx, ["X"]);

/* Par quelle lettre commence le mot ? */
Engines.first_letter = ctx => {
  const letters = poolOf(ctx).filter(x => x.t === "L");
  const chars = new Set(letters.map(x => x.ch));
  const words = allOf(["W"], v => v.emoji && chars.has(v.first) && !v.ar.includes(" ") && !v.plain.startsWith("ال"))
    .filter(v => v.k.startsWith("W:"));
  const n = ctx.act.n || 8;
  const allLetters = allOf(["L"]);
  runQuiz(ctx, cycle(words, n).map(w => {
    const target = letters.find(x => x.ch === w.first);
    let others = distract(target, letters.filter(x => x !== target), 3, x => x.ch);
    if (others.length < 3) others = others.concat(distract(target, allLetters.filter(x => !others.includes(x)), 3 - others.length, x => others.some(o => o.ch === x.ch) ? null : x.ch));
    return quizRound(target, others, {
      key: w.k,
      prompt: `<div class="card-pic">${emojiHtml(w.emoji, "huge")}</div>`, play: slow => speakItem(w, slow),
      after: () => Speech.seq([[sayText(w), "ar"], [target.ar, "ar"]]),
    });
  }));
};

/* Quelle haraka entends-tu ? */
Engines.haraka = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "S" && !x.long);
  const n = ctx.act.n || 8;
  const marks = ["fatha", "damma", "kasra"].map(h => ({ k: h, h, ...DATA.harakat[h] }));
  runQuiz(ctx, cycle(P, n).map(tg => {
    const L = I("L:" + tg.letter);
    const base = tg.ar.replace(/[ً-ْ]/g, "");
    const target = marks.find(m => m.h === tg.h);
    return quizRound(target, marks.filter(m => m !== target), {
      key: tg.k,
      prompt: `<div class="card-read">${ar(base, "xl")}</div>`, play: slow => speakItem(tg, slow),
      render: m => `<span class="mark" lang="ar">◌${m.mark}</span><span class="mark-name">${esc(lang() === "ar" ? m.name : m[lang()])}</span>`,
      layout: "row", after: () => { $(".card-read").innerHTML = readHtml(tg); return speakItem(tg); },
    });
  }));
};

/* Forme de la lettre dans le mot (isolée, début, milieu, fin). */
function letterForm(plain, idx) {
  const chars = Array.from(plain);
  const joins = c => c && c !== " " && !NON_JOINING.includes(c);
  const prev = chars[idx - 1], next = chars[idx + 1];
  const prevJoins = joins(prev);
  const hasNext = next && next !== " ";
  if (prevJoins && hasNext && joins(chars[idx])) return 2;
  if (prevJoins) return 3;
  if (hasNext && joins(chars[idx])) return 1;
  return 0;
}

Engines.position = ctx => {
  const P = poolOf(ctx);
  const letters = P.filter(x => x.t === "L");
  const words = P.filter(x => x.t === "W");
  const cands = [];
  words.forEach(w => letters.forEach(L => {
    const idx = Array.from(w.plain).indexOf(L.ch);
    if (idx >= 0) cands.push({ w, L, form: letterForm(w.plain, idx) });
  }));
  const n = ctx.act.n || 8;
  const names = ["alone", "start", "middle", "end"];
  const rounds = sample(cands, Math.min(n, cands.length)).map(c => {
    // Les lettres qui ne se lient pas ont deux formes seulement : on garde des choix différents.
    const forms = [];
    c.L.forms.forEach((f, i) => { if (!forms.some(x => x.f === f)) forms.push({ k: c.L.k + i, f, i }); });
    const target = forms.find(x => x.f === c.L.forms[c.form]);
    return quizRound(target, forms.filter(x => x !== target), {
      key: c.w.k,
      prompt: `<div class="card-pic">${c.w.emoji ? emojiHtml(c.w.emoji) : ""}${readHtml(c.w)}</div>
        <div class="ask-letter">${esc(t("where_letter"))} ${ar(c.L.ch, "md")}</div>`,
      play: slow => Speech.seq([[sayText(c.w), "ar"], [c.L.ar, "ar"]], { slow }),
      render: x => `<span class="read lg" lang="ar">${esc(x.f)}</span><span class="mark-name">${esc(DATA.ui.feedback[names[x.i]][0][lang()])}</span>`,
      layout: forms.length > 3 ? "grid" : "row", after: () => speakItem(c.w),
    });
  });
  runQuiz(ctx, rounds);
};

/* ال : lettre solaire ou lunaire ? */
Engines.sun_moon = ctx => {
  const P = poolOf(ctx).filter(x => x.plain.startsWith("ال"));
  const n = ctx.act.n || 8;
  const sun = { k: "sun", e: "☀️", tr: DATA.ui.feedback.sun[0] };
  const moon = { k: "moon", e: "🌙", tr: DATA.ui.feedback.moon[0] };
  runQuiz(ctx, cycle(P, n).map(w => {
    const isSun = DATA.sun.includes(w.plain[2]);
    const target = isSun ? sun : moon;
    return quizRound(target, [isSun ? moon : sun], {
      key: w.k, prompt: `<div class="card-pic">${w.emoji ? emojiHtml(w.emoji) : ""}${readHtml(w)}</div>`,
      render: x => `<span class="pic">${x.e}</span><span class="mark-name">${esc(x.tr[lang()])}</span>`,
      layout: "row", after: () => speakItem(w),
    });
  }));
};

/* Vrai ou faux : le mot (ou la phrase) va-t-il avec l'image ? */
Engines.truefalse = ctx => {
  const P = poolOf(ctx).filter(x => x.emoji);
  const n = ctx.act.n || 8;
  const yes = { k: "true", e: "✔️", tr: DATA.ui.feedback.true[0] };
  const no = { k: "false", e: "❌", tr: DATA.ui.feedback.false[0] };
  runQuiz(ctx, cycle(P, n).map(tg => {
    const other = Math.random() < 0.5 ? pick(P.filter(x => x.emoji !== tg.emoji)) : null;
    const pic = other ? other.emoji : tg.emoji;
    return quizRound(other ? no : yes, [other ? yes : no], {
      key: tg.k, prompt: `<div class="card-pic">${emojiHtml(pic, "huge")}${readHtml(tg)}</div>`,
      render: x => `<span class="pic">${x.e}</span><span class="mark-name">${esc(x.tr[lang()])}</span>`,
      layout: "row", after: () => speakItem(tg),
    });
  }));
};

/* Le mot avec une lettre manquante. */
Engines.missing = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "W" && x.cl && x.cl.length >= 2 && !x.ar.includes(" "));
  const n = ctx.act.n || Math.min(8, Math.max(5, P.length));
  const letters = DATA.letters.map(id => I("L:" + id).ch);
  runQuiz(ctx, cycle(P, n).map(w => {
    const idxs = w.cl.map((c, i) => i).filter(i => /[ء-ي]/.test(w.cl[i]) && w.cl[i][0] !== "ا");
    const idx = pick(idxs.length ? idxs : [0]);
    const right = w.cl[idx];
    const base = right[0], marks = right.slice(1);
    const fake = sample(letters.filter(c => c !== base && !w.plain.includes(c)), 2)
      .map(c => ({ k: "x" + c, ar: c + marks, t: "S" }));
    const target = { k: "ok", ar: right, t: "S" };
    const tiles = w.cl.map((c, i) => i === idx ? `<span class="tile slot">?</span>` : `<span class="tile">${esc(c)}</span>`).join("");
    return quizRound(target, fake, {
      key: w.k,
      prompt: `<div class="card-pic">${w.emoji ? emojiHtml(w.emoji) : ""}<div class="tiles" lang="ar" dir="rtl">${tiles}</div></div>`,
      layout: "row",
      after: () => { $(".tiles").outerHTML = `<div class="tiles done">${readHtml(w)}</div>`; return speakItem(w); },
    });
  }));
};

/* Nombres : entends → choisis les chiffres ; lis les chiffres → choisis le nom. */
Engines.number = ctx => {
  const P = poolOf(ctx);
  const n = ctx.act.n || Math.min(8, P.length + 2);
  runQuiz(ctx, cycle(P, n).map(tg => quizRound(tg, distract(tg, P.filter(x => x !== tg), 3, x => x.digits), {
    prompt: `<div class="big-speaker">👂</div>`, play: slow => speakItem(tg, slow),
    render: x => ltr(x.digits, "digits"), after: () => speakItem(tg),
  })));
};
Engines.number_word = ctx => {
  const P = poolOf(ctx);
  const n = ctx.act.n || Math.min(8, P.length + 2);
  runQuiz(ctx, cycle(P, n).map(tg => quizRound(tg, distract(tg, P.filter(x => x !== tg), 2, x => x.ar), {
    prompt: `<div class="card-read">${ltr(tg.digits, "digits huge")}</div>`, layout: "list",
    after: () => speakItem(tg),
  })));
};

/* Révision des erreurs : chaque élément raté revient sous une forme adaptée. */
Engines.review = ctx => {
  const P = poolOf(ctx);
  const rounds = P.map(tg => {
    const glob = sameTypeGlobal(tg);
    if (tg.t === "W" && tg.emoji && !tg.ar.includes(" ")) {
      const others = distract(tg, allOf(["W"], v => v.emoji), 3, x => x.emoji);
      return quizRound(tg, others, { prompt: `<div class="card-read">${readHtml(tg)}</div>`,
        render: x => emojiHtml(x.emoji), layout: "pics", after: () => speakItem(tg) });
    }
    if (tg.t === "N" || tg.t === "P") {
      return quizRound(tg, distract(tg, allOf([tg.t]), 3, x => x.digits), {
        prompt: `<div class="big-speaker">👂</div>`, play: slow => speakItem(tg, slow), render: x => ltr(x.digits, "digits") });
    }
    let cands = glob;
    if (tg.t === "S") cands = glob.filter(x => x.letter === tg.letter).concat(glob);
    return quizRound(tg, distract(tg, cands, tg.t === "X" ? 2 : 3, shown), {
      prompt: `<div class="big-speaker">👂</div>`, play: slow => speakItem(tg, slow), layout: tg.t === "X" ? "list" : "grid" });
  });
  runQuiz(ctx, shuffle(rounds));
};

/* ------------------------------------------------------------------------- */
/* Découvrir : des cartes à regarder et à écouter                              */
/* ------------------------------------------------------------------------- */
function learnCard(it) {
  const tr = transl(it);
  if (it.t === "L") {
    const w = I(it.word);
    return `<div class="lc-letter">${ar(it.ch, "giant")}</div>
      <div class="lc-name">${ar(it.ar, "md")}</div>
      <div class="forms-row">${it.forms.map(f => `<span lang="ar">${esc(f)}</span>`).join("")}</div>
      ${w ? `<div class="lc-example">${emojiHtml(w.emoji)}${readHtml(w)}${transl(w) ? `<div class="hint">${esc(transl(w))}</div>` : ""}</div>` : ""}`;
  }
  if (it.t === "N" || it.t === "P") {
    return `<div class="lc-letter">${ltr(it.digits, "digits giant")}</div><div>${readHtml(it)}</div>
      ${tr ? `<div class="hint">${esc(tr)}</div>` : ""}`;
  }
  return `${it.emoji ? `<div class="lc-pic">${emojiHtml(it.emoji, "huge")}</div>` : ""}
    <div class="lc-text">${readHtml(it, it.t === "S" ? "giant" : "")}</div>${tr ? `<div class="hint">${esc(tr)}</div>` : ""}`;
}

function learnAudio(it, slow) {
  if (it.t === "L") {
    const w = I(it.word);
    return Speech.seq([[it.ar, "ar"], ...(w ? [[sayText(w), "ar"]] : [])], { slow });
  }
  return speakItem(it, slow);
}

function runCards(ctx, items, cardFn, audioFn) {
  ctx.total = items.length;
  ctx.i = 0;
  const show = () => {
    const it = items[ctx.i];
    Play.frame(ctx, `<div class="learn-card" id="lc">${cardFn(it)}</div>
      <div class="learn-nav">
        <button class="btn ghost" id="lc-prev" ${ctx.i === 0 ? "disabled" : ""} aria-label="${esc(t("previous"))}">${backArrow()}</button>
        <button class="speak-btn" id="lc-say" aria-label="${esc(t("listen"))}">🔊</button>
        <button class="speak-btn slow" id="lc-slow" aria-label="${esc(t("slow"))}">🐢</button>
        <button class="btn primary" id="lc-next">${ctx.i === items.length - 1 ? "✔" : fwdArrow()}</button>
      </div><div class="dots">${items.map((x, i) => `<i class="${i === ctx.i ? "on" : i < ctx.i ? "done" : ""}"></i>`).join("")}</div>`,
      { progress: ctx.i / items.length });
    $("#lc-say").onclick = () => { Sfx.click(); audioFn(it, false); };
    $("#lc-slow").onclick = () => { Sfx.click(); audioFn(it, true); };
    $("#lc").onclick = () => audioFn(it, false);
    $("#lc-prev").onclick = () => { Sfx.flip(); ctx.i--; show(); };
    $("#lc-next").onclick = () => {
      Sfx.flip();
      ctx.score = Math.max(ctx.score, ctx.i + 1);
      if (ctx.i === items.length - 1) return Play.finish(ctx);
      ctx.i++;
      show();
    };
    Play.intro(ctx, () => audioFn(it, false));
  };
  show();
}

Engines.learn = ctx => {
  let items = poolOf(ctx);
  if (ctx.act.group === "letter") {
    // syllabes regroupées par lettre : بَ بُ بِ, puis تَ تُ تِ…
    items = items.slice().sort((a, b) => DATA.letters.indexOf(a.letter) - DATA.letters.indexOf(b.letter));
  }
  runCards(ctx, items, learnCard, learnAudio);
};

Engines.learn_forms = ctx => {
  const letters = poolOf(ctx).filter(x => x.t === "L");
  const words = poolOf(ctx).filter(x => x.t === "W");
  const labels = ["alone", "start", "middle", "end"].map(k => DATA.ui.feedback[k][0][lang()]);
  runCards(ctx, letters, L => {
    const ex = words.find(w => w.plain.includes(L.ch));
    return `<div class="lc-letter">${ar(L.ch, "giant")}</div><div class="lc-name">${ar(L.ar, "md")}</div>
      <div class="forms-grid">${L.forms.map((f, i) => `<div><span class="read lg" lang="ar">${esc(f)}</span><small>${esc(labels[i])}</small></div>`).join("")}</div>
      ${ex ? `<div class="lc-example">${ex.emoji ? emojiHtml(ex.emoji) : ""}${readHtml(ex)}</div>` : ""}`;
  }, (L, slow) => {
    const ex = words.find(w => w.plain.includes(L.ch));
    return Speech.seq([[L.ar, "ar"], ...(ex ? [[sayText(ex), "ar"]] : [])], { slow });
  });
};

/* ------------------------------------------------------------------------- */
/* Bulles : éclater toutes les bulles du son demandé                           */
/* ------------------------------------------------------------------------- */
Engines.bubbles = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "L" || x.t === "S");
  const rounds = cycle(P, 3);
  const PER = 4;
  ctx.total = rounds.length * PER;
  ctx.i = 0;
  ctx.rounds = rounds;
  let wrong = 0;
  const others = P.length >= 3 ? P : P.concat(sameTypeGlobal(P[0]).slice(0, 8));

  const round = () => {
    if (ctx.over) return;
    if (ctx.i >= rounds.length) {
      ctx.score = Math.max(0, ctx.score - Math.floor(wrong / 2));
      return Play.finish(ctx);
    }
    const tg = rounds[ctx.i];
    const decoys = distract(tg, others.filter(x => x.k !== tg.k), 4, shown);
    const bubbles = shuffle([...Array(PER).fill(tg), ...decoys, ...sample(decoys, Math.min(3, decoys.length))]);
    Play.frame(ctx, `<div class="bubble-head"><button class="speak-btn" id="bb-say">🔊</button>
        <span class="bubble-target">${readHtml(tg)}</span></div>
      <div class="bubble-zone" id="bz">${bubbles.map((b, i) => {
        const f = ((i * 0.37) % 1).toFixed(2);
        const dur = 7 + (i % 4) * 1.3;
        return `<button class="bubble c${i % 5}" data-k="${b.k}" style="left:calc((100% - 100px) * ${f} + 4px);animation-duration:${dur}s;animation-delay:-${((i * 1.7) % dur).toFixed(1)}s">${readHtml(b)}</button>`;
      }).join("")}</div>`, { progress: ctx.i / rounds.length });
    let left = PER;
    $("#bb-say").onclick = () => { Sfx.click(); speakItem(tg); };
    $$(".bubble").forEach(b => b.onclick = () => {
      if (b.classList.contains("popped")) return;
      if (b.dataset.k === tg.k) {
        b.classList.add("popped");
        Sfx.pop();
        ctx.score++;
        Play.setScore(ctx);
        left--;
        if (left === 0) {
          Mascot.say(Speech.feedback("good", false), "happy");
          Sfx.correct();
          ctx.i++;
          setTimeout(round, 900);
        }
      } else {
        wrong++;
        b.classList.add("shake");
        setTimeout(() => b.classList.remove("shake"), 450);
        Play.bad(ctx, tg.k, false);
        speakItem(tg);
      }
    });
    Play.intro(ctx, () => speakItem(tg));
  };
  round();
};

/* ------------------------------------------------------------------------- */
/* Mémoire : retrouver les paires (lettre ↔ image, mot ↔ image)                */
/* ------------------------------------------------------------------------- */
Engines.memory = ctx => {
  const P = poolOf(ctx);
  const pairs = sample(P.map(x => {
    if (x.t === "L") { const w = I(x.word); return w && w.emoji ? { k: x.k, a: readHtml(x), b: emojiHtml(w.emoji), say: x.ar, say2: sayText(w) } : null; }
    return x.emoji ? { k: x.k, a: readHtml(x), b: emojiHtml(x.emoji), say: sayText(x), say2: sayText(x) } : null;
  }).filter(Boolean), 6);
  const cards = shuffle(pairs.flatMap(p => [{ p, html: p.a, side: "a" }, { p, html: p.b, side: "b" }]));
  ctx.total = pairs.length;
  let open = [], found = 0, moves = 0, busy = false;
  Play.frame(ctx, `<div class="memory n${cards.length}">${cards.map((c, i) =>
    `<button class="mem-card" data-i="${i}"><span class="mem-back">?</span><span class="mem-front">${c.html}</span></button>`).join("")}</div>`,
    { progress: 0 });
  $$(".mem-card").forEach(el => el.onclick = async () => {
    if (busy || el.classList.contains("open")) return;
    const c = cards[+el.dataset.i];
    el.classList.add("open");
    Sfx.flip();
    Speech.say(c.side === "a" ? c.p.say : c.p.say2);
    open.push({ el, c });
    if (open.length < 2) return;
    moves++;
    const [x, y] = open;
    open = [];
    if (x.c.p === y.c.p) {
      found++;
      x.el.classList.add("found"); y.el.classList.add("found");
      Sfx.correct();
      $(".bar span").style.width = `${Math.round(found / pairs.length * 100)}%`;
      if (found === pairs.length) {
        ctx.score = Math.max(0, pairs.length - Math.floor(Math.max(0, moves - pairs.length - 2) / 2));
        await wait(1100);
        Play.finish(ctx);
      }
    } else {
      busy = true;
      await wait(1000);
      x.el.classList.remove("open"); y.el.classList.remove("open");
      busy = false;
    }
  });
  Play.intro(ctx);
};

/* ------------------------------------------------------------------------- */
/* Relier : mots ↔ images                                                      */
/* ------------------------------------------------------------------------- */
Engines.match = ctx => {
  const P = poolOf(ctx).filter(x => x.emoji);
  const sets = [];
  const pool = shuffle(P);
  for (let i = 0; i + 3 < pool.length && sets.length < 2; i += 4) sets.push(pool.slice(i, i + 4));
  if (!sets.length) sets.push(pool.slice(0, 4));
  ctx.total = sets.reduce((n, s) => n + s.length, 0);
  ctx.i = 0;
  const round = () => {
    if (ctx.i >= sets.length) return Play.finish(ctx);
    const set = sets[ctx.i];
    const pics = shuffle(set);
    let sel = null, done = 0;
    const missed = new Set();
    Play.frame(ctx, `<div class="match">
      <div class="col words">${set.map(x => `<button class="m-item" data-k="${x.k}">${readHtml(x)}</button>`).join("")}</div>
      <div class="col pics">${pics.map(x => `<button class="m-item" data-k="${x.k}">${emojiHtml(x.emoji)}</button>`).join("")}</div>
    </div>`, { progress: ctx.i / sets.length });
    $$(".words .m-item").forEach(b => b.onclick = () => {
      if (b.classList.contains("ok")) return;
      $$(".words .m-item").forEach(x => x.classList.toggle("sel", x === b));
      sel = b;
      Sfx.click();
    });
    $$(".pics .m-item").forEach(b => b.onclick = () => {
      if (b.classList.contains("ok")) return;
      if (!sel) { b.classList.add("shake"); setTimeout(() => b.classList.remove("shake"), 400); return; }
      if (sel.dataset.k === b.dataset.k) {
        sel.classList.remove("sel"); sel.classList.add("ok"); b.classList.add("ok");
        Play.good(ctx, b.dataset.k, !missed.has(b.dataset.k));
        speakItem(I(b.dataset.k));
        sel = null;
        if (++done === set.length) { ctx.i++; setTimeout(round, 1300); }
      } else {
        missed.add(sel.dataset.k);
        b.classList.add("shake");
        setTimeout(() => b.classList.remove("shake"), 400);
        Play.bad(ctx, sel.dataset.k);
      }
    });
    Play.intro(ctx);
  };
  round();
};

/* ------------------------------------------------------------------------- */
/* Ranger dans l'ordre : lettres d'un mot, mots d'une phrase, phrases d'une histoire, jours… */
/* ------------------------------------------------------------------------- */
function runOrder(ctx, rounds) {
  // round = { key, pieces: [texte…] (dans l'ordre), prompt, play, after, joiner, pieceCls }
  ctx.rounds = rounds;
  ctx.total = rounds.length;
  ctx.i = 0;
  const show = () => {
    if (ctx.over) return;
    if (ctx.i >= rounds.length) return Play.finish(ctx);
    const r = rounds[ctx.i];
    const order = shuffle(r.pieces.map((p, i) => ({ p, i })));
    if (order.length > 1 && order.every((x, j) => x.i === j)) order.reverse();
    let next = 0, errors = 0;
    Play.frame(ctx, `<div class="prompt">${r.prompt || ""}
        ${r.play ? `<div class="prompt-audio"><button class="speak-btn" id="pr-say">🔊</button><button class="speak-btn slow" id="pr-slow">🐢</button></div>` : ""}</div>
      <div class="answer-line ${r.cls || ""}" id="ans" lang="ar" dir="rtl">${r.pieces.map(() => `<span class="slot"></span>`).join("")}</div>
      <div class="pieces ${r.cls || ""}" lang="ar" dir="rtl">${order.map(x => `<button class="piece" data-i="${x.i}">${esc(x.p)}</button>`).join("")}</div>`);
    if (r.play) {
      $("#pr-say").onclick = () => { Sfx.click(); r.play(false); };
      $("#pr-slow").onclick = () => { Sfx.click(); r.play(true); };
    }
    $$(".piece").forEach(b => b.onclick = async () => {
      if (b.disabled) return;
      if (+b.dataset.i === next) {
        b.disabled = true;
        b.classList.add("used");
        const slot = $$("#ans .slot")[next];
        slot.textContent = r.pieces[next];
        slot.classList.add("filled");
        Sfx.click();
        if (r.sayPiece) r.sayPiece(next);
        next++;
        if (next === r.pieces.length) {
          if (r.perPiece) {           // une étoile par morceau bien placé (histoire)
            ctx.score += Math.max(0, r.pieces.length - errors);
            Play.setScore(ctx);
            Sfx.correct();
          } else if (errors === 0) Play.good(ctx, r.key);
          else Sfx.correct();
          if (r.joined) $("#ans").outerHTML = `<div class="answer-line done">${r.joined}</div>`;
          await Promise.race([r.after ? r.after() : wait(600), wait(6000)]);
          await wait(400);
          ctx.i++;
          show();
        }
      } else {
        errors++;
        b.classList.add("shake");
        setTimeout(() => b.classList.remove("shake"), 450);
        Play.bad(ctx, r.key, errors === 1);
      }
    });
    Play.intro(ctx, () => { if (r.play) r.play(false); });
  };
  show();
}

/* Construire le mot avec ses lettres (chaque lettre avec ses signes). */
Engines.build = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "W" && x.cl && !x.ar.includes(" ") && x.cl.length >= 2 && x.cl.length <= 7);
  const n = ctx.act.n || Math.min(5, P.length);
  runOrder(ctx, sample(P, n).map(w => ({
    key: w.k, pieces: w.cl, cls: "letters",
    prompt: w.emoji ? `<div class="card-pic">${emojiHtml(w.emoji, "huge")}</div>` : "",
    play: slow => speakItem(w, slow), joined: readHtml(w), after: () => speakItem(w),
  })));
};

/* Ranger les mots d'une phrase. */
Engines.order = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "X" && x.words.length >= 2);
  const n = ctx.act.n || Math.min(5, P.length);
  runOrder(ctx, sample(P, n).map(x => ({
    key: x.k, pieces: x.words, cls: "words",
    prompt: `<div class="card-pic">${emojiHtml(x.emoji, "huge")}${transl(x) ? `<div class="hint">${esc(transl(x))}</div>` : ""}</div>`,
    play: slow => speakItem(x, slow), joined: readHtml(x), after: () => speakItem(x),
  })));
};

/* Remettre l'histoire dans l'ordre (une seule manche, une étoile par phrase bien placée). */
Engines.order_story = ctx => {
  const s = ctx.story;
  const lines = s.lines.map(l => l.ar);
  runOrder(ctx, [{
    key: null, pieces: lines, cls: "lines", perPiece: true,
    prompt: `<div class="story-title">${emojiHtml(s.emoji)} ${ar(s.title.ar, "md")}</div>`,
    sayPiece: i => Speech.say(lines[i]),
  }]);
  ctx.total = lines.length;
};

/* Ranger jours, mois, lettres de l'alphabet. */
function orderSeq(ctx, items) {
  const n = ctx.act.n || 4;
  const rounds = [];
  for (let r = 0; r < n; r++) {
    const len = Math.min(4, items.length);
    const start = Math.floor(Math.random() * (items.length - len + 1));
    const part = items.slice(start, start + len);
    rounds.push({ key: null, pieces: part.map(shown), cls: "words", sayPiece: i => speakItem(part[i]) });
  }
  runOrder(ctx, rounds);
}
Engines.order_list = ctx => orderSeq(ctx, poolOf(ctx));
Engines.order_letters = ctx => orderSeq(ctx, DATA.letters.map(id => ({ k: "L:" + id, ...I("L:" + id) })));

/* ------------------------------------------------------------------------- */
/* Histoire ou message : lecture, puis questions                               */
/* ------------------------------------------------------------------------- */
Engines.story = ctx => {
  const s = ctx.story;
  Play.frame(ctx, `<article class="story" lang="ar" dir="rtl">
      <h2>${emojiHtml(s.emoji)} ${ar(s.title.ar, "md")}</h2>
      ${s.lines.map((l, i) => `<p class="story-line" data-i="${i}"><span class="sl-emoji">${esc(l.emoji)}</span>
        ${ar(l.ar, "line")}${lang() !== "ar" && Settings.get("translate") ? `<small class="hint" dir="ltr">${esc(l[lang()])}</small>` : ""}</p>`).join("")}
    </article>
    <div class="row center">
      <button class="btn secondary" id="st-read">🔊 ${esc(t("read_to_me"))}</button>
      <button class="btn primary big" id="st-go">${esc(t("questions"))} ${fwdArrow()}</button>
    </div>`, { progress: 0 });
  const lines = $$(".story-line");
  lines.forEach(p => p.onclick = () => { lines.forEach(x => x.classList.toggle("now", x === p)); Speech.say(s.lines[+p.dataset.i].ar); });
  $("#st-read").onclick = async () => {
    const my = ++readToken;
    for (let i = 0; i < s.lines.length; i++) {
      if (my !== readToken || ctx.over) break;
      lines.forEach((x, j) => x.classList.toggle("now", j === i));
      const ok = await Speech.say(s.lines[i].ar);
      if (!ok) break;
      await wait(250);
    }
    lines.forEach(x => x.classList.remove("now"));
  };
  $("#st-go").onclick = () => {
    readToken++;
    Speech.stop();
    runQuiz(ctx, s.questions.map((q, qi) => {
      const opts = q.options.map((o, i) => ({ k: `${s.id}.${qi}.${i}`, ar: o, t: "X" }));
      return quizRound(opts[0], opts.slice(1), {
        key: null,
        prompt: `<div class="question">${ar(q.ar, "md")}${lang() !== "ar" && Settings.get("translate") ? `<div class="hint">${esc(q[lang()])}</div>` : ""}</div>`,
        play: slow => Speech.say(q.ar, { slow }), layout: "list",
      });
    }));
  };
  Play.intro(ctx);
};
let readToken = 0;

/* ------------------------------------------------------------------------- */
/* Lire à voix haute (reconnaissance vocale du téléphone ou du navigateur)     */
/* ------------------------------------------------------------------------- */
function normalizeAr(s) {
  return String(s || "").replace(/[ً-ْٰـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[^ء-ي ]/g, "").trim();
}

function closeEnough(heard, want) {
  const h = normalizeAr(heard), w = normalizeAr(want);
  if (!h || !w) return false;
  if (h.split(" ").includes(w) || h.includes(w)) return true;
  const strip = x => x.replace(/^ال/, "");
  if (strip(h) === strip(w)) return true;
  // une lettre de différence accepte les petites erreurs du moteur de reconnaissance
  if (Math.abs(h.length - w.length) > 1 || w.length < 3) return false;
  let i = 0, j = 0, diff = 0;
  while (i < h.length && j < w.length) {
    if (h[i] === w[j]) { i++; j++; continue; }
    diff++;
    if (h.length > w.length) i++; else if (w.length > h.length) j++; else { i++; j++; }
  }
  return diff + (h.length - i) + (w.length - j) <= 1;
}

Engines.speak = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "W" && x.emoji);
  const words = sample(P, Math.min(4, P.length));
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  ctx.total = words.length;
  ctx.i = 0;
  const show = () => {
    if (ctx.over) return;
    if (ctx.i >= words.length) return Play.finish(ctx);
    const w = words[ctx.i];
    let tries = 0;
    Play.frame(ctx, `<div class="prompt"><div class="card-pic">${emojiHtml(w.emoji, "huge")}${readHtml(w)}</div></div>
      <div class="speak-zone">
        <button class="mic-btn" id="mic" ${Rec ? "" : "disabled"}>🎤</button>
        <div class="mic-msg" id="mic-msg">${esc(Rec ? t("mic_tap") : t("mic_none"))}</div>
      </div>
      <div class="row center">
        <button class="btn secondary" id="sp-listen">🔊 ${esc(t("listen_model"))}</button>
        <button class="btn ghost" id="sp-self">${esc(Rec ? t("skip") : t("i_read_it"))}</button>
      </div>`);
    const msg = $("#mic-msg");
    $("#sp-listen").onclick = () => { Sfx.click(); speakItem(w); };
    $("#sp-self").onclick = () => {
      if (!Rec) { ctx.score++; Play.setScore(ctx); }
      ctx.i++;
      show();
    };
    if (Rec) $("#mic").onclick = () => {
      Speech.stop();
      const rec = new Rec();
      rec.lang = "ar-SA";
      rec.maxAlternatives = 5;
      rec.interimResults = false;
      $("#mic").classList.add("on");
      msg.textContent = t("mic_listening");
      let got = false;
      rec.onresult = e => {
        got = true;
        const alts = Array.from(e.results[0] || []).map(x => x.transcript);
        $("#mic").classList.remove("on");
        if (alts.some(a => closeEnough(a, w.ar))) {
          msg.textContent = "✔ " + Speech.feedback("good", false);
          Play.good(ctx, w.k, tries === 0);
          ctx.flags = { spoke: true };
          speakItem(w).then(() => { ctx.i++; setTimeout(show, 400); });
        } else {
          tries++;
          msg.textContent = `${t("mic_heard")} « ${alts[0] || "…"} »`;
          Play.bad(ctx, w.k);
          if (tries >= 3) setTimeout(() => { ctx.i++; show(); }, 1800);
        }
      };
      rec.onerror = e => {
        $("#mic").classList.remove("on");
        msg.textContent = e.error === "not-allowed" ? t("mic_denied") : e.error === "no-speech" ? t("mic_nothing") : t("mic_error");
      };
      rec.onend = () => { $("#mic") && $("#mic").classList.remove("on"); if (!got && msg.textContent === t("mic_listening")) msg.textContent = t("mic_nothing"); };
      try { rec.start(); } catch (err) { msg.textContent = t("mic_error"); }
    };
    Play.intro(ctx, () => Speech.instruction("speak"));
  };
  show();
};
