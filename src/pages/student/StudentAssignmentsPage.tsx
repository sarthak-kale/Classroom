import React, { useState, useEffect } from 'react';
import { supabase, normalizeError } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Assignment, AssignmentStudentStatus } from '../../types/database';
import { AssignmentCard } from '../../features/assignments/AssignmentCard';
import { SearchBar, Skeleton, EmptyState, ErrorState } from '../../components/ui/FeedbackStates';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

export const normalizeAssignment = (a: any): Assignment => ({
  ...a,
  max_marks: Number(a.max_marks ?? a.points ?? 100),
  points: Number(a.points ?? a.max_marks ?? 100),
  due_at: a.due_at || a.due_date || null,
  due_date: a.due_date || a.due_at || null,
  published_at: a.published_at || (a.status === 'published' ? a.created_at : null),
  status: a.status || (a.published_at ? 'published' : 'draft'),
  published: a.published ?? (a.status === 'published' || Boolean(a.published_at)),
});

export const StudentAssignmentsPage: React.FC = () => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchAssignments = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const { data: memberRows, error: memberErr } = await supabase
        .from('classroom_members')
        .select('classroom:classrooms(id, name)')
        .eq('student_id', user.id);

      if (memberErr) throw memberErr;

      const classes = (memberRows || []).map((m: any) => m.classroom).filter(Boolean);
      setClassrooms(classes);

      if (classes.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map((c: any) => c.id);

      const { data, error } = await supabase
        .from('assignments')
        .select(`
          *,
          user_view:assignment_views(*),
          user_submission:assignment_submissions(*)
        `)
        .in('classroom_id', classIds)
        .or('status.eq.published,published.eq.true,published_at.not.is.null')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processed = (data || []).map((raw: any) => {
        const a = normalizeAssignment(raw);
        return {
          ...a,
          user_view: Array.isArray(a.user_view)
            ? a.user_view.find((v: any) => v.student_id === user.id) || null
            : a.user_view,
          user_submission: Array.isArray(a.user_submission)
            ? a.user_submission.find((s: any) => s.student_id === user.id) || null
            : a.user_submission,
        };
      }).sort((a: Assignment, b: Assignment) => {
        const dateA = a.due_at || a.due_date;
        const dateB = b.due_at || b.due_date;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });

      setAssignments(processed as Assignment[]);
    } catch (err: unknown) {
      console.error('Error loading student assignments:', err);
      const norm = normalizeError(err);
      setErrorMsg(norm.message);
      toast.error(norm.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [user]);

  const getDerivedStatus = (a: Assignment): AssignmentStudentStatus => {
    const sub = a.user_submission;
    const isPastDue = a.due_at ? new Date() > new Date(a.due_at) : false;

    if (sub?.grades_released && sub?.graded_at) return 'graded';
    if (sub) {
      if (sub.is_late) return 'late_submitted';
      return 'submitted';
    }
    if (isPastDue) return 'overdue';
    return 'not_submitted';
  };

  const filtered = assignments.filter((a) => {
    if (selectedClassroomId !== 'all' && a.classroom_id !== selectedClassroomId) {
      return false;
    }
    const status = getDerivedStatus(a);
    if (statusFilter !== 'all' && status !== statusFilter) {
      return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.title.toLowerCase().includes(q) || (a.instructions && a.instructions.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Your Assignments</h1>
        <p className="text-xs text-gray-500 mt-1">
          Track deadlines, submit assignments, and review released scores and teacher feedback.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search assignments..."
          className="w-full sm:w-80"
        />

        <div className="flex items-center space-x-2 self-end sm:self-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="not_submitted">Assigned (Pending)</option>
            <option value="submitted">Turned In</option>
            <option value="late_submitted">Turned In Late</option>
            <option value="graded">Graded</option>
            <option value="overdue">Overdue / Missing</option>
          </select>

          {/* Classroom Filter */}
          <select
            value={selectedClassroomId}
            onChange={(e) => setSelectedClassroomId(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Classrooms</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : errorMsg ? (
        <ErrorState
          title="Failed to load assignments"
          message={errorMsg}
          onRetry={fetchAssignments}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No assignments found"
          description={
            assignments.length === 0
              ? 'No assignments currently assigned in your classrooms.'
              : 'No assignments matched your filter criteria.'
          }
          icon={<FileText className="w-6 h-6 text-amber-600" />}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((asgn) => (
            <AssignmentCard
              key={asgn.id}
              assignment={asgn}
              classroomId={asgn.classroom_id}
              isTeacher={false}
              onStatusChanged={fetchAssignments}
            />
          ))}
        </div>
      )}
    </div>
  );
};
