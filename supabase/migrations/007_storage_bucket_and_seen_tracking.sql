-- Migration 007: Supabase Storage Configuration and Seen/Unseen Material Tracking
-- ClassFlow Learning Management System

-- ============================================================================
-- 1. IDEMPOTENT STORAGE BUCKET CREATION
-- Ensures 'classroom-materials' bucket is created and configured as private
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'classroom-materials',
    'classroom-materials',
    false,
    52428800, -- 50 MB
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'text/plain'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Function to allow safe on-demand bucket provisioning by client RPC if needed
CREATE OR REPLACE FUNCTION public.ensure_storage_bucket(
    p_bucket_id TEXT DEFAULT 'classroom-materials',
    p_public BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        p_bucket_id,
        p_bucket_id,
        p_public,
        52428800,
        ARRAY[
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
            'text/plain'
        ]
    )
    ON CONFLICT (id) DO UPDATE SET
        public = EXCLUDED.public,
        file_size_limit = 52428800;
    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_storage_bucket(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_storage_bucket(TEXT, BOOLEAN) TO anon;

-- ============================================================================
-- 2. SECURE STORAGE POLICIES FOR CLASSROOM MATERIALS
-- Path convention: {classroom_id}/{teacher_id}/{unique_filename}
-- Teachers: full upload/update/delete/read access to their classroom folders
-- Students: read-only access to published materials for classrooms they joined
-- ============================================================================
DROP POLICY IF EXISTS "materials_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_select_v2" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_insert_v2" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_update_v2" ON storage.objects;
DROP POLICY IF EXISTS "materials_storage_delete_v2" ON storage.objects;

-- Teachers can upload into their classroom folder
CREATE POLICY "materials_storage_insert_v2"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- Teachers can update their uploaded files
CREATE POLICY "materials_storage_update_v2"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- Teachers can delete their classroom files
CREATE POLICY "materials_storage_delete_v2"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- Teachers can read all their classroom files.
-- Enrolled students can read only published files in classrooms they belong to.
CREATE POLICY "materials_storage_select_v2"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND (
        -- Classroom teacher
        public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
        -- OR enrolled student accessing published material
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

-- ============================================================================
-- 3. SCHEMA ALIGNMENT FOR MATERIALS TABLE
-- Ensures columns (teacher_id, file_path, type, published) exist and stay synced
-- ============================================================================
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT true;

-- Backfill missing teacher_id from classrooms table
UPDATE public.materials m
SET teacher_id = c.teacher_id
FROM public.classrooms c
WHERE m.classroom_id = c.id AND m.teacher_id IS NULL;

-- Backfill file_path from file_url
UPDATE public.materials
SET file_path = file_url
WHERE file_path IS NULL AND file_url IS NOT NULL;

-- Backfill file_url from file_path
UPDATE public.materials
SET file_url = file_path
WHERE file_url IS NULL AND file_path IS NOT NULL;

-- Backfill type from file_type
UPDATE public.materials
SET type = COALESCE(file_type, 'application/pdf')
WHERE type IS NULL;

-- Backfill file_type from type
UPDATE public.materials
SET file_type = type
WHERE file_type IS NULL AND type IS NOT NULL;

-- Backfill published from published_at
UPDATE public.materials
SET published = (published_at IS NOT NULL)
WHERE published IS NULL;

-- Synchronization trigger to guarantee dual column compatibility
CREATE OR REPLACE FUNCTION public.sync_material_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.file_path IS NOT NULL AND NEW.file_url IS NULL THEN
        NEW.file_url := NEW.file_path;
    ELSIF NEW.file_url IS NOT NULL AND NEW.file_path IS NULL THEN
        NEW.file_path := NEW.file_url;
    END IF;

    IF NEW.type IS NOT NULL AND NEW.file_type IS NULL THEN
        NEW.file_type := NEW.type;
    ELSIF NEW.file_type IS NOT NULL AND NEW.type IS NULL THEN
        NEW.type := NEW.file_type;
    END IF;

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

-- ============================================================================
-- 4. SEEN/UNSEEN TRACKING RPC FUNCTIONS
-- record_material_view: atomic insertion / increment of views by students
-- mark_material_unseen: optional student reset
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
        -- Teacher views are not tracked as student seen
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

GRANT EXECUTE ON FUNCTION public.record_material_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_material_unseen(UUID) TO authenticated;
