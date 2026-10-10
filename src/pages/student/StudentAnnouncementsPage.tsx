import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { SearchBar, Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import { Megaphone, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

export const StudentAnnouncementsPage: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAnnouncements = async () => {
    if (!user) return;
    try {
      setLoading(true);

      const { data: memberRows } = await supabase
        .from('classroom_members')
        .select('classroom_id')
        .eq('student_id', user.id);

      const classIds = (memberRows || []).map((m: any) => m.classroom_id);

      if (classIds.length === 0) {
        setAnnouncements([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('announcements')
        .select(`
          *,
          classroom:classrooms!announcements_classroom_id_fkey(name),
          author:profiles!announcements_author_id_fkey(*)
        `)
        .in('classroom_id', classIds)
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

  const filtered = announcements.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.content.toLowerCase().includes(q) || (a.classroom?.name && a.classroom.name.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Announcements Feed</h1>
        <p className="text-xs text-gray-500 mt-1">
          Stay up to date with updates, reminders, and notices from your teachers.
        </p>
      </div>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search announcements..."
        className="w-full sm:w-80"
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No announcements"
          description="Your teachers have not posted any class announcements yet."
          icon={<Megaphone className="w-6 h-6 text-blue-600" />}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-2xs hover:border-gray-300 transition-colors space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <Avatar
                    name={item.author?.full_name || 'Instructor'}
                    url={item.author?.avatar_url}
                    size="md"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 leading-tight">
                      {item.author?.full_name || 'Instructor'}
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(item.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  <GraduationCap className="w-3.5 h-3.5" />
                  {item.classroom?.name || 'Classroom'}
                </span>
              </div>

              <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                {item.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
