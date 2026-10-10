-- Migration 004: Automated Notification Triggers
-- ClassFlow Classroom Management Platform

-- 1. MATERIAL PUBLISHED NOTIFICATION TRIGGER
CREATE OR REPLACE FUNCTION public.notify_on_material_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mem RECORD;
    c_name TEXT;
BEGIN
    -- Check if material has just been published (either on insert with published_at set, or updated from draft to published)
    IF NEW.published_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.published_at IS NULL) THEN
        SELECT name INTO c_name FROM public.classrooms WHERE id = NEW.classroom_id;

        FOR mem IN 
            SELECT student_id 
            FROM public.classroom_members 
            WHERE classroom_id = NEW.classroom_id
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
                mem.student_id,
                'New Material: ' || NEW.title,
                COALESCE(c_name, 'Classroom') || ': New material has been posted.',
                'material_published',
                NEW.id,
                NEW.classroom_id,
                'mat_pub_' || mem.student_id || '_' || NEW.id
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_material_published ON public.materials;
CREATE TRIGGER trigger_material_published
    AFTER INSERT OR UPDATE OF published_at ON public.materials
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_material_publish();

-- 2. ASSIGNMENT PUBLISHED NOTIFICATION TRIGGER
CREATE OR REPLACE FUNCTION public.notify_on_assignment_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mem RECORD;
    c_name TEXT;
BEGIN
    IF NEW.published_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.published_at IS NULL) THEN
        SELECT name INTO c_name FROM public.classrooms WHERE id = NEW.classroom_id;

        FOR mem IN 
            SELECT student_id 
            FROM public.classroom_members 
            WHERE classroom_id = NEW.classroom_id
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
                mem.student_id,
                'New Assignment: ' || NEW.title,
                COALESCE(c_name, 'Classroom') || ': A new assignment is due ' || COALESCE(to_char(NEW.due_at, 'Mon DD, YYYY HH24:MI'), 'at no set date') || '.',
                'assignment_published',
                NEW.id,
                NEW.classroom_id,
                'asgn_pub_' || mem.student_id || '_' || NEW.id
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_assignment_published ON public.assignments;
CREATE TRIGGER trigger_assignment_published
    AFTER INSERT OR UPDATE OF published_at ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment_publish();

-- 3. ASSIGNMENT DUE DATE CHANGED NOTIFICATION TRIGGER
CREATE OR REPLACE FUNCTION public.notify_on_assignment_due_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mem RECORD;
    c_name TEXT;
BEGIN
    IF NEW.published_at IS NOT NULL AND (OLD.due_at IS DISTINCT FROM NEW.due_at) THEN
        SELECT name INTO c_name FROM public.classrooms WHERE id = NEW.classroom_id;

        FOR mem IN 
            SELECT student_id 
            FROM public.classroom_members 
            WHERE classroom_id = NEW.classroom_id
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
                mem.student_id,
                'Due Date Updated: ' || NEW.title,
                'The due date for "' || NEW.title || '" has changed to ' || COALESCE(to_char(NEW.due_at, 'Mon DD, YYYY HH24:MI'), 'none') || '.',
                'due_date_changed',
                NEW.id,
                NEW.classroom_id,
                'due_change_' || mem.student_id || '_' || NEW.id || '_' || COALESCE(NEW.due_at::text, 'none')
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_assignment_due_changed ON public.assignments;
CREATE TRIGGER trigger_assignment_due_changed
    AFTER UPDATE OF due_at ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment_due_change();

-- 4. ANNOUNCEMENT CREATED NOTIFICATION TRIGGER
CREATE OR REPLACE FUNCTION public.notify_on_announcement_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mem RECORD;
    c_name TEXT;
    author_name TEXT;
BEGIN
    SELECT name INTO c_name FROM public.classrooms WHERE id = NEW.classroom_id;
    SELECT full_name INTO author_name FROM public.profiles WHERE id = NEW.author_id;

    FOR mem IN 
        SELECT student_id 
        FROM public.classroom_members 
        WHERE classroom_id = NEW.classroom_id AND student_id != NEW.author_id
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
            mem.student_id,
            'Announcement in ' || COALESCE(c_name, 'Class'),
            COALESCE(author_name, 'Teacher') || ': ' || substr(NEW.content, 1, 100),
            'announcement_created',
            NEW.id,
            NEW.classroom_id,
            'announcement_' || mem.student_id || '_' || NEW.id
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_announcement_created ON public.announcements;
CREATE TRIGGER trigger_announcement_created
    AFTER INSERT ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_announcement_created();
