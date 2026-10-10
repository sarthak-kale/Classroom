import React, { useState } from 'react';
import { Announcement } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/FeedbackStates';
import { Megaphone, Send, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AnnouncementFeedProps {
  classroomId: string;
  announcements: Announcement[];
  isTeacher: boolean;
  onRefresh: () => void;
}

export const AnnouncementFeed: React.FC<AnnouncementFeedProps> = ({
  classroomId,
  announcements,
  isTeacher,
  onRefresh,
}) => {
  const { user, profile } = useAuth();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('announcements').insert({
        classroom_id: classroomId,
        author_id: user.id,
        content: content.trim(),
      });

      if (error) throw error;
      toast.success('Announcement posted to class stream.');
      setContent('');
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ content: editContent.trim() })
        .eq('id', id);

      if (error) throw error;
      toast.success('Announcement updated.');
      setEditingId(null);
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('Announcement deleted.');
      setDeleteId(null);
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Post Composer for Teacher */}
      {isTeacher && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-start space-x-3 mb-3">
            <Avatar name={profile?.full_name || 'Teacher'} url={profile?.avatar_url} size="md" />
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">
                Announce something to your class
              </label>
              <textarea
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Share updates, reminders, exam schedules, or greetings..."
                className="w-full p-3 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handlePost}
              disabled={submitting || !content.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-40 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Posting...' : 'Post Announcement'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Announcements Stream */}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            description="When your teacher posts updates or notices, they will appear here."
            icon={<Megaphone className="w-6 h-6 text-blue-600" />}
          />
        ) : (
          announcements.map((ann) => {
            const isEditing = editingId === ann.id;
            return (
              <div
                key={ann.id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-2xs hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center space-x-3">
                    <Avatar
                      name={ann.author?.full_name || 'Instructor'}
                      url={ann.author?.avatar_url}
                      size="md"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 leading-tight">
                        {ann.author?.full_name || 'Instructor'}
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(ann.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {isTeacher && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => {
                          setEditingId(ann.id);
                          setEditContent(ann.content);
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                        title="Edit announcement"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(ann.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                        title="Delete announcement"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2 mt-2">
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-2.5 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdate(ann.id)}
                        className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                    {ann.content}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="Delete Announcement"
        message="Are you sure you want to delete this announcement from the classroom feed?"
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
