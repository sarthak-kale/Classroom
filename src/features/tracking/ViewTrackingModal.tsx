import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ViewTrackingResponse, StudentViewTrackingRecord } from '../../types/database';
import { SeenBadge } from '../../components/ui/StatusBadge';
import { Avatar } from '../../components/ui/Avatar';
import { SearchBar, Skeleton, ErrorState, EmptyState } from '../../components/ui/FeedbackStates';
import {
  X,
  Users,
  Eye,
  EyeOff,
  BarChart3,
  RefreshCw,
  FileText,
  Calendar,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpDown
} from 'lucide-react';
import { toast } from 'sonner';

interface ViewTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'material' | 'assignment';
  entityId: string;
  title: string;
  fileName?: string | null;
  classroomName?: string | null;
  publicationDate?: string | null;
}

export const ViewTrackingModal: React.FC<ViewTrackingModalProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  title,
  fileName: propFileName,
  classroomName: propClassroomName,
  publicationDate: propPublicationDate,
}) => {
  const [data, setData] = useState<ViewTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'seen' | 'unseen'>('all');
  const [sortBy, setSortBy] = useState<'unseen_first' | 'seen_first' | 'name_asc' | 'name_desc' | 'first_viewed' | 'views'>('unseen_first');

  const fetchTracking = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const rpcName = entityType === 'material' ? 'get_material_view_tracking' : 'get_assignment_view_tracking';
      const paramName = entityType === 'material' ? 'p_material_id' : 'p_assignment_id';

      // 1. Attempt canonical secure RPC
      const { data: resData, error: rpcError } = await supabase.rpc(rpcName, {
        [paramName]: entityId,
      });

      if (!rpcError && resData) {
        setData(resData as ViewTrackingResponse);
        return;
      }

      // 2. Direct fallback query if RPC is missing or fails
      if (entityType === 'material') {
        const { data: matData, error: matErr } = await supabase
          .from('materials')
          .select(`
            id,
            title,
            file_name,
            file_path,
            file_url,
            published,
            published_at,
            created_at,
            classroom_id,
            classroom:classrooms(id, name, teacher_id)
          `)
          .eq('id', entityId)
          .single();

        if (matErr || !matData) throw matErr || new Error('Material not found');

        const classroomInfo = Array.isArray(matData.classroom) ? matData.classroom[0] : matData.classroom;
        const teacherId = classroomInfo?.teacher_id;

        // Fetch enrolled members with profiles (excluding teachers)
        const { data: members, error: memErr } = await supabase
          .from('classroom_members')
          .select('student_id, student:profiles(id, full_name, email, avatar_url, role)')
          .eq('classroom_id', matData.classroom_id);

        if (memErr) throw memErr;

        // Fetch material views
        const { data: views, error: viewErr } = await supabase
          .from('material_views')
          .select('*')
          .eq('material_id', entityId);

        if (viewErr) throw viewErr;

        const viewMap = new Map((views || []).map((v) => [v.student_id, v]));

        // Filter out teachers and non-student roles from student tracking
        const eligibleMembers = (members || []).filter((m: any) => {
          if (m.student_id === teacherId) return false;
          if (m.student?.role === 'teacher') return false;
          return true;
        });

        const studentsList: StudentViewTrackingRecord[] = eligibleMembers.map((m: any) => {
          const profile = m.student;
          const v = viewMap.get(m.student_id);
          const hasViewed = Boolean(v);

          const rawName = profile?.full_name?.trim();
          const fallbackName = profile?.email ? profile.email.split('@')[0] : `Student (${m.student_id.slice(0, 6)})`;

          return {
            student_id: m.student_id,
            full_name: rawName || fallbackName,
            email: profile?.email || '—',
            avatar_url: profile?.avatar_url || null,
            status: hasViewed ? 'seen' : 'unseen',
            first_viewed_at: v?.first_viewed_at || null,
            last_viewed_at: v?.last_viewed_at || null,
            view_count: v?.view_count || 0,
          };
        });

        const enrolledCount = studentsList.length;
        const seenCount = studentsList.filter((s) => s.status === 'seen').length;
        const unseenCount = Math.max(0, enrolledCount - seenCount);
        const engagementPct = enrolledCount > 0 ? Math.round((seenCount / enrolledCount) * 1000) / 10 : 0.0;

        const derivedFileName =
          matData.file_name ||
          (matData.file_path || matData.file_url ? (matData.file_path || matData.file_url).split('/').pop()?.replace(/^\d+_/, '') : null);

        setData({
          material_id: entityId,
          title: matData.title,
          file_name: derivedFileName,
          classroom_name: classroomInfo?.name || propClassroomName || null,
          published_at: matData.published_at || (matData.published ? matData.created_at : null),
          summary: {
            enrolled_count: enrolledCount,
            seen_count: seenCount,
            unseen_count: unseenCount,
            engagement_pct: engagementPct,
          },
          students: studentsList,
        });
      } else {
        throw rpcError || new Error('View tracking data unavailable');
      }
    } catch (err: unknown) {
      console.error('[ClassFlow] Failed to load view tracking:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tracking data');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, propClassroomName]);

  useEffect(() => {
    if (!isOpen || !entityId) return;
    fetchTracking();

    // Setup Realtime subscription on views table for instant synchronization
    const channelName = `view_tracking_${entityType}_${entityId}_${Date.now()}`;
    const targetTable = entityType === 'material' ? 'material_views' : 'assignment_views';
    const filterColumn = entityType === 'material' ? 'material_id' : 'assignment_id';

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: targetTable,
          filter: `${filterColumn}=eq.${entityId}`,
        },
        () => {
          // Re-fetch via authorized query to guarantee validated data
          fetchTracking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, entityId, entityType, fetchTracking]);

  // Derived display values
  const effectiveFileName = data?.file_name || propFileName || 'No file attached';
  const effectiveClassroomName = data?.classroom_name || propClassroomName || 'Classroom';
  const rawPubDate = data?.published_at || propPublicationDate;
  const formattedPubDate = rawPubDate
    ? new Date(rawPubDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not published';

  // Filtered & Sorted Students
  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];

    let list = [...data.students];

    // Search query filter (by name or email)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          (s.full_name && s.full_name.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q))
      );
    }

    // Status filter (all / seen / unseen)
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'unseen_first') {
        if (a.status !== b.status) return a.status === 'unseen' ? -1 : 1;
        return a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === 'seen_first') {
        if (a.status !== b.status) return a.status === 'seen' ? -1 : 1;
        return a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === 'name_asc') {
        return a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === 'name_desc') {
        return b.full_name.localeCompare(a.full_name);
      }
      if (sortBy === 'first_viewed') {
        const timeA = a.first_viewed_at ? new Date(a.first_viewed_at).getTime() : 0;
        const timeB = b.first_viewed_at ? new Date(b.first_viewed_at).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'views') {
        return b.view_count - a.view_count;
      }
      return 0;
    });

    return list;
  }, [data, searchQuery, statusFilter, sortBy]);

  if (!isOpen) return null;

  const totalStudents = data?.summary.enrolled_count ?? 0;
  const seenCount = data?.summary.seen_count ?? 0;
  const unseenCount = data?.summary.unseen_count ?? 0;
  const viewRate = data?.summary.engagement_pct ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/90">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md">
                  Material View Tracking
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <h2 className="text-base font-bold text-gray-900 truncate max-w-md mt-0.5" title={title}>
                {title}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={fetchTracking}
              disabled={loading}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-200/70 transition-colors border border-gray-200 bg-white"
              title="Refresh tracking data"
              aria-label="Refresh tracking data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 transition-colors border border-gray-200 bg-white"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !data ? (
            <div className="space-y-4">
              <Skeleton className="h-24 rounded-2xl" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : error ? (
            <ErrorState
              title="Failed to load material view tracking"
              message={error}
              onRetry={fetchTracking}
            />
          ) : data ? (
            <>
              {/* ==================================================
                  1. MATERIAL INFORMATION CARD
                  ================================================== */}
              <div className="p-4 bg-gradient-to-r from-slate-50 via-gray-50 to-blue-50/30 border border-gray-200 rounded-2xl shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Material Information</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block font-medium">Material Title</span>
                    <span className="font-semibold text-gray-900 truncate block mt-0.5" title={data.title || title}>
                      {data.title || title}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block font-medium">File Name</span>
                    <span className="font-semibold text-gray-900 truncate block mt-0.5" title={effectiveFileName}>
                      {effectiveFileName}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block font-medium">Classroom</span>
                    <span className="font-semibold text-gray-900 truncate block mt-0.5" title={effectiveClassroomName}>
                      {effectiveClassroomName}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block font-medium">Publication Date</span>
                    <span className="font-semibold text-gray-900 truncate block mt-0.5" title={formattedPubDate}>
                      {formattedPubDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* ==================================================
                  2. SUMMARY CARDS
                  ================================================== */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* 1. TOTAL STUDENTS */}
                <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-2xs hover:border-gray-300 transition-all">
                  <div className="flex items-center justify-between text-gray-500 mb-1">
                    <span className="text-xs font-bold tracking-wide uppercase text-gray-600">Total Students</span>
                    <Users className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-2xl font-extrabold text-gray-900">{totalStudents}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Enrolled in classroom</p>
                </div>

                {/* 2. SEEN */}
                <div className="p-4 bg-white border border-blue-200 rounded-xl shadow-2xs bg-blue-50/20 hover:border-blue-300 transition-all">
                  <div className="flex items-center justify-between text-blue-700 mb-1">
                    <span className="text-xs font-bold tracking-wide uppercase text-blue-700">Seen</span>
                    <Eye className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-blue-700">{seenCount}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Opened material</p>
                </div>

                {/* 3. UNSEEN */}
                <div className="p-4 bg-white border border-amber-200 rounded-xl shadow-2xs bg-amber-50/20 hover:border-amber-300 transition-all">
                  <div className="flex items-center justify-between text-amber-700 mb-1">
                    <span className="text-xs font-bold tracking-wide uppercase text-amber-700">Unseen</span>
                    <EyeOff className="w-4 h-4 text-amber-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-amber-700">{unseenCount}</p>
                  <p className="text-xs text-amber-500 mt-0.5">Not opened yet</p>
                </div>

                {/* 4. VIEW RATE */}
                <div className="p-4 bg-white border border-emerald-200 rounded-xl shadow-2xs bg-emerald-50/20 hover:border-emerald-300 transition-all">
                  <div className="flex items-center justify-between text-emerald-700 mb-1">
                    <span className="text-xs font-bold tracking-wide uppercase text-emerald-700">View Rate</span>
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-emerald-700">{viewRate}%</p>
                  <div className="w-full bg-emerald-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, viewRate))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Status Alert Banners */}
              {totalStudents > 0 && seenCount === totalStudents && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">All eligible students have viewed this material.</span>
                </div>
              )}

              {totalStudents > 0 && seenCount === 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2.5 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-semibold">No students have viewed this material yet. All enrolled students are listed below.</span>
                </div>
              )}

              {/* Controls bar: Search & Filters */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search students by name or email..."
                  className="w-full sm:w-80"
                />

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                    aria-label="Filter by viewing status"
                  >
                    <option value="all">All Students ({totalStudents})</option>
                    <option value="seen">Seen Only ({seenCount})</option>
                    <option value="unseen">Unseen Only ({unseenCount})</option>
                  </select>

                  {/* Sort Filter */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                    aria-label="Sort student list"
                  >
                    <option value="unseen_first">Sort: Unseen First</option>
                    <option value="seen_first">Sort: Seen First</option>
                    <option value="name_asc">Sort: Name (A–Z)</option>
                    <option value="name_desc">Sort: Name (Z–A)</option>
                    <option value="first_viewed">Sort: First Viewed</option>
                    <option value="views">Sort: Total Views</option>
                  </select>
                </div>
              </div>

              {/* ==================================================
                  3. STUDENT-BY-STUDENT TRACKING TABLE
                  ================================================== */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                {filteredStudents.length === 0 ? (
                  <EmptyState
                    title="No students found"
                    description={
                      totalStudents === 0
                        ? 'No eligible students are currently enrolled in this classroom.'
                        : 'No students matched your search criteria.'
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        <tr>
                          <th scope="col" className="px-5 py-3.5">Student Name</th>
                          <th scope="col" className="px-5 py-3.5">Email</th>
                          <th scope="col" className="px-5 py-3.5">Material Status</th>
                          <th scope="col" className="px-5 py-3.5">First Viewed</th>
                          <th scope="col" className="px-5 py-3.5">Last Viewed</th>
                          <th scope="col" className="px-5 py-3.5 text-center">Total Views</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredStudents.map((st) => (
                          <tr
                            key={st.student_id}
                            className={`hover:bg-gray-50/70 transition-colors ${
                              st.status === 'unseen' ? 'bg-amber-50/10' : ''
                            }`}
                          >
                            {/* Student Name */}
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <div className="flex items-center space-x-3">
                                <Avatar name={st.full_name} url={st.avatar_url} size="sm" />
                                <div>
                                  <div className="font-semibold text-gray-900 text-sm">
                                    {st.full_name}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Email */}
                            <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600">
                              {st.email || '—'}
                            </td>

                            {/* Material Status */}
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <SeenBadge
                                status={st.status}
                                firstViewedAt={st.first_viewed_at}
                                viewCount={st.view_count}
                              />
                            </td>

                            {/* First Viewed */}
                            <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 font-medium">
                              {st.first_viewed_at ? (
                                <span title={new Date(st.first_viewed_at).toISOString()}>
                                  {new Date(st.first_viewed_at).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              ) : (
                                <span className="text-gray-400 font-bold">—</span>
                              )}
                            </td>

                            {/* Last Viewed */}
                            <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600">
                              {st.last_viewed_at ? (
                                <span title={new Date(st.last_viewed_at).toISOString()}>
                                  {new Date(st.last_viewed_at).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              ) : (
                                <span className="text-gray-400 font-bold">—</span>
                              )}
                            </td>

                            {/* Total Views */}
                            <td className="px-5 py-3.5 whitespace-nowrap text-center text-xs font-semibold">
                              {st.view_count > 0 ? (
                                <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                                  {st.view_count}
                                </span>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {data ? (
              <>
                Showing {filteredStudents.length} of {totalStudents} enrolled student{totalStudents === 1 ? '' : 's'}
              </>
            ) : null}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors shadow-2xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
