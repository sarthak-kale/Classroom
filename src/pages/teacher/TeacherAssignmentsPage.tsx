import React, { useState, useEffect } from 'react';
import { supabase, normalizeError } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Assignment } from '../../types/database';
import { AssignmentCard } from '../../features/assignments/AssignmentCard';
import { CreateAssignmentModal } from '../../features/assignments/CreateAssignmentModal';
import { SearchBar, Skeleton, EmptyState, ErrorState } from '../../components/ui/FeedbackStates';
import { FileText, Plus } from 'lucide-react';
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

export const TeacherAssignmentsPage: React.FC = () => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  const fetchAssignments = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const { data: classList, error: classErr } = await supabase
        .from('classrooms')
        .select('id, name')
        .eq('teacher_id', user.id);

      if (classErr) throw classErr;

      const classes = classList || [];
      setClassrooms(classes);

      if (classes.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map((c) => c.id);

      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .in('classroom_id', classIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const normalized = (data || []).map(normalizeAssignment);
      setAssignments(normalized);
    } catch (err: unknown) {
      console.error('Error loading teacher assignments:', err);
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

  const filtered = assignments.filter((a) => {
    if (selectedClassroomId !== 'all' && a.classroom_id !== selectedClassroomId) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.title.toLowerCase().includes(q) || (a.instructions && a.instructions.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Assignments & Tasks</h1>
          <p className="text-xs text-gray-500 mt-1">
            Review student submissions, grade coursework, release marks, and monitor seen engagement.
          </p>
        </div>

        {classrooms.length > 0 && (
          <button
            onClick={() => {
              setEditingAssignment(null);
              setCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create Assignment</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search assignments..."
          className="w-full sm:w-80"
        />

        <div className="flex items-center space-x-2 self-end sm:self-auto">
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
        <div className="space-y-4">
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
              ? 'You have not created any assignments yet.'
              : 'No assignments matched your filter.'
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
              isTeacher={true}
              onEdit={(a) => {
                setEditingAssignment(a);
                setCreateModalOpen(true);
              }}
              onDeleted={fetchAssignments}
              onStatusChanged={fetchAssignments}
            />
          ))}
        </div>
      )}

      {createModalOpen && (
        <CreateAssignmentModal
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setEditingAssignment(null);
          }}
          classroomId={
            editingAssignment?.classroom_id ||
            (selectedClassroomId !== 'all' ? selectedClassroomId : classrooms[0]?.id || '')
          }
          initialAssignment={editingAssignment}
          onSaved={fetchAssignments}
          onDeleted={fetchAssignments}
        />
      )}
    </div>
  );
};
