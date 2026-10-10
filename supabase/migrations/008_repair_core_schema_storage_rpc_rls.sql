-- Migration 008: Repair Core Schema, Storage Buckets, RPC Functions, and RLS
-- ClassFlow Learning Management System
--
-- ============================================================================
-- CANONICAL STORAGE PATH CONVENTIONS (ENFORCED ACROSS APP AND STORAGE POLICIES)
-- ============================================================================
-- 1. classroom-materials:    {classroom_id}/{material_id}/{sanitized_filename}
-- 2. assignment-attachments: {classroom_id}/{assignment_id}/{sanitized_filename}
-- 3. student-submissions:    {classroom_id}/{assignment_id}/{student_id}/{sanitized_filename}
-- 4. profile-avatars:        {user_id}/{sanitized_filename}
--
-- The path stored in the database must match exactly the object path in storage.objects.
-- ============================================================================

-- ============================================================================
-- PART 1: SCHEMA ALIGNMENT (ADDITIVE, IDEMPOTENT, ZERO DATA LOSS)
-- ============================================================================

-- 1.0 ALIGN PUBLIC.CLASSROOMS
ALTER TABLE public.classrooms ADD COLUMN IF NOT EXISTS join_code TEXT;
ALTER TABLE public.classrooms ALTER COLUMN subject SET DEFAULT 'General';
ALTER TABLE public.classrooms ALTER COLUMN subject DROP NOT NULL;

-- Ensure join_code column default generator function exists and is attached
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
            RAISE EXCEPTION 'Failed to generate a unique classroom join code after multiple attempts';
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE public.classrooms ALTER COLUMN join_code SET DEFAULT public.generate_unique_classroom_code();

-- Backfill missing join codes
UPDATE public.classrooms
SET join_code = public.generate_unique_classroom_code()
WHERE join_code IS NULL OR trim(join_code) = '';

-- 1.1 ALIGN PUBLIC.MATERIALS
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.materials ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.materials ALTER COLUMN description SET DEFAULT '';
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS external_url TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT true;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Backfill missing teacher_id from classrooms table
UPDATE public.materials m
SET teacher_id = c.teacher_id
FROM public.classrooms c
WHERE m.classroom_id = c.id AND m.teacher_id IS NULL;

-- Backfill paths and URLs
UPDATE public.materials SET file_path = file_url WHERE file_path IS NULL AND file_url IS NOT NULL;
UPDATE public.materials SET file_url = file_path WHERE file_url IS NULL AND file_path IS NOT NULL;
UPDATE public.materials SET external_url = url WHERE external_url IS NULL AND url IS NOT NULL;
UPDATE public.materials SET url = external_url WHERE url IS NULL AND external_url IS NOT NULL;
UPDATE public.materials SET type = COALESCE(file_type, 'pdf') WHERE type IS NULL;
UPDATE public.materials SET file_type = type WHERE file_type IS NULL;
UPDATE public.materials SET published_at = created_at WHERE published_at IS NULL AND published IS TRUE;
UPDATE public.materials SET published = (published_at IS NOT NULL) WHERE published IS NULL;

-- Dual-synchronization trigger for public.materials
CREATE OR REPLACE FUNCTION public.sync_material_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Synchronize file_path and file_url
    IF NEW.file_path IS NOT NULL AND NEW.file_url IS NULL THEN
        NEW.file_url := NEW.file_path;
    ELSIF NEW.file_url IS NOT NULL AND NEW.file_path IS NULL THEN
        NEW.file_path := NEW.file_url;
    END IF;

    -- Synchronize type and file_type
    IF NEW.type IS NOT NULL AND NEW.file_type IS NULL THEN
        NEW.file_type := NEW.type;
    ELSIF NEW.file_type IS NOT NULL AND NEW.type IS NULL THEN
        NEW.type := NEW.file_type;
    END IF;

    -- Synchronize url and external_url
    IF NEW.external_url IS NOT NULL AND NEW.url IS NULL THEN
        NEW.url := NEW.external_url;
    ELSIF NEW.url IS NOT NULL AND NEW.external_url IS NULL THEN
        NEW.external_url := NEW.url;
    END IF;

    -- Synchronize published and published_at
    IF NEW.published IS TRUE AND NEW.published_at IS NULL THEN
        NEW.published_at := timezone('utc'::text, now());
    ELSIF NEW.published IS FALSE THEN
        NEW.published_at := NULL;
    ELSIF NEW.published_at IS NOT NULL AND NEW.published IS NULL THEN
        NEW.published := TRUE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_material_columns ON public.materials;
CREATE TRIGGER trg_sync_material_columns
    BEFORE INSERT OR UPDATE ON public.materials
    FOR EACH ROW EXECUTE FUNCTION public.sync_material_columns();


-- 1.2 ALIGN PUBLIC.ASSIGNMENTS
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE public.assignments ALTER COLUMN instructions DROP NOT NULL;
ALTER TABLE public.assignments ALTER COLUMN instructions SET DEFAULT '';
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS points NUMERIC(6,2) DEFAULT 100.00;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS max_marks NUMERIC(6,2) DEFAULT 100.00;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT true;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Backfill assignments columns safely
UPDATE public.assignments a
SET teacher_id = c.teacher_id
FROM public.classrooms c
WHERE a.classroom_id = c.id AND a.teacher_id IS NULL;

UPDATE public.assignments SET max_marks = points WHERE max_marks IS NULL AND points IS NOT NULL;
UPDATE public.assignments SET points = max_marks WHERE points IS NULL AND max_marks IS NOT NULL;
UPDATE public.assignments SET due_at = due_date WHERE due_at IS NULL AND due_date IS NOT NULL;
UPDATE public.assignments SET due_date = due_at WHERE due_date IS NULL AND due_at IS NOT NULL;

UPDATE public.assignments 
SET published_at = created_at 
WHERE published_at IS NULL AND (status = 'published' OR status IS NULL);

UPDATE public.assignments 
SET published = (published_at IS NOT NULL) 
WHERE published IS NULL;

UPDATE public.assignments 
SET status = CASE WHEN published_at IS NOT NULL THEN 'published' ELSE 'draft' END 
WHERE status IS NULL;

-- Dual-synchronization trigger for public.assignments
CREATE OR REPLACE FUNCTION public.sync_assignment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Synchronize points and max_marks
    IF NEW.max_marks IS NOT NULL AND NEW.points IS NULL THEN
        NEW.points := NEW.max_marks;
    ELSIF NEW.points IS NOT NULL AND NEW.max_marks IS NULL THEN
        NEW.max_marks := NEW.points;
    END IF;

    -- Synchronize due_date and due_at
    IF NEW.due_at IS NOT NULL AND NEW.due_date IS NULL THEN
        NEW.due_date := NEW.due_at;
    ELSIF NEW.due_date IS NOT NULL AND NEW.due_at IS NULL THEN
        NEW.due_at := NEW.due_date;
    END IF;

    -- Synchronize status, published, published_at
    IF NEW.published IS TRUE AND NEW.published_at IS NULL THEN
        NEW.published_at := timezone('utc'::text, now());
        NEW.status := 'published';
    ELSIF NEW.published IS FALSE THEN
        NEW.published_at := NULL;
        NEW.status := 'draft';
    ELSIF NEW.status = 'draft' THEN
        NEW.published := FALSE;
        NEW.published_at := NULL;
    ELSIF NEW.published_at IS NOT NULL THEN
        NEW.published := TRUE;
        NEW.status := 'published';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_assignment_columns ON public.assignments;
CREATE TRIGGER trg_sync_assignment_columns
    BEFORE INSERT OR UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.sync_assignment_columns();


-- 1.3 ALIGN PUBLIC.ASSIGNMENT_SUBMISSIONS
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS grade NUMERIC(6,2);
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS marks_obtained NUMERIC(6,2);
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS grades_released BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'submitted';

-- Backfill missing classroom_id from assignments table
UPDATE public.assignment_submissions s
SET classroom_id = a.classroom_id
FROM public.assignments a
WHERE s.assignment_id = a.id AND s.classroom_id IS NULL;

-- Backfill submissions columns
UPDATE public.assignment_submissions SET marks_obtained = grade WHERE marks_obtained IS NULL AND grade IS NOT NULL;
UPDATE public.assignment_submissions SET grade = marks_obtained WHERE grade IS NULL AND marks_obtained IS NOT NULL;
UPDATE public.assignment_submissions SET file_path = file_url WHERE file_path IS NULL AND file_url IS NOT NULL;
UPDATE public.assignment_submissions SET file_url = file_path WHERE file_url IS NULL AND file_path IS NOT NULL;

-- Dual-synchronization trigger for public.assignment_submissions
CREATE OR REPLACE FUNCTION public.sync_submission_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Synchronize classroom_id
    IF NEW.classroom_id IS NULL AND NEW.assignment_id IS NOT NULL THEN
        SELECT classroom_id INTO NEW.classroom_id
        FROM public.assignments
        WHERE id = NEW.assignment_id;
    END IF;

    IF NEW.marks_obtained IS NOT NULL AND NEW.grade IS NULL THEN
        NEW.grade := NEW.marks_obtained;
    ELSIF NEW.grade IS NOT NULL AND NEW.marks_obtained IS NULL THEN
        NEW.marks_obtained := NEW.grade;
    END IF;

    IF NEW.file_path IS NOT NULL AND NEW.file_url IS NULL THEN
        NEW.file_url := NEW.file_path;
    ELSIF NEW.file_url IS NOT NULL AND NEW.file_path IS NULL THEN
        NEW.file_path := NEW.file_url;
    END IF;

    IF NEW.graded_at IS NOT NULL AND NEW.status = 'submitted' THEN
        NEW.status := 'graded';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_submission_columns ON public.assignment_submissions;
CREATE TRIGGER trg_sync_submission_columns
    BEFORE INSERT OR UPDATE ON public.assignment_submissions
    FOR EACH ROW EXECUTE FUNCTION public.sync_submission_columns();


-- 1.4 ALIGN TRACKING TABLES & UNIQUE CONSTRAINTS
ALTER TABLE public.material_views ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE;
ALTER TABLE public.material_views ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.material_views ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.material_views ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.material_views'::regclass 
        AND conname = 'unique_material_student'
    ) THEN
        ALTER TABLE public.material_views 
            ADD CONSTRAINT unique_material_student UNIQUE (material_id, student_id);
    END IF;
END $$;

ALTER TABLE public.assignment_views ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE;
ALTER TABLE public.assignment_views ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.assignment_views ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.assignment_views ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.assignment_views'::regclass 
        AND conname = 'unique_assignment_student'
    ) THEN
        ALTER TABLE public.assignment_views 
            ADD CONSTRAINT unique_assignment_student UNIQUE (assignment_id, student_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.assignment_submissions'::regclass 
        AND conname = 'unique_assignment_submission'
    ) THEN
        ALTER TABLE public.assignment_submissions 
            ADD CONSTRAINT unique_assignment_submission UNIQUE (assignment_id, student_id);
    END IF;
END $$;


-- ============================================================================
-- PART 2: CANONICAL HELPER & RPC FUNCTIONS (EXACT SIGNATURES, NO OVERLOADS)
-- ============================================================================

-- Clean up RPC function overloads safely before creating canonical versions.
-- Note: is_classroom_teacher and is_classroom_member are NOT dropped because existing RLS policies
-- depend on them; they are updated in place using CREATE OR REPLACE FUNCTION with identical signatures.
DROP FUNCTION IF EXISTS public.record_material_view(UUID, UUID);
DROP FUNCTION IF EXISTS public.mark_material_unseen(UUID);
DROP FUNCTION IF EXISTS public.get_material_view_tracking(UUID);
DROP FUNCTION IF EXISTS public.record_assignment_view(UUID);
DROP FUNCTION IF EXISTS public.get_assignment_view_tracking(UUID);
DROP FUNCTION IF EXISTS public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.grade_submission(UUID, NUMERIC, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.release_assignment_grades(UUID);

-- 2.1 is_classroom_teacher(p_classroom_id UUID, p_user_id UUID DEFAULT auth.uid())
CREATE OR REPLACE FUNCTION public.is_classroom_teacher(
    p_classroom_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.classrooms
        WHERE id = p_classroom_id AND teacher_id = p_user_id
    );
$$;

-- 2.2 is_classroom_member(p_classroom_id UUID, p_user_id UUID DEFAULT auth.uid())
CREATE OR REPLACE FUNCTION public.is_classroom_member(
    p_classroom_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.classroom_members
        WHERE classroom_id = p_classroom_id AND student_id = p_user_id
    );
$$;

-- 2.3 record_material_view(p_material_id UUID)
CREATE OR REPLACE FUNCTION public.record_material_view(p_material_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    caller_role TEXT;
    target_material RECORD;
    is_member BOOLEAN;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
    END IF;

    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role != 'student' THEN
        -- Teacher views are not counted in student view tracking
        RETURN jsonb_build_object('success', false, 'reason', 'not_a_student');
    END IF;

    SELECT * INTO target_material 
    FROM public.materials 
    WHERE id = p_material_id;

    IF target_material.id IS NULL OR (target_material.published_at IS NULL AND COALESCE(target_material.published, false) = false) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'material_not_published_or_found');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.classroom_members 
        WHERE classroom_id = target_material.classroom_id AND student_id = caller_id
    ) INTO is_member;

    IF NOT is_member THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_enrolled');
    END IF;

    INSERT INTO public.material_views (
        material_id,
        student_id,
        classroom_id,
        first_viewed_at,
        last_viewed_at,
        view_count
    ) VALUES (
        p_material_id,
        caller_id,
        target_material.classroom_id,
        timezone('utc'::text, now()),
        timezone('utc'::text, now()),
        1
    )
    ON CONFLICT (material_id, student_id)
    DO UPDATE SET
        last_viewed_at = timezone('utc'::text, now()),
        view_count = material_views.view_count + 1;

    RETURN jsonb_build_object('success', true, 'material_id', p_material_id);
END;
$$;

-- 2.4 mark_material_unseen(p_material_id UUID)
CREATE OR REPLACE FUNCTION public.mark_material_unseen(p_material_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
    END IF;

    DELETE FROM public.material_views
    WHERE material_id = p_material_id AND student_id = caller_id;

    RETURN jsonb_build_object('success', true, 'material_id', p_material_id);
END;
$$;

-- 2.5 get_material_view_tracking(p_material_id UUID)
CREATE OR REPLACE FUNCTION public.get_material_view_tracking(p_material_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    mat RECORD;
    summary_data RECORD;
    student_records JSONB;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;
    
    SELECT m.*, c.teacher_id INTO mat
    FROM public.materials m
    JOIN public.classrooms c ON c.id = m.classroom_id
    WHERE m.id = p_material_id;

    IF mat.id IS NULL OR mat.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized: only the classroom teacher can access analytics.';
    END IF;

    -- Aggregate summary metrics
    SELECT 
        COUNT(cm.student_id)::INT AS enrolled_count,
        COUNT(mv.student_id)::INT AS seen_count,
        (COUNT(cm.student_id) - COUNT(mv.student_id))::INT AS unseen_count,
        CASE 
            WHEN COUNT(cm.student_id) = 0 THEN 0.0
            ELSE ROUND((COUNT(mv.student_id)::NUMERIC / COUNT(cm.student_id)::NUMERIC) * 100, 1)
        END AS engagement_pct
    INTO summary_data
    FROM public.classroom_members cm
    LEFT JOIN public.material_views mv 
        ON mv.material_id = p_material_id AND mv.student_id = cm.student_id
    WHERE cm.classroom_id = mat.classroom_id;

    -- Detailed student rows with seen/unseen status
    SELECT jsonb_agg(
        jsonb_build_object(
            'student_id', p.id,
            'full_name', p.full_name,
            'email', p.email,
            'avatar_url', p.avatar_url,
            'status', CASE WHEN mv.student_id IS NOT NULL THEN 'seen' ELSE 'unseen' END,
            'first_viewed_at', mv.first_viewed_at,
            'last_viewed_at', mv.last_viewed_at,
            'view_count', COALESCE(mv.view_count, 0)
        ) ORDER BY p.full_name ASC
    ) INTO student_records
    FROM public.classroom_members cm
    JOIN public.profiles p ON p.id = cm.student_id
    LEFT JOIN public.material_views mv 
        ON mv.material_id = p_material_id AND mv.student_id = cm.student_id
    WHERE cm.classroom_id = mat.classroom_id;

    RETURN jsonb_build_object(
        'material_id', mat.id,
        'title', mat.title,
        'published_at', COALESCE(mat.published_at, mat.created_at),
        'summary', jsonb_build_object(
            'enrolled_count', summary_data.enrolled_count,
            'seen_count', summary_data.seen_count,
            'unseen_count', summary_data.unseen_count,
            'engagement_pct', summary_data.engagement_pct
        ),
        'students', COALESCE(student_records, '[]'::jsonb)
    );
END;
$$;

-- 2.6 record_assignment_view(p_assignment_id UUID)
CREATE OR REPLACE FUNCTION public.record_assignment_view(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    caller_role TEXT;
    target_assign RECORD;
    is_member BOOLEAN;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
    END IF;

    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role != 'student' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_a_student');
    END IF;

    SELECT * INTO target_assign 
    FROM public.assignments 
    WHERE id = p_assignment_id;

    IF target_assign.id IS NULL OR (target_assign.published_at IS NULL AND COALESCE(target_assign.published, false) = false) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'assignment_not_published');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.classroom_members 
        WHERE classroom_id = target_assign.classroom_id AND student_id = caller_id
    ) INTO is_member;

    IF NOT is_member THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_enrolled');
    END IF;

    INSERT INTO public.assignment_views (
        assignment_id,
        student_id,
        first_viewed_at,
        last_viewed_at,
        view_count
    ) VALUES (
        p_assignment_id,
        caller_id,
        timezone('utc'::text, now()),
        timezone('utc'::text, now()),
        1
    )
    ON CONFLICT (assignment_id, student_id)
    DO UPDATE SET
        last_viewed_at = timezone('utc'::text, now()),
        view_count = assignment_views.view_count + 1;

    RETURN jsonb_build_object('success', true, 'assignment_id', p_assignment_id);
END;
$$;

-- 2.7 get_assignment_view_tracking(p_assignment_id UUID)
CREATE OR REPLACE FUNCTION public.get_assignment_view_tracking(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    assign RECORD;
    summary_data RECORD;
    student_records JSONB;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT a.*, c.teacher_id INTO assign
    FROM public.assignments a
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE a.id = p_assignment_id;

    IF assign.id IS NULL OR assign.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized: only the classroom teacher can access analytics.';
    END IF;

    SELECT 
        COUNT(cm.student_id)::INT AS enrolled_count,
        COUNT(av.student_id)::INT AS seen_count,
        (COUNT(cm.student_id) - COUNT(av.student_id))::INT AS unseen_count,
        CASE 
            WHEN COUNT(cm.student_id) = 0 THEN 0.0
            ELSE ROUND((COUNT(av.student_id)::NUMERIC / COUNT(cm.student_id)::NUMERIC) * 100, 1)
        END AS engagement_pct
    INTO summary_data
    FROM public.classroom_members cm
    LEFT JOIN public.assignment_views av 
        ON av.assignment_id = p_assignment_id AND av.student_id = cm.student_id
    WHERE cm.classroom_id = assign.classroom_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'student_id', p.id,
            'full_name', p.full_name,
            'email', p.email,
            'avatar_url', p.avatar_url,
            'status', CASE WHEN av.student_id IS NOT NULL THEN 'seen' ELSE 'unseen' END,
            'first_viewed_at', av.first_viewed_at,
            'last_viewed_at', av.last_viewed_at,
            'view_count', COALESCE(av.view_count, 0),
            'has_submitted', (sub.id IS NOT NULL),
            'submitted_at', sub.submitted_at,
            'is_late', COALESCE(sub.is_late, false),
            'marks_obtained', sub.marks_obtained,
            'grades_released', COALESCE(sub.grades_released, false)
        ) ORDER BY p.full_name ASC
    ) INTO student_records
    FROM public.classroom_members cm
    JOIN public.profiles p ON p.id = cm.student_id
    LEFT JOIN public.assignment_views av 
        ON av.assignment_id = p_assignment_id AND av.student_id = cm.student_id
    LEFT JOIN public.assignment_submissions sub 
        ON sub.assignment_id = p_assignment_id AND sub.student_id = cm.student_id
    WHERE cm.classroom_id = assign.classroom_id;

    RETURN jsonb_build_object(
        'assignment_id', assign.id,
        'title', assign.title,
        'max_marks', COALESCE(assign.max_marks, assign.points, 100),
        'due_at', COALESCE(assign.due_at, assign.due_date),
        'published_at', COALESCE(assign.published_at, assign.created_at),
        'summary', jsonb_build_object(
            'enrolled_count', summary_data.enrolled_count,
            'seen_count', summary_data.seen_count,
            'unseen_count', summary_data.unseen_count,
            'engagement_pct', summary_data.engagement_pct
        ),
        'students', COALESCE(student_records, '[]'::jsonb)
    );
END;
$$;

-- 2.8 submit_assignment(p_assignment_id, p_submission_text, p_file_url, p_file_name, p_file_size)
CREATE OR REPLACE FUNCTION public.submit_assignment(
    p_assignment_id UUID,
    p_submission_text TEXT DEFAULT NULL,
    p_file_url TEXT DEFAULT NULL,
    p_file_name TEXT DEFAULT NULL,
    p_file_size BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    target_assign RECORD;
    is_late_submission BOOLEAN;
    effective_due TIMESTAMPTZ;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit assignments.';
    END IF;

    SELECT * INTO target_assign 
    FROM public.assignments 
    WHERE id = p_assignment_id;

    IF target_assign.id IS NULL OR (target_assign.published_at IS NULL AND COALESCE(target_assign.published, false) = false) THEN
        RAISE EXCEPTION 'Assignment not found or has not been published.';
    END IF;

    IF NOT public.is_classroom_member(target_assign.classroom_id, caller_id) THEN
        RAISE EXCEPTION 'You are not enrolled in the classroom for this assignment.';
    END IF;

    -- Calculate late status
    effective_due := COALESCE(target_assign.due_at, target_assign.due_date);
    is_late_submission := (effective_due IS NOT NULL AND timezone('utc'::text, now()) > effective_due);

    -- Check if already graded
    IF EXISTS (
        SELECT 1 FROM public.assignment_submissions
        WHERE assignment_id = p_assignment_id AND student_id = caller_id AND graded_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Cannot modify submission after it has been graded by instructor.';
    END IF;

    INSERT INTO public.assignment_submissions (
        assignment_id,
        classroom_id,
        student_id,
        submission_text,
        file_path,
        file_url,
        file_name,
        file_size,
        submitted_at,
        is_late,
        status
    ) VALUES (
        p_assignment_id,
        target_assign.classroom_id,
        caller_id,
        p_submission_text,
        p_file_url,
        p_file_url,
        p_file_name,
        p_file_size,
        timezone('utc'::text, now()),
        is_late_submission,
        'submitted'
    )
    ON CONFLICT (assignment_id, student_id)
    DO UPDATE SET
        submission_text = COALESCE(EXCLUDED.submission_text, assignment_submissions.submission_text),
        file_path = COALESCE(EXCLUDED.file_path, assignment_submissions.file_path),
        file_url = COALESCE(EXCLUDED.file_url, assignment_submissions.file_url),
        file_name = COALESCE(EXCLUDED.file_name, assignment_submissions.file_name),
        file_size = COALESCE(EXCLUDED.file_size, assignment_submissions.file_size),
        submitted_at = timezone('utc'::text, now()),
        is_late = is_late_submission,
        status = 'submitted',
        updated_at = timezone('utc'::text, now());

    RETURN jsonb_build_object(
        'success', true,
        'is_late', is_late_submission
    );
END;
$$;

-- 2.9 grade_submission(p_submission_id, p_marks_obtained, p_feedback, p_release_grades)
CREATE OR REPLACE FUNCTION public.grade_submission(
    p_submission_id UUID,
    p_marks_obtained NUMERIC,
    p_feedback TEXT DEFAULT NULL,
    p_release_grades BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    sub RECORD;
    assign RECORD;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT s.*, c.teacher_id, a.title AS assignment_title, COALESCE(a.max_marks, a.points, 100) AS max_marks
    INTO sub
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE s.id = p_submission_id;

    IF sub.id IS NULL OR sub.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized: only the classroom teacher can grade submissions.';
    END IF;

    IF p_marks_obtained < 0 OR p_marks_obtained > sub.max_marks THEN
        RAISE EXCEPTION 'Marks obtained (%) must be between 0 and %', p_marks_obtained, sub.max_marks;
    END IF;

    UPDATE public.assignment_submissions
    SET grade = p_marks_obtained,
        marks_obtained = p_marks_obtained,
        feedback = p_feedback,
        graded_by = caller_id,
        graded_at = timezone('utc'::text, now()),
        grades_released = p_release_grades,
        status = 'graded',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_submission_id;

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', p_submission_id,
        'grades_released', p_release_grades
    );
END;
$$;

-- 2.10 release_assignment_grades(p_assignment_id)
CREATE OR REPLACE FUNCTION public.release_assignment_grades(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    assign RECORD;
    updated_count INT;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT a.*, c.teacher_id INTO assign
    FROM public.assignments a
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE a.id = p_assignment_id;

    IF assign.id IS NULL OR assign.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized: only the classroom teacher can release grades.';
    END IF;

    UPDATE public.assignment_submissions
    SET grades_released = true,
        updated_at = timezone('utc'::text, now())
    WHERE assignment_id = p_assignment_id AND graded_at IS NOT NULL AND grades_released = false;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'released_count', updated_count
    );
END;
$$;

-- Revoke execute from PUBLIC/anon and grant to authenticated
REVOKE ALL ON FUNCTION public.is_classroom_teacher(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_classroom_teacher(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_classroom_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_classroom_member(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.record_material_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_material_view(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_material_unseen(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_material_unseen(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_material_view_tracking(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_material_view_tracking(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.record_assignment_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_assignment_view(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_assignment_view_tracking(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assignment_view_tracking(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

REVOKE ALL ON FUNCTION public.grade_submission(UUID, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_submission(UUID, NUMERIC, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.release_assignment_grades(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_assignment_grades(UUID) TO authenticated;


-- ============================================================================
-- PART 3: ROW LEVEL SECURITY POLICIES (NO USING (TRUE))
-- ============================================================================

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- 3.0 CLASSROOMS & CLASSROOM_MEMBERS RLS
DROP POLICY IF EXISTS "classrooms_select_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select_enrolled_student" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select_by_join_code" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_insert_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_update_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_delete_teacher" ON public.classrooms;

CREATE POLICY "classrooms_select_teacher"
    ON public.classrooms FOR SELECT
    TO authenticated
    USING (teacher_id = auth.uid());

CREATE POLICY "classrooms_select_enrolled_student"
    ON public.classrooms FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classroom_members cm
            WHERE cm.classroom_id = classrooms.id AND cm.student_id = auth.uid()
        )
    );

CREATE POLICY "classrooms_insert_teacher"
    ON public.classrooms FOR INSERT
    TO authenticated
    WITH CHECK (
        teacher_id = auth.uid()
        AND public.get_user_role(auth.uid()) = 'teacher'
    );

CREATE POLICY "classrooms_update_teacher"
    ON public.classrooms FOR UPDATE
    TO authenticated
    USING (teacher_id = auth.uid())
    WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "classrooms_delete_teacher"
    ON public.classrooms FOR DELETE
    TO authenticated
    USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "classroom_members_select_teacher" ON public.classroom_members;
DROP POLICY IF EXISTS "classroom_members_select_student_self" ON public.classroom_members;
DROP POLICY IF EXISTS "classroom_members_delete_teacher" ON public.classroom_members;
DROP POLICY IF EXISTS "classroom_members_delete_student_self" ON public.classroom_members;

CREATE POLICY "classroom_members_select_teacher"
    ON public.classroom_members FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = classroom_members.classroom_id AND c.teacher_id = auth.uid()
        )
    );

CREATE POLICY "classroom_members_select_student_self"
    ON public.classroom_members FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

CREATE POLICY "classroom_members_delete_teacher"
    ON public.classroom_members FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = classroom_members.classroom_id AND c.teacher_id = auth.uid()
        )
    );

CREATE POLICY "classroom_members_delete_student_self"
    ON public.classroom_members FOR DELETE
    TO authenticated
    USING (student_id = auth.uid());

-- 3.1 MATERIALS RLS
DROP POLICY IF EXISTS "materials_select_teacher" ON public.materials;
DROP POLICY IF EXISTS "materials_select_enrolled_student" ON public.materials;
DROP POLICY IF EXISTS "materials_insert_teacher" ON public.materials;
DROP POLICY IF EXISTS "materials_update_teacher" ON public.materials;
DROP POLICY IF EXISTS "materials_delete_teacher" ON public.materials;

CREATE POLICY "materials_select_teacher"
    ON public.materials FOR SELECT
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "materials_select_enrolled_student"
    ON public.materials FOR SELECT
    TO authenticated
    USING (
        public.is_classroom_member(classroom_id, auth.uid())
        AND (published_at IS NOT NULL OR COALESCE(published, false) = true)
    );

CREATE POLICY "materials_insert_teacher"
    ON public.materials FOR INSERT
    TO authenticated
    WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "materials_update_teacher"
    ON public.materials FOR UPDATE
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()))
    WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "materials_delete_teacher"
    ON public.materials FOR DELETE
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

-- 3.2 ASSIGNMENTS RLS
DROP POLICY IF EXISTS "assignments_select_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_select_enrolled_student" ON public.assignments;
DROP POLICY IF EXISTS "assignments_insert_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_update_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_delete_teacher" ON public.assignments;

CREATE POLICY "assignments_select_teacher"
    ON public.assignments FOR SELECT
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "assignments_select_enrolled_student"
    ON public.assignments FOR SELECT
    TO authenticated
    USING (
        public.is_classroom_member(classroom_id, auth.uid())
        AND (published_at IS NOT NULL OR COALESCE(published, false) = true)
    );

CREATE POLICY "assignments_insert_teacher"
    ON public.assignments FOR INSERT
    TO authenticated
    WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "assignments_update_teacher"
    ON public.assignments FOR UPDATE
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()))
    WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "assignments_delete_teacher"
    ON public.assignments FOR DELETE
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

-- 3.3 MATERIAL_VIEWS RLS
DROP POLICY IF EXISTS "material_views_select_teacher" ON public.material_views;
DROP POLICY IF EXISTS "material_views_select_student_self" ON public.material_views;

CREATE POLICY "material_views_select_teacher"
    ON public.material_views FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.materials m
            WHERE m.id = material_views.material_id
            AND public.is_classroom_teacher(m.classroom_id, auth.uid())
        )
    );

CREATE POLICY "material_views_select_student_self"
    ON public.material_views FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

-- 3.4 ASSIGNMENT_VIEWS RLS
DROP POLICY IF EXISTS "assignment_views_select_teacher" ON public.assignment_views;
DROP POLICY IF EXISTS "assignment_views_select_student_self" ON public.assignment_views;

CREATE POLICY "assignment_views_select_teacher"
    ON public.assignment_views FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments a
            WHERE a.id = assignment_views.assignment_id
            AND public.is_classroom_teacher(a.classroom_id, auth.uid())
        )
    );

CREATE POLICY "assignment_views_select_student_self"
    ON public.assignment_views FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

-- 3.5 ASSIGNMENT_SUBMISSIONS RLS & GRADE PRIVACY
DROP POLICY IF EXISTS "assignment_submissions_select_teacher" ON public.assignment_submissions;
DROP POLICY IF EXISTS "assignment_submissions_select_student_self" ON public.assignment_submissions;
DROP POLICY IF EXISTS "assignment_submissions_update_teacher_grading" ON public.assignment_submissions;
DROP POLICY IF EXISTS "assignment_submissions_insert_student_self" ON public.assignment_submissions;
DROP POLICY IF EXISTS "assignment_submissions_update_student_self" ON public.assignment_submissions;

CREATE POLICY "assignment_submissions_select_teacher"
    ON public.assignment_submissions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments a
            WHERE a.id = assignment_submissions.assignment_id
            AND public.is_classroom_teacher(a.classroom_id, auth.uid())
        )
    );

-- Student selects own submission (grades privacy handled via secure view or client RPC)
CREATE POLICY "assignment_submissions_select_student_self"
    ON public.assignment_submissions FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

-- Student insert/update before grading
CREATE POLICY "assignment_submissions_insert_student_self"
    ON public.assignment_submissions FOR INSERT
    TO authenticated
    WITH CHECK (
        student_id = auth.uid()
        AND (
            (classroom_id IS NOT NULL AND public.is_classroom_member(classroom_id, auth.uid()))
            OR EXISTS (
                SELECT 1 FROM public.assignments a
                WHERE a.id = assignment_submissions.assignment_id
                AND public.is_classroom_member(a.classroom_id, auth.uid())
            )
        )
    );

CREATE POLICY "assignment_submissions_update_student_self"
    ON public.assignment_submissions FOR UPDATE
    TO authenticated
    USING (student_id = auth.uid() AND graded_at IS NULL)
    WITH CHECK (student_id = auth.uid() AND graded_at IS NULL);

CREATE POLICY "assignment_submissions_update_teacher_grading"
    ON public.assignment_submissions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments a
            WHERE a.id = assignment_submissions.assignment_id
            AND public.is_classroom_teacher(a.classroom_id, auth.uid())
        )
    );


-- ============================================================================
-- PART 4: SECURE STORAGE BUCKETS AND STORAGE.OBJECTS POLICIES
-- ============================================================================

-- 4.1 CREATE OR UPSERT THE FOUR BUCKETS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    (
        'classroom-materials',
        'classroom-materials',
        false,
        10485760, -- 10 MB
        ARRAY[
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpeg'
        ]
    ),
    (
        'assignment-attachments',
        'assignment-attachments',
        false,
        10485760, -- 10 MB
        ARRAY[
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpeg'
        ]
    ),
    (
        'student-submissions',
        'student-submissions',
        false,
        10485760, -- 10 MB
        ARRAY[
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpeg'
        ]
    ),
    (
        'profile-avatars',
        'profile-avatars',
        true,
        5242880, -- 5 MB
        ARRAY[
            'image/png',
            'image/jpeg',
            'image/webp'
        ]
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4.2 CLEANUP EXISTING STORAGE POLICIES
DROP POLICY IF EXISTS "materials_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_select_v2" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_insert_v2" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_update_v2" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_delete_v2" ON storage.objects;

DROP POLICY IF EXISTS "assignment_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "assignment_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "assignment_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "assignment_attachments_delete" ON storage.objects;

DROP POLICY IF EXISTS "submissions_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "submissions_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "submissions_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "submissions_storage_delete" ON storage.objects;

DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;

-- 4.3 CLASSROOM-MATERIALS POLICIES: {classroom_id}/{material_id}/{filename}
CREATE POLICY "materials_storage_select_v3"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND (
        -- Classroom teacher has full read
        public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
        -- Enrolled student has read only if material is published
        OR (
            public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.materials m
                WHERE (m.file_path = name OR m.file_url = name)
                  AND (m.published_at IS NOT NULL OR COALESCE(m.published, false) = true)
                  AND m.classroom_id = ((storage.foldername(name))[1])::uuid
            )
        )
    )
);

CREATE POLICY "materials_storage_insert_v3"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "materials_storage_update_v3"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "materials_storage_delete_v3"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- 4.4 ASSIGNMENT-ATTACHMENTS POLICIES: {classroom_id}/{assignment_id}/{filename}
CREATE POLICY "assignment_attachments_select_v3"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'assignment-attachments'
    AND (
        public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
        OR (
            public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.assignments a
                WHERE (a.attachment_url = name OR a.attachment_url LIKE ('%' || name))
                  AND (a.published_at IS NOT NULL OR COALESCE(a.published, false) = true)
                  AND a.classroom_id = ((storage.foldername(name))[1])::uuid
            )
        )
    )
);

CREATE POLICY "assignment_attachments_insert_v3"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'assignment-attachments'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "assignment_attachments_update_v3"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'assignment-attachments'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "assignment_attachments_delete_v3"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'assignment-attachments'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- 4.5 STUDENT-SUBMISSIONS POLICIES: {classroom_id}/{assignment_id}/{student_id}/{filename}
CREATE POLICY "submissions_storage_select_v3"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND (
        -- Classroom teacher reads all submissions in their classroom
        public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
        -- Student reads only their own submission folder
        OR ((storage.foldername(name))[3] = auth.uid()::text)
    )
);

CREATE POLICY "submissions_storage_insert_v3"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'student-submissions'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "submissions_storage_update_v3"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "submissions_storage_delete_v3"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- 4.6 PROFILE-AVATARS POLICIES: {user_id}/{filename}
CREATE POLICY "avatars_public_select_v3"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-avatars');

CREATE POLICY "avatars_user_insert_v3"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "avatars_user_update_v3"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "avatars_user_delete_v3"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
