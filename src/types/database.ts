// TypeScript type definitions for ClassFlow Supabase Schema

export type UserRole = 'teacher' | 'student';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Classroom {
  id: string;
  name: string;
  section: string | null;
  subject: string | null;
  room: string | null;
  join_code: string;
  code?: string; // Backwards-compatible alias for join_code
  description?: string | null;
  banner_color?: string | null;
  teacher_id: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  teacher?: Profile;
  _count?: {
    members?: number;
    materials?: number;
    assignments?: number;
  };
}

export const normalizeClassroom = (c: any): Classroom => {
  const code = c?.join_code || c?.code || '';
  return {
    ...c,
    join_code: code,
    code: code,
  };
};

export const getJoinCode = (c?: { join_code?: string; code?: string } | null): string => {
  if (!c) return '';
  return c.join_code || c.code || '';
};

export interface ClassroomMember {
  id: string;
  classroom_id: string;
  student_id: string;
  joined_at: string;
  student?: Profile;
}

export interface Material {
  id: string;
  classroom_id: string;
  teacher_id?: string | null;
  title: string;
  description: string | null;
  file_url: string | null;
  file_path?: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  type?: string | null;
  external_url: string | null;
  published?: boolean;
  published_at: string | null; // null = draft
  is_published?: boolean;
  is_viewed?: boolean;
  created_at: string;
  updated_at: string;
  user_view?: MaterialView | null;
  classroom?: { id: string; name: string };
  seen_count?: number;
  enrolled_count?: number;
}

export const normalizeMaterial = (m: any): Material => {
  if (!m) return m;
  const filePath = m?.file_path || m?.file_url || null;
  const isPublished = m?.published === true || Boolean(m?.published_at);
  const publishedAt = m?.published_at || (isPublished ? m?.created_at || new Date().toISOString() : null);

  return {
    ...m,
    file_path: filePath,
    file_url: filePath,
    file_type: m?.file_type || m?.type || 'file',
    type: m?.type || m?.file_type || 'file',
    published: isPublished,
    published_at: publishedAt,
    is_published: isPublished,
    is_viewed: Boolean(m?.user_view || (Array.isArray(m?.material_views) && m.material_views.length > 0)),
  };
};

export interface MaterialView {
  id: string;
  material_id: string;
  student_id: string;
  first_viewed_at: string;
  last_viewed_at: string;
  view_count: number;
  student?: Profile;
}

export interface Assignment {
  id: string;
  classroom_id: string;
  teacher_id?: string | null;
  title: string;
  instructions: string | null;
  points?: number;
  max_marks: number;
  due_date?: string | null;
  due_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  status?: string;
  published?: boolean;
  published_at: string | null; // null = draft
  is_published?: boolean;
  created_at: string;
  updated_at: string;
  user_view?: AssignmentView | null;
  user_submission?: AssignmentSubmission | null;
}

export const normalizeAssignment = (a: any): Assignment => {
  if (!a) return a;
  const maxMarks = Number(a?.max_marks ?? a?.points ?? 100);
  const dueAt = a?.due_at || a?.due_date || null;
  const isPublished = a?.published === true || a?.status === 'published' || Boolean(a?.published_at);
  const publishedAt = a?.published_at || (isPublished ? a?.created_at || new Date().toISOString() : null);

  return {
    ...a,
    points: a?.points ?? maxMarks,
    max_marks: maxMarks,
    due_date: a?.due_date || dueAt,
    due_at: dueAt,
    status: a?.status || (publishedAt ? 'published' : 'draft'),
    published: isPublished,
    published_at: publishedAt,
    is_published: isPublished,
    attachment_url: a?.attachment_url || a?.file_url || a?.file_path || null,
    attachment_name: a?.attachment_name || a?.file_name || null,
    attachment_size: a?.attachment_size ?? a?.file_size ?? null,
  };
};

export interface AssignmentView {
  id: string;
  assignment_id: string;
  student_id: string;
  first_viewed_at: string;
  last_viewed_at: string;
  view_count: number;
  student?: Profile;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  submission_text: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  submitted_at: string;
  is_late: boolean;
  marks_obtained: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  grades_released: boolean;
  updated_at: string;
  student?: Profile;
  grader?: Profile;
}

export interface Announcement {
  id: string;
  classroom_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: Profile;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'material_published' | 'assignment_published' | 'due_date_changed' | 'announcement_created' | 'grade_released';
  related_id: string | null;
  classroom_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ViewTrackingSummary {
  enrolled_count: number;
  seen_count: number;
  unseen_count: number;
  engagement_pct: number;
}

export interface StudentViewTrackingRecord {
  student_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  status: 'seen' | 'unseen';
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  has_submitted?: boolean;
  submitted_at?: string | null;
  is_late?: boolean;
  marks_obtained?: number | null;
  grades_released?: boolean;
}

export interface ViewTrackingResponse {
  material_id?: string;
  assignment_id?: string;
  title: string;
  file_name?: string | null;
  classroom_name?: string | null;
  max_marks?: number;
  due_at?: string | null;
  published_at: string | null;
  summary: ViewTrackingSummary;
  students: StudentViewTrackingRecord[];
}

export type AssignmentStudentStatus = 
  | 'graded'
  | 'late_submitted'
  | 'submitted'
  | 'overdue'
  | 'not_submitted';
