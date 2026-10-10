import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import {
  Classroom,
  ClassroomMember,
  Material,
  Assignment,
  Announcement,
  Profile,
  normalizeClassroom,
  normalizeAssignment,
  getJoinCode,
} from '../../types/database';
import { MaterialCard } from '../../features/materials/MaterialCard';
import { CreateMaterialModal } from '../../features/materials/CreateMaterialModal';
import { AssignmentCard } from '../../features/assignments/AssignmentCard';
import { CreateAssignmentModal } from '../../features/assignments/CreateAssignmentModal';
import { AnnouncementFeed } from '../../features/announcements/AnnouncementFeed';
import { ClassroomPeopleTab } from '../../features/classrooms/ClassroomPeopleTab';
import { Skeleton, ErrorState, EmptyState } from '../../components/ui/FeedbackStates';
import {
  GraduationCap,
  Copy,
  Check,
  Plus,
  BookOpen,
  FileText,
  Users,
  Megaphone,
  BarChart3,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

export const ClassroomDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [teacher, setTeacher] = useState<Profile | null>(null);

  const [activeTab, setActiveTab] = useState<'stream' | 'classwork' | 'people' | 'analytics'>('stream');
  const [classworkFilter, setClassworkFilter] = useState<'all' | 'materials' | 'assignments'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [createMaterialOpen, setCreateMaterialOpen] = useState(false);
  const [createAssignmentOpen, setCreateAssignmentOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchClassroomData = useCallback(async () => {
    if (!id || !user) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch classroom
      const { data: classData, error: classErr } = await supabase
        .from('classrooms')
        .select(`*, teacher:profiles!classrooms_teacher_id_fkey(*)`)
        .eq('id', id)
        .single();

      if (classErr) throw classErr;
      setClassroom(normalizeClassroom(classData));
      setTeacher(classData.teacher || null);

      // 2. Fetch members
      const { data: memberData, error: memErr } = await supabase
        .from('classroom_members')
        .select(`*, student:profiles!classroom_members_student_id_fkey(*)`)
        .eq('classroom_id', id)
        .order('joined_at', { ascending: true });

      if (!memErr) setMembers((memberData || []) as ClassroomMember[]);

      // 3. Fetch materials
      let matQuery = supabase
        .from('materials')
        .select(`
          *,
          user_view:material_views!material_views_material_id_fkey(*)
        `)
        .eq('classroom_id', id)
        .order('created_at', { ascending: false });

      if (!isTeacher) {
        matQuery = matQuery.or('published.eq.true,published_at.not.is.null');
      }

      const { data: matData, error: matErr } = await matQuery;
      if (!matErr) {
        const processedMats = (matData || []).map((m: any) => ({
          ...m,
          user_view: Array.isArray(m.user_view)
            ? m.user_view.find((v: any) => v.student_id === user.id) || null
            : m.user_view,
        }));
        setMaterials(processedMats as Material[]);
      }

      // 4. Fetch assignments
      let asgnQuery = supabase
        .from('assignments')
        .select(`
          *,
          user_view:assignment_views(*),
          user_submission:assignment_submissions(*)
        `)
        .eq('classroom_id', id)
        .order('created_at', { ascending: false });

      if (!isTeacher) {
        asgnQuery = asgnQuery.or('status.eq.published,published.eq.true,published_at.not.is.null');
      }

      const { data: asgnData, error: asgnErr } = await asgnQuery;
      if (!asgnErr) {
        const processedAsgns = (asgnData || []).map((raw: any) => {
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
        });
        setAssignments(processedAsgns as Assignment[]);
      }

      // 5. Fetch announcements
      const { data: annData, error: annErr } = await supabase
        .from('announcements')
        .select(`*, author:profiles!announcements_author_id_fkey(*)`)
        .eq('classroom_id', id)
        .order('created_at', { ascending: false });

      if (!annErr) setAnnouncements((annData || []) as Announcement[]);
    } catch (err: unknown) {
      console.error('Error fetching classroom detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [id, user, isTeacher]);

  useEffect(() => {
    fetchClassroomData();
  }, [fetchClassroomData]);

  const copyCode = async () => {
    if (!classroom) return;
    const code = getJoinCode(classroom);
    if (!code) {
      toast.error('No join code available for this classroom');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedCode(true);
      toast.success(`Class code "${code}" copied!`);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error('[ClassFlow] Copy code failed:', err);
      toast.error(`Class code: ${code}`);
    }
  };

  if (loading && !classroom) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-2xl" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <ErrorState
        title="Classroom not found or unauthorized"
        message={error || 'You do not have access to view this classroom.'}
        onRetry={fetchClassroomData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Classroom Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-2xl p-6 sm:p-8 text-white shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-blue-200 block mb-1">
              {classroom.subject || 'Course'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {classroom.name}
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              {classroom.section ? `${classroom.section}` : ''}
              {classroom.room ? ` • ${classroom.room}` : ''}
              {teacher?.full_name ? ` • Instructor: ${teacher.full_name}` : ''}
            </p>
          </div>

          {/* Join Code card for teacher */}
          {isTeacher && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-xl flex items-center space-x-3 shrink-0">
              <div className="text-left">
                <span className="text-[10px] text-white/80 uppercase tracking-wider block font-medium">
                  Class Join Code
                </span>
                <span className="text-base font-mono font-bold tracking-wider text-white">
                  {getJoinCode(classroom) || '—'}
                </span>
              </div>
              <button
                onClick={copyCode}
                className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                title="Copy code"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs (Stream, Classwork, People, Analytics) */}
      <div className="border-b border-gray-200 flex items-center justify-between">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('stream')}
            className={`py-3 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'stream'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            <span>Stream</span>
          </button>

          <button
            onClick={() => setActiveTab('classwork')}
            className={`py-3 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'classwork'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Classwork</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium ml-1">
              {materials.length + assignments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('people')}
            className={`py-3 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'people'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>People</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium ml-1">
              {members.length}
            </span>
          </button>

          {isTeacher && (
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-3 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>
          )}
        </nav>

        {/* Create Dropdown on Classwork Tab for Teachers */}
        {isTeacher && activeTab === 'classwork' && (
          <div className="relative">
            <button
              onClick={() => setCreateDropdownOpen(!createDropdownOpen)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {createDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setCreateDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-30 animate-in fade-in zoom-in-95">
                  <button
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      setEditingMaterial(null);
                      setCreateMaterialOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-xs text-left text-gray-700 hover:bg-gray-50 flex items-center space-x-2.5"
                  >
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    <span>Material / Notes</span>
                  </button>
                  <button
                    onClick={() => {
                      setCreateDropdownOpen(false);
                      setEditingAssignment(null);
                      setCreateAssignmentOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-xs text-left text-gray-700 hover:bg-gray-50 flex items-center space-x-2.5"
                  >
                    <FileText className="w-4 h-4 text-amber-600" />
                    <span>Assignment / Task</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: STREAM */}
      {activeTab === 'stream' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left mini sidebar: class details */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
                Classroom Details
              </h4>
              <div className="space-y-2 text-xs text-gray-600">
                <div>
                  <span className="font-semibold text-gray-700">Subject: </span>
                  {classroom.subject || 'Not specified'}
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Section: </span>
                  {classroom.section || 'Default'}
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Room: </span>
                  {classroom.room || 'Online'}
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Enrolled: </span>
                  {members.length} {members.length === 1 ? 'student' : 'students'}
                </div>
              </div>
            </div>

            {/* Upcoming assignments preview */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
                Upcoming Due
              </h4>
              {assignments.filter((a) => a.due_at && new Date(a.due_at) > new Date()).length === 0 ? (
                <p className="text-xs text-gray-400">No assignments due soon.</p>
              ) : (
                <div className="space-y-2">
                  {assignments
                    .filter((a) => a.due_at && new Date(a.due_at) > new Date())
                    .slice(0, 3)
                    .map((a) => (
                      <div key={a.id} className="text-xs border-b border-gray-100 pb-2">
                        <p className="font-medium text-gray-900 truncate">{a.title}</p>
                        <p className="text-[11px] text-gray-500">
                          Due {new Date(a.due_at!).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Right main column: announcements stream */}
          <div className="lg:col-span-3">
            <AnnouncementFeed
              classroomId={classroom.id}
              announcements={announcements}
              isTeacher={isTeacher}
              onRefresh={fetchClassroomData}
            />
          </div>
        </div>
      )}

      {/* TAB 2: CLASSWORK */}
      {activeTab === 'classwork' && (
        <div className="space-y-6">
          {/* Subfilter pills */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setClassworkFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                classworkFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              All Items ({materials.length + assignments.length})
            </button>
            <button
              onClick={() => setClassworkFilter('materials')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                classworkFilter === 'materials'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Materials ({materials.length})
            </button>
            <button
              onClick={() => setClassworkFilter('assignments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                classworkFilter === 'assignments'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Assignments ({assignments.length})
            </button>
          </div>

          {/* Materials Section */}
          {(classworkFilter === 'all' || classworkFilter === 'materials') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  <span>Study Materials</span>
                </h3>
                <span className="text-xs text-gray-400">
                  {materials.length} {materials.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {materials.length === 0 ? (
                <EmptyState
                  title="No study materials posted"
                  description={
                    isTeacher
                      ? 'Click the "Create" button above to upload slides, worksheets, or links.'
                      : 'Your instructor has not published any study materials yet.'
                  }
                  icon={<BookOpen className="w-6 h-6 text-blue-600" />}
                />
              ) : (
                <div className="space-y-3">
                  {materials.map((mat) => (
                    <MaterialCard
                      key={mat.id}
                      material={mat}
                      isTeacher={isTeacher}
                      classroomName={classroom?.name}
                      onEdit={(m) => {
                        setEditingMaterial(m);
                        setCreateMaterialOpen(true);
                      }}
                      onDeleted={fetchClassroomData}
                      onStatusToggled={() => fetchClassroomData()}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Assignments Section */}
          {(classworkFilter === 'all' || classworkFilter === 'assignments') && (
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-600" />
                  <span>Assignments & Tasks</span>
                </h3>
                <span className="text-xs text-gray-400">
                  {assignments.length} {assignments.length === 1 ? 'task' : 'tasks'}
                </span>
              </div>

              {assignments.length === 0 ? (
                <EmptyState
                  title="No assignments posted"
                  description={
                    isTeacher
                      ? 'Click "Create" above to assign coursework, sets, or essays.'
                      : 'No assignments have been posted in this class yet.'
                  }
                  icon={<FileText className="w-6 h-6 text-amber-600" />}
                />
              ) : (
                <div className="space-y-3">
                  {assignments.map((asgn) => (
                    <AssignmentCard
                      key={asgn.id}
                      assignment={asgn}
                      classroomId={classroom.id}
                      isTeacher={isTeacher}
                      onEdit={(a) => {
                        setEditingAssignment(a);
                        setCreateAssignmentOpen(true);
                      }}
                      onDeleted={fetchClassroomData}
                      onStatusChanged={fetchClassroomData}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PEOPLE */}
      {activeTab === 'people' && (
        <ClassroomPeopleTab
          classroom={classroom}
          members={members}
          teacher={teacher}
          isTeacher={isTeacher}
          onMemberRemoved={fetchClassroomData}
        />
      )}

      {/* TAB 4: ANALYTICS (TEACHER ONLY) */}
      {activeTab === 'analytics' && isTeacher && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
              <span className="text-xs font-medium text-gray-500 block mb-1">Enrolled Learners</span>
              <p className="text-3xl font-extrabold text-gray-900">{members.length}</p>
              <p className="text-xs text-gray-400 mt-1">Active class participants</p>
            </div>

            <div className="p-5 bg-white border border-blue-200 rounded-xl shadow-xs bg-blue-50/20">
              <span className="text-xs font-medium text-blue-700 block mb-1">Materials Published</span>
              <p className="text-3xl font-extrabold text-blue-700">{materials.filter((m) => m.published_at).length}</p>
              <p className="text-xs text-blue-500 mt-1">Accessible study guides</p>
            </div>

            <div className="p-5 bg-white border border-amber-200 rounded-xl shadow-xs bg-amber-50/20">
              <span className="text-xs font-medium text-amber-700 block mb-1">Assignments Created</span>
              <p className="text-3xl font-extrabold text-amber-700">{assignments.length}</p>
              <p className="text-xs text-amber-500 mt-1">Tasks for evaluation</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <h4 className="text-sm font-bold text-gray-900 mb-2">Classroom Engagement Tip</h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              Use the <strong>View Tracking</strong> button on any Material or Assignment in the Classwork tab to inspect real-time WhatsApp-style Seen vs Unseen status for each student enrolled.
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      {isTeacher && (
        <>
          <CreateMaterialModal
            isOpen={createMaterialOpen}
            onClose={() => {
              setCreateMaterialOpen(false);
              setEditingMaterial(null);
            }}
            classroomId={classroom.id}
            initialMaterial={editingMaterial}
            onSaved={fetchClassroomData}
          />

          <CreateAssignmentModal
            isOpen={createAssignmentOpen}
            onClose={() => {
              setCreateAssignmentOpen(false);
              setEditingAssignment(null);
            }}
            classroomId={classroom.id}
            initialAssignment={editingAssignment}
            onSaved={fetchClassroomData}
          />
        </>
      )}
    </div>
  );
};
