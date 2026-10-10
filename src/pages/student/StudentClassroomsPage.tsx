import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Classroom, normalizeClassroom } from '../../types/database';
import { ClassroomCard } from '../../features/classrooms/ClassroomCard';
import { JoinClassroomModal } from '../../features/classrooms/JoinClassroomModal';
import { SearchBar, Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import { KeyRound, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

export const StudentClassroomsPage: React.FC = () => {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const fetchClassrooms = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('classroom_members')
        .select(`
          classroom:classrooms!classroom_members_classroom_id_fkey(
            *,
            teacher:profiles!classrooms_teacher_id_fkey(*)
          )
        `)
        .eq('student_id', user.id);

      if (error) throw error;
      const loaded: Classroom[] = (data || []).map((row: any) => row.classroom).filter(Boolean).map(normalizeClassroom);
      setClassrooms(loaded);
    } catch (err: unknown) {
      toast.error('Failed to load classrooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassrooms();
  }, [user]);

  const filtered = classrooms.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.section && c.section.toLowerCase().includes(q)) ||
      (c.subject && c.subject.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Classrooms</h1>
          <p className="text-xs text-gray-500 mt-1">
            Courses you are currently enrolled in as a student.
          </p>
        </div>

        <button
          onClick={() => setJoinModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors self-start sm:self-auto"
        >
          <KeyRound className="w-4 h-4" />
          <span>Join Classroom</span>
        </button>
      </div>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search enrolled classrooms..."
        className="w-full sm:w-80"
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No classrooms found"
          description={
            classrooms.length === 0
              ? 'You have not enrolled in any classrooms yet.'
              : 'No classrooms matched your search.'
          }
          icon={<GraduationCap className="w-6 h-6 text-blue-600" />}
          action={
            classrooms.length === 0
              ? {
                  label: 'Join Classroom',
                  onClick: () => setJoinModalOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => (
            <ClassroomCard key={c.id} classroom={c} isTeacher={false} />
          ))}
        </div>
      )}

      <JoinClassroomModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoined={fetchClassrooms}
      />
    </div>
  );
};
