// Scholar — looking after the schools on this deployment.
//   npm run school -- list
//   npm run school -- create <id> --name "Adarsha High School" --admin "Principal's name" [--email x] [--host www.adarsha.edu.bd] [--year 2026]
//   npm run school -- host <id> --add <address> | --remove <address>
//   npm run school -- sms <id> --key <BulkSMSBD API key> --sender <sender ID> | --clear
//   npm run school -- admin-code <id>
//   npm run school -- suspend <id> | activate <id>
//   npm run school -- delete <id> --confirm <id>
// Uses DATABASE_URL (from the environment or .env.local), or the local PGlite
// database when it isn't set. Stop `npm run dev` first when using PGlite.
// The running app picks up changes to schools within a minute.

import "./env.mjs";

const { db } = await import("../lib/server/db.js");
const P = await import("../lib/server/platform.js");

const [cmd, id, ...rest] = process.argv.slice(2);
// --name "x" style options; --host can repeat.
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const m = rest[i].match(/^--([a-z-]+)$/);
  if (!m) continue;
  const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
  opts[m[1]] = m[1] === "host" ? [...(opts.host ?? []), v] : v;
}

const USAGE = `Usage:
  npm run school -- list
  npm run school -- create <id> --name "School name" --admin "Admin's name" [--email x] [--host address] [--year 2026]
  npm run school -- host <id> --add <address> | --remove <address>
  npm run school -- sms <id> --key <api key> --sender <sender id> | --clear
  npm run school -- admin-code <id>
  npm run school -- suspend <id> | activate <id>
  npm run school -- delete <id> --confirm <id>`;

const codeText = (r) => `  Username:        ${r.username}
  Activation code: ${r.code}  (valid until ${r.expires.slice(0, 10)}, shown only now)
  Create account:  https://${r.address}/activate?u=${r.username}`;

const conn = await db();
try {
  switch (cmd) {
    case "list": {
      const rows = await P.listSchools();
      if (!rows.length) { console.log("No schools yet."); break; }
      for (const s of rows) {
        const flags = [s.demo && "demo", s.status !== "active" && s.status.toUpperCase()].filter(Boolean).join(", ");
        console.log(`${s.id}${flags ? ` [${flags}]` : ""}  ${s.name}`);
        console.log(`  ${P.addressOf(s)}${s.hosts.length > 1 ? ` (+ ${s.hosts.slice(1).join(", ")})` : ""}`);
        console.log(`  ${s.students} students · ${s.teachers} teachers · ${s.active_accounts} accounts set up · last sign-in ${s.last_sign_in ? new Date(s.last_sign_in).toISOString().slice(0, 10) : "never"} · SMS ${s.sms_sender ? `own (${s.sms_sender})` : "shared or off"} · since ${s.created}`);
      }
      break;
    }
    case "create": {
      const r = await P.createSchool({ id, name: opts.name, adminName: opts.admin, adminEmail: opts.email || "", hosts: opts.host ?? [], year: opts.year && String(opts.year) });
      console.log(`Created ${r.id}: ${r.name}. Give the admin these, once:\n${codeText(r)}`);
      console.log(`They then set up classes, teachers and students in the app.`);
      break;
    }
    case "host": {
      if (typeof opts.add === "string") { await P.addHost(id, opts.add); console.log(`${opts.add} now opens ${id}.`); }
      else if (typeof opts.remove === "string") { await P.removeHost(id, opts.remove); console.log(`${opts.remove} no longer opens ${id}.`); }
      else throw new P.PlatformError("Say --add <address> or --remove <address>.");
      break;
    }
    case "sms": {
      if (opts.clear) { await P.setSms(id, {}); console.log(`${id} no longer has its own SMS account.`); }
      else { await P.setSms(id, { key: typeof opts.key === "string" ? opts.key : "", sender: typeof opts.sender === "string" ? opts.sender : "" }); console.log(`${id} now sends SMS through its own account, as ${opts.sender}.`); }
      break;
    }
    case "admin-code": {
      const r = await P.newAdminCode(id);
      console.log(`New code for ${id}'s admin. Their old password no longer works.\n${codeText(r)}`);
      break;
    }
    case "suspend":
    case "activate": {
      await P.setStatus(id, cmd === "suspend" ? "suspended" : "active");
      console.log(cmd === "suspend" ? `${id} is suspended: its website and app don't open, and everyone is signed out. Nothing was deleted.` : `${id} is active again.`);
      break;
    }
    case "delete": {
      if (!id || opts.confirm !== id) throw new P.PlatformError(`This deletes the school and all its data for good. To go ahead: npm run school -- delete ${id ?? "<id>"} --confirm ${id ?? "<id>"}`);
      const s = await P.deleteSchool(id);
      console.log(`Deleted ${s.id} (${s.name}) and all its data.`);
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  if (!(e instanceof P.PlatformError)) throw e;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
