-- Migration 002: Helper Functions and Row Level Security (RLS)
-- ClassFlow Classroom Management Platform

-- ============================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER with safe search_path to avoid recursion)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_role(u_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = u_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_classroom_teacher(c_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.classrooms
        WHERE id = c_id AND teacher_id = u_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_classroom_member(c_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.classroom_members
        WHERE classroom_id = c_id AND student_id = u_id
    );
$$;

-- Restrict function execution to authenticated users
REVOKE ALL ON FUNCTION public.get_user_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_classroom_teacher(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_classroom_teacher(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_classroom_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_classroom_member(UUID, UUID) TO authenticated;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. PROFILES POLICIES
-- Users read their own profile;
-- Teachers read profiles of students in their classrooms;
-- Students read profiles of teachers of their enrolled classrooms.
-- Users update their own profile.
-- ============================================================================
CREATE POLICY "profiles_select_own"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "profiles_select_teacher_reading_students"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classroom_members cm
            JOIN public.classrooms c ON c.id = cm.classroom_id
            WHERE c.teacher_id = auth.uid() AND cm.student_id = profiles.id
        )
    );

CREATE POLICY "profiles_select_student_reading_teachers"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classrooms c
            JOIN public.classroom_members cm ON cm.classroom_id = c.id
            WHERE cm.student_id = auth.uid() AND c.teacher_id = profiles.id
        )
    );

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================================================
-- 2. CLASSROOMS POLICIES
-- Teachers can manage their classrooms.
-- Students can read classrooms they are enrolled in (and not archived, or read status).
-- ============================================================================
CREATE POLICY "classrooms_select_teacher"
    ON public.classrooms FOR SELECT
    TO authenticated
    USING (teacher_id = auth.uid());

CREATE POLICY "classrooms_select_enrolled_student"
    ON public.classrooms FOR SELECT
    TO authenticated
    USING (public.is_classroom_member(id, auth.uid()));

CREATE POLICY "classrooms_insert_teacher"
    ON public.classrooms FOR INSERT
    TO authenticated
    WITH CHECK (teacher_id = auth.uid() AND public.get_user_role(auth.uid()) = 'teacher');

CREATE POLICY "classrooms_update_teacher"
    ON public.classrooms FOR UPDATE
    TO authenticated
    USING (teacher_id = auth.uid())
    WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "classrooms_delete_teacher"
    ON public.classrooms FOR DELETE
    TO authenticated
    USING (teacher_id = auth.uid());

-- ============================================================================
-- 3. CLASSROOM_MEMBERS POLICIES
-- Teacher can view members in their classrooms.
-- Teacher can delete (remove) members from their classrooms.
-- Student can view their own membership rows.
-- Student can leave classroom (delete own membership).
-- Student insertion is handled via join_classroom RPC (SECURITY DEFINER).
-- ============================================================================
CREATE POLICY "classroom_members_select_teacher"
    ON public.classroom_members FOR SELECT
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "classroom_members_select_student_self"
    ON public.classroom_members FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

CREATE POLICY "classroom_members_delete_teacher"
    ON public.classroom_members FOR DELETE
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "classroom_members_delete_student_self"
    ON public.classroom_members FOR DELETE
    TO authenticated
    USING (student_id = auth.uid());

-- ============================================================================
-- 4. MATERIALS POLICIES
-- Teacher can full access to materials in their classrooms.
-- Enrolled students can read only published materials.
-- ============================================================================
CREATE POLICY "materials_select_teacher"
    ON public.materials FOR SELECT
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "materials_select_enrolled_student"
    ON public.materials FOR SELECT
    TO authenticated
    USING (
        public.is_classroom_member(classroom_id, auth.uid())
        AND published_at IS NOT NULL
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

-- ============================================================================
-- 5. MATERIAL_VIEWS POLICIES
-- Teachers can view all material_views for materials in their classrooms.
-- Students can only view their own view records.
-- Direct insert/update is prevented (must go through record_material_view RPC).
-- ============================================================================
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

-- ============================================================================
-- 6. ASSIGNMENTS POLICIES
-- Teachers can manage assignments in their classrooms.
-- Students can select published assignments in classrooms they belong to.
-- ============================================================================
CREATE POLICY "assignments_select_teacher"
    ON public.assignments FOR SELECT
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "assignments_select_enrolled_student"
    ON public.assignments FOR SELECT
    TO authenticated
    USING (
        public.is_classroom_member(classroom_id, auth.uid())
        AND published_at IS NOT NULL
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

-- ============================================================================
-- 7. ASSIGNMENT_VIEWS POLICIES
-- Teachers can view tracking records for assignments in their classrooms.
-- Students can only view their own records.
-- Direct insert/update is prevented (handled via record_assignment_view RPC).
-- ============================================================================
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

-- ============================================================================
-- 8. ASSIGNMENT_SUBMISSIONS POLICIES
-- Teachers can select and grade submissions for their classrooms.
-- Students can select their own submission. (Marks and feedback are visible
-- only if grades_released is true, handled via view or SELECT query / client masking).
-- Students can insert/update their own submissions via submit_assignment RPC or directly
-- before grading.
-- ============================================================================
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

CREATE POLICY "assignment_submissions_select_student_self"
    ON public.assignment_submissions FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

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
-- 9. ANNOUNCEMENTS POLICIES
-- Teachers can create/update/delete announcements in their classrooms.
-- Enrolled students and teachers can select announcements.
-- ============================================================================
CREATE POLICY "announcements_select_teacher"
    ON public.announcements FOR SELECT
    TO authenticated
    USING (public.is_classroom_teacher(classroom_id, auth.uid()));

CREATE POLICY "announcements_select_student"
    ON public.announcements FOR SELECT
    TO authenticated
    USING (public.is_classroom_member(classroom_id, auth.uid()));

CREATE POLICY "announcements_insert_teacher"
    ON public.announcements FOR INSERT
    TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND public.is_classroom_teacher(classroom_id, auth.uid())
    );

CREATE POLICY "announcements_update_teacher"
    ON public.announcements FOR UPDATE
    TO authenticated
    USING (
        author_id = auth.uid()
        AND public.is_classroom_teacher(classroom_id, auth.uid())
    )
    WITH CHECK (
        author_id = auth.uid()
        AND public.is_classroom_teacher(classroom_id, auth.uid())
    );

CREATE POLICY "announcements_delete_teacher"
    ON public.announcements FOR DELETE
    TO authenticated
    USING (
        author_id = auth.uid()
        AND public.is_classroom_teacher(classroom_id, auth.uid())
    );

-- ============================================================================
-- 10. NOTIFICATIONS POLICIES
-- Users can only read and update their own notifications.
-- Insertions are done via database triggers.
-- ============================================================================
CREATE POLICY "notifications_select_own"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own"
    ON public.notifications FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
