import React, { useState, useEffect } from 'react';
import { supabase, normalizeError } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Material } from '../../types/database';
import { MaterialCard } from '../../features/materials/MaterialCard';
import { CreateMaterialModal } from '../../features/materials/CreateMaterialModal';
import { SearchBar, Skeleton, EmptyState, ErrorState } from '../../components/ui/FeedbackStates';
import {
  BookOpen,
  Plus,
  Filter,
  FileText,
  Eye,
  CheckCircle2,
  FileCheck,
  Search,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

export const TeacherMaterialsPage: React.FC = () => {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('all');
  const [publishFilter, setPublishFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  const fetchMaterials = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      // 1. Get teacher's classrooms
      const { data: classList, error: classErr } = await supabase
        .from('classrooms')
        .select('id, name')
        .eq('teacher_id', user.id)
        .order('name', { ascending: true });

      if (classErr) throw classErr;
      const classes = classList || [];
      setClassrooms(classes);

      if (classes.length === 0) {
        setMaterials([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map((c) => c.id);

      // 2. Fetch all materials for teacher's classrooms
      const { data, error } = await supabase
        .from('materials')
        .select(`
          *,
          classroom:classrooms(id, name)
        `)
        .in('classroom_id', classIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMaterials((data || []) as Material[]);
    } catch (err: unknown) {
      console.error('[ClassFlow] fetchMaterials error:', err);
      const norm = normalizeError(err);
      setErrorMsg(norm.message);
      toast.error(norm.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, [user]);

  const filtered = materials.filter((m) => {
    if (selectedClassroomId !== 'all' && m.classroom_id !== selectedClassroomId) {
      return false;
    }
    const isPub = m.published ?? Boolean(m.published_at);
    if (publishFilter === 'published' && !isPub) return false;
    if (publishFilter === 'draft' && isPub) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  });

  const publishedCount = materials.filter((m) => m.published ?? Boolean(m.published_at)).length;
  const draftCount = materials.length - publishedCount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Header - Google Classroom Inspired */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Classwork & Resources</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Study Materials</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Upload course readings, lecture slides, and reference links. Monitor which students have opened and reviewed them in real time.
          </p>
        </div>

        {classrooms.length > 0 && (
          <button
            onClick={() => {
              setEditingMaterial(null);
              setCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors shrink-0 self-start md:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Study Material</span>
          </button>
        )}
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Materials</p>
            <p className="text-xl font-bold text-gray-900">{materials.length}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Published Items</p>
            <p className="text-xl font-bold text-emerald-700">{publishedCount}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Drafts</p>
            <p className="text-xl font-bold text-amber-700">{draftCount}</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search materials by title or topic..."
          className="w-full sm:w-80"
        />

        <div className="flex items-center flex-wrap gap-2">
          {/* Status Chips */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-2xs">
            <button
              onClick={() => setPublishFilter('all')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                publishFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All ({materials.length})
            </button>
            <button
              onClick={() => setPublishFilter('published')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                publishFilter === 'published'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Published ({publishedCount})
            </button>
            <button
              onClick={() => setPublishFilter('draft')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                publishFilter === 'draft'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Drafts ({draftCount})
            </button>
          </div>

          {/* Classroom Dropdown */}
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

      {/* Material Cards List */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : errorMsg ? (
        <ErrorState
          title="Failed to load study materials"
          message={errorMsg}
          onRetry={fetchMaterials}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No study materials found"
          description={
            materials.length === 0
              ? 'You have not uploaded any study materials yet. Click "Add Study Material" to share course readings and notes.'
              : 'No materials matched your filter criteria.'
          }
          icon={<BookOpen className="w-8 h-8 text-blue-600" />}
          action={
            materials.length === 0 && classrooms.length > 0
              ? {
                  label: 'Upload First Material',
                  onClick: () => setCreateModalOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3.5">
          {filtered.map((mat) => (
            <MaterialCard
              key={mat.id}
              material={mat}
              isTeacher={true}
              classroomName={mat.classroom?.name}
              onEdit={(m) => {
                setEditingMaterial(m);
                setCreateModalOpen(true);
              }}
              onDeleted={fetchMaterials}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Material Modal */}
      {createModalOpen && (
        <CreateMaterialModal
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setEditingMaterial(null);
          }}
          classroomId={
            editingMaterial?.classroom_id ||
            (selectedClassroomId !== 'all' ? selectedClassroomId : classrooms[0]?.id || '')
          }
          classrooms={classrooms}
          initialMaterial={editingMaterial}
          onSaved={fetchMaterials}
        />
      )}
    </div>
  );
};
