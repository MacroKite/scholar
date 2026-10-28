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

It's a Next.js app (JavaScript) backed by Postgres. One deployment serves
many schools, each at its own address and with its own data (see **Many
schools** below). Everyone signs in with their own account at their school.
The admin, teachers, and families (a student together with their guardian)
each see their own pages of the same school's data.

Live: https://scholar-six-pied.vercel.app

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5180 for the school's public website, or
http://localhost:5180/app (or **Sign in** on the website) for the app.

There's nothing to set up for local use. Without `DATABASE_URL`, the app uses
PGlite, a full Postgres that runs inside Node and keeps its files in
`.data/pglite`. The first start creates the tables and adds the demo school
(`demo`), which opens at http://localhost:5180.

To use your own Postgres instead, copy `.env.example` to `.env.local` and set
`DATABASE_URL`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 5180 |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:setup` | Create the tables; add the demo school if the database is empty; list the schools |
| `npm run db:reset` | Delete every school and start again with just the demo school |
| `npm test` | Check that schools can't see or change each other's data (uses a temporary database) |

With PGlite, stop `npm run dev` before running the `db:` commands, because
only one process can open the database at a time. In a demo school, the admin
can also reset its data from **Settings → Reset demo data**; a real school
has no such button.

## Many schools

Every school's data lives in the same tables, each row tagged with its
school (`school_id`). Each school has its own `admin`, its own student IDs
and its own receipt numbers.

**Which school a request is for** comes from the address it was sent to:

1. one of the school's own addresses (`schools.hosts`), e.g. `www.adarshahigh.edu.bd`;
2. `<school id>.<ROOT_DOMAIN>`, e.g. `adarsha.scholar.com.bd`. `ROOT_DOMAIN`
   defaults to `localhost`, so locally `second.localhost:5180` opens school
   `second` (browsers send `*.localhost` to your own computer);
3. otherwise `DEFAULT_SCHOOL`, or the only school if there's just one, so a
   one-school deployment works at any address.

A school id that doesn't exist, an unknown address when there are several
schools, or a school whose `status` is `suspended` shows "not found". Sign-in,
sessions and the sign-in throttle all belong to one school: a session cookie
from one school's address doesn't work at another's.

**How schools are kept apart.** All school data is read and written inside
`forSchool(id, fn)` (`lib/server/db.js`): a transaction that sets the school
and switches to the `scholar_app` database role. Postgres row-level security
then lets it see and change only that school's rows, and new rows get the
school automatically. So a query that forgets a school filter still can't
reach another school's data. `npm test` checks this for reading, for the
actions that write, for sign-in and for addresses. Only the `schools` table,
upgrades and SMS delivery use the connecting user's full access.

Row-level security guards against mistakes in Scholar's own queries, not
against someone running SQL of their own; every query passes values as
parameters, so nobody can. For extra safety in production, connect with a
database user that doesn't own the tables.

**Upgrading an older, single-school database** happens by itself on the
first start: its data becomes one school (id `main`, or `LEGACY_SCHOOL_ID`),
everyone stays signed in, and nothing is lost if it fails part-way (it runs
in one transaction). That school isn't a demo, so it can't be reset.

### Running the service: `npm run school`

Schools are created and looked after from the command line, against the
database in `DATABASE_URL` (or the local PGlite one: stop `npm run dev`
first). The running app picks up changes within a minute.

| Command | What it does |
| --- | --- |
| `npm run school -- list` | Every school: address, students, teachers, accounts set up, last sign-in, SMS |
| `npm run school -- create adarsha --name "Adarsha High School" --admin "Rokeya Begum" [--email …] [--host www.adarshahigh.edu.bd] [--year 2026]` | A new, empty school, and its admin's one-time activation code |
| `npm run school -- host <id> --add <address>` / `--remove <address>` | The addresses a school opens at, besides `<id>.<ROOT_DOMAIN>` |
| `npm run school -- sms <id> --key <api key> --sender <sender id>` / `--clear` | The school's own BulkSMSBD account |
| `npm run school -- admin-code <id>` | A new code for the school's admin (a forgotten password, or a new principal) |
| `npm run school -- suspend <id>` / `activate <id>` | Close a school's website and app (e.g. unpaid), signing everyone out; nothing is deleted |
| `npm run school -- delete <id> --confirm <id>` | Delete the school and all its data, for good |

A new school's admin opens the address the command prints, enters `admin`
and the code, and picks a password. Then they add classes, teachers and
students in the app, which gives each teacher and family their own code.
A new school has no demo logins on its sign-in page and no "Reset demo
data".

## School website

The address `/` is the school's public website; the app itself is at `/app`.
The website uses the classic look and works in English and Bangla, on phones
too. Its pages are drawn on the server, so they load fast on mobile data and
can be found by search engines.

| Page | What it shows |
| --- | --- |
| Home | Name, EIIN, board, tagline, admission banner, latest notices, totals (students, teachers, classes, SSC pass rate), principal's message, mission, facilities, SSC results |
| About | History, mission and vision, the principal's full message, managing committee, achievements, SSC results, facilities |
| Academics | Classes and sections, the subjects of each group in Classes 9–10, school days and shift times, the exam routine |
| Admission | Open or closed, session and last date, who can apply, how to apply, documents needed, monthly tuition by class, and an admission enquiry form |
| Teachers | Names and subjects (can be turned off) |
| Notices | Notices posted for **Everyone**, each with its own page |
| Gallery | Photos, once the school adds some |
| Contact | Address, phone, email, office hours, Facebook, a Google map and a contact form |

Notices, teachers, classes, fees, school hours and the exam routine come
straight from Scholar. The admin fills in the rest on the **Website** page in
the app: school details (EIIN, school code, board, address, phone, map),
principal's message, history, mission and vision, facilities, managing
committee, achievements, admission details, SSC results and photo addresses.
Lists are typed one item per line.

Enquiries from the Admission and Contact forms appear on the Website page,
where they can be marked as followed up. Each address can send only a few in a
quarter of an hour. The website never shows anything about an individual
student, and teachers' phone numbers and emails stay private.

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
- Families see their dues and receipts, and pay at the office or from their
  phones by bKash, Nagad or Rocket (below). A demo school without wallet
  numbers keeps a pretend "Pay" button instead (no money moves).

#### Paying from a phone: bKash, Nagad, Rocket

1. The admin enters the school's wallet numbers under **Settings → Fees by
   bKash, Nagad or Rocket**, with a line of instructions for families (e.g.
   "Use Payment and write the student ID as the reference").
2. The family sends the money from their own wallet app, then presses **Pay
   by bKash** on their Fees page and enters the amount and the transaction ID
   from the confirmation SMS. It shows as **Waiting for the office**, and
   counts against what's due, so the Pay button doesn't offer the same
   amount twice.
3. The office opens **Fees & Payments → Online payments** (the bell says
   when something is waiting), finds the transaction in the school's own
   bKash/Nagad statement, and presses **Approve** (twice, to be sure). That
   makes an ordinary receipt marked "Paid online", with the transaction ID on
   it, and the dues go down. Or **Reject** with a reason the family sees.

Nothing counts until the office approves it. A transaction ID can be waiting
or approved only once per school (a rejected one can be sent again, e.g.
after fixing a typo), a family can have three payments waiting at most, and
a payment can't be for more than is due. The money goes straight to the
school's own wallet; Scholar never handles it. A payment gateway that
confirms payments automatically can be added later, school by school.

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
through [BulkSMSBD](https://bulksmsbd.net): each school through its own
account and sender name, set with `npm run school -- sms <id> --key … --sender …`.
A school without one uses the server's `BULKSMSBD_API_KEY` and
`BULKSMSBD_SENDER_ID`, if set. With neither, nothing leaves the server, and
the outbox marks messages "Not sent". The app can tell a school has its own
account, but only the background sender can read the API key. Guardians'
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
  (site)/                      the public school website (/, /about, /admission, …)
  app/page.js                  the signed-in app at /app (redirects to /login otherwise)
  login/                       sign-in page
  activate/                    create account with an activation code
  api/auth/login|logout|activate   sessions, account activation
  api/state                    GET: everything the signed-in user may see
  api/actions                  POST { op, input }: every change the app makes
  api/enquiry                  POST: an admission or contact enquiry from the website
components/ScholarApp.js       sidebar/shell; mounts the client app
components/site/               the website's menu, language switch, enquiry form, shared parts
lib/client/app.js              the pages, forms and actions (runs in the browser)
lib/school/calendar.js         class names, subjects, date helpers (shared)
lib/school/rules.js            groups, religion, 4th subject, exam parts, GPA, shifts (shared)
lib/school/results.js          a student's result, grades, year-end promotion plan (shared)
lib/school/website.js          the website's own content and its defaults
lib/school/seed.js             the demo school
lib/server/
  db.js                        Postgres (pg) or PGlite; creates tables, seeds if empty
  schema.js                    tables
  state.js                     per-role view of the data
  actions.js                   permission checks + writes, one transaction each
  fees.js                      charges, payments and receipt numbers
  sms.js                       SMS outbox and BulkSMSBD delivery
  site.js                      what the public website may show
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
