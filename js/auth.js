/* Inscription, connexion, mot de passe oublié (Supabase Auth) — le compte est facultatif. */

const AUTH_ERRORS = {
  invalid_credentials: "err_invalid_credentials",
  email_not_confirmed: "err_email_not_confirmed",
  user_already_exists: "err_user_exists",
  email_exists: "err_user_exists",
  weak_password: "err_weak_password",
  same_password: "err_same_password",
  over_email_send_rate_limit: "err_rate_limit",
  over_request_rate_limit: "err_rate_limit",
  email_address_invalid: "err_email",
  signup_disabled: "err_signup_disabled",
};
const Auth = { email: "" };

function authMessage(error) {
  const key = AUTH_ERRORS[error.code] || (error.status === 429 ? "err_rate_limit" : null);
  if (!key && /fetch|network/i.test(error.message || "")) return t("err_offline");
  return key ? t(key) : t("err_generic");
}

Screens.account = mode => {
  if (!Cloud.client) return go("#/helper/account");
  if (Cloud.session && mode !== "newpass") return go("#/helper/account");
  mode = mode || "login";
  const email = esc(Auth.email);
  const pw = (id, label, hint, auto) => `<div class="field"><label for="${id}">${esc(t(label))}</label>
      <div class="pw" dir="ltr"><input id="${id}" type="password" autocomplete="${auto}" dir="ltr" required>
        <button type="button" class="pw-eye" data-for="${id}" aria-label="${esc(t("show_password"))}">👁️</button></div>
      ${hint ? `<small class="muted">${esc(t(hint))}</small>` : ""}</div>`;
  const emailField = `<label class="field"><span>${esc(t("email"))}</span>
      <input id="au-email" type="email" autocomplete="email" inputmode="email" dir="ltr" value="${email}" required></label>`;
  const forms = {
    signup: `<h2>${esc(t("signup_title"))}</h2><p class="muted">${esc(t("signup_intro"))}</p>
      <form id="auth-form" novalidate>
        <label class="field"><span>${esc(t("your_name"))}</span>
          <input id="au-name" autocomplete="name" maxlength="80" placeholder="${esc(t("your_name_ph"))}" required></label>
        ${emailField}
        ${pw("au-pass", "password", "password_hint", "new-password")}
        ${pw("au-pass2", "password_confirm", "", "new-password")}
        <div class="auth-error" id="au-error" role="alert" hidden></div>
        <button class="btn primary big wide" type="submit">✔ ${esc(t("create_account"))}</button>
      </form>
      <p class="auth-switch">${esc(t("have_account"))} <a href="#/account/login">${esc(t("sign_in"))}</a></p>
      <p class="muted small">${esc(t("shared_account_note"))}</p>`,
    login: `<h2>${esc(t("login_title"))}</h2><p class="muted">${esc(t("login_intro"))}</p>
      <form id="auth-form" novalidate>
        ${emailField}
        ${pw("au-pass", "password", "", "current-password")}
        <div class="auth-forgot"><a href="#/account/forgot">${esc(t("forgot"))}</a></div>
        <div class="auth-error" id="au-error" role="alert" hidden></div>
        <button class="btn primary big wide" type="submit">${esc(t("sign_in"))} ${fwdArrow()}</button>
      </form>
      <p class="auth-switch">${esc(t("no_account"))} <a href="#/account/signup">${esc(t("create_account"))}</a></p>`,
    forgot: `<div class="auth-big">🔑</div><h2>${esc(t("forgot_title"))}</h2><p class="muted">${esc(t("forgot_intro"))}</p>
      <form id="auth-form" novalidate>
        ${emailField}
        <div class="auth-error" id="au-error" role="alert" hidden></div>
        <button class="btn primary big wide" type="submit">📧 ${esc(t("send_link"))}</button>
      </form>`,
    sent: `<div class="auth-big">📬</div><h2>${esc(t("check_email_title"))}</h2>
      <p>${t("check_email", { e: `<b dir="ltr">${email}</b>` })}</p>
      <p class="warn-box">${esc(t("check_spam"))}</p>
      <div class="auth-error" id="au-error" role="alert" hidden></div>
      <div class="row center"><button class="btn secondary" id="au-resend">🔁 ${esc(t("resend"))}</button>
        <a class="btn ghost" href="#/account/login">${esc(t("sign_in"))}</a></div>`,
    reset_sent: `<div class="auth-big">📬</div><h2>${esc(t("check_email_title"))}</h2>
      <p>${t("reset_sent", { e: `<b dir="ltr">${email}</b>` })}</p>
      <p class="warn-box">${esc(t("check_spam"))}</p>`,
    newpass: `<div class="auth-big">🔐</div><h2>${esc(t("newpass_title"))}</h2>
      <form id="auth-form" novalidate>
        ${pw("au-pass", "password", "password_hint", "new-password")}
        ${pw("au-pass2", "password_confirm", "", "new-password")}
        <div class="auth-error" id="au-error" role="alert" hidden></div>
        <button class="btn primary big wide" type="submit">✔ ${esc(t("save"))}</button>
      </form>`,
  };
  app().innerHTML = `<div class="page">
    ${header({ back: "#/helper/account", title: `☁️ ${t("account_title")}` })}
    <section class="card auth">${forms[mode] || forms.login}</section>
    <p class="legal-links"><a href="privacy.html#${lang()}" target="_blank" rel="noopener">🔒 ${esc(t("privacy"))}</a></p>
  </div>`;
  $$(".pw-eye").forEach(b => b.onclick = () => {
    const input = $("#" + b.dataset.for);
    input.type = input.type === "password" ? "text" : "password";
    b.textContent = input.type === "password" ? "👁️" : "🙈";
  });
  const first = $("#au-name") || $("#au-email") || $("#au-pass");
  if (first) setTimeout(() => first.focus(), 50);
  const form = $("#auth-form");
  if (form) form.onsubmit = e => { e.preventDefault(); submitAuth(mode, form); };
  const resend = $("#au-resend");
  if (resend) resend.onclick = async () => {
    resend.disabled = true;
    const { error } = await Cloud.client.auth.resend({ type: "signup", email: Auth.email,
      options: { emailRedirectTo: Cloud.redirect() } });
    resend.disabled = false;
    if (error) showAuthError(authMessage(error)); else toast(t("resent"));
  };
};

function showAuthError(msg, input) {
  const box = $("#au-error");
  box.textContent = msg;
  box.hidden = false;
  $$(".field input.bad").forEach(x => x.classList.remove("bad"));
  if (input) { input.classList.add("bad", "shake"); input.focus(); setTimeout(() => input.classList.remove("shake"), 400); }
  Sfx.wrong();
}

async function submitAuth(mode, form) {
  const val = id => { const x = $("#" + id); return x ? x.value.trim() : ""; };
  const name = val("au-name"), email = val("au-email"), pass = ($("#au-pass") || {}).value || "";
  if (mode === "signup" && name.length < 2) return showAuthError(t("err_name"), $("#au-name"));
  if (mode !== "newpass" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showAuthError(t("err_email"), $("#au-email"));
  if ((mode === "signup" || mode === "newpass") && pass.length < 8) return showAuthError(t("err_password_short"), $("#au-pass"));
  if ((mode === "signup" || mode === "newpass") && pass !== $("#au-pass2").value) return showAuthError(t("err_password_match"), $("#au-pass2"));
  if (mode === "login" && !pass) return showAuthError(t("err_invalid_credentials"), $("#au-pass"));
  if (email) Auth.email = email;

  const button = $("button[type=submit]", form);
  const label = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "⏳";
  let result;
  try {
    const auth = Cloud.client.auth;
    if (mode === "signup") {
      result = await auth.signUp({ email, password: pass, options: { data: { full_name: name }, emailRedirectTo: Cloud.redirect() } });
    } else if (mode === "login") {
      result = await auth.signInWithPassword({ email, password: pass });
    } else if (mode === "forgot") {
      result = await auth.resetPasswordForEmail(email, { redirectTo: Cloud.redirect() });
    } else {
      result = await auth.updateUser({ password: pass });
    }
  } catch (e) {
    result = { error: { message: String(e) } };
  }
  button.disabled = false;
  button.innerHTML = label;
  const { data, error } = result;
  if (error) return showAuthError(authMessage(error), error.code === "invalid_credentials" ? $("#au-pass") : null);
  Sfx.win();
  if (mode === "signup") {
    // Adresse déjà inscrite : Supabase répond sans erreur mais sans identité.
    if (data.user && data.user.identities && !data.user.identities.length) return showAuthError(t("err_user_exists"), $("#au-email"));
    if (!data.session) go("#/account/sent");
  } else if (mode === "forgot") {
    go("#/account/reset_sent");
  } else if (mode === "newpass") {
    Cloud.recovering = false;
    toast(t("password_updated"));
    go("#/helper/account");
  } else {
    toast(t("signed_in"));
  }
}
