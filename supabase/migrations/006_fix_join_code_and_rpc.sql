-- Migration 006: Fix Join Code Generation, Column Consistency, and Student Join RPC
-- ClassFlow Classroom Management Platform

-- ============================================================================
-- 1. ENSURE JOIN_CODE COLUMN EXISTS AND IS CONSTRAINED
-- ============================================================================

-- Add join_code column if it does not already exist
ALTER TABLE public.classrooms 
    ADD COLUMN IF NOT EXISTS join_code TEXT;

-- Backfill any existing classrooms that have NULL or empty join_code
UPDATE public.classrooms
SET join_code = 'CF-' || upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 6))
WHERE join_code IS NULL OR trim(join_code) = '';

-- Set NOT NULL constraint on join_code
ALTER TABLE public.classrooms 
    ALTER COLUMN join_code SET NOT NULL;

-- Ensure subject column has a safe default and does not reject classroom creation when omitted
ALTER TABLE public.classrooms 
    ALTER COLUMN subject SET DEFAULT 'General';

UPDATE public.classrooms 
SET subject = 'General' 
WHERE subject IS NULL;

-- Safely remove any accidental NOT NULL constraint on subject
ALTER TABLE public.classrooms 
    ALTER COLUMN subject DROP NOT NULL;

-- Safely add UNIQUE constraint if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.classrooms'::regclass 
        AND (conname = 'classrooms_join_code_key' OR conname = 'unique_classrooms_join_code')
    ) THEN
        ALTER TABLE public.classrooms 
            ADD CONSTRAINT unique_classrooms_join_code UNIQUE (join_code);
    END IF;
END $$;

-- Create index for fast join code lookup
CREATE INDEX IF NOT EXISTS idx_classrooms_join_code ON public.classrooms (upper(trim(join_code)));

-- ============================================================================
-- 2. SECURE DATABASE-SIDE JOIN CODE GENERATOR FUNCTION
-- Generates unambiguous, student-friendly code with retry on collision
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_unique_classroom_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    -- Unambiguous alphabet excluding easily confused characters (0, O, 1, I, L)
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
            RAISE EXCEPTION 'Failed to generate a unique classroom join code after multiple attempts';
        END IF;
    END LOOP;
END;
$$;

-- Set column default so Supabase generates join_code automatically on insert
ALTER TABLE public.classrooms 
    ALTER COLUMN join_code SET DEFAULT public.generate_unique_classroom_code();

-- ============================================================================
-- 3. PREVENT UNAUTHORIZED JOIN CODE MODIFICATIONS TRIGGER
-- Teachers and students cannot tamper with join codes after creation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_join_code_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.join_code IS NOT NULL AND NEW.join_code IS DISTINCT FROM OLD.join_code THEN
        RAISE EXCEPTION 'Classroom join codes are permanent and cannot be modified.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_join_code_change ON public.classrooms;
CREATE TRIGGER trg_prevent_join_code_change
    BEFORE UPDATE OF join_code ON public.classrooms
    FOR EACH ROW EXECUTE FUNCTION public.prevent_join_code_change();

-- ============================================================================
-- 4. SECURE JOIN_CLASSROOM RPC FUNCTION (CANONICAL)
-- Validates code, student role, archived status, duplicate enrollment
-- ============================================================================

-- Ensure only one canonical join_classroom(code_input TEXT) definition exists
DROP FUNCTION IF EXISTS public.join_classroom(TEXT);

CREATE OR REPLACE FUNCTION public.join_classroom(code_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    caller_role TEXT;
    cleaned_code TEXT;
    target_classroom RECORD;
    new_membership_id UUID;
BEGIN
    -- 1. Verify caller authentication
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to join a classroom.';
    END IF;

    -- 2. Verify caller has student role from profiles
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role IS NULL THEN
        RAISE EXCEPTION 'User profile not found. Please refresh your profile and try again.';
    END IF;
    IF caller_role != 'student' THEN
        RAISE EXCEPTION 'Only students can join classrooms using a join code.';
    END IF;

    -- 3. Sanitize code (trim, uppercase, remove interior whitespace)
    cleaned_code := upper(trim(COALESCE(code_input, '')));
    cleaned_code := regexp_replace(cleaned_code, '\s+', '', 'g');
    IF length(cleaned_code) = 0 THEN
        RAISE EXCEPTION 'Classroom join code cannot be empty.';
    END IF;

    -- 4. Lookup classroom by join_code (case-insensitive and prefix-tolerant)
    SELECT * INTO target_classroom 
    FROM public.classrooms 
    WHERE upper(trim(join_code)) = cleaned_code
       OR upper(trim(join_code)) = ('CF-' || cleaned_code)
       OR upper(trim(replace(join_code, 'CF-', ''))) = upper(trim(replace(cleaned_code, 'CF-', '')))
       OR upper(regexp_replace(join_code, '[^A-Z0-9]', '', 'g')) = upper(regexp_replace(cleaned_code, '[^A-Z0-9]', '', 'g'))
    LIMIT 1;

    IF target_classroom.id IS NULL THEN
        RAISE EXCEPTION 'Invalid classroom join code. Please verify the code with your teacher and try again.';
    END IF;

    -- 5. Reject archived classrooms
    IF target_classroom.is_archived THEN
        RAISE EXCEPTION 'This classroom has been archived and is not accepting new students.';
    END IF;

    -- 6. Reject duplicate membership
    IF EXISTS (
        SELECT 1 FROM public.classroom_members 
        WHERE classroom_id = target_classroom.id AND student_id = caller_id
    ) THEN
        RAISE EXCEPTION 'You have already joined this classroom.';
    END IF;

    -- 7. Insert membership atomically
    INSERT INTO public.classroom_members (classroom_id, student_id, joined_at)
    VALUES (target_classroom.id, caller_id, timezone('utc'::text, now()))
    RETURNING id INTO new_membership_id;

    RETURN jsonb_build_object(
        'success', true,
        'classroom_id', target_classroom.id,
        'classroom_name', target_classroom.name,
        'section', target_classroom.section,
        'subject', target_classroom.subject,
        'join_code', target_classroom.join_code
    );
END;
$$;

-- Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_unique_classroom_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_classroom(TEXT) TO authenticated;

-- ============================================================================
-- 5. RLS POLICIES FOR CLASSROOM CREATION AND READ ACCESS
-- ============================================================================

-- Enable RLS
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;

-- 1. Teachers can create classrooms for themselves only
DROP POLICY IF EXISTS "classrooms_insert_teacher" ON public.classrooms;
CREATE POLICY "classrooms_insert_teacher"
    ON public.classrooms FOR INSERT
    TO authenticated
    WITH CHECK (
        teacher_id = auth.uid()
        AND (
            SELECT role FROM public.profiles WHERE id = auth.uid()
        ) = 'teacher'
    );

-- 2. Teachers can read their own classrooms
DROP POLICY IF EXISTS "classrooms_select_teacher" ON public.classrooms;
CREATE POLICY "classrooms_select_teacher"
    ON public.classrooms FOR SELECT
    TO authenticated
    USING (
        teacher_id = auth.uid()
    );

-- 3. Students can read classrooms they are enrolled in
DROP POLICY IF EXISTS "classrooms_select_enrolled_student" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select_by_join_code" ON public.classrooms;
CREATE POLICY "classrooms_select_enrolled_student"
    ON public.classrooms FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classroom_members cm
            WHERE cm.classroom_id = classrooms.id AND cm.student_id = auth.uid()
        )
    );

-- 4. Teachers can update and delete their own classrooms
DROP POLICY IF EXISTS "classrooms_update_teacher" ON public.classrooms;
CREATE POLICY "classrooms_update_teacher"
    ON public.classrooms FOR UPDATE
    TO authenticated
    USING (teacher_id = auth.uid())
    WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "classrooms_delete_teacher" ON public.classrooms;
CREATE POLICY "classrooms_delete_teacher"
    ON public.classrooms FOR DELETE
    TO authenticated
    USING (teacher_id = auth.uid());

-- 5. Classroom membership policies
DROP POLICY IF EXISTS "classroom_members_select_teacher" ON public.classroom_members;
CREATE POLICY "classroom_members_select_teacher"
    ON public.classroom_members FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = classroom_members.classroom_id AND c.teacher_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "classroom_members_select_student_self" ON public.classroom_members;
CREATE POLICY "classroom_members_select_student_self"
    ON public.classroom_members FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

DROP POLICY IF EXISTS "classroom_members_delete_teacher" ON public.classroom_members;
CREATE POLICY "classroom_members_delete_teacher"
    ON public.classroom_members FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = classroom_members.classroom_id AND c.teacher_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "classroom_members_delete_student_self" ON public.classroom_members;
CREATE POLICY "classroom_members_delete_student_self"
    ON public.classroom_members FOR DELETE
    TO authenticated
    USING (student_id = auth.uid());
