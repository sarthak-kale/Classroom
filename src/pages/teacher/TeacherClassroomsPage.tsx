import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Classroom, normalizeClassroom, getJoinCode } from '../../types/database';
import { ClassroomCard } from '../../features/classrooms/ClassroomCard';
import { CreateClassroomModal } from '../../features/classrooms/CreateClassroomModal';
import { SearchBar, Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import { Plus, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

export const TeacherClassroomsPage: React.FC = () => {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterArchived, setFilterArchived] = useState<'active' | 'archived' | 'all'>('active');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const fetchClassrooms = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('classrooms')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ClassFlow] Error fetching classrooms:', error);
        throw error;
      }
      setClassrooms((data || []).map(normalizeClassroom));
    } catch (err: unknown) {
      toast.error('Failed to load classrooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassrooms();
  }, [user]);

  const handleArchiveToggle = async (id: string, isArchived: boolean) => {
    try {
      const { error } = await supabase
        .from('classrooms')
        .update({ is_archived: isArchived })
        .eq('id', id);

      if (error) throw error;
      toast.success(isArchived ? 'Classroom archived' : 'Classroom unarchived');
      fetchClassrooms();
    } catch (err: unknown) {
      toast.error('Failed to update classroom');
    }
  };

  const filtered = classrooms.filter((c) => {
    if (filterArchived === 'active' && c.is_archived) return false;
    if (filterArchived === 'archived' && !c.is_archived) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const joinCode = getJoinCode(c).toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.section && c.section.toLowerCase().includes(q)) ||
      (c.subject && c.subject.toLowerCase().includes(q)) ||
      joinCode.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Classrooms</h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage your courses, share join codes with students, and track engagement.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Classroom</span>
        </button>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by name, section, subject or code..."
          className="w-full sm:w-80"
        />

        <div className="flex items-center space-x-2 self-end sm:self-auto">
          <select
            value={filterArchived}
            onChange={(e) => setFilterArchived(e.target.value as any)}
            className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">Active Classes</option>
            <option value="archived">Archived Classes</option>
            <option value="all">All Classes</option>
          </select>
        </div>
      </div>

      {/* Grid */}
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
              ? 'You have not created any classrooms yet. Click the button above to begin.'
              : 'No classrooms matched your search criteria.'
          }
          action={
            classrooms.length === 0
              ? {
                  label: 'Create Classroom',
                  onClick: () => setCreateModalOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => (
            <ClassroomCard
              key={c.id}
              classroom={c}
              isTeacher={true}
              onArchiveToggle={handleArchiveToggle}
            />
          ))}
        </div>
      )}

      <CreateClassroomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(newClassroom) => {
          if (newClassroom) {
            setClassrooms((prev) => [newClassroom, ...prev.filter((c) => c.id !== newClassroom.id)]);
          }
          fetchClassrooms();
        }}
      />
    </div>
  );
};
