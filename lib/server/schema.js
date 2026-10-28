// Scholar — database tables. Safe to run on every start: everything is
// CREATE … IF NOT EXISTS. Dates are ISO strings ("2026-10-25", months
// "2026-10") to match what the app works with.
//
// Many schools share one database. Every table except `schools` has a
// school_id, and every key includes it, so each school has its own "admin",
// its own student s001 and its own receipt no. 1. A row's school_id defaults
// to the school of the transaction (app.school_id, set by forSchool() in
// db.js), so inserts don't name it. Row-level security (SECURITY below) lets
// a transaction see and change only its own school's rows.

const SCHOOL = `school_id text NOT NULL DEFAULT current_setting('app.school_id') REFERENCES schools (id) ON DELETE CASCADE`;

export const SCHEMA = `
-- status: active, or suspended (e.g. unpaid): a suspended school's website
-- and app don't open. hosts: the web addresses it answers on, e.g.
-- {adarsha.scholar.com.bd, www.adarshahigh.edu.bd}. demo: sample data that
-- its admin may reset.
CREATE TABLE IF NOT EXISTS schools (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name       text NOT NULL,
  hosts      text[] NOT NULL DEFAULT '{}',
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  demo       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  ${SCHOOL} PRIMARY KEY,
  school      text NOT NULL,
  year        text NOT NULL,
  threshold   int  NOT NULL,
  admin_name  text NOT NULL,
  admin_email text NOT NULL DEFAULT '',
  grading     jsonb NOT NULL,
  published   jsonb NOT NULL DEFAULT '{}',
  reminders   jsonb NOT NULL DEFAULT '{}',
  demo        jsonb NOT NULL DEFAULT '{}',
  -- Optional features (lib/school/features.js); missing keys mean off.
  features    jsonb NOT NULL DEFAULT '{}',
  -- School days and shifts (lib/school/rules.js).
  schedule    jsonb NOT NULL DEFAULT '{}',
  -- Which automatic SMS are on, and their language: {"absent": true, "results": true, "lang": "bn"}.
  sms         jsonb NOT NULL DEFAULT '{}',
  -- The public website's own content (lib/school/website.js).
  website     jsonb NOT NULL DEFAULT '{}',
  -- Where families send fees from their phones: {"bkash": "01…", "nagad": "",
  -- "rocket": "", "note": "Use Payment and write the student ID as reference"}.
  pay_numbers jsonb NOT NULL DEFAULT '{}',
  seeded_on   text NOT NULL
);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pay_numbers jsonb NOT NULL DEFAULT '{}';

-- password_hash is null until the person activates the account with the
-- one-time code the school gave them (invite_hash is that code's SHA-256).
CREATE TABLE IF NOT EXISTS users (
  ${SCHOOL},
  id             text NOT NULL,
  username       text NOT NULL,
  password_hash  text,
  role           text NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  person_id      text,
  prefs          jsonb NOT NULL DEFAULT '{}',
  invite_hash    text,
  invite_expires timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, id),
  UNIQUE (school_id, username)
);
CREATE INDEX IF NOT EXISTS users_by_person ON users (school_id, person_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  ${SCHOOL},
  user_id    text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teachers (
  ${SCHOOL},
  id       text NOT NULL,
  name     text NOT NULL,
  subject  text NOT NULL,
  initials text NOT NULL,
  email    text NOT NULL DEFAULT '',
  phone    text NOT NULL DEFAULT '',
  joined   text NOT NULL,
  PRIMARY KEY (school_id, id),
  UNIQUE (school_id, initials)
);

-- section_meta: each section's shift and group, as {"A": {"shift": "day",
-- "group": "science"}}. subject_rules: who takes a subject (groups,
-- religion, 4th subject) and its exam parts.
CREATE TABLE IF NOT EXISTS classes (
  ${SCHOOL},
  id            text NOT NULL,
  level         int  NOT NULL,
  name          text NOT NULL,
  short         text NOT NULL,
  year          text NOT NULL,
  sections      jsonb NOT NULL,
  subjects      jsonb NOT NULL,
  fee           int  NOT NULL,
  section_meta  jsonb NOT NULL DEFAULT '{}',
  subject_rules jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (school_id, id)
);

-- discount: standing tuition discount in percent (100 = free studentship).
-- left_on: the date they passed out (null while they're at the school).
CREATE TABLE IF NOT EXISTS students (
  ${SCHOOL},
  id               text NOT NULL,
  name             text NOT NULL,
  roll             int  NOT NULL,
  class_id         text NOT NULL,
  section          text NOT NULL,
  gender           text NOT NULL,
  guardian         text NOT NULL,
  phone            text NOT NULL DEFAULT '',
  dob              text NOT NULL,
  admitted         text NOT NULL,
  religion         text NOT NULL DEFAULT 'islam',
  optional_subject text,
  discount         int  NOT NULL DEFAULT 0,
  left_on          text,
  PRIMARY KEY (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES classes (school_id, id)
);
CREATE INDEX IF NOT EXISTS students_by_section ON students (school_id, class_id, section);

-- Religion classes and 4th subjects run side by side, so a section can have
-- several subjects in one period (a row each).
CREATE TABLE IF NOT EXISTS timetable (
  ${SCHOOL},
  id         text NOT NULL,
  day        int  NOT NULL,
  period     int  NOT NULL,
  class_id   text NOT NULL,
  section    text NOT NULL,
  subject    text NOT NULL,
  teacher_id text NOT NULL,
  room       text NOT NULL DEFAULT '',
  PRIMARY KEY (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES classes (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, teacher_id) REFERENCES teachers (school_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_by_slot ON timetable (school_id, class_id, section, day, period, subject);

-- The class teacher of each section takes its attendance. One teacher may
-- look after several sections (e.g. every section of a class).
CREATE TABLE IF NOT EXISTS class_teachers (
  ${SCHOOL},
  class_id   text NOT NULL,
  section    text NOT NULL,
  teacher_id text NOT NULL,
  PRIMARY KEY (school_id, class_id, section),
  FOREIGN KEY (school_id, class_id) REFERENCES classes (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, teacher_id) REFERENCES teachers (school_id, id) ON DELETE CASCADE
);

-- taken_by: who saved the roll call ("admin" or a teacher id).
CREATE TABLE IF NOT EXISTS attendance (
  ${SCHOOL},
  date       text NOT NULL,
  class_id   text NOT NULL,
  section    text NOT NULL,
  student_id text NOT NULL,
  mark       text NOT NULL CHECK (mark IN ('P', 'A', 'L')),
  taken_by   text,
  PRIMARY KEY (school_id, date, class_id, section, student_id),
  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS attendance_by_student ON attendance (school_id, student_id);

-- Exams belong to an academic year; after year-end promotion only the new
-- year's exams are shown (earlier ones stay in the database). parts: how the
-- exam is split, [{"key": "cq", "full": 70}, …].
CREATE TABLE IF NOT EXISTS exams (
  ${SCHOOL},
  id         text NOT NULL,
  term       text NOT NULL,
  subject    text NOT NULL,
  class_id   text NOT NULL,
  date       text NOT NULL,
  start      text NOT NULL,
  full_marks int  NOT NULL,
  parts      jsonb NOT NULL DEFAULT '[]',
  year       text,
  PRIMARY KEY (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES classes (school_id, id) ON DELETE CASCADE
);

-- value is the total; parts the part marks, {"cq": 52, "mcq": 21}.
CREATE TABLE IF NOT EXISTS marks (
  ${SCHOOL},
  exam_id    text NOT NULL,
  student_id text NOT NULL,
  value      double precision NOT NULL,
  parts      jsonb,
  PRIMARY KEY (school_id, exam_id, student_id),
  FOREIGN KEY (school_id, exam_id) REFERENCES exams (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS homework (
  ${SCHOOL},
  id         text NOT NULL,
  class_id   text NOT NULL,
  section    text NOT NULL,
  subject    text NOT NULL,
  teacher_id text,
  topic      text NOT NULL,
  details    text NOT NULL,
  assigned   text NOT NULL,
  due        text NOT NULL,
  PRIMARY KEY (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES classes (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, teacher_id) REFERENCES teachers (school_id, id) ON DELETE SET NULL (teacher_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  ${SCHOOL},
  homework_id  text NOT NULL,
  student_id   text NOT NULL,
  submitted_on text NOT NULL,
  reviewed     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (school_id, homework_id, student_id),
  FOREIGN KEY (school_id, homework_id) REFERENCES homework (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notices (
  ${SCHOOL},
  id       text NOT NULL,
  number   text NOT NULL,
  date     text NOT NULL,
  topic    text NOT NULL,
  body     text NOT NULL,
  audience text NOT NULL DEFAULT 'Everyone',
  PRIMARY KEY (school_id, id)
);

-- Fees: charges are what a student owes (monthly tuition, admission, session,
-- exam fees…), less any discount; payments are money received, each with a
-- receipt number, split over one or more charges (payment_items), so a
-- charge can be paid in parts.
CREATE TABLE IF NOT EXISTS charges (
  ${SCHOOL},
  id         text NOT NULL,
  student_id text NOT NULL,
  kind       text NOT NULL,
  label      text NOT NULL,
  period     text NOT NULL DEFAULT '',
  amount     int  NOT NULL,
  discount   int  NOT NULL DEFAULT 0,
  due_on     text NOT NULL,
  created_on text NOT NULL,
  PRIMARY KEY (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS charges_by_student ON charges (school_id, student_id);
CREATE TABLE IF NOT EXISTS payments (
  ${SCHOOL},
  id          text NOT NULL,
  receipt_no  int  NOT NULL,
  student_id  text NOT NULL,
  paid_on     text NOT NULL,
  amount      int  NOT NULL,
  method      text NOT NULL,
  note        text NOT NULL DEFAULT '',
  received_by text NOT NULL DEFAULT 'admin',
  PRIMARY KEY (school_id, id),
  UNIQUE (school_id, receipt_no),
  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id) ON DELETE CASCADE
);
-- A family says it paid by bKash, Nagad or Rocket, with the transaction ID
-- the wallet gave them. Nothing counts until the office checks it against the
-- school's statement and approves it, which makes a payment (payment_id) with
-- a receipt. status: pending, approved, rejected (reason says why), or
-- cancelled by the family. A transaction ID can be pending or approved only once.
CREATE TABLE IF NOT EXISTS payment_claims (
  ${SCHOOL},
  id         text NOT NULL,
  student_id text NOT NULL,
  amount     int  NOT NULL CHECK (amount > 0),
  method     text NOT NULL,
  trx_id     text NOT NULL,
  sender     text NOT NULL DEFAULT '',
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason     text NOT NULL DEFAULT '',
  payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  PRIMARY KEY (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, payment_id) REFERENCES payments (school_id, id) ON DELETE SET NULL (payment_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_claims_by_trx ON payment_claims (school_id, method, trx_id) WHERE status IN ('pending', 'approved');
CREATE TABLE IF NOT EXISTS payment_items (
  ${SCHOOL},
  payment_id text NOT NULL,
  charge_id  text NOT NULL,
  amount     int  NOT NULL,
  PRIMARY KEY (school_id, payment_id, charge_id),
  FOREIGN KEY (school_id, payment_id) REFERENCES payments (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, charge_id) REFERENCES charges (school_id, id) ON DELETE CASCADE
);

-- SMS to guardians. Every message is kept here (the outbox); it's sent
-- through BulkSMSBD only when the server has its API key. status: pending,
-- sent, failed, not_sent (no gateway set up), invalid (no usable number).
-- ref stops repeats, e.g. one absence SMS per student per day.
CREATE TABLE IF NOT EXISTS sms (
  ${SCHOOL},
  id         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  student_id text,
  phone      text NOT NULL DEFAULT '',
  kind       text NOT NULL,
  ref        text NOT NULL DEFAULT '',
  body       text NOT NULL,
  status     text NOT NULL,
  error      text NOT NULL DEFAULT '',
  sent_at    timestamptz,
  PRIMARY KEY (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id) ON DELETE SET NULL (student_id)
);
CREATE INDEX IF NOT EXISTS sms_by_ref ON sms (school_id, kind, student_id, ref);
CREATE INDEX IF NOT EXISTS sms_pending ON sms (created_at) WHERE status = 'pending';

-- A school's own BulkSMSBD account, so its messages go out under its own
-- sender name and on its own bill. Set with "npm run school -- sms". The app
-- can see that an account exists (sender_id) but never the API key: only the
-- background sender reads that.
CREATE TABLE IF NOT EXISTS school_sms (
  ${SCHOOL} PRIMARY KEY,
  api_key    text NOT NULL,
  sender_id  text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Admission and contact enquiries people send from the public website.
CREATE TABLE IF NOT EXISTS enquiries (
  ${SCHOOL},
  id         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind       text NOT NULL,
  name       text NOT NULL,
  phone      text NOT NULL,
  class_name text NOT NULL DEFAULT '',
  message    text NOT NULL DEFAULT '',
  handled    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (school_id, id)
);
`;

// Every table that holds a school's data, parents first (the order data is
// copied in when an old database is upgraded; reversed, the order a school's
// data is wiped before a reseed).
export const SCHOOL_TABLES = ["settings", "users", "sessions", "teachers", "classes", "students", "timetable", "class_teachers", "attendance", "exams", "marks", "homework", "submissions", "notices", "charges", "payments", "payment_claims", "payment_items", "sms", "enquiries"];

// The role school data is read and written as. It doesn't own the tables and
// can't bypass row-level security, so each table's policy applies: only rows
// of the transaction's school (app.school_id) are visible, and only those can
// be written. With no school set, current_setting(…, true) is null and
// nothing matches. The connecting user keeps full access for sign-in lookups,
// upgrades and sending SMS (see db.js).
export const APP_ROLE = "scholar_app";
const SAME_SCHOOL = `school_id = current_setting('app.school_id', true)`;
export const SECURITY = `
DO $$ BEGIN CREATE ROLE ${APP_ROLE} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- The connecting user must be able to SET ROLE to it (Postgres 16+ doesn't
-- grant that to a role's creator by itself).
DO $$ BEGIN
  IF NOT pg_has_role(current_user, '${APP_ROLE}', 'MEMBER') THEN EXECUTE format('GRANT ${APP_ROLE} TO %I', current_user); END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
GRANT SELECT ON schools TO ${APP_ROLE};
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS same_school ON schools;
CREATE POLICY same_school ON schools USING (id = current_setting('app.school_id', true));
REVOKE ALL ON school_sms FROM ${APP_ROLE};
GRANT SELECT (school_id, sender_id) ON school_sms TO ${APP_ROLE};
ALTER TABLE school_sms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS same_school ON school_sms;
CREATE POLICY same_school ON school_sms USING (${SAME_SCHOOL});
${SCHOOL_TABLES.map((t) => `GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO ${APP_ROLE};
ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS same_school ON ${t};
CREATE POLICY same_school ON ${t} USING (${SAME_SCHOOL}) WITH CHECK (${SAME_SCHOOL});`).join("\n")}
`;
