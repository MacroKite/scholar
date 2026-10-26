# Scholar — academic management

A school management system for Bangladeshi schools. Feature ideas come from
the sketches in `Photos/`.

It has two looks, each with a light and dark mode:

- **Classic** for the admin, teachers and the sign-in pages: warm stone and
  ivory, a charcoal sidebar, muted gold highlights and serif headings.
- **Friendly** for students and families: white cards on soft blue-grey, a
  navy sidebar with icons over labels, violet and pink accents, rounded type,
  and a dashboard with a welcome banner, subject progress and a "Coming up"
  column of exams, fees and homework.

It's a Next.js app (JavaScript) backed by Postgres. Everyone signs in with
their own account. The admin, teachers, and families (a student together
with their guardian) each see their own pages, and they all share the same
school data.

Live: https://scholar-six-pied.vercel.app

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5180 and sign in.

There's nothing to set up for local use. Without `DATABASE_URL`, the app uses
PGlite, a full Postgres that runs inside Node and keeps its files in
`.data/pglite`. The first start creates the tables and fills them with the
demo school.

To use your own Postgres instead, copy `.env.example` to `.env.local` and set
`DATABASE_URL`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 5180 |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:setup` | Create the tables; seed the demo school if the database is empty |
| `npm run db:reset` | Wipe everything and seed the demo school again |

With PGlite, stop `npm run dev` before running the `db:` commands, because
only one process can open the database at a time. Admins can also reset the
data from **Settings → Reset demo data** while the app is running.

## Accounts

The admin and every teacher have their own account. Each student and their
guardian share one **family account**.

| Who | Username | Demo account |
| --- | --- | --- |
| Admin (principal) | `admin` | Abdullah Al Maruf |
| Teacher | their initials, lowercase | `tnr`: Tania Rahman |
| Student & guardian (family) | the student ID | `s113`: Ayaan Karim and guardian Nadia Karim, Class Nine A |

The seeded demo accounts start with the password **`scholar123`** (or
`DEMO_PASSWORD`). Anyone can change their own password under **Settings**.

### Creating an account (activation codes)

There's no open sign-up. Every account belongs to a real student's family or
a teacher, so the school creates it and the family or teacher activates it:

1. The admin adds a student (which creates the family account) or a teacher.
   Scholar shows a one-time **activation code**, like `K7QM-4XPD`, valid for
   14 days. The code is shown only
   once; the database stores just its hash. **Copy details** copies the
   usernames, codes and link.
2. The person opens **Create account** (`/activate`, linked from the sign-in
   page), enters their username and code, and chooses a password. They're
   signed in straight away, and the code stops working.

A student's profile (and the teacher form) shows the account's status: active,
not set up, or code expired. The admin can issue a **new code** there.
For an account that's already active, **Reset access** is how a forgotten
password gets reset: the old password stops working, the person is signed
out, and they set a new password with the new code.

Signing in to an account that hasn't been set up yet points the person to
**Create account**.

### Security

Sessions are httpOnly cookies that last 30 days. Passwords are hashed with
scrypt. Changing a password signs you out everywhere else. After 10 failed
sign-in or activation attempts in 15 minutes, further attempts for that
username or address are refused for a while.

## Roles

| Role | Pages | Can see |
| --- | --- | --- |
| Admin | Dashboard, Class Setup (with class teachers), Grading System, Promotion, Timetable (editable), Attendance (any section), Exams, Results (publish, print result cards and tabulation sheets), Students, Teachers, Fees & Payments (dues, receipts), Notice Board, SMS, Settings | Everything |
| Teacher | Dashboard (today's classes, pending tasks), Attendance (class teachers only), Exams (enter marks), Timetable, Students, Notice Board | The students, attendance and marks of the sections they teach; guardians' phone numbers only for sections they're class teacher of; no fees |
| Student | Dashboard (classes, exams, attendance, GPA, fees due), Class Routine, Attendance calendar, Results, Report Card (printable result card), Fees (dues, pay, receipts), Notice Board (student and guardian notices) | Their own records; results only once published |

### Language: English and বাংলা

Every page works in English or Bangla. Switch with the **বাং / EN** button in
the sidebar, under **Settings → Language**, or on the sign-in pages. The
choice is saved in a cookie, so the sign-in pages and the server's error
messages follow it too.

The app's text is written in English in the code and looked up in
`lib/i18n/bn.js` (the English text is the key; anything missing falls back to
English). Subject names, class names, exam terms, months and weekdays are
translated; what people type (names, notices, homework) stays as entered.
In Bangla, numbers (marks, dates, money, times) are shown in Bangla digits and
grades in Bangla letters (A+ → এ+). Anything people type back stays in Latin
digits: usernames, activation codes, student IDs, phone numbers, emails and
form fields. Search boxes accept either kind of digit.

### Class teachers

Each section has a **class teacher**, set in **Class Setup** (admin). A class
can have a different class teacher for each section, or the same teacher for
all of them ("Same teacher for every section"). One teacher can look after
any number of sections.

- Only a section's class teacher takes its attendance. They get one
  "Today's roll call" task per section and see guardians' phone numbers for
  those students. Subject teachers don't see attendance tasks, phone numbers
  or fees.
- The admin can take any section's attendance. If a section has no class
  teacher, only the admin can, and the admin dashboard and bell flag it
  until one is assigned.
- Each roll call records who took it.
- Students see their class teacher's name on their dashboard.

### Classes 9–10: groups, religion, 4th subject and exam parts

Classes 9 and 10 follow SSC rules. They're set per class in **Class Setup**
(the "Sections" and "Subjects: who takes them" panels), and new Class 9–10
classes start with the usual SSC subjects and rules.

- **Each section is one group** (Science, Business Studies or Humanities).
  A subject can be limited to some groups; Physics, for example, is Science
  only.
- **Religion subjects** (Islam, Hindu, Buddhist and Christian Religion and
  Moral Education) are taken only by students of that religion. A student's
  religion is set on their profile.
- **4th subject**: each student picks one of the optional subjects open to
  their group (e.g. Higher Math or Agriculture Studies). In the GPA it only
  adds the points it earns above 2.00, and failing it doesn't fail the
  result. Without it, GPA is the average of the compulsory subjects; any
  compulsory F makes it 0. The overall grade follows the GPA.
- **Exam parts**: an exam can be split into creative (CQ), MCQ and
  practical, e.g. CQ 70 + MCQ 30, or CQ 50 + MCQ 25 + practical 25 for
  science subjects. Teachers enter marks per part, and a student must get at
  least 33% in every part (70 → 23, 30 → 10, 25 → 8). Failing one part is an
  F in the subject even if the total is enough. Exams whose full marks match
  the subject's usual split start with it filled in; class tests are one
  paper.

Students only see the periods, exams, homework and results of subjects they
take. Mark sheets and teachers' "Enter marks" tasks list only those
students. Religion classes and 4th subjects run side by side in the same
period. In the admin timetable a period can hold several of them (**Side by
side**); any other subject replaces what's there.

### School week and shifts

Under **Settings → School week & shifts** the admin picks the school days
and sets up one or two shifts (morning and day). Each shift has its own
start time, number of periods, period length, gaps and break, and Scholar
works out the times. With two shifts, each section is put in a shift in
**Class Setup**, and its routine, today's classes and "now" follow that
shift's times. Teachers can teach in both shifts; the timetable refuses a
teacher whose periods overlap in time. Attendance and exams can only be on
school days. Periods that no longer exist after a change (a removed day, or
a shift with fewer periods) are taken off the timetable.

The demo school runs two shifts: Classes One–Five in the morning
(7:00–10:50) and Six–Ten in the day shift (12:00–5:10), Sunday to Thursday.
Nine A and Ten A are Science, Nine B is Business Studies and Ten B is
Humanities.

### Fees: dues, discounts and money receipts

Each student owes **charges**: monthly tuition (added automatically every
month at the class's fee, due on the 10th), plus any admission, session, exam
or other fee the admin adds for everyone, a class, a section or one student.
The demo school has a session fee in January and a half-yearly exam fee.

- **Discounts:** a student can have a standing tuition discount (25%, half,
  75% or a free studentship), set on their profile. Any single fee can also
  get a discount, for example half the session fee waived.
- **Payments and receipts:** **Collect payment** takes money against the
  dues the admin ticks. Paying less than the total is fine: the rest stays
  due, oldest first. Every payment gets the next receipt number and a
  printable **money receipt**. A receipt entered by mistake can be
  cancelled, which makes the amount due again.
- **Fees & Payments** shows who owes what (by class), every receipt by month,
  and this month's collection. **SMS reminders** texts every guardian who
  owes fees.
- Families see their dues and receipts, and can pay online (a demo: no money
  moves).

Databases from before this change are moved over automatically: each old
monthly fee becomes a tuition charge, and each paid month a payment with a
receipt number.

### SMS to guardians

The **SMS** page (admin) sends messages to guardians' phones:

- **Automatically:** when a student is marked absent in today's roll call
  (once a day per student), and when exam results are published (each
  student's GPA and grade, once per exam). Both can be turned off.
- **Fee reminders** from Fees & Payments, **notices** (tick "Also send by
  SMS" when posting), and the admin's own messages to all guardians, a class
  or a section.
- SMS are written in Bangla (default) or English. The page counts
  characters and SMS parts (a Bangla SMS holds 70 characters, English 160).

Every message is kept in the **outbox** with its status. Messages are sent
through [BulkSMSBD](https://bulksmsbd.net) only when the server has
`BULKSMSBD_API_KEY` and `BULKSMSBD_SENDER_ID` set. Without them nothing
leaves the server, and the outbox marks messages "Not sent". Guardians'
numbers must be Bangladeshi mobile numbers (01XXXXXXXXX, with or without +88);
others are marked "No number". Check BulkSMSBD's current API documentation
for your account: Scholar posts `api_key`, `senderid`, `number` and `message`
to `https://bulksmsbd.net/api/smsapi`, with `type=unicode` for Bangla and
`text` otherwise, and treats response code 202 as sent. `BULKSMSBD_URL`
overrides the address.

### Printed result cards and tabulation sheets

From **Results** the admin prints, for a section and exam:

- **Result cards:** one A4 page per student with marks per part (CQ, MCQ,
  practical), grade, point, GPA, result, position and attendance, and
  signature lines for the class teacher, guardian and principal.
- **A tabulation sheet:** the whole section on one landscape page, with each
  subject's marks and grade, total, GPA, grade and position, and how many
  passed.

Families print their own result card from the Report Card page. Everything
prints in the language the app is showing.

### Year-end promotion

**Academic → Promotion** moves students up a class for the new year, going
by an exam's results (the annual exam by default):

- Students who passed are promoted. A failed student stays in their class
  unless the admin ticks them to promote **on consideration**.
- Students keep their group where the next class has a section for it
  (Science to Science), otherwise the same section letter; the admin can pick
  another section for any student.
- New roll numbers in each section go by merit (GPA, then total marks).
  Students repeating the class come after the promoted ones.
- Students of the top class pass out: they leave the lists but stay in the
  database.
- The academic year then moves on by one. This year's exams and results stay
  in the database but are no longer shown, and nothing is published yet.

### Optional feature: Homework (off by default)

Homework only helps if teachers post it every day, so each school turns it
on under **Settings → Optional features** (admin only). It adds homework
pages for teachers (set and review) and students (mark submitted), plus
homework counts, due-soon reminders, teacher tasks and the report-card
homework figure.

While it's off, homework is hidden from every menu and page, the server
refuses homework actions and doesn't send homework data. Turning it back on
brings back everything already stored.

The server decides what each account receives. Families never get
classmates' names or marks; classmates show up only as anonymous entries, so
"position in section" and "highest in class" still work. Every change is
checked on the server against the signed-in role. For example, a teacher can
only take attendance or enter marks for sections they teach, and a family can
only pay its own fees.

## How it's built

```
app/
  layout.js, globals.css       page shell, theme, styles
  page.js                      signed-in app (redirects to /login otherwise)
  login/                       sign-in page
  activate/                    create account with an activation code
  api/auth/login|logout|activate   sessions, account activation
  api/state                    GET: everything the signed-in user may see
  api/actions                  POST { op, input }: every change the app makes
components/ScholarApp.js       sidebar/shell; mounts the client app
lib/client/app.js              the pages, forms and actions (runs in the browser)
lib/school/calendar.js         class names, subjects, date helpers (shared)
lib/school/rules.js            groups, religion, 4th subject, exam parts, GPA, shifts (shared)
lib/school/results.js          a student's result, grades, year-end promotion plan (shared)
lib/school/seed.js             the demo school
lib/server/
  db.js                        Postgres (pg) or PGlite; creates tables, seeds if empty
  schema.js                    tables
  state.js                     per-role view of the data
  actions.js                   permission checks + writes, one transaction each
  fees.js                      charges, payments and receipt numbers
  sms.js                       SMS outbox and BulkSMSBD delivery
  auth.js, accounts.js         sessions, passwords, usernames
scripts/db.mjs                 db:setup / db:reset
```

The browser posts each change to `/api/actions`, then reloads `/api/state` and
redraws, so every page always shows what's in the database.

## Deploy to Vercel

1. Create a Postgres database (for example Neon from the Vercel Marketplace,
   which sets `DATABASE_URL` for you, or any Postgres connection string).
2. Add `DATABASE_URL` to the project's environment variables.
3. Deploy:

   ```bash
   vercel deploy --prod
   ```

On the first request, the app creates the tables and seeds the demo school.
To hide the demo accounts on the sign-in page, set
`SHOW_DEMO_ACCOUNTS=false`. `SCHOOL_TIMEZONE` (default `Asia/Dhaka`) decides
what "today" is on the server. To send SMS, add `BULKSMSBD_API_KEY` and
`BULKSMSBD_SENDER_ID` (see "SMS to guardians").

Light or dark mode is saved per browser. Everything else is stored in
the database and shared.
