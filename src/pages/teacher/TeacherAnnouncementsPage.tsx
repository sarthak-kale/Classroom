import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Announcement } from '../../types/database';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchBar, Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import { Megaphone, Trash2, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

export const TeacherAnnouncementsPage: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAnnouncements = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          *,
          classroom:classrooms!announcements_classroom_id_fkey(name),
          author:profiles!announcements_author_id_fkey(*)
        `)
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err: unknown) {
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [user]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('Announcement removed.');
      setDeleteId(null);
      fetchAnnouncements();
    } catch (err: unknown) {
      toast.error('Failed to delete announcement');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = announcements.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.content.toLowerCase().includes(q) || (a.classroom?.name && a.classroom.name.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Announcements</h1>
        <p className="text-xs text-gray-500 mt-1">
          Review broadcast messages and updates sent to your students.
        </p>
      </div>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search announcement content..."
        className="w-full sm:w-80"
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No announcements found"
          description="You haven't posted any announcements yet."
          icon={<Megaphone className="w-6 h-6 text-blue-600" />}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-2xs hover:border-gray-300 transition-colors flex items-start justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    <GraduationCap className="w-3.5 h-3.5" />
                    {item.classroom?.name || 'Classroom'}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {new Date(item.created_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {item.content}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDeleteId(item.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete announcement"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="Delete Announcement"
        message="Are you sure you want to delete this announcement?"
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
