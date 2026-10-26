"use client";

import { useState } from "react";
import { useLang } from "@/components/useLang.js";

const MIN_PASSWORD = 8;

export default function ActivateForm({ school, initialUsername, lang }) {
  const { t, switcher } = useLang(lang);
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) { setError(t("Choose a password of at least {n} characters.", { n: MIN_PASSWORD })); return; }
    if (password !== confirm) { setError(t("The two passwords don't match.")); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, code, password }) });
      if (res.ok) { window.location.href = "/"; return; }
      setError((await res.json().catch(() => ({}))).error || t("Couldn't create the account. Try again."));
    } catch {
      setError(t("Couldn't reach the server. Check your connection."));
    }
    setBusy(false);
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit}>
        {switcher}
        <div className="login-brand"><div className="brand-mark">S</div><span className="brand-name">Scholar</span></div>
        <h1 className="h1">{t("Create your account")}</h1>
        <p className="sub">{school}</p>
        <p className="hint">{t("Use the username and one-time activation code you got from the school office, then choose your own password.")}</p>
        <div className="field">
          <label htmlFor="username">{t("Username")}</label>
          <input className="input" id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("e.g. s148")} required autoFocus={!initialUsername} />
        </div>
        <div className="field">
          <label htmlFor="code">{t("Activation code")}</label>
          <input className="input mono login-code" id="code" name="code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX" required autoFocus={!!initialUsername} />
        </div>
        <div className="fields-2">
          <div className="field">
            <label htmlFor="password">{t("New password")}</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="confirm">{t("Confirm password")}</label>
            <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
        </div>
        {error && <div className="err" role="alert">{error}</div>}
        <button className="btn primary login-go" disabled={busy}>{busy ? t("Creating account…") : t("Create account")}</button>
        <p className="login-switch">{t("Already set up?")} <a href="/login">{t("Sign in")}</a></p>
      </form>
    </main>
  );
}
