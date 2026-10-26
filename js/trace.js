/*
 * Écrire avec le doigt : le modèle (lettre, forme, mot, chiffre ou prénom) est dessiné en gris
 * clair ; l'apprenant repasse dessus. On compare deux images : la part du modèle couverte par
 * le doigt, et la part de l'encre restée près du modèle. Pas besoin de connaître l'ordre des traits.
 */

const TRACE_FONT = { ar: "700 1px 'Noto Naskh Arabic', serif", digits: "700 1px 'Baloo Bhaijaan 2', sans-serif" };

const Tracer = {
  /* Dessine le texte centré dans le canvas ; renvoie la taille de police utilisée. */
  drawGlyph(ctx2d, text, w, h, font, fill) {
    let size = h * 0.62;
    ctx2d.font = font.replace("1px", `${size}px`);
    const m = ctx2d.measureText(text);
    const width = m.width || 1;
    if (width > w * 0.84) size = size * (w * 0.84) / width;
    ctx2d.font = font.replace("1px", `${size}px`);
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.direction = "rtl";
    ctx2d.fillStyle = fill;
    ctx2d.fillText(text, w / 2, h * 0.52);
    return size;
  },

  mask(text, w, h, font) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const size = this.drawGlyph(g, text, w, h, font, "#000");
    return { data: g.getImageData(0, 0, w, h).data, size };
  },

  /* Grossit le modèle de « r » pixels (tolérance autour du trait). */
  dilate(alpha, w, h, r) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (alpha[(y * w + x) * 4 + 3] < 100) continue;
      for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = 1;
      }
    }
    return out;
  },
};

/* Un exercice d'écriture : liste de { text, say, font } */
function runTrace(ctx, glyphs, { lenient = false } = {}) {
  ctx.total = glyphs.length;
  ctx.i = 0;
  const show = () => {
    if (ctx.over) return;
    if (ctx.i >= glyphs.length) return Play.finish(ctx);
    const g = glyphs[ctx.i];
    let checks = 0;
    Play.frame(ctx, `<div class="trace-wrap">
        <div class="trace-model">${g.font === "digits" ? ltr(g.text, "digits md") : ar(g.text, "md")}
          ${g.say ? `<button class="speak-btn" id="tr-say">🔊</button>` : ""}</div>
        <div class="trace-box"><canvas id="tr-canvas"></canvas><div class="trace-pen" id="tr-pen">✏️</div></div>
        <div class="trace-msg" id="tr-msg"></div>
        <div class="row center trace-tools">
          <button class="btn ghost" id="tr-demo">👀 ${esc(t("show_me"))}</button>
          <button class="btn ghost" id="tr-clear">🧽 ${esc(t("erase"))}</button>
          <button class="btn primary big" id="tr-ok">✔ ${esc(t("done"))}</button>
        </div></div>`, { progress: ctx.i / glyphs.length });

    const canvas = $("#tr-canvas");
    const box = $(".trace-box");
    const W = Math.round(box.clientWidth), H = Math.round(box.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const c2 = canvas.getContext("2d");
    c2.scale(dpr, dpr);
    const font = g.font === "digits" ? TRACE_FONT.digits : TRACE_FONT.ar;

    // Image de référence en petite taille (calcul rapide).
    const SW = 160, SH = Math.round(160 * H / W);
    const ref = Tracer.mask(g.text, SW, SH, font);
    const brush = Math.max(14, ref.size * (W / SW) * 0.11);
    const near = Tracer.dilate(ref.data, SW, SH, Math.max(3, Math.round(brush / (W / SW) * 0.9)));
    let total = 0;
    for (let i = 3; i < ref.data.length; i += 4) if (ref.data[i] > 100) total++;

    const ink = document.createElement("canvas");
    ink.width = SW; ink.height = SH;
    const ic = ink.getContext("2d");
    ic.lineCap = ic.lineJoin = "round";
    ic.lineWidth = brush * SW / W;
    ic.strokeStyle = "#000";

    const paintModel = () => {
      c2.clearRect(0, 0, W, H);
      // lignes du cahier
      c2.strokeStyle = "rgba(13,148,136,.18)";
      c2.lineWidth = 2;
      [0.3, 0.52, 0.74].forEach(y => { c2.beginPath(); c2.moveTo(10, H * y); c2.lineTo(W - 10, H * y); c2.stroke(); });
      Tracer.drawGlyph(c2, g.text, W, H, font, "rgba(15,118,110,.20)");
    };
    paintModel();
    c2.lineCap = c2.lineJoin = "round";

    let drawing = false, last = null, strokes = 0;
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.onpointerdown = e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      last = pos(e);
      strokes++;
      dot(last);
    };
    canvas.onpointermove = e => {
      if (!drawing) return;
      const p = pos(e);
      line(last, p);
      last = p;
    };
    canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; autoCheck(); };
    const line = (a, b) => {
      c2.strokeStyle = "#f97316";
      c2.lineWidth = brush;
      c2.beginPath(); c2.moveTo(a.x, a.y); c2.lineTo(b.x, b.y); c2.stroke();
      ic.beginPath(); ic.moveTo(a.x * SW / W, a.y * SH / H); ic.lineTo(b.x * SW / W, b.y * SH / H); ic.stroke();
    };
    const dot = p => line(p, { x: p.x + 0.1, y: p.y + 0.1 });

    const measure = () => {
      const d = ic.getImageData(0, 0, SW, SH).data;
      let covered = 0, inkAll = 0, inkNear = 0;
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const on = d[i + 3] > 100;
        if (on) { inkAll++; if (near[j]) inkNear++; }
        if (on && ref.data[i + 3] > 100) covered++;
      }
      return { cover: covered / Math.max(1, total), precise: inkAll ? inkNear / inkAll : 0 };
    };
    const need = lenient ? 0.55 : 0.68;
    let autoDone = false;
    const autoCheck = () => {
      if (autoDone) return;
      const m = measure();
      if (m.cover >= need + 0.08 && m.precise >= 0.7) { autoDone = true; success(); }
    };
    const success = async () => {
      if (ctx.over) return;
      $("#tr-msg").textContent = "✔ " + Speech.feedback("good", false);
      $("#tr-msg").className = "trace-msg ok";
      canvas.onpointerdown = null;
      Play.good(ctx, g.key, checks <= 1);
      ctx.traced++;
      Confetti.burst(40);
      if (g.say) await Promise.race([Speech.say(g.say), wait(2500)]);
      await wait(500);
      ctx.i++;
      show();
    };
    $("#tr-ok").onclick = () => {
      checks++;
      const m = measure();
      if (m.cover >= need && m.precise >= 0.6) return success();
      Play.bad(ctx, g.key, false);
      $("#tr-msg").textContent = m.precise < 0.6 ? t("trace_outside") : t("trace_more");
      $("#tr-msg").className = "trace-msg bad";
      Speech.sayT(DATA.ui.feedback.trace_again[0]);
      if (checks >= 3) {
        $("#tr-ok").textContent = `${fwdArrow()} ${t("next")}`;
        $("#tr-ok").onclick = () => { ctx.i++; show(); };
      }
    };
    $("#tr-clear").onclick = () => {
      Sfx.click();
      ic.clearRect(0, 0, SW, SH);
      paintModel();
      c2.lineCap = c2.lineJoin = "round";
      $("#tr-msg").textContent = "";
      strokes = 0;
    };
    $("#tr-demo").onclick = () => demo();
    if ($("#tr-say")) $("#tr-say").onclick = () => { Sfx.click(); Speech.say(g.say); };

    // Démonstration : le modèle apparaît de droite à gauche (sens de l'écriture arabe), crayon en tête.
    const demo = () => {
      const pen = $("#tr-pen");
      const start = performance.now();
      const dur = 1800;
      const ltrText = g.font === "digits";
      const frame = now => {
        if (!$("#tr-canvas") || ctx.over) return;
        const k = Math.min(1, (now - start) / dur);
        paintModel();
        c2.save();
        c2.beginPath();
        if (ltrText) c2.rect(0, 0, W * k, H); else c2.rect(W * (1 - k), 0, W * k, H);
        c2.clip();
        Tracer.drawGlyph(c2, g.text, W, H, font, "rgba(13,148,136,.75)");
        c2.restore();
        pen.style.display = "block";
        pen.style.left = `${(ltrText ? k : 1 - k) * (W - 40) + 4}px`;
        pen.style.top = `${H * 0.4}px`;
        if (k < 1) requestAnimationFrame(frame);
        else setTimeout(() => {
          pen.style.display = "none";
          paintModel();
          // l'encre déjà tracée reste visible
          c2.drawImage(ink, 0, 0, W, H);
          c2.lineCap = c2.lineJoin = "round";
        }, 600);
      };
      requestAnimationFrame(frame);
    };
    Play.intro(ctx, () => { if (g.say) Speech.say(g.say); if (ctx.i === 0) demo(); });
  };
  // Attendre la police : sinon le modèle est mesuré avec une police de secours.
  (document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load("700 40px 'Noto Naskh Arabic'", "بت"), document.fonts.load("700 40px 'Baloo Bhaijaan 2'", "12")])
    : Promise.resolve()).catch(() => {}).then(show);
}

Engines.trace = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "L");
  const list = ctx.act.random ? sample(P, ctx.act.n || 6) : P;
  runTrace(ctx, list.map(L => ({ text: L.ch, say: L.ar, key: L.k })));
};

Engines.trace_forms = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "L");
  const list = sample(P, ctx.act.n || Math.min(6, P.length));
  runTrace(ctx, list.map(L => {
    const i = L.joins ? 1 + Math.floor(Math.random() * 3) : pick([0, 3]);
    return { text: L.forms[i], say: L.ar, key: L.k };
  }));
};

Engines.trace_words = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "W");
  runTrace(ctx, sample(P, ctx.act.n || 5).map(w => ({ text: w.ar, say: sayText(w), key: w.k })), { lenient: true });
};

Engines.trace_digits = ctx => {
  const P = poolOf(ctx).filter(x => x.t === "N" && x.num < 10);
  runTrace(ctx, sample(P, ctx.act.n || 5).map(n => ({ text: n.digits, say: n.ar, key: n.k, font: "digits" })));
};

Engines.trace_name = ctx => {
  const l = Store.current();
  const arName = l && (l.arName || (/[ء-ي]/.test(l.name) ? l.name : ""));
  if (arName) {
    ctx.flags = { name: true };
    return runTrace(ctx, [0, 1, 2].map(() => ({ text: arName, key: null })), { lenient: true });
  }
  // Prénom pas encore écrit en arabe : l'accompagnant l'écrit une fois.
  Play.frame(ctx, `<div class="card center-text">
      <div class="pic huge">🪪</div>
      <p>${esc(t("name_needed"))}</p>
      <input id="nm" class="big-input" lang="ar" dir="rtl" maxlength="20" placeholder="${esc(t("name_ar_ph"))}">
      <div class="row center"><button class="btn primary big" id="nm-ok">✔ ${esc(t("save"))}</button></div>
    </div>`);
  $("#nm-ok").onclick = () => {
    const v = $("#nm").value.trim();
    if (!/[ء-ي]/.test(v)) { $("#nm").classList.add("shake"); return; }
    Store.updateLearner(l.id, { arName: v });
    Engines.trace_name(ctx);
  };
};
