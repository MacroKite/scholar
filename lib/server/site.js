// Scholar — what the public website may show. Only school-level facts:
// notices for everyone, teachers' names and subjects (no phone numbers),
// classes, fees, school hours, the exam routine and totals. Nothing about
// any one student.

import { query, one } from "./db.js";
import { schoolToday } from "./clock.js";
import { websiteOf } from "../school/website.js";
import { scheduleOf } from "../school/rules.js";

export async function siteData() {
  const st = await one(`SELECT school, year, admin_name, website, schedule FROM settings WHERE id = 1`);
  if (!st) return null;
  const today = schoolToday();
  const [notices, teachers, classes, counts, exams, enrolment] = await Promise.all([
    query(`SELECT id, number, date, topic, body FROM notices WHERE audience = 'Everyone' ORDER BY date DESC, number DESC LIMIT 60`),
    query(`SELECT id, name, subject, initials FROM teachers ORDER BY name`),
    query(`SELECT id, level, name, short, sections, subjects, section_meta AS "sectionMeta", subject_rules AS "subjectRules", fee FROM classes ORDER BY level, name`),
    one(`SELECT (SELECT count(*)::int FROM students WHERE left_on IS NULL) AS students, (SELECT count(*)::int FROM teachers) AS teachers, (SELECT count(*)::int FROM classes) AS classes`),
    query(`SELECT term, subject, class_id AS "classId", date, start FROM exams WHERE year = $1 AND date >= $2 ORDER BY date, start LIMIT 200`, [st.year, today]),
    // Totals only: boys and girls in each class.
    query(`SELECT class_id AS "classId", gender, count(*)::int AS n FROM students WHERE left_on IS NULL GROUP BY class_id, gender`),
  ]);
  return {
    school: st.school, year: st.year, principal: st.admin_name, today,
    website: websiteOf(st.website), schedule: scheduleOf(st.schedule),
    notices, teachers, classes, counts, exams, enrolment,
  };
}
