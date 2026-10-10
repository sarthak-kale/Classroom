# ClassFlow — Classroom Management Platform

ClassFlow is a full-featured, Google Classroom-style educational platform with dedicated Teacher and Student portals, built with React, TypeScript, Tailwind CSS, and a real Supabase backend. It features WhatsApp-style real-time Seen/Unseen engagement tracking, assignment submissions, grading, notifications, and strict PostgreSQL Row Level Security (RLS).

---

## 🚀 Key Features

- **Distinct Teacher & Student Portals**: Separate workflows, guards, and navigation. Role is chosen at registration and is strictly **immutable** thereafter (enforced via database trigger).
- **Seen/Unseen Tracking**: Real-time WhatsApp-style tracking for study materials and assignments.
  - Automatically recorded when a student opens an item via an atomic, idempotent RPC (`record_material_view`, `record_assignment_view`).
  - Instructors have a dedicated **View Tracking** live panel showing enrolled count, seen count, unseen count, engagement percentage, and a per-student breakdown table with search and sort.
- **Assignment Workflow & Statuses**:
  - Full precedence status engine: `Graded` (with released marks & teacher feedback) → `Turned in Late` → `Turned In` → `Missing / Overdue` → `Assigned`.
  - Student submissions lock once graded by the teacher.
  - Teachers can grade submissions and release grades individually or in batch (`release_assignment_grades`).
- **Secure File Storage**:
  - Private buckets for classroom materials, assignments, and submissions, served securely via short-lived signed URLs.
  - Public avatars bucket (`profile-avatars`).
- **Automated Notifications**:
  - Idempotent triggers emit real-time notifications for newly published materials, new assignments, due date updates, announcements, and grade releases.

---

## 🛠️ Supabase Setup & Installation

### 1. Disable Email Confirmation in Supabase (CRITICAL REQUIREMENT)
ClassFlow registers users and immediately creates an authenticated session without email verification screens.
1. Open your **Supabase Dashboard** → Select your Project.
2. Navigate to **Authentication** → **Providers** → **Email**.
3. Toggle off **"Confirm email"** and save.
> ⚠️ **Note**: The frontend cannot override this setting; it must be disabled in your Supabase project dashboard.

### 2. Run Database Migrations
Go to **SQL Editor** in your Supabase dashboard and execute the migration files located in `supabase/migrations/` in order:
1. `001_initial_schema.sql` — Tables, schemas, updated_at triggers, marks validation trigger, role immutability trigger.
2. `002_helper_functions_and_rls.sql` — Security Definer helper functions and Row Level Security policies for all 10 tables.
3. `003_rpc_functions.sql` — Atomic RPCs (`join_classroom`, `record_material_view`, `record_assignment_view`, `submit_assignment`, `grade_submission`, `release_assignment_grades`, `get_material_view_tracking`, `get_assignment_view_tracking`).
4. `004_notification_triggers.sql` — Notification triggers on publishing, due-date adjustments, and announcements.
5. `005_storage_buckets_and_policies.sql` — Storage buckets creation and granular access policies.
6. `006_fix_join_code_and_rpc.sql` — Automated unique join code generation (`CF-XXXXXX`), immutability trigger, and updated join classroom RPC.

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-or-publishable-key"
```
> **Location of keys**: Find your URL and Key in Supabase Dashboard → **Project Settings** → **API** → **Project URL** and **Project API Keys** (`anon` public key).

Alternatively, if you run the app without `.env`, ClassFlow includes a built-in **Configuration Screen** where you can paste your URL and API Key directly.

### 4. Run Locally
```bash
npm install
npm run dev
```
The dev server will run on `http://localhost:3000`.

---

## 🧪 Verification & Testing Checklist

You can execute the automated SQL test suite in `supabase/verification_tests.sql` to test database constraints and triggers.

### Manual Acceptance Checklist:
- [x] **Registration & Instant Session**: Register a teacher and a student with name, email, password, and role. Both register with no email verification screen and obtain an active session immediately.
- [x] **Role Immutability**: Neither teacher nor student can edit their role; database trigger rejects role alteration.
- [x] **Classroom Creation**: Teacher creates a classroom; unambiguous 8-character code is generated.
- [x] **Join Flow**:
  - Student enters code → enrolled successfully.
  - Invalid code → clear error message.
  - Duplicate join → rejected.
  - Archived classroom → rejected.
  - Teacher cannot call student join RPC.
- [x] **Draft vs Published**: Materials and assignments created as drafts remain visible only to the owning teacher until published.
- [x] **Seen/Unseen Tracking**:
  - Student opens a published material or assignment → view recorded atomically via RPC.
  - Teacher opens "View Tracking" panel → student shows "Seen" with first opened timestamp, last seen, and view count.
  - Reopening the material increments view count while preserving original `first_viewed_at`.
  - Refresh or re-login preserves seen status.
  - A student who joins later starts as "Unseen" for existing published items.
- [x] **Student Removal**: Teacher removes a student from a classroom → membership is deleted and student immediately loses access to classwork via RLS. Historical views are excluded from active engagement metrics.
- [x] **Assignment Submission & Grading**:
  - Student submits text and file attachment. Late submissions are flagged automatically.
  - Teacher grades submission with feedback and marks (enforced `marks <= max_marks`).
  - Teacher releases grade → student sees score, feedback, and locked state.
  - Student cannot alter submission after grading.
- [x] **Security & RLS**:
  - Student cannot inspect another student's submission.
  - Student cannot insert view rows directly (only via the atomic RPC).
  - Private files cannot be accessed without authenticated membership and valid signed URLs.

---

## 📌 Known Limitations

1. **Email Service Dependent on Supabase Settings**: Since "Confirm email" must be turned off for immediate session creation, welcome emails and password resets rely on Supabase's configured SMTP settings.
2. **Offline Mode**: Offline cache is not active; an active internet connection to Supabase is required for real-time tracking and database queries.
3. **External Cloud Storage Size Limits**: Supabase free-tier storage defaults to 50MB per uploaded file.
# Classroom
