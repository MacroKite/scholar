// Scholar — the school's local date. Servers often run in UTC, but "today"
// should follow the school's clock (Dhaka by default).

export const SCHOOL_TZ = process.env.SCHOOL_TIMEZONE || "Asia/Dhaka";

export function schoolToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const schoolMonth = () => schoolToday().slice(0, 7);

