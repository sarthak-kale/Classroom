-- ============================================================================
-- ClassFlow Migration 009: Teacher Material Seen/Unseen Tracking Enhancements
-- ============================================================================

-- 1. Ensure Table Columns & Constraints
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

CREATE INDEX IF NOT EXISTS idx_material_views_mat_stu ON public.material_views(material_id, student_id);
CREATE INDEX IF NOT EXISTS idx_material_views_classroom ON public.material_views(classroom_id);

-- 2. Enhanced record_material_view RPC
-- Strictly validates authenticated user, student role, membership, publication status
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

    -- Validate user role: teachers cannot record student views
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role = 'teacher' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_a_student');
    END IF;

    -- Validate material exists and is published
    SELECT * INTO target_material 
    FROM public.materials 
    WHERE id = p_material_id;

    IF target_material.id IS NULL OR (target_material.published_at IS NULL AND COALESCE(target_material.published, false) = false) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'material_not_published_or_found');
    END IF;

    -- Validate caller is an active enrolled student of the material's classroom
    SELECT EXISTS (
        SELECT 1 FROM public.classroom_members 
        WHERE classroom_id = target_material.classroom_id AND student_id = caller_id
    ) INTO is_member;

    IF NOT is_member THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_enrolled');
    END IF;

    -- Atomic upsert: create first view or update last viewed timestamp and increment count
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

-- Overload with classroom_id for backwards compatibility
CREATE OR REPLACE FUNCTION public.record_material_view(p_classroom_id UUID, p_material_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.record_material_view(p_material_id);
END;
$$;

-- 3. Enhanced get_material_view_tracking RPC
-- Returns Material Info, Summary Cards data, and Student-by-Student Records
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
    
    -- Fetch material and verify caller is the classroom teacher
    SELECT 
        m.*, 
        c.teacher_id, 
        c.name AS classroom_name 
    INTO mat
    FROM public.materials m
    JOIN public.classrooms c ON c.id = m.classroom_id
    WHERE m.id = p_material_id;

    IF mat.id IS NULL OR mat.teacher_id != caller_id THEN
        RAISE EXCEPTION 'Unauthorized: only the classroom teacher can access material tracking.';
    END IF;

    -- Aggregate summary metrics for eligible enrolled students
    -- Teachers and non-students are excluded from student counts
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
    JOIN public.profiles p ON p.id = cm.student_id
    LEFT JOIN public.material_views mv 
        ON mv.material_id = p_material_id AND mv.student_id = cm.student_id
    WHERE cm.classroom_id = mat.classroom_id
      AND cm.student_id != mat.teacher_id
      AND (p.role = 'student' OR p.role IS NULL);

    -- Detailed student rows with seen/unseen status
    SELECT jsonb_agg(
        jsonb_build_object(
            'student_id', p.id,
            'full_name', COALESCE(NULLIF(trim(p.full_name), ''), 'Student'),
            'email', COALESCE(p.email, ''),
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
    WHERE cm.classroom_id = mat.classroom_id
      AND cm.student_id != mat.teacher_id
      AND (p.role = 'student' OR p.role IS NULL);

    RETURN jsonb_build_object(
        'material_id', mat.id,
        'title', mat.title,
        'file_name', COALESCE(mat.file_name, split_part(COALESCE(mat.file_path, mat.file_url, ''), '/', -1)),
        'classroom_name', mat.classroom_name,
        'published_at', COALESCE(mat.published_at, mat.created_at),
        'summary', jsonb_build_object(
            'enrolled_count', COALESCE(summary_data.enrolled_count, 0),
            'seen_count', COALESCE(summary_data.seen_count, 0),
            'unseen_count', COALESCE(summary_data.unseen_count, 0),
            'engagement_pct', COALESCE(summary_data.engagement_pct, 0.0)
        ),
        'students', COALESCE(student_records, '[]'::jsonb)
    );
END;
$$;

-- 4. Secure Row-Level Security Policies
ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_views_select_teacher" ON public.material_views;
DROP POLICY IF EXISTS "material_views_select_student_self" ON public.material_views;

-- Teachers can select view tracking only for materials in their classrooms
CREATE POLICY "material_views_select_teacher"
    ON public.material_views FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.materials m
            JOIN public.classrooms c ON c.id = m.classroom_id
            WHERE m.id = material_views.material_id
            AND c.teacher_id = auth.uid()
        )
    );

-- Students can only select their own view records
CREATE POLICY "material_views_select_student_self"
    ON public.material_views FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());
