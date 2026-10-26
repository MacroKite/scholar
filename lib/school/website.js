// Scholar — the public school website's own content, which the admin edits
// under Website (admin). Everything else on the site (notices, teachers,
// classes, fees, school hours, the exam routine) comes from the school's data.
// Lists are typed one item per line, so they're easy to edit in a text box.

export const WEBSITE_FIELDS = {
  // School details shown in the header, footer and contact page.
  tagline: "", eiin: "", schoolCode: "", established: "", board: "",
  address: "", phone: "", email: "", officeHours: "", mapUrl: "", facebook: "", heroImage: "",
  // About
  principalMessage: "", history: "", mission: "", vision: "",
  facilities: "",   // one per line
  committee: "",    // "Name | Position" per line
  achievements: "", // one per line
  // Admission
  admissionOpen: false, admissionSession: "", admissionDeadline: "",
  admissionEligibility: "", admissionDocuments: "", admissionSteps: "",
  // Public results: "Year | Examinees | Passed | GPA 5" per line
  results: "",
  // Photos: "Image address | Caption" per line
  gallery: "",
  showTeachers: true,
};
const TEXT_MAX = { principalMessage: 4000, history: 4000, mission: 1500, vision: 1500 };

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
