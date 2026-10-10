import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  FileText,
  Users,
  Megaphone,
  BarChart3,
  Settings,
  Bell,
  User,
  Home,
  X,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';

  const teacherNavItems = [
    { name: 'Dashboard', to: '/teacher/dashboard', icon: LayoutDashboard },
    { name: 'My Classrooms', to: '/teacher/classrooms', icon: GraduationCap },
    { name: 'Materials', to: '/teacher/materials', icon: BookOpen },
    { name: 'Assignments', to: '/teacher/assignments', icon: FileText },
    { name: 'Students', to: '/teacher/students', icon: Users },
    { name: 'Announcements', to: '/teacher/announcements', icon: Megaphone },
    { name: 'Analytics', to: '/teacher/analytics', icon: BarChart3 },
    { name: 'Settings', to: '/settings', icon: Settings },
  ];

  const studentNavItems = [
    { name: 'Home', to: '/student/home', icon: Home },
    { name: 'My Classrooms', to: '/student/classrooms', icon: GraduationCap },
    { name: 'Materials', to: '/student/materials', icon: BookOpen },
    { name: 'Assignments', to: '/student/assignments', icon: FileText },
    { name: 'Announcements', to: '/student/announcements', icon: Megaphone },
    { name: 'Notifications', to: '/student/notifications', icon: Bell },
    { name: 'Profile', to: '/profile', icon: User },
    { name: 'Settings', to: '/settings', icon: Settings },
  ];

  const navItems = isTeacher ? teacherNavItems : studentNavItems;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200 lg:hidden">
          <span className="font-bold text-gray-900 text-base">ClassFlow</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role identifier badge in sidebar */}
        <div className="px-5 py-4 border-b border-gray-100 hidden lg:block">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {isTeacher ? 'Instructor Portal' : 'Learner Portal'}
          </div>
          <div className="text-xs font-medium text-gray-700 truncate mt-0.5">
            Signed in as {profile?.full_name}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  `flex items-center px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`
                }
              >
                <Icon className="w-4 h-4 mr-3 shrink-0 stroke-[2.2]" />
                <span className="truncate">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-gray-100 text-[11px] text-gray-400">
          <div className="flex items-center justify-between">
            <span>ClassFlow v1.0</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Connected" />
          </div>
          <div className="mt-0.5 text-[10px] text-gray-400">Seen/Unseen Tracking Enabled</div>
        </div>
      </aside>
    </>
  );
};
