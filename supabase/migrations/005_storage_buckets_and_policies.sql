-- Migration 005: Storage Buckets and Access Control Policies
-- ClassFlow Classroom Management Platform

-- 1. CREATE STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('classroom-materials', 'classroom-materials', false, 52428800, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp', 'text/plain']),
    ('assignment-attachments', 'assignment-attachments', false, 52428800, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp', 'text/plain']),
    ('student-submissions', 'student-submissions', false, 52428800, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/zip']),
    ('profile-avatars', 'profile-avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 2. PROFILE-AVATARS POLICIES
-- Public read; authenticated users write only to their own folder {user_id}/{filename}
-- ============================================================================
CREATE POLICY "avatars_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-avatars');

CREATE POLICY "avatars_user_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "avatars_user_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "avatars_user_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- 3. CLASSROOM-MATERIALS POLICIES
-- Path format: {classroom_id}/{material_id}/{filename}
-- Teachers of the classroom can upload/update/delete.
-- Enrolled students and teacher can read.
-- ============================================================================
CREATE POLICY "materials_storage_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND (
        public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
        OR public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
    )
);

CREATE POLICY "materials_storage_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "materials_storage_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'classroom-materials'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- ============================================================================
-- 4. ASSIGNMENT-ATTACHMENTS POLICIES
-- Path format: {classroom_id}/{assignment_id}/{filename}
-- Teachers can insert/update/delete.
-- Enrolled students and teachers can select.
-- ============================================================================
CREATE POLICY "assignment_attachments_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'assignment-attachments'
    AND (
        public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
        OR public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
    )
);

CREATE POLICY "assignment_attachments_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'assignment-attachments'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "assignment_attachments_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'assignment-attachments'
    AND public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- ============================================================================
-- 5. STUDENT-SUBMISSIONS POLICIES
-- Path format: {classroom_id}/{assignment_id}/{student_id}/{filename}
-- Students can insert into their own student_id folder.
-- Teachers of the classroom can read all submissions in the classroom.
-- The student can read their own submission.
-- ============================================================================
CREATE POLICY "submissions_storage_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND (
        -- Classroom teacher can read
        public.is_classroom_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
        -- Or the student who uploaded it
        OR ((storage.foldername(name))[3] = auth.uid()::text)
    )
);

CREATE POLICY "submissions_storage_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'student-submissions'
    -- The folder student_id must match authenticated user
    AND (storage.foldername(name))[3] = auth.uid()::text
    -- And student must belong to the classroom
    AND public.is_classroom_member(((storage.foldername(name))[1])::uuid, auth.uid())
);
