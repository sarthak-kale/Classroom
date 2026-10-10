import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Profile, Classroom } from '../../types/database';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchBar, Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import { Users, UserMinus, Mail, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

interface EnrolledStudentRecord {
  membership_id: string;
  classroom_id: string;
  classroom_name: string;
  student_id: string;
  joined_at: string;
  student: Profile;
}

export const TeacherStudentsPage: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<EnrolledStudentRecord[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentToRemove, setStudentToRemove] = useState<EnrolledStudentRecord | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchStudents = async () => {
    if (!user) return;
    try {
      setLoading(true);

      const { data: classList } = await supabase
        .from('classrooms')
        .select('*')
        .eq('teacher_id', user.id);

      const classes = (classList || []) as Classroom[];
      setClassrooms(classes);

      if (classes.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map((c) => c.id);

      const { data, error } = await supabase
        .from('classroom_members')
        .select(`
          id,
          classroom_id,
          joined_at,
          classroom:classrooms!classroom_members_classroom_id_fkey(name),
          student:profiles!classroom_members_student_id_fkey(*)
        `)
        .in('classroom_id', classIds)
        .order('joined_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((row: any) => ({
        membership_id: row.id,
        classroom_id: row.classroom_id,
        classroom_name: row.classroom?.name || 'Classroom',
        student_id: row.student?.id,
        joined_at: row.joined_at,
        student: row.student,
      }));

      setStudents(formatted);
    } catch (err: unknown) {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [user]);

  const handleConfirmRemove = async () => {
    if (!studentToRemove) return;
    setRemoving(true);
    try {
      const { error } = await supabase
        .from('classroom_members')
        .delete()
        .eq('id', studentToRemove.membership_id);

      if (error) throw error;
      toast.success(`${studentToRemove.student?.full_name} removed from ${studentToRemove.classroom_name}.`);
      setStudentToRemove(null);
      fetchStudents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove student');
    } finally {
      setRemoving(false);
    }
  };

  const filtered = students.filter((s) => {
    if (selectedClassId !== 'all' && s.classroom_id !== selectedClassId) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = s.student?.full_name?.toLowerCase() || '';
    const email = s.student?.email?.toLowerCase() || '';
    return name.includes(q) || email.includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Student Roster</h1>
        <p className="text-xs text-gray-500 mt-1">
          Master directory of all enrolled students across your classrooms.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search students by name or email..."
          className="w-full sm:w-80"
        />

        <div className="flex items-center space-x-2 self-end sm:self-auto">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
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
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No students found"
          description={
            students.length === 0
              ? 'No students have joined any of your classrooms yet.'
              : 'No students matched your search.'
          }
          icon={<Users className="w-6 h-6 text-blue-600" />}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-2xs">
          {filtered.map((item) => (
            <div
              key={item.membership_id}
              className="p-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex items-center space-x-3.5 min-w-0">
                <Avatar
                  name={item.student?.full_name || 'Student'}
                  url={item.student?.avatar_url}
                  size="md"
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 truncate">
                    {item.student?.full_name || 'Student'}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-gray-400" />
                      {item.student?.email}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-medium text-blue-600">
                      <GraduationCap className="w-3 h-3" />
                      {item.classroom_name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-xs text-gray-400 hidden sm:inline">
                  Enrolled {new Date(item.joined_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => setStudentToRemove(item)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove student from this classroom"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(studentToRemove)}
        title="Remove Student from Classroom"
        message={`Are you sure you want to remove ${studentToRemove?.student?.full_name} from ${studentToRemove?.classroom_name}?`}
        confirmLabel="Remove"
        isDestructive={true}
        isLoading={removing}
        onConfirm={handleConfirmRemove}
        onCancel={() => setStudentToRemove(null)}
      />
    </div>
  );
};
