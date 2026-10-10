import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Skeleton } from '../../components/ui/FeedbackStates';
import { BarChart3, TrendingUp, Users, CheckCircle, Eye, Award } from 'lucide-react';

export const TeacherAnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalMaterials, setTotalMaterials] = useState(0);
  const [totalAssignments, setTotalAssignments] = useState(0);
  const [totalMaterialViews, setTotalMaterialViews] = useState(0);
  const [totalSubmissions, setTotalSubmissions] = useState(0);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!user) return;
      try {
        setLoading(true);

        const { data: classrooms } = await supabase
          .from('classrooms')
          .select('id')
          .eq('teacher_id', user.id);

        const classIds = (classrooms || []).map((c) => c.id);

        if (classIds.length === 0) {
          setLoading(false);
          return;
        }

        const [mems, mats, asgns] = await Promise.all([
          supabase.from('classroom_members').select('id', { count: 'exact', head: true }).in('classroom_id', classIds),
          supabase.from('materials').select('id').in('classroom_id', classIds),
          supabase.from('assignments').select('id').in('classroom_id', classIds),
        ]);

        const matIds = (mats.data || []).map((m) => m.id);
        const asgnIds = (asgns.data || []).map((a) => a.id);

        let mViewsCount = 0;
        let subsCount = 0;

        if (matIds.length > 0) {
          const res = await supabase.from('material_views').select('id', { count: 'exact', head: true }).in('material_id', matIds);
          mViewsCount = res.count || 0;
        }

        if (asgnIds.length > 0) {
          const res = await supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).in('assignment_id', asgnIds);
          subsCount = res.count || 0;
        }

        setTotalStudents(mems.count || 0);
        setTotalMaterials(matIds.length);
        setTotalAssignments(asgnIds.length);
        setTotalMaterialViews(mViewsCount);
        setTotalSubmissions(subsCount);
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [user]);

  const viewEngagementRate =
    totalStudents && totalMaterials
      ? Math.min(100, Math.round((totalMaterialViews / (totalStudents * totalMaterials)) * 100))
      : 0;

  const submissionRate =
    totalStudents && totalAssignments
      ? Math.min(100, Math.round((totalSubmissions / (totalStudents * totalAssignments)) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analytics & Insights</h1>
        <p className="text-xs text-gray-500 mt-1">
          Real-time metrics on content discovery, seen status, and assignment submission trends.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Enrolled</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{totalStudents}</p>
              <p className="text-xs text-gray-400 mt-1">Across all your courses</p>
            </div>

            <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Views</span>
                <Eye className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{totalMaterialViews}</p>
              <p className="text-xs text-gray-400 mt-1">Recorded material view events</p>
            </div>

            <div className="p-5 bg-white border border-blue-200 rounded-xl shadow-xs bg-blue-50/20">
              <div className="flex items-center justify-between text-blue-700 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Material Seen Rate</span>
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-3xl font-extrabold text-blue-700">{viewEngagementRate}%</p>
              <p className="text-xs text-blue-500 mt-1">Average views per enrolled student</p>
            </div>

            <div className="p-5 bg-white border border-amber-200 rounded-xl shadow-xs bg-amber-50/20">
              <div className="flex items-center justify-between text-amber-700 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Submission Rate</span>
                <Award className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-3xl font-extrabold text-amber-700">{submissionRate}%</p>
              <p className="text-xs text-amber-500 mt-1">Completed assignments</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-gray-900">How ClassFlow Tracks Engagement</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Whenever a learner opens a published study guide or assignment, the application executes an atomic, idempotent database RPC function (<code>record_material_view</code> or <code>record_assignment_view</code>). This updates the WhatsApp-style <strong>Seen status</strong> instantly, capturing the first timestamp, last timestamp, and cumulative view count.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                <span className="font-semibold text-gray-900 block">Strict Data Isolation</span>
                <p className="text-gray-600">Students cannot forge view records or manipulate timestamps directly because direct insert/update operations are disabled via PostgreSQL Row Level Security (RLS).</p>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                <span className="font-semibold text-gray-900 block">Exclusion of Removed Members</span>
                <p className="text-gray-600">If a student leaves or is removed from a course, their prior views are kept historically but strictly excluded from active class engagement totals.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
