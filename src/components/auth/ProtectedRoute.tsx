import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { UserRole } from '../../types/database';
import { GraduationCap } from 'lucide-react';
import { SetupSupabaseScreen } from '../SetupSupabaseScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: UserRole;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRole }) => {
  const { user, profile, isLoading, isConfigured } = useAuth();
  const location = useLocation();

  if (!isConfigured) {
    return <SetupSupabaseScreen />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFD] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md animate-pulse">
          <GraduationCap className="w-7 h-7" />
        </div>
        <p className="text-xs text-gray-500 font-medium">Verifying authorization...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If role is required and doesn't match
  if (allowedRole && profile && profile.role !== allowedRole) {
    if (profile.role === 'teacher') {
      return <Navigate to="/teacher/dashboard" replace />;
    } else {
      return <Navigate to="/student/home" replace />;
    }
  }

  return <>{children}</>;
};
