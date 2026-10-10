import React, { useState } from 'react';
import { Classroom, ClassroomMember, Profile, getJoinCode } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchBar, EmptyState } from '../../components/ui/FeedbackStates';
import { UserMinus, Users, ShieldCheck, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface ClassroomPeopleTabProps {
  classroom: Classroom;
  members: ClassroomMember[];
  teacher: Profile | null;
  isTeacher: boolean;
  onMemberRemoved: () => void;
}

export const ClassroomPeopleTab: React.FC<ClassroomPeopleTabProps> = ({
  classroom,
  members,
  teacher,
  isTeacher,
  onMemberRemoved,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [studentToRemove, setStudentToRemove] = useState<ClassroomMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const filteredMembers = members.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = m.student?.full_name?.toLowerCase() || '';
    const email = m.student?.email?.toLowerCase() || '';
    return name.includes(q) || email.includes(q);
  });

  const handleConfirmRemove = async () => {
    if (!studentToRemove) return;
    setRemoving(true);
    try {
      const { error } = await supabase
        .from('classroom_members')
        .delete()
        .eq('classroom_id', classroom.id)
        .eq('student_id', studentToRemove.student_id);

      if (error) throw error;

      toast.success(`${studentToRemove.student?.full_name || 'Student'} removed from classroom.`);
      setStudentToRemove(null);
      onMemberRemoved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove student');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Teacher Section */}
      <div>
        <div className="border-b-2 border-blue-600 pb-2 mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span>Teachers</span>
          </h3>
          <span className="text-xs font-semibold text-gray-500">1 instructor</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center space-x-3.5 shadow-2xs">
          <Avatar name={teacher?.full_name || 'Teacher'} url={teacher?.avatar_url} size="md" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-gray-900 leading-tight">
              {teacher?.full_name || 'Instructor'}
            </h4>
            <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
              <Mail className="w-3 h-3" />
              {teacher?.email}
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Head Instructor
          </span>
        </div>
      </div>

      {/* Students Section */}
      <div>
        <div className="border-b-2 border-blue-600 pb-2 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <h3 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span>Classmates</span>
            </h3>
            <span className="text-xs font-semibold text-gray-500">
              ({members.length} {members.length === 1 ? 'student' : 'students'})
            </span>
          </div>

          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search students..."
            className="w-full sm:w-64"
          />
        </div>

        {filteredMembers.length === 0 ? (
          <EmptyState
            title="No students yet"
            description={
              members.length === 0
                ? isTeacher
                  ? `Share code "${getJoinCode(classroom)}" with students so they can join.`
                  : 'No classmates have joined this class yet.'
                : 'No students matched your search.'
            }
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-2xs">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="p-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <Avatar
                    name={member.student?.full_name || 'Student'}
                    url={member.student?.avatar_url}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {member.student?.full_name || 'Student'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{member.student?.email}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                  </span>

                  {isTeacher && (
                    <button
                      type="button"
                      onClick={() => setStudentToRemove(member)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove student from classroom"
                      aria-label="Remove student"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(studentToRemove)}
        title="Remove Student from Classroom"
        message={`Are you sure you want to remove ${studentToRemove?.student?.full_name}? They will immediately lose access to materials, assignments, and announcements.`}
        confirmLabel="Remove Student"
        isDestructive={true}
        isLoading={removing}
        onConfirm={handleConfirmRemove}
        onCancel={() => setStudentToRemove(null)}
      />
    </div>
  );
};
