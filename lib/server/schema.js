// Scholar — database tables. Safe to run on every start: everything is
// CREATE … IF NOT EXISTS. Dates are ISO strings ("2026-10-25", months
// "2026-10") to match what the app works with.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  school      text NOT NULL,
  year        text NOT NULL,
  threshold   int  NOT NULL,
  admin_name  text NOT NULL,
  admin_email text NOT NULL DEFAULT '',
  grading     jsonb NOT NULL,
  published   jsonb NOT NULL DEFAULT '{}',
  reminders   jsonb NOT NULL DEFAULT '{}',
  demo        jsonb NOT NULL DEFAULT '{}',
  features    jsonb NOT NULL DEFAULT '{}',
  seeded_on   text NOT NULL
);

-- password_hash is null until the person activates the account with the
-- one-time code the school gave them (invite_hash is that code's SHA-256).
CREATE TABLE IF NOT EXISTS users (
  id             text PRIMARY KEY,
  username       text NOT NULL UNIQUE,
  password_hash  text,
  role           text NOT NULL,
  person_id      text,
  prefs          jsonb NOT NULL DEFAULT '{}',
  invite_hash    text,
  invite_expires timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_person ON users (person_id);
-- Optional features (lib/school/features.js); missing keys mean off.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}';
-- Databases created before activation codes existed.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires timestamptz;
-- Student and guardian now share one family account (the student's), so
-- separate guardian logins from older databases are removed.
DELETE FROM users WHERE role = 'parent';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'student'));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  subject  text NOT NULL,
  initials text NOT NULL UNIQUE,
  email    text NOT NULL DEFAULT '',
  phone    text NOT NULL DEFAULT '',
  joined   text NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id       text PRIMARY KEY,
  level    int  NOT NULL,
  name     text NOT NULL,
  short    text NOT NULL,
  year     text NOT NULL,
  sections jsonb NOT NULL,
  subjects jsonb NOT NULL,
  fee      int  NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  roll     int  NOT NULL,
  class_id text NOT NULL REFERENCES classes (id),
  section  text NOT NULL,
  gender   text NOT NULL,
  guardian text NOT NULL,
  phone    text NOT NULL DEFAULT '',
  dob      text NOT NULL,
  admitted text NOT NULL
);
CREATE INDEX IF NOT EXISTS students_section ON students (class_id, section);

CREATE TABLE IF NOT EXISTS timetable (
  id         text PRIMARY KEY,
  day        int  NOT NULL,
  period     int  NOT NULL,
  class_id   text NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  section    text NOT NULL,
  subject    text NOT NULL,
  teacher_id text NOT NULL REFERENCES teachers (id),
  room       text NOT NULL DEFAULT ''
);

-- The class teacher of each section takes its attendance. One teacher may
-- look after several sections (e.g. every section of a class).
CREATE TABLE IF NOT EXISTS class_teachers (
  class_id   text NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  section    text NOT NULL,
  teacher_id text NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, section)
);

-- taken_by: who saved the roll call ("admin" or a teacher id).
CREATE TABLE IF NOT EXISTS attendance (
  date       text NOT NULL,
  class_id   text NOT NULL,
  section    text NOT NULL,
  student_id text NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  mark       text NOT NULL CHECK (mark IN ('P', 'A', 'L')),
  taken_by   text,
  PRIMARY KEY (date, class_id, section, student_id)
);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS taken_by text;
CREATE INDEX IF NOT EXISTS attendance_student ON attendance (student_id);

CREATE TABLE IF NOT EXISTS exams (
  id         text PRIMARY KEY,
  term       text NOT NULL,
  subject    text NOT NULL,
  class_id   text NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  date       text NOT NULL,
  start      text NOT NULL,
  full_marks int  NOT NULL
);

CREATE TABLE IF NOT EXISTS marks (
  exam_id    text NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  value      double precision NOT NULL,
  PRIMARY KEY (exam_id, student_id)
);

-- One row per student per billed month; paid_on is null until it's paid.
CREATE TABLE IF NOT EXISTS fees (
  student_id text NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  month      text NOT NULL,
  paid_on    text,
  method     text,
  PRIMARY KEY (student_id, month)
);

CREATE TABLE IF NOT EXISTS homework (
  id         text PRIMARY KEY,
  class_id   text NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  section    text NOT NULL,
  subject    text NOT NULL,
  teacher_id text REFERENCES teachers (id) ON DELETE SET NULL,
  topic      text NOT NULL,
  details    text NOT NULL,
  assigned   text NOT NULL,
  due        text NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  homework_id  text NOT NULL REFERENCES homework (id) ON DELETE CASCADE,
  student_id   text NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  submitted_on text NOT NULL,
  reviewed     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (homework_id, student_id)
);

CREATE TABLE IF NOT EXISTS notices (
  id       text PRIMARY KEY,
  number   text NOT NULL,
  date     text NOT NULL,
  topic    text NOT NULL,
  body     text NOT NULL,
  audience text NOT NULL DEFAULT 'Everyone'
);

-- Classes 9–10 and shifts (lib/school/rules.js). settings.schedule: school
-- days and shifts. classes.section_meta: each section's shift and group, as
-- {"A": {"shift": "day", "group": "science"}}. classes.subject_rules: who
-- takes a subject (groups, religion, 4th subject) and its exam parts.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '{}';
ALTER TABLE classes ADD COLUMN IF NOT EXISTS section_meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE classes ADD COLUMN IF NOT EXISTS subject_rules jsonb NOT NULL DEFAULT '{}';
ALTER TABLE students ADD COLUMN IF NOT EXISTS religion text NOT NULL DEFAULT 'islam';
ALTER TABLE students ADD COLUMN IF NOT EXISTS optional_subject text;
-- An exam's parts, [{"key": "cq", "full": 70}, …], and a mark's part marks,
-- {"cq": 52, "mcq": 21}; marks.value stays the total.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS parts jsonb NOT NULL DEFAULT '[]';
ALTER TABLE marks ADD COLUMN IF NOT EXISTS parts jsonb;
-- Religion classes and 4th subjects run side by side, so a section can have
-- several subjects in one period (a row each).
ALTER TABLE timetable DROP CONSTRAINT IF EXISTS timetable_class_id_section_day_period_key;
CREATE UNIQUE INDEX IF NOT EXISTS timetable_slot ON timetable (class_id, section, day, period, subject);

-- Fees: charges are what a student owes (monthly tuition, admission, session,
-- exam fees…), less any discount; payments are money received, each with a
-- receipt number, split over one or more charges (payment_items), so a
-- charge can be paid in parts. The old one-row-per-month fees table is kept
-- only to move its data across once.
CREATE TABLE IF NOT EXISTS charges (
  id         text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  kind       text NOT NULL,
  label      text NOT NULL,
  period     text NOT NULL DEFAULT '',
  amount     int  NOT NULL,
  discount   int  NOT NULL DEFAULT 0,
  due_on     text NOT NULL,
  created_on text NOT NULL
);
CREATE INDEX IF NOT EXISTS charges_student ON charges (student_id);
CREATE TABLE IF NOT EXISTS payments (
  id          text PRIMARY KEY,
  receipt_no  int  NOT NULL UNIQUE,
  student_id  text NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  paid_on     text NOT NULL,
  amount      int  NOT NULL,
  method      text NOT NULL,
  note        text NOT NULL DEFAULT '',
  received_by text NOT NULL DEFAULT 'admin'
);
CREATE TABLE IF NOT EXISTS payment_items (
  payment_id text NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  charge_id  text NOT NULL REFERENCES charges (id) ON DELETE CASCADE,
  amount     int  NOT NULL,
  PRIMARY KEY (payment_id, charge_id)
);
-- A student's standing tuition discount in percent (100 = free studentship),
-- and the date they passed out (null while they're at the school).
ALTER TABLE students ADD COLUMN IF NOT EXISTS discount int NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS left_on text;
-- Move the old monthly fee rows across (only into an empty charges table).
INSERT INTO charges (id, student_id, kind, label, period, amount, discount, due_on, created_on)
  SELECT 'tu-' || f.student_id || '-' || f.month, f.student_id, 'tuition', 'Tuition', f.month, c.fee, 0, f.month || '-10', f.month || '-01'
  FROM fees f JOIN students s ON s.id = f.student_id JOIN classes c ON c.id = s.class_id
  WHERE NOT EXISTS (SELECT 1 FROM charges);
INSERT INTO payments (id, receipt_no, student_id, paid_on, amount, method)
  SELECT 'pm-' || f.student_id || '-' || f.month, row_number() OVER (ORDER BY f.paid_on, f.student_id, f.month), f.student_id, f.paid_on, c.fee, f.method
  FROM fees f JOIN students s ON s.id = f.student_id JOIN classes c ON c.id = s.class_id
  WHERE f.paid_on IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payments);
INSERT INTO payment_items (payment_id, charge_id, amount)
  SELECT p.id, 'tu-' || f.student_id || '-' || f.month, p.amount
  FROM fees f JOIN payments p ON p.id = 'pm-' || f.student_id || '-' || f.month
  WHERE NOT EXISTS (SELECT 1 FROM payment_items);
DELETE FROM fees;

-- SMS to guardians. Every message is kept here (the outbox); it's sent
-- through BulkSMSBD only when the server has its API key. status: pending,
-- sent, failed, not_sent (no gateway set up), invalid (no usable number).
-- ref stops repeats, e.g. one absence SMS per student per day.
CREATE TABLE IF NOT EXISTS sms (
  id         text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  student_id text REFERENCES students (id) ON DELETE SET NULL,
  phone      text NOT NULL DEFAULT '',
  kind       text NOT NULL,
  ref        text NOT NULL DEFAULT '',
  body       text NOT NULL,
  status     text NOT NULL,
  error      text NOT NULL DEFAULT '',
  sent_at    timestamptz
);
CREATE INDEX IF NOT EXISTS sms_ref ON sms (kind, student_id, ref);
-- Which automatic SMS are on, and their language: {"absent": true, "results": true, "lang": "bn"}.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms jsonb NOT NULL DEFAULT '{}';

-- Exams belong to an academic year; after year-end promotion only the new
-- year's exams are shown (earlier ones stay in the database).
ALTER TABLE exams ADD COLUMN IF NOT EXISTS year text;
UPDATE exams SET year = (SELECT year FROM settings WHERE id = 1) WHERE year IS NULL;
`;

// Every table that holds school data, children first, for wiping before a reseed.
export const DATA_TABLES = ["sms", "payment_items", "payments", "charges", "notices", "submissions", "homework", "fees", "marks", "exams", "attendance", "class_teachers", "timetable", "students", "classes", "teachers", "sessions", "users", "settings"];
