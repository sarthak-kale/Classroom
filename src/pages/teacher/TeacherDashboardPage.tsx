import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { ClassroomCard } from '../../features/classrooms/ClassroomCard';
import { CreateClassroomModal } from '../../features/classrooms/CreateClassroomModal';
import { Classroom, normalizeClassroom } from '../../types/database';
import { Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import {
  GraduationCap,
  Users,
  BookOpen,
  FileText,
  Clock,
  BarChart3,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardStats {
  classroomsCount: number;
  enrolledStudentsCount: number;
  publishedMaterialsCount: number;
  assignmentsCount: number;
  pendingSubmissionsCount: number;
  averageEngagementPct: number;
}

export const TeacherDashboardPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    classroomsCount: 0,
    enrolledStudentsCount: 0,
    publishedMaterialsCount: 0,
    assignmentsCount: 0,
    pendingSubmissionsCount: 0,
    averageEngagementPct: 0,
  });
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const fetchDashboardData = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Fetch classrooms
      const { data: classList, error: classErr } = await supabase
        .from('classrooms')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (classErr) {
        console.error('[ClassFlow] Error fetching teacher classrooms:', classErr);
        throw classErr;
      }
      const loadedClasses = (classList || []).map(normalizeClassroom);
      setClassrooms(loadedClasses);

      if (loadedClasses.length === 0) {
        setStats({
          classroomsCount: 0,
          enrolledStudentsCount: 0,
          publishedMaterialsCount: 0,
          assignmentsCount: 0,
          pendingSubmissionsCount: 0,
          averageEngagementPct: 0,
        });
        setLoading(false);
        return;
      }

      const classIds = loadedClasses.map((c) => c.id);

      // 2. Count enrolled students
      const { count: enrolledCount } = await supabase
        .from('classroom_members')
        .select('id', { count: 'exact', head: true })
        .in('classroom_id', classIds);

      // 3. Count published materials
      const { data: publishedMats, count: materialsCount } = await supabase
        .from('materials')
        .select('id', { count: 'exact' })
        .in('classroom_id', classIds)
        .or('published.eq.true,published_at.not.is.null');

      const publishedMatIds = (publishedMats || []).map((m) => m.id);

      // 4. Count assignments
      const { count: assignmentsCount } = await supabase
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .in('classroom_id', classIds);

      // 5. Count pending submissions (graded_at is null)
      const { data: assignmentsList } = await supabase
        .from('assignments')
        .select('id')
        .in('classroom_id', classIds);

      const asgnIds = (assignmentsList || []).map((a) => a.id);
      let pendingCount = 0;
      if (asgnIds.length > 0) {
        const { count } = await supabase
          .from('assignment_submissions')
          .select('id', { count: 'exact', head: true })
          .in('assignment_id', asgnIds)
          .is('graded_at', null);
        pendingCount = count || 0;
      }

      // 6. Calculate material engagement % scoped strictly to teacher's materials
      let engagementPct = 0;
      if (publishedMatIds.length > 0 && enrolledCount) {
        const { count: viewsCount } = await supabase
          .from('material_views')
          .select('id', { count: 'exact', head: true })
          .in('material_id', publishedMatIds);
        const totalPossible = publishedMatIds.length * (enrolledCount || 1);
        engagementPct = Math.min(100, Math.round(((viewsCount || 0) / totalPossible) * 100));
      }

      setStats({
        classroomsCount: loadedClasses.length,
        enrolledStudentsCount: enrolledCount || 0,
        publishedMaterialsCount: materialsCount || 0,
        assignmentsCount: assignmentsCount || 0,
        pendingSubmissionsCount: pendingCount,
        averageEngagementPct: engagementPct,
      });
    } catch (err) {
      console.error('Error fetching teacher dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  return (
    <div className="space-y-8">
      {/* Welcome Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Teacher Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Welcome back, {profile?.full_name}. Here is an overview of your classrooms and engagement.
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Classrooms</span>
            <GraduationCap className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.classroomsCount}</p>
          <span className="text-[11px] text-gray-400">Total active</span>
        </div>

        <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Students</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.enrolledStudentsCount}</p>
          <span className="text-[11px] text-gray-400">Enrolled total</span>
        </div>

        <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Materials</span>
            <BookOpen className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.publishedMaterialsCount}</p>
          <span className="text-[11px] text-gray-400">Published</span>
        </div>

        <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Assignments</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.assignmentsCount}</p>
          <span className="text-[11px] text-gray-400">Tasks</span>
        </div>

        <div className="p-4 bg-white border border-amber-200 rounded-xl shadow-xs bg-amber-50/20">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700">{stats.pendingSubmissionsCount}</p>
          <span className="text-[11px] text-amber-600">Needs grading</span>
        </div>

        <div className="p-4 bg-white border border-emerald-200 rounded-xl shadow-xs bg-emerald-50/20">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Engagement</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700">{stats.averageEngagementPct}%</p>
          <span className="text-[11px] text-emerald-600">Seen rate</span>
        </div>
      </div>

      {/* Classrooms Grid Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h2 className="text-lg font-bold text-gray-900">Your Classrooms</h2>
          <Link
            to="/teacher/classrooms"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        ) : classrooms.length === 0 ? (
          <EmptyState
            title="No classrooms yet"
            description="Create your first classroom to begin inviting students and posting materials."
            action={{
              label: 'Create Classroom',
              onClick: () => setCreateModalOpen(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classrooms.slice(0, 6).map((c) => (
              <ClassroomCard key={c.id} classroom={c} isTeacher={true} />
            ))}
          </div>
        )}
      </div>

      <CreateClassroomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(newClassroom) => {
          if (newClassroom) {
            console.info('[ClassFlow] Prepending newly created classroom to dashboard view:', newClassroom);
            setClassrooms((prev) => [newClassroom, ...prev.filter((c) => c.id !== newClassroom.id)]);
            setStats((prev) => ({
              ...prev,
              classroomsCount: prev.classroomsCount + 1,
            }));
          }
          fetchDashboardData();
        }}
      />
    </div>
  );
};
