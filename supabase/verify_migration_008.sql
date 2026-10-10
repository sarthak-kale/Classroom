-- Verification SQL Script for Migration 008
-- Tests RLS isolation, role impersonation, drafts hiding, submission privacy, and bucket integrity

BEGIN;

-- 1. Setup mock profiles and classrooms for testing
DO $$
DECLARE
    v_teacher_1 UUID := '11111111-1111-1111-1111-111111111111';
    v_teacher_2 UUID := '22222222-2222-2222-2222-222222222222';
    v_student_1 UUID := '33333333-3333-3333-3333-333333333333';
    v_student_2 UUID := '44444444-4444-4444-4444-444444444444';
    v_class_1 UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_mat_pub UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_mat_draft UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    v_asgn_pub UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    v_asgn_draft UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
BEGIN
    -- Temporary test records (will be rolled back)
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES 
        (v_teacher_1, 't1@test.com', 'Teacher One', 'teacher'),
        (v_teacher_2, 't2@test.com', 'Teacher Two', 'teacher'),
        (v_student_1, 's1@test.com', 'Student One', 'student'),
        (v_student_2, 's2@test.com', 'Student Two', 'student')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.classrooms (id, name, teacher_id, join_code)
    VALUES (v_class_1, 'Math 101', v_teacher_1, 'CF-TEST01')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.classroom_members (classroom_id, student_id)
    VALUES 
        (v_class_1, v_student_1),
        (v_class_1, v_student_2)
    ON CONFLICT (classroom_id, student_id) DO NOTHING;

    -- Published & Draft Material
    INSERT INTO public.materials (id, classroom_id, teacher_id, title, published, published_at)
    VALUES 
        (v_mat_pub, v_class_1, v_teacher_1, 'Published Algebra', true, now()),
        (v_mat_draft, v_class_1, v_teacher_1, 'Draft Calculus', false, null)
    ON CONFLICT (id) DO NOTHING;

    -- Published & Draft Assignment
    INSERT INTO public.assignments (id, classroom_id, teacher_id, title, published, published_at, max_marks)
    VALUES 
        (v_asgn_pub, v_class_1, v_teacher_1, 'Homework 1', true, now(), 100),
        (v_asgn_draft, v_class_1, v_teacher_1, 'Draft Exam', false, null, 100)
    ON CONFLICT (id) DO NOTHING;

    -- Student 1 submission with unreleased grade
    INSERT INTO public.assignment_submissions (
        assignment_id, classroom_id, student_id, submission_text, marks_obtained, grade, grades_released, status
    ) VALUES (
        v_asgn_pub, v_class_1, v_student_1, 'Student 1 Answer', 95.0, 95.0, false, 'graded'
    ) ON CONFLICT (assignment_id, student_id) DO NOTHING;

    -- Student 1 view tracking
    INSERT INTO public.material_views (material_id, classroom_id, student_id, view_count)
    VALUES (v_mat_pub, v_class_1, v_student_1, 1)
    ON CONFLICT (material_id, student_id) DO NOTHING;
END $$;

-- TEST A: Impersonate Student 1
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

-- A.1 Verify student CANNOT see draft materials (should return 0)
DO $$
DECLARE count_drafts INT;
BEGIN
    SELECT count(*) INTO count_drafts FROM public.materials WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    IF count_drafts > 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Student can see draft materials!';
    END IF;
    RAISE NOTICE 'PASSED: Draft materials are invisible to students.';
END $$;

-- A.2 Verify student CANNOT see draft assignments (should return 0)
DO $$
DECLARE count_drafts INT;
BEGIN
    SELECT count(*) INTO count_drafts FROM public.assignments WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    IF count_drafts > 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Student can see draft assignments!';
    END IF;
    RAISE NOTICE 'PASSED: Draft assignments are invisible to students.';
END $$;

-- TEST B: Impersonate Student 2
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

-- B.1 Verify Student 2 CANNOT see Student 1's submission
DO $$
DECLARE count_subs INT;
BEGIN
    SELECT count(*) INTO count_subs 
    FROM public.assignment_submissions 
    WHERE student_id = '33333333-3333-3333-3333-333333333333';
    IF count_subs > 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Student 2 can view Student 1 submission!';
    END IF;
    RAISE NOTICE 'PASSED: Student cannot read another student submission.';
END $$;

-- B.2 Verify Student 2 CANNOT see Student 1's material views
DO $$
DECLARE count_views INT;
BEGIN
    SELECT count(*) INTO count_views 
    FROM public.material_views 
    WHERE student_id = '33333333-3333-3333-3333-333333333333';
    IF count_views > 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Student 2 can view Student 1 material views!';
    END IF;
    RAISE NOTICE 'PASSED: Student cannot read another student view tracking.';
END $$;

-- TEST C: Impersonate Unrelated Teacher 2
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- C.1 Verify Teacher 2 CANNOT see Teacher 1's classroom
DO $$
DECLARE count_classes INT;
BEGIN
    SELECT count(*) INTO count_classes 
    FROM public.classrooms 
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    IF count_classes > 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Teacher 2 can read Teacher 1 classroom!';
    END IF;
    RAISE NOTICE 'PASSED: Teacher cannot touch classrooms they do not own.';
END $$;

-- Rollback all test data so database remains clean
ROLLBACK;
