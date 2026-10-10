import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Material } from '../../types/database';
import { MaterialCard } from '../../features/materials/MaterialCard';
import { SearchBar, Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import {
  BookOpen,
  CheckCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';

export const StudentMaterialsPage: React.FC = () => {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('all');
  const [seenFilter, setSeenFilter] = useState<'all' | 'unseen' | 'seen'>('all');

  const fetchMaterials = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Fetch classrooms student is enrolled in
      const { data: memberRows, error: memberErr } = await supabase
        .from('classroom_members')
        .select('classroom:classrooms(id, name)')
        .eq('student_id', user.id);

      if (memberErr) throw memberErr;

      const classes = (memberRows || []).map((m: any) => m.classroom).filter(Boolean);
      setClassrooms(classes);

      if (classes.length === 0) {
        setMaterials([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map((c: any) => c.id);

      // 2. Fetch published materials with student view tracking
      const { data, error } = await supabase
        .from('materials')
        .select(`
          *,
          classroom:classrooms(id, name),
          user_view:material_views!material_views_material_id_fkey(*)
        `)
        .in('classroom_id', classIds)
        .or('published.eq.true,published_at.not.is.null')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processed = (data || []).map((m: any) => ({
        ...m,
        user_view: Array.isArray(m.user_view)
          ? m.user_view.find((v: any) => v.student_id === user.id) || null
          : m.user_view,
      }));

      setMaterials(processed as Material[]);
    } catch (err: unknown) {
      console.error('[ClassFlow] fetchMaterials error:', err);
      toast.error('Failed to load study materials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, [user]);

  // Update local view status optimistically
  const handleStatusToggled = (materialId: string, seen: boolean) => {
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id !== materialId) return m;
        return {
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
        };
      })
    );
  };

  const filtered = materials.filter((m) => {
    if (selectedClassroomId !== 'all' && m.classroom_id !== selectedClassroomId) {
      return false;
    }
    const isSeen = Boolean(m.user_view);
    if (seenFilter === 'seen' && !isSeen) return false;
    if (seenFilter === 'unseen' && isSeen) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  });

  const unseenCount = materials.filter((m) => !m.user_view).length;
  const seenCount = materials.filter((m) => Boolean(m.user_view)).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner - Google Classroom Inspired */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Learning Resources</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Study Materials</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Review lecture notes, readings, and downloadable attachments. Opening a material automatically marks it as Seen.
          </p>
        </div>

        {unseenCount > 0 && (
          <div className="flex items-center space-x-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs font-medium self-start md:self-auto shadow-2xs">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              You have <strong className="font-bold text-blue-900">{unseenCount}</strong> new {unseenCount === 1 ? 'material' : 'materials'} to review
            </span>
          </div>
        )}
      </div>

      {/* Progress Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Published Items</p>
            <p className="text-xl font-bold text-gray-900">{materials.length}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Unseen / To Review</p>
            <p className="text-xl font-bold text-amber-700">{unseenCount}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Seen & Reviewed</p>
            <p className="text-xl font-bold text-emerald-700">{seenCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search materials by title or topic..."
          className="w-full sm:w-80"
        />

        <div className="flex items-center flex-wrap gap-2">
          {/* Seen / Unseen Status Tabs */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-2xs">
            <button
              onClick={() => setSeenFilter('all')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                seenFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All ({materials.length})
            </button>
            <button
              onClick={() => setSeenFilter('unseen')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                seenFilter === 'unseen'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Unseen ({unseenCount})
            </button>
            <button
              onClick={() => setSeenFilter('seen')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                seenFilter === 'seen'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Seen ({seenCount})
            </button>
          </div>

          {/* Classroom Selector */}
          <select
            value={selectedClassroomId}
            onChange={(e) => setSelectedClassroomId(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
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

      {/* Materials List */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No study materials found"
          description={
            materials.length === 0
              ? 'No study materials have been published in your enrolled classrooms yet.'
              : 'No study materials matched your current search and filter settings.'
          }
          icon={<BookOpen className="w-8 h-8 text-blue-600" />}
        />
      ) : (
        <div className="space-y-3.5">
          {filtered.map((mat) => (
            <MaterialCard
              key={mat.id}
              material={mat}
              isTeacher={false}
              classroomName={mat.classroom?.name}
              onStatusToggled={handleStatusToggled}
            />
          ))}
        </div>
      )}
    </div>
  );
};
