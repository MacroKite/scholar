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
`;

// Every table that holds school data, children first, for wiping before a reseed.
export const DATA_TABLES = ["notices", "submissions", "homework", "fees", "marks", "exams", "attendance", "class_teachers", "timetable", "students", "classes", "teachers", "sessions", "users", "settings"];
