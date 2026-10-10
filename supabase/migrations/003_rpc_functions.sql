-- Migration 003: Core RPC Functions
-- ClassFlow Classroom Management Platform

-- ============================================================================
-- 1. UNAMBIGUOUS JOIN CODE GENERATION
-- Alphabet excludes confusing characters: 0, 1, I, O, L
-- Format: CF-XXXXXX
-- ============================================================================
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

-- Alter table to set default classroom join code
ALTER TABLE public.classrooms 
    ALTER COLUMN join_code SET DEFAULT public.generate_unique_classroom_code();

-- ============================================================================
-- 2. JOIN CLASSROOM RPC
-- Validates code, student role, archived state, duplicates, and returns classroom
-- ============================================================================
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
    new_member_id UUID;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to join a classroom.';
    END IF;

    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role IS NULL THEN
        RAISE EXCEPTION 'User profile not found. Please refresh your profile and try again.';
    END IF;
    IF caller_role != 'student' THEN
        RAISE EXCEPTION 'Only students can join classrooms using a join code.';
    END IF;

    cleaned_code := upper(trim(COALESCE(code_input, '')));
    cleaned_code := regexp_replace(cleaned_code, '\s+', '', 'g');
    IF length(cleaned_code) = 0 THEN
        RAISE EXCEPTION 'Classroom join code cannot be empty.';
    END IF;

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

    IF target_classroom.is_archived THEN
        RAISE EXCEPTION 'This classroom has been archived and is not accepting new students.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.classroom_members 
        WHERE classroom_id = target_classroom.id AND student_id = caller_id
    ) THEN
        RAISE EXCEPTION 'You have already joined this classroom.';
    END IF;

    INSERT INTO public.classroom_members (classroom_id, student_id, joined_at)
    VALUES (target_classroom.id, caller_id, timezone('utc'::text, now()))
    RETURNING id INTO new_member_id;

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

-- ============================================================================
-- 3. RECORD MATERIAL VIEW RPC (ATOMIC & IDEMPOTENT)
-- Never overwrites first_viewed_at, increments view_count, ignores teachers
-- ============================================================================
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
        -- Teacher views are not tracked
        RETURN jsonb_build_object('success', false, 'reason', 'not_a_student');
    END IF;

    SELECT * INTO target_material 
    FROM public.materials 
    WHERE id = p_material_id;

    IF target_material.id IS NULL OR target_material.published_at IS NULL THEN
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
        first_viewed_at,
        last_viewed_at,
        view_count
    ) VALUES (
        p_material_id,
        caller_id,
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

-- ============================================================================
-- 4. RECORD ASSIGNMENT VIEW RPC (ATOMIC & IDEMPOTENT)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_assignment_view(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID;
    caller_role TEXT;
    target_assignment RECORD;
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

    SELECT * INTO target_assignment 
    FROM public.assignments 
    WHERE id = p_assignment_id;

    IF target_assignment.id IS NULL OR target_assignment.published_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'assignment_not_published_or_found');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.classroom_members 
        WHERE classroom_id = target_assignment.classroom_id AND student_id = caller_id
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

-- ============================================================================
-- 5. SUBMIT ASSIGNMENT RPC
-- Validates membership, locks when graded, calculates late flag server-side
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_assignment(
    p_assignment_id UUID,
    p_submission_text TEXT,
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
    caller_role TEXT;
    target_assignment RECORD;
    is_member BOOLEAN;
    existing_sub RECORD;
    is_late_calc BOOLEAN;
    sub_id UUID;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role != 'student' THEN
        RAISE EXCEPTION 'Only students can submit assignments.';
    END IF;

    SELECT * INTO target_assignment 
    FROM public.assignments 
    WHERE id = p_assignment_id;

    IF target_assignment.id IS NULL OR target_assignment.published_at IS NULL THEN
        RAISE EXCEPTION 'Assignment not found or not published.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.classroom_members 
        WHERE classroom_id = target_assignment.classroom_id AND student_id = caller_id
    ) INTO is_member;

    IF NOT is_member THEN
        RAISE EXCEPTION 'You are not enrolled in this classroom.';
    END IF;

    -- Check if existing submission has already been graded
    SELECT * INTO existing_sub 
    FROM public.assignment_submissions 
    WHERE assignment_id = p_assignment_id AND student_id = caller_id;

    IF existing_sub.id IS NOT NULL AND existing_sub.graded_at IS NOT NULL THEN
        RAISE EXCEPTION 'This submission has already been graded and cannot be modified.';
    END IF;

    -- Compute late flag server-side
    is_late_calc := (target_assignment.due_at IS NOT NULL AND timezone('utc'::text, now()) > target_assignment.due_at);

    INSERT INTO public.assignment_submissions (
        assignment_id,
        student_id,
        submission_text,
        file_url,
        file_name,
        file_size,
        submitted_at,
        is_late,
        grades_released
    ) VALUES (
        p_assignment_id,
        caller_id,
        p_submission_text,
        p_file_url,
        p_file_name,
        p_file_size,
        timezone('utc'::text, now()),
        is_late_calc,
        false
    )
    ON CONFLICT (assignment_id, student_id)
    DO UPDATE SET
        submission_text = EXCLUDED.submission_text,
        file_url = EXCLUDED.file_url,
        file_name = EXCLUDED.file_name,
        file_size = EXCLUDED.file_size,
        submitted_at = EXCLUDED.submitted_at,
        is_late = EXCLUDED.is_late
    RETURNING id INTO sub_id;

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', sub_id,
        'is_late', is_late_calc
    );
END;
$$;

-- ============================================================================
-- 6. GRADE SUBMISSION RPC
-- Validates teacher ownership, enforces marks <= max_marks, sets graded_by/at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.grade_submission(
    p_submission_id UUID,
    p_marks_obtained NUMERIC,
    p_feedback TEXT,
    p_release_grades BOOLEAN DEFAULT false
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
    c_teacher_id UUID;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO sub FROM public.assignment_submissions WHERE id = p_submission_id;
    IF sub.id IS NULL THEN
        RAISE EXCEPTION 'Submission not found.';
    END IF;

    SELECT a.*, c.teacher_id INTO assign
    FROM public.assignments a
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE a.id = sub.assignment_id;

    IF assign.teacher_id != caller_id THEN
        RAISE EXCEPTION 'You are not authorized to grade submissions for this classroom.';
    END IF;

    IF p_marks_obtained < 0 OR p_marks_obtained > assign.max_marks THEN
        RAISE EXCEPTION 'Marks obtained (%) must be between 0 and %.', p_marks_obtained, assign.max_marks;
    END IF;

    UPDATE public.assignment_submissions
    SET marks_obtained = p_marks_obtained,
        feedback = p_feedback,
        graded_by = caller_id,
        graded_at = timezone('utc'::text, now()),
        grades_released = p_release_grades,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_submission_id;

    -- Notification if grades released
    IF p_release_grades THEN
        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            related_id,
            classroom_id,
            idempotency_key
        ) VALUES (
            sub.student_id,
            'Grade Released: ' || assign.title,
            'Your submission for "' || assign.title || '" has been graded: ' || p_marks_obtained || ' / ' || assign.max_marks,
            'grade_released',
            assign.id,
            assign.classroom_id,
            'grade_released_' || sub.student_id || '_' || assign.id || '_' || now()::date
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', p_submission_id,
        'marks_obtained', p_marks_obtained,
        'grades_released', p_release_grades
    );
END;
$$;

-- ============================================================================
-- 7. RELEASE ALL ASSIGNMENT GRADES RPC
-- ============================================================================
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
    sub RECORD;
BEGIN
    caller_id := auth.uid();
    SELECT a.*, c.teacher_id INTO assign
    FROM public.assignments a
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE a.id = p_assignment_id;

    IF assign.id IS NULL OR assign.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized to release grades for this assignment.';
    END IF;

    UPDATE public.assignment_submissions
    SET grades_released = true,
        updated_at = timezone('utc'::text, now())
    WHERE assignment_id = p_assignment_id AND graded_at IS NOT NULL AND grades_released = false;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- Send notifications for newly released grades
    FOR sub IN 
        SELECT student_id, marks_obtained 
        FROM public.assignment_submissions 
        WHERE assignment_id = p_assignment_id AND graded_at IS NOT NULL
    LOOP
        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            related_id,
            classroom_id,
            idempotency_key
        ) VALUES (
            sub.student_id,
            'Grade Released: ' || assign.title,
            'Your grade for "' || assign.title || '" is now available.',
            'grade_released',
            p_assignment_id,
            assign.classroom_id,
            'grade_release_batch_' || sub.student_id || '_' || p_assignment_id
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'released_count', updated_count
    );
END;
$$;

-- ============================================================================
-- 8. VIEW TRACKING RPCs (MATERIAL & ASSIGNMENT)
-- Returns exact enrolled count, seen count, unseen count, engagement %, and student rows
-- ============================================================================
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
    
    SELECT m.*, c.teacher_id INTO mat
    FROM public.materials m
    JOIN public.classrooms c ON c.id = m.classroom_id
    WHERE m.id = p_material_id;

    IF mat.id IS NULL OR mat.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized or material not found.';
    END IF;

    -- Compute enrolled, seen, unseen stats for currently enrolled students
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

    -- Detailed student rows
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
        'published_at', mat.published_at,
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

    SELECT a.*, c.teacher_id INTO assign
    FROM public.assignments a
    JOIN public.classrooms c ON c.id = a.classroom_id
    WHERE a.id = p_assignment_id;

    IF assign.id IS NULL OR assign.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized or assignment not found.';
    END IF;

    -- Compute enrolled, seen, unseen stats for currently enrolled students
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

    -- Detailed student rows including view and submission status
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
        'max_marks', assign.max_marks,
        'due_at', assign.due_at,
        'published_at', assign.published_at,
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

-- Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.join_classroom(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_material_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_assignment_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grade_submission(UUID, NUMERIC, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_assignment_grades(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_material_view_tracking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignment_view_tracking(UUID) TO authenticated;
