import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Classroom, Assignment, Material, NotificationItem, normalizeClassroom, normalizeAssignment } from '../../types/database';
import { ClassroomCard } from '../../features/classrooms/ClassroomCard';
import { JoinClassroomModal } from '../../features/classrooms/JoinClassroomModal';
import { MaterialCard } from '../../features/materials/MaterialCard';
import { AssignmentCard } from '../../features/assignments/AssignmentCard';
import { Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import {
  GraduationCap,
  KeyRound,
  FileText,
  BookOpen,
  Clock,
  AlertCircle,
  Bell,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const StudentHomePage: React.FC = () => {
  const { user, profile } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [upcomingAssignments, setUpcomingAssignments] = useState<Assignment[]>([]);
  const [overdueAssignments, setOverdueAssignments] = useState<Assignment[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const fetchStudentHomeData = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Fetch enrolled classrooms
      const { data: memberRows, error: memErr } = await supabase
        .from('classroom_members')
        .select(`
          classroom:classrooms!classroom_members_classroom_id_fkey(
            *,
            teacher:profiles!classrooms_teacher_id_fkey(*)
          )
        `)
        .eq('student_id', user.id);

      if (memErr) throw memErr;

      const loadedClasses: Classroom[] = (memberRows || [])
        .map((row: any) => row.classroom)
        .filter(Boolean)
        .map(normalizeClassroom);

      setClassrooms(loadedClasses);

      if (loadedClasses.length === 0) {
        setLoading(false);
        return;
      }

      const classIds = loadedClasses.map((c) => c.id);

      // 2. Fetch assignments across classrooms
      const { data: asgnData } = await supabase
        .from('assignments')
        .select(`
          *,
          user_view:assignment_views(*),
          user_submission:assignment_submissions(*)
        `)
        .in('classroom_id', classIds)
        .or('status.eq.published,published.eq.true,published_at.not.is.null')
        .order('created_at', { ascending: false });

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
      }) as Assignment[];

      const now = new Date();
      const upcoming: Assignment[] = [];
      const overdue: Assignment[] = [];

      processedAsgns.forEach((a) => {
        const hasSubmitted = Boolean(a.user_submission);
        if (!hasSubmitted && a.due_at) {
          if (new Date(a.due_at) < now) {
            overdue.push(a);
          } else {
            upcoming.push(a);
          }
        }
      });

      setUpcomingAssignments(upcoming.slice(0, 5));
      setOverdueAssignments(overdue.slice(0, 5));

      // 3. Fetch recent materials
      const { data: matData } = await supabase
        .from('materials')
        .select(`
          *,
          classroom:classrooms(id, name),
          user_view:material_views!material_views_material_id_fkey(*)
        `)
        .in('classroom_id', classIds)
        .or('published.eq.true,published_at.not.is.null')
        .order('created_at', { ascending: false })
        .limit(4);

      const processedMats = (matData || []).map((m: any) => ({
        ...m,
        user_view: Array.isArray(m.user_view)
          ? m.user_view.find((v: any) => v.student_id === user.id) || null
          : m.user_view,
      })) as Material[];

      setRecentMaterials(processedMats);
    } catch (err) {
      console.error('Error fetching student home:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentHomeData();
  }, [user]);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Student Dashboard</h1>
          <p className="text-xs text-gray-500 mt-1">
            Welcome, {profile?.full_name}. Here is your classwork, upcoming assignments, and recent notes.
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

      {/* Overdue Alert banner if any */}
      {overdueAssignments.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-xs text-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block">
              You have {overdueAssignments.length} overdue {overdueAssignments.length === 1 ? 'task' : 'tasks'}:
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {overdueAssignments.map((a) => (
                <span
                  key={a.id}
                  className="px-2.5 py-0.5 rounded bg-white border border-red-200 text-red-900 font-medium"
                >
                  {a.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Enrolled Classrooms Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h2 className="text-lg font-bold text-gray-900">Enrolled Classrooms</h2>
          <Link
            to="/student/classrooms"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        ) : classrooms.length === 0 ? (
          <EmptyState
            title="You haven't joined any classrooms yet"
            description="Ask your teacher for an 8-character join code and click Join Classroom."
            icon={<GraduationCap className="w-6 h-6 text-blue-600" />}
            action={{
              label: 'Join Classroom',
              onClick: () => setJoinModalOpen(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classrooms.slice(0, 6).map((c) => (
              <ClassroomCard key={c.id} classroom={c} isTeacher={false} />
            ))}
          </div>
        )}
      </div>

      {/* 2-Column: Upcoming assignments & Recent Materials */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        {/* Upcoming Tasks */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Upcoming Due</span>
            </h3>
            <Link
              to="/student/assignments"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              All Assignments →
            </Link>
          </div>

          {upcomingAssignments.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center bg-white rounded-xl border border-gray-200">
              No pending assignments due soon! You are all caught up.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingAssignments.map((asgn) => (
                <AssignmentCard
                  key={asgn.id}
                  assignment={asgn}
                  classroomId={asgn.classroom_id}
                  isTeacher={false}
                  onStatusChanged={fetchStudentHomeData}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Study Materials */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>Recent Materials</span>
            </h3>
            <Link
              to="/student/materials"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              All Materials →
            </Link>
          </div>

          {recentMaterials.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center bg-white rounded-xl border border-gray-200">
              No materials have been published in your classes yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentMaterials.map((mat) => (
                <MaterialCard
                  key={mat.id}
                  material={mat}
                  isTeacher={false}
                  classroomName={mat.classroom?.name}
                  onStatusToggled={(materialId, seen) => {
                    setRecentMaterials((prev) =>
                      prev.map((m) =>
                        m.id === materialId
                          ? {
                              ...m,
                              user_view: seen
                                ? {
                                    id: m.user_view?.id || crypto.randomUUID(),
                                    material_id: m.id,
                                    student_id: user?.id || '',
                                    first_viewed_at: m.user_view?.first_viewed_at || new Date().toISOString(),
                                    last_viewed_at: new Date().toISOString(),
                                    view_count: (m.user_view?.view_count || 0) + 1,
                                  }
                                : null,
                            }
                          : m
                      )
                    );
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <JoinClassroomModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoined={fetchStudentHomeData}
      />
    </div>
  );
};
