// Scholar — the public school website's own content, which the admin edits
// under Website (admin). Everything else on the site (notices, teachers,
// classes, fees, school hours, the exam routine) comes from the school's data.
// Lists are typed one item per line, so they're easy to edit in a text box.

export const WEBSITE_FIELDS = {
  // Government, MPO (non-government, on the government payroll) or private:
  // decides what the site must publish (see websiteChecklist).
  schoolType: "",
  // School details shown in the header, footer and contact page.
  tagline: "", eiin: "", schoolCode: "", established: "", board: "", recognition: "", headPhone: "", headEmail: "",
  address: "", phone: "", email: "", officeHours: "", mapUrl: "", facebook: "", heroImage: "",
  // About
  principalMessage: "", history: "", mission: "", vision: "",
  facilities: "",   // one per line
  committee: "",    // "Name | Position" per line
  achievements: "", // one per line
  // Admission
  admissionOpen: false, admissionSession: "", admissionDeadline: "",
  admissionEligibility: "", admissionDocuments: "", admissionSteps: "",
  admissionSeats: "",    // "Class | Seats" per line
  admissionFees: "",     // "Fee | Amount" per line (admission, session, form…)
  admissionNotice: "", admissionApplyUrl: "", // links: the notice (PDF), and where to apply online
  // Right to Information Act 2009, and for government schools the citizen's
  // charter and the grievance (GRS) and integrity (NIS) focal points.
  // Officers are "Name | Post | Phone | Email".
  rtiOfficer: "", rtiAppeal: "",
  citizenCharter: "",    // "Service | How to get it | Time | Cost" per line
  grsOfficer: "", nisOfficer: "",
  // "Date | Event" per line; a date may be "2026-12-20 to 2026-12-31".
  calendar: "",
  // "Title | Link" per line: forms, circulars, the prospectus.
  downloads: "",
  // Public results: "Year | Examinees | Passed | GPA 5" per line
  results: "",
  // Photos: "Image address | Caption" per line
  gallery: "",
  showTeachers: true,
  showStudentCounts: true, // students per class, boys and girls (numbers only)
};
export const SCHOOL_TYPES = ["government", "mpo", "private"];
export const SCHOOL_TYPE_LABELS = { government: "Government school", mpo: "Non-government (MPO) school", private: "Private school" };
const TEXT_MAX = { principalMessage: 4000, history: 4000, mission: 1500, vision: 1500, citizenCharter: 6000, calendar: 6000 };

// The saved content with every field present.
export function websiteOf(stored) {
  const w = { ...WEBSITE_FIELDS };
  for (const k of Object.keys(WEBSITE_FIELDS)) if (stored && k in stored) w[k] = stored[k];
  return w;
}
// Clean what the admin typed: strings trimmed and capped, booleans as booleans.
export function cleanWebsite(input) {
  const w = {};
  for (const [k, def] of Object.entries(WEBSITE_FIELDS)) {
    const v = input?.[k];
    w[k] = typeof def === "boolean" ? !!v : String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, TEXT_MAX[k] ?? 3000);
  }
  if (!SCHOOL_TYPES.includes(w.schoolType)) w.schoolType = "";
  return w;
}

export const lines = (text) => String(text || "").split("\n").map((x) => x.trim()).filter(Boolean);
// "a | b | c" lines as arrays.
export const rows = (text) => lines(text).map((l) => l.split("|").map((x) => x.trim()));
export const committeeOf = (w) => rows(w.committee).map(([name, role = ""]) => ({ name, role }));
export const galleryOf = (w) => rows(w.gallery).filter(([url]) => /^https?:\/\//i.test(url)).map(([url, caption = ""]) => ({ url, caption }));
export const resultsOf = (w) => rows(w.results).map(([year, examinees, passed, gpa5]) => ({ year, examinees: Number(examinees) || 0, passed: Number(passed) || 0, gpa5: Number(gpa5) || 0 }))
  .filter((r) => r.year && r.examinees).sort((a, b) => b.year.localeCompare(a.year));
// A Google Maps "embed" address can be shown in a frame; any other link is just a link.
export const mapEmbed = (url) => (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(url || "") ? url : null);

export const isLink = (url) => /^https:\/\//i.test(url || "");
export const officerOf = (line) => {
  const [name = "", post = "", phone = "", email = ""] = String(line || "").split("|").map((x) => x.trim());
  return name ? { name, post, phone, email } : null;
};
export const seatsOf = (w) => rows(w.admissionSeats).map(([cls, seats]) => ({ cls, seats: Number(seats) || 0 })).filter((r) => r.cls && r.seats);
export const feesOf = (w) => rows(w.admissionFees).map(([name, amount = ""]) => ({ name, amount })).filter((r) => r.name);
export const downloadsOf = (w) => rows(w.downloads).filter(([, url]) => isLink(url)).map(([title, url]) => ({ title, url }));
export const charterOf = (w) => rows(w.citizenCharter).map(([service, how = "", time = "", cost = ""]) => ({ service, how, time, cost })).filter((r) => r.service);
// Calendar lines with a real date, in date order.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const calendarOf = (w) => rows(w.calendar).map(([when, event = ""]) => {
  const [from, to = ""] = when.split(/\s+to\s+/i).map((x) => x.trim());
  return { from, to: ISO.test(to) && to > from ? to : "", event };
}).filter((r) => ISO.test(r.from) && r.event).sort((a, b) => a.from.localeCompare(b.from));

// What a school of this type is expected to publish. Government and MPO
// schools are public authorities under the Right to Information Act 2009, so
// they name an information officer and an appeal authority; government
// schools also publish a citizen's charter and their GRS and NIS focal
// points. The rest is what DSHE, the boards and the admission policy expect.
export const needsRti = (w) => w.schoolType === "government" || w.schoolType === "mpo";
export const needsCharter = (w) => w.schoolType === "government";
export function websiteChecklist(w) {
  const rti = needsRti(w), gov = needsCharter(w);
  return [
    { label: "School type", done: !!w.schoolType, required: true },
    { label: "EIIN", done: !!w.eiin, required: true },
    { label: "Education board", done: !!w.board, required: true },
    { label: "Address and phone", done: !!(w.address && w.phone), required: true },
    { label: "Recognition and MPO status", done: !!w.recognition, required: w.schoolType !== "private" },
    { label: "Head of school's phone or email", done: !!(w.headPhone || w.headEmail), required: true },
    { label: "Information officer (RTI)", done: !!officerOf(w.rtiOfficer), required: rti },
    { label: "Appeal authority (RTI)", done: !!officerOf(w.rtiAppeal), required: rti },
    { label: "Seats per class", done: seatsOf(w).length > 0, required: w.admissionOpen },
    { label: "Admission and session fees", done: feesOf(w).length > 0, required: w.admissionOpen },
    { label: "Citizen's charter", done: charterOf(w).length > 0, required: gov },
    { label: "Grievance (GRS) focal point", done: !!officerOf(w.grsOfficer), required: gov },
    { label: "Integrity (NIS) focal point", done: !!officerOf(w.nisOfficer), required: gov },
    { label: "Managing committee", done: !!w.committee, required: w.schoolType === "mpo" },
    { label: "Academic calendar", done: calendarOf(w).length > 0, required: false },
    { label: "SSC results", done: !!w.results, required: false },
  ];
}
