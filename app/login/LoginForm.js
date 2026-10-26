"use client";

import { useState } from "react";
import { useLang } from "@/components/useLang.js";

export default function LoginForm({ school, demo, demoPassword, lang }) {
  const { t, switcher } = useLang(lang);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false); // account exists but isn't activated
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPending(false);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      if (res.ok) { window.location.href = "/"; return; }
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("Couldn't sign in. Try again."));
      setPending(!!data.pending);
    } catch {
      setError(t("Couldn't reach the server. Check your connection."));
    }
    setBusy(false);
  }

  const fillDemo = (u) => { setUsername(u); setPassword(demoPassword); setError(""); };

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit} autoComplete="on">
        {switcher}
        <div className="login-brand"><div className="brand-mark">S</div><span className="brand-name">Scholar</span></div>
        <h1 className="h1">{t("Sign in")}</h1>
        <p className="sub">{school}</p>
        <div className="field">
          <label htmlFor="username">{t("Username")}</label>
          <input className="input" id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("e.g. admin, tnr or s113")} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">{t("Password")}</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="err" role="alert">{error}{pending && <> <a href={`/activate?u=${encodeURIComponent(username.trim())}`}>{t("Create your account")}</a></>}</div>}
        <button className="btn primary login-go" disabled={busy}>{busy ? t("Signing in…") : t("Sign in")}</button>
        <p className="hint">{t("Teachers sign in with their initials. Students and their guardians share one family account: sign in with the student ID (e.g. s113).")}</p>
        <p className="login-switch">{t("New here?")} <a href="/activate">{t("Create your account")}</a></p>
      </form>

      {demo && (
        <section className="card login-demo" aria-label={t("Try a demo account")}>
          <h2>{t("Try a demo account")}</h2>
          <p className="hint">{t("Every account in the demo school starts with the password")} <b className="mono">{demoPassword}</b></p>
          <div className="login-demo-list">
            {demo.map((d) => (
              <button type="button" key={d.username} className="login-demo-item" onClick={() => fillDemo(d.username)}>
                <span className="t">{t(d.role)}</span>
                <span className="m">{d.name} · <span className="mono">{d.username}</span></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
