/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

// Shared Pages
import { ClassroomDetailPage } from './pages/classrooms/ClassroomDetailPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { SettingsPage } from './pages/settings/SettingsPage';

// Teacher Pages
import { TeacherDashboardPage } from './pages/teacher/TeacherDashboardPage';
import { TeacherClassroomsPage } from './pages/teacher/TeacherClassroomsPage';
import { TeacherMaterialsPage } from './pages/teacher/TeacherMaterialsPage';
import { TeacherAssignmentsPage } from './pages/teacher/TeacherAssignmentsPage';
import { TeacherStudentsPage } from './pages/teacher/TeacherStudentsPage';
import { TeacherAnnouncementsPage } from './pages/teacher/TeacherAnnouncementsPage';
import { TeacherAnalyticsPage } from './pages/teacher/TeacherAnalyticsPage';

// Student Pages
import { StudentHomePage } from './pages/student/StudentHomePage';
import { StudentClassroomsPage } from './pages/student/StudentClassroomsPage';
import { StudentMaterialsPage } from './pages/student/StudentMaterialsPage';
import { StudentAssignmentsPage } from './pages/student/StudentAssignmentsPage';
import { StudentAnnouncementsPage } from './pages/student/StudentAnnouncementsPage';
import { StudentNotificationsPage } from './pages/student/StudentNotificationsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Root Redirector based on User Role
const RootRedirect: React.FC = () => {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFD] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (profile?.role === 'teacher') {
    return <Navigate to="/teacher/dashboard" replace />;
  }
  return <Navigate to="/student/home" replace />;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Authenticated Application Layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<RootRedirect />} />

              {/* Shared Protected Routes */}
              <Route path="classrooms/:id" element={<ClassroomDetailPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />

              {/* Teacher Portal Routes */}
              <Route
                path="teacher/dashboard"
                element={
                  <ProtectedRoute allowedRole="teacher">
                    <TeacherDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teacher/classrooms"
                element={
                  <ProtectedRoute allowedRole="teacher">
                    <TeacherClassroomsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teacher/materials"
                element={
                  <ProtectedRoute allowedRole="teacher">
                    <TeacherMaterialsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teacher/assignments"
                element={
                  <ProtectedRoute allowedRole="teacher">
                    <TeacherAssignmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teacher/students"
                element={
                  <ProtectedRoute allowedRole="teacher">
                    <TeacherStudentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teacher/announcements"
                element={
                  <ProtectedRoute allowedRole="teacher">
                    <TeacherAnnouncementsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="teacher/analytics"
                element={
                  <ProtectedRoute allowedRole="teacher">
                    <TeacherAnalyticsPage />
                  </ProtectedRoute>
                }
              />

              {/* Student Portal Routes */}
              <Route
                path="student/home"
                element={
                  <ProtectedRoute allowedRole="student">
                    <StudentHomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="student/classrooms"
                element={
                  <ProtectedRoute allowedRole="student">
                    <StudentClassroomsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="student/materials"
                element={
                  <ProtectedRoute allowedRole="student">
                    <StudentMaterialsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="student/assignments"
                element={
                  <ProtectedRoute allowedRole="student">
                    <StudentAssignmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="student/announcements"
                element={
                  <ProtectedRoute allowedRole="student">
                    <StudentAnnouncementsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="student/notifications"
                element={
                  <ProtectedRoute allowedRole="student">
                    <StudentNotificationsPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors theme="light" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
