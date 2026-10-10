import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { X, KeyRound, ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface JoinClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoined: (classroomId: string) => void;
}

export const JoinClassroomModal: React.FC<JoinClassroomModalProps> = ({
  isOpen,
  onClose,
  onJoined,
}) => {
  const { user, profile } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Normalize class code:
    // - Trim leading and trailing whitespace
    // - Convert to uppercase
    // - Remove interior whitespace (e.g. "CF - XXXXXX" -> "CF-XXXXXX")
    // - Accept codes with or without the CF- prefix
    const rawTrimmed = code.trim().toUpperCase();
    if (!rawTrimmed) {
      const emptyMsg = 'Please enter a classroom join code.';
      setErrorMsg(emptyMsg);
      toast.error(emptyMsg);
      return;
    }

    const normalizedCode = rawTrimmed.replace(/\s+/g, '');

    // 2. Validate authentication & profile loading
    if (!user) {
      const authMsg = 'You must be signed in to join a classroom.';
      setErrorMsg(authMsg);
      toast.error(authMsg);
      return;
    }

    if (!profile) {
      const profileMsg = 'Your user profile is still loading. Please wait a moment and try again.';
      setErrorMsg(profileMsg);
      toast.error(profileMsg);
      return;
    }

    // 3. Prevent non-students (e.g. teachers) from using student join workflow
    if (profile.role !== 'student') {
      const roleMsg = 'Only students can join classrooms using a join code.';
      setErrorMsg(roleMsg);
      toast.error(roleMsg);
      return;
    }

    setLoading(true);

    try {
      // 4. Call canonical Supabase RPC function exactly once:
      // join_classroom(code_input TEXT)
      const { data, error } = await supabase.rpc('join_classroom', {
        code_input: normalizedCode,
      });

      if (error) {
        const rawErrMsg = error.message || '';
        let displayError = rawErrMsg;

        if (rawErrMsg.toLowerCase().includes('already joined')) {
          displayError = 'You have already joined this classroom.';
        } else if (rawErrMsg.toLowerCase().includes('archived')) {
          displayError = 'This classroom has been archived and is not accepting new students.';
        } else if (
          rawErrMsg.toLowerCase().includes('invalid classroom join code') ||
          rawErrMsg.toLowerCase().includes('not found')
        ) {
          displayError = 'Invalid classroom join code. Please verify the code with your teacher and try again.';
        } else if (rawErrMsg.toLowerCase().includes('only students')) {
          displayError = 'Only students can join classrooms using a join code.';
        } else if (rawErrMsg.toLowerCase().includes('authentication required')) {
          displayError = 'Authentication required to join a classroom.';
        } else if (error.code === '42501') {
          displayError = 'Permission denied. You do not have permission to join this classroom.';
        } else if (!displayError) {
          displayError = 'Failed to join classroom. Please check your code and try again.';
        }

        setErrorMsg(displayError);
        toast.error(displayError);
        return;
      }

      // 5. Validate that returned classroom_id exists before reporting success
      const result = data as {
        success?: boolean;
        classroom_id?: string;
        classroom_name?: string;
      } | null;

      const classroomId = result?.classroom_id;
      if (!classroomId || typeof classroomId !== 'string') {
        const confirmationErr = 'Enrollment failed: Classroom confirmation was not returned by the server.';
        setErrorMsg(confirmationErr);
        toast.error(confirmationErr);
        return;
      }

      // 6. Success behavior:
      // - Close the modal
      // - Clear the entered code
      // - Show a success toast
      // - Refresh the student's classroom list from Supabase
      const classroomName = result?.classroom_name || 'Classroom';
      toast.success(`Successfully joined "${classroomName}"!`);
      setCode('');
      setErrorMsg(null);
      onJoined(classroomId);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while joining the classroom.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      // 7. Always reset loading state in finally
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <KeyRound className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Join Classroom</h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            Enter the classroom join code provided by your teacher (e.g. <span className="font-mono font-semibold text-gray-800">CF-D3257E</span>).
          </p>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Class Join Code
            </label>
            <input
              type="text"
              required
              disabled={loading}
              maxLength={16}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="e.g. CF-D3257E"
              className="w-full px-3.5 py-3 text-base text-center tracking-widest font-mono font-bold bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 uppercase disabled:opacity-60"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Joining...</span>
                </>
              ) : (
                <>
                  <span>Join Class</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
