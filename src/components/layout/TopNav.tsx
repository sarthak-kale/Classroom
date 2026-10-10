import React, { useState } from 'react';
import { useAuth } from '../../features/auth/AuthContext';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { Avatar } from '../ui/Avatar';
import { Menu, LogOut, User, Settings, GraduationCap, ChevronDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface TopNavProps {
  onToggleSidebar: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ onToggleSidebar }) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-gray-200 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 shadow-2xs">
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 lg:hidden focus:outline-hidden"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link to="/" className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold text-gray-900 tracking-tight leading-none">ClassFlow</span>
            <span className="text-[10px] text-gray-500 font-medium capitalize mt-0.5">
              {profile?.role === 'teacher' ? 'Teacher Portal' : 'Student Portal'}
            </span>
          </div>
        </Link>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Notifications Bell */}
        <NotificationBell />

        {/* User Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center space-x-2.5 p-1 rounded-full hover:bg-gray-100 transition-colors focus:outline-hidden"
          >
            <Avatar name={profile?.full_name || 'User'} url={profile?.avatar_url} size="md" />
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-semibold text-gray-900 leading-tight">
                {profile?.full_name || 'Loading...'}
              </span>
              <span className="text-[10px] text-gray-500 capitalize">{profile?.role}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 hidden md:block" />
          </button>

          {profileDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 animate-in fade-in zoom-in-95">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-900 truncate">{profile?.full_name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{profile?.email}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-blue-50 text-blue-700">
                    {profile?.role}
                  </span>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      navigate('/profile');
                    }}
                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center space-x-2 text-left"
                  >
                    <User className="w-4 h-4 text-gray-400" />
                    <span>My Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center space-x-2 text-left"
                  >
                    <Settings className="w-4 h-4 text-gray-400" />
                    <span>Account Settings</span>
                  </button>
                </div>

                <div className="border-t border-gray-100 pt-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      signOut();
                    }}
                    className="w-full px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2 text-left font-medium"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
