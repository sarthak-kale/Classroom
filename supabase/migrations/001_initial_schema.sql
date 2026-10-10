-- Migration 001: Initial Schema
-- ClassFlow Classroom Management Platform

-- Enable UUID extension if not already available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger to handle new user registration from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    user_role TEXT;
    user_full_name TEXT;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
    IF user_role NOT IN ('teacher', 'student') THEN
        user_role := 'student';
    END IF;

    user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

    INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        user_full_name,
        user_role,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to enforce role immutability
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        RAISE EXCEPTION 'User role is immutable and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_role_immutability ON public.profiles;
CREATE TRIGGER enforce_profile_role_immutability
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- Trigger to set updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Database-side secure join code generator
CREATE OR REPLACE FUNCTION public.generate_unique_classroom_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    chars CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    code_length CONSTANT INT := 6;
    new_code TEXT := '';
    i INT;
    idx INT;
    code_exists BOOLEAN;
    bytes BYTEA;
    attempts INT := 0;
BEGIN
    LOOP
        attempts := attempts + 1;
        new_code := 'CF-';
        bytes := gen_random_bytes(code_length);

        FOR i IN 0..(code_length - 1) LOOP
            idx := (get_byte(bytes, i) % length(chars)) + 1;
            new_code := new_code || substr(chars, idx, 1);
        END LOOP;

        SELECT EXISTS (
            SELECT 1 FROM public.classrooms WHERE upper(join_code) = upper(new_code)
        ) INTO code_exists;

        IF NOT code_exists THEN
            RETURN new_code;
        END IF;

        IF attempts > 100 THEN
            RAISE EXCEPTION 'Failed to generate unique classroom code after multiple attempts';
        END IF;
    END LOOP;
END;
$$;

-- 2. CLASSROOMS TABLE
CREATE TABLE IF NOT EXISTS public.classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    section TEXT,
    subject TEXT DEFAULT 'General',
    room TEXT,
    join_code TEXT NOT NULL UNIQUE DEFAULT public.generate_unique_classroom_code(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS set_classrooms_updated_at ON public.classrooms;
CREATE TRIGGER set_classrooms_updated_at
    BEFORE UPDATE ON public.classrooms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. CLASSROOM MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.classroom_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_classroom_student UNIQUE (classroom_id, student_id)
);

-- 4. MATERIALS TABLE
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    description TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    file_type TEXT,
    external_url TEXT,
    published_at TIMESTAMPTZ, -- NULL means draft
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS set_materials_updated_at ON public.materials;
CREATE TRIGGER set_materials_updated_at
    BEFORE UPDATE ON public.materials
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. MATERIAL VIEWS TABLE
CREATE TABLE IF NOT EXISTS public.material_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count >= 1),
    CONSTRAINT unique_material_student UNIQUE (material_id, student_id)
);

-- 6. ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    instructions TEXT,
    max_marks NUMERIC(6,2) NOT NULL DEFAULT 100.00 CHECK (max_marks > 0),
    due_at TIMESTAMPTZ,
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_size BIGINT,
    published_at TIMESTAMPTZ, -- NULL means draft
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS set_assignments_updated_at ON public.assignments;
CREATE TRIGGER set_assignments_updated_at
    BEFORE UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. ASSIGNMENT VIEWS TABLE
CREATE TABLE IF NOT EXISTS public.assignment_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count >= 1),
    CONSTRAINT unique_assignment_student UNIQUE (assignment_id, student_id)
);

-- 8. ASSIGNMENT SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    submission_text TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    is_late BOOLEAN NOT NULL DEFAULT false,
    marks_obtained NUMERIC(6,2) CHECK (marks_obtained >= 0),
    feedback TEXT,
    graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    graded_at TIMESTAMPTZ,
    grades_released BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_assignment_submission UNIQUE (assignment_id, student_id)
);

-- Trigger to validate marks_obtained <= assignment.max_marks
CREATE OR REPLACE FUNCTION public.validate_submission_marks()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    assignment_max NUMERIC(6,2);
BEGIN
    IF NEW.marks_obtained IS NOT NULL THEN
        SELECT max_marks INTO assignment_max
        FROM public.assignments
        WHERE id = NEW.assignment_id;

        IF NEW.marks_obtained > assignment_max THEN
            RAISE EXCEPTION 'Marks obtained (%) cannot exceed maximum marks (%)', NEW.marks_obtained, assignment_max;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_submission_marks ON public.assignment_submissions;
CREATE TRIGGER check_submission_marks
    BEFORE INSERT OR UPDATE ON public.assignment_submissions
    FOR EACH ROW EXECUTE FUNCTION public.validate_submission_marks();

DROP TRIGGER IF EXISTS set_assignment_submissions_updated_at ON public.assignment_submissions;
CREATE TRIGGER set_assignment_submissions_updated_at
    BEFORE UPDATE ON public.assignment_submissions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS set_announcements_updated_at ON public.announcements;
CREATE TRIGGER set_announcements_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('material_published', 'assignment_published', 'due_date_changed', 'announcement_created', 'grade_released')),
    related_id UUID,
    classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    idempotency_key TEXT UNIQUE
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_join_code ON public.classrooms(join_code);
CREATE INDEX IF NOT EXISTS idx_classrooms_is_archived ON public.classrooms(is_archived);

CREATE INDEX IF NOT EXISTS idx_classroom_members_cid ON public.classroom_members(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_members_sid ON public.classroom_members(student_id);

CREATE INDEX IF NOT EXISTS idx_materials_cid ON public.materials(classroom_id);
CREATE INDEX IF NOT EXISTS idx_materials_published ON public.materials(published_at);

CREATE INDEX IF NOT EXISTS idx_material_views_mid ON public.material_views(material_id);
CREATE INDEX IF NOT EXISTS idx_material_views_sid ON public.material_views(student_id);

CREATE INDEX IF NOT EXISTS idx_assignments_cid ON public.assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_published ON public.assignments(published_at);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON public.assignments(due_at);

CREATE INDEX IF NOT EXISTS idx_assignment_views_aid ON public.assignment_views(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_views_sid ON public.assignment_views(student_id);

CREATE INDEX IF NOT EXISTS idx_submissions_aid ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_sid ON public.assignment_submissions(student_id);

CREATE INDEX IF NOT EXISTS idx_announcements_cid ON public.announcements(classroom_id);

CREATE INDEX IF NOT EXISTS idx_notifications_uid ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(user_id, is_read);
