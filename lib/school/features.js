// Scholar — optional features. Each school turns these on in Settings; all
// are off by default, because they only help if teachers keep them up to
// date every day. Shared by the server (which refuses and leaves out the
// data of features that are off) and the browser (which hides them).

export const FEATURES = {
  homework: { label: "Homework", desc: "Teachers post homework online; students mark it submitted and see what's due. Also adds homework to dashboards, reminders, teacher tasks and the report card." },
};

// Missing keys count as off.
export const withDefaults = (stored) => Object.fromEntries(Object.keys(FEATURES).map((k) => [k, stored?.[k] === true]));
