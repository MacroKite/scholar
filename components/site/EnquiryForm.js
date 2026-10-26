"use client";

import { useState } from "react";
import { makeT } from "@/lib/i18n/index.js";

// Admission or contact enquiry: saved for the school office (Website, admin).
export default function EnquiryForm({ kind, lang, classes = [] }) {
  const t = makeT(lang);
  const [state, setState] = useState({ busy: false, done: false, error: "" });
  async function submit(e) {
    e.preventDefault();
    const f = e.target;
    setState({ busy: true, done: false, error: "" });
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: f.name.value, phone: f.phone.value, className: f.className?.value ?? "", message: f.message.value }),
      });
      if (res.ok) { f.reset(); setState({ busy: false, done: true, error: "" }); return; }
      setState({ busy: false, done: false, error: (await res.json().catch(() => ({}))).error || t("Couldn't send. Try again.") });
    } catch {
      setState({ busy: false, done: false, error: t("Couldn't reach the server. Check your connection.") });
    }
  }
  if (state.done) {
    return <div className="site-card site-thanks"><b>{t("Thank you!")}</b><p>{t("The school office will call you back soon.")}</p>
      <button type="button" className="btn" onClick={() => setState({ busy: false, done: false, error: "" })}>{t("Send another")}</button></div>;
  }
  return (
    <form className="site-card site-form" onSubmit={submit}>
      <h3>{kind === "admission" ? t("Admission enquiry") : t("Send us a message")}</h3>
      <div className="fields-2">
        <div className="field"><label htmlFor={`${kind}-name`}>{kind === "admission" ? t("Guardian's name") : t("Your name")}</label><input className="input" id={`${kind}-name`} name="name" required maxLength={80} /></div>
        <div className="field"><label htmlFor={`${kind}-phone`}>{t("Phone")}</label><input className="input" id={`${kind}-phone`} name="phone" type="tel" required maxLength={30} placeholder="01XXXXXXXXX" /></div>
      </div>
      {kind === "admission" && (
        <div className="field"><label htmlFor="admission-class">{t("Class wanted")}</label>
          <select className="select" id="admission-class" name="className" defaultValue="">
            <option value="">{t("Choose a class")}</option>
            {classes.map((c) => <option key={c} value={c}>{t.data(c)}</option>)}
          </select></div>
      )}
      <div className="field"><label htmlFor={`${kind}-message`}>{t("Message")}</label><textarea className="input textarea" id={`${kind}-message`} name="message" maxLength={2000} placeholder={kind === "admission" ? t("e.g. My son is in Class Five now. When is the admission test?") : t("How can we help?")} /></div>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <button className="btn primary" disabled={state.busy}>{state.busy ? t("Sending…") : t("Send")}</button>
    </form>
  );
}
