import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { NotificationItem } from '../../types/database';
import { Skeleton, EmptyState } from '../../components/ui/FeedbackStates';
import { Bell, Check, CheckCheck, BookOpen, FileText, Calendar, Megaphone, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export const StudentNotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications((data || []) as NotificationItem[]);
    } catch (err: unknown) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success('All notifications marked as read.');
    } catch (err) {
      toast.error('Failed to mark all as read');
    }
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'material_published':
        return <BookOpen className="w-5 h-5 text-blue-600" />;
      case 'assignment_published':
        return <FileText className="w-5 h-5 text-amber-600" />;
      case 'due_date_changed':
        return <Calendar className="w-5 h-5 text-red-600" />;
      case 'announcement_created':
        return <Megaphone className="w-5 h-5 text-indigo-600" />;
      case 'grade_released':
        return <Award className="w-5 h-5 text-emerald-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const filtered = notifications.filter((n) => (filter === 'unread' ? !n.is_read : true));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Notification Center</h1>
          <p className="text-xs text-gray-500 mt-1">
            System announcements, newly published materials, and released grades.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filter === 'unread'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {filter === 'unread' ? 'Showing Unread' : 'Filter Unread'}
          </button>
          <button
            onClick={markAllAsRead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
          >
            <CheckCheck className="w-4 h-4 text-blue-600" />
            <span>Mark All Read</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No notifications"
          description={
            filter === 'unread'
              ? 'You have read all your notifications!'
              : 'You do not have any notifications yet.'
          }
          icon={<Bell className="w-6 h-6 text-blue-600" />}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-2xs">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (!item.is_read) markAsRead(item.id);
                if (item.classroom_id) navigate(`/classrooms/${item.classroom_id}`);
              }}
              className={`p-4 flex items-start space-x-4 cursor-pointer transition-colors ${
                !item.is_read ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-gray-50/70'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-white border border-gray-200 shrink-0 shadow-2xs mt-0.5">
                {getIcon(item.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className={`text-sm ${!item.is_read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {item.title}
                  </h4>
                  <span className="text-xs text-gray-400">
                    {new Date(item.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{item.message}</p>
              </div>

              {!item.is_read && (
                <button
                  type="button"
                  onClick={(e) => markAsRead(item.id, e)}
                  className="p-1 text-blue-600 hover:text-blue-800"
                  title="Mark read"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 block" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
