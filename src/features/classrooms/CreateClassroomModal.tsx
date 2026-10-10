import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { Classroom, normalizeClassroom, getJoinCode } from '../../types/database';
import { X, GraduationCap, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CreateClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (classroom?: Classroom) => void;
}

export const CreateClassroomModal: React.FC<CreateClassroomModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { user, profile } = useAuth();
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');
  const [room, setRoom] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Validate classroom name
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Classroom name is required');
      toast.error('Classroom name is required');
      return;
    }

    // 2. Retrieve authenticated user & profile
    if (!user) {
      console.error('[ClassFlow] Classroom creation failed: User is not authenticated');
      setErrorMsg('You must be signed in to create a classroom.');
      toast.error('Authentication required');
      return;
    }

    if (!profile) {
      const profileMsg = 'Your user profile is still loading. Please wait a moment and try again.';
      setErrorMsg(profileMsg);
      toast.error(profileMsg);
      return;
    }

    // 3. Verify user has teacher role
    if (profile.role !== 'teacher') {
      console.warn(`[ClassFlow] Unauthorized creation attempt: User ${user.id} has role "${profile.role}", expected "teacher"`);
      setErrorMsg('Only teachers are authorized to create classrooms.');
      toast.error('Teacher role required');
      return;
    }

    setLoading(true);

    try {
      console.info(`[ClassFlow] Creating classroom "${trimmedName}" for teacher ${user.id}...`);

      // 4. Insert classroom into Supabase using correct database column names
      // 5. Let Supabase generate the join code via database default
      // Provide a safe default for subject to satisfy not-null constraints in database
      const safeSubject = subject.trim() || 'General';
      const insertPayload: Record<string, any> = {
        name: trimmedName,
        subject: safeSubject,
        teacher_id: user.id,
      };

      if (section.trim()) {
        insertPayload.section = section.trim();
      }
      if (room.trim()) {
        insertPayload.room = room.trim();
      }

      // 6, 7. Execute insert and retrieve single created row
      let { data, error } = await supabase
        .from('classrooms')
        .insert(insertPayload)
        .select('*')
        .single();

      // If database complains about not-null on subject, ensure fallback and retry
      if (error && error.code === '23502' && error.message?.includes('subject')) {
        console.warn('[ClassFlow] Database requires non-null subject. Retrying with fallback subject...');
        insertPayload.subject = 'General';
        const retryRes = await supabase
          .from('classrooms')
          .insert(insertPayload)
          .select('*')
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      // If database default is missing on join_code (Postgres error 23502: not-null violation on join_code),
      // call the database-side RPC function to generate the code securely, then retry.
      if (error && (error.message?.includes('join_code') || (error.code === '23502' && !insertPayload.join_code))) {
        console.warn('[ClassFlow] DB default missing on join_code. Calling generate_unique_classroom_code RPC...');
        const { data: generatedCode, error: rpcErr } = await supabase.rpc('generate_unique_classroom_code');
        if (!rpcErr && generatedCode) {
          insertPayload.join_code = generatedCode;
          const retryRes = await supabase
            .from('classrooms')
            .insert(insertPayload)
            .select('*')
            .single();
          data = retryRes.data;
          error = retryRes.error;
        }
      }

      // Handle the extremely unlikely event of a unique constraint collision by retrying safely
      if (error && error.code === '23505' && error.message?.includes('join_code')) {
        console.warn('[ClassFlow] Unique constraint collision on join_code. Retrying with a new database-generated code...');
        const { data: retryCode } = await supabase.rpc('generate_unique_classroom_code');
        if (retryCode) {
          insertPayload.join_code = retryCode;
          const retryRes = await supabase
            .from('classrooms')
            .insert(insertPayload)
            .select('*')
            .single();
          data = retryRes.data;
          error = retryRes.error;
        }
      }

      if (error) {
        console.error('[ClassFlow] Database error creating classroom:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No classroom data returned from server.');
      }

      // 8. Verify returned classroom contains a valid join code
      let returnedJoinCode = data.join_code || data.code;
      if (!returnedJoinCode || typeof returnedJoinCode !== 'string' || !returnedJoinCode.trim()) {
        const { data: codeRes } = await supabase.rpc('generate_unique_classroom_code');
        if (codeRes) {
          await supabase.from('classrooms').update({ join_code: codeRes }).eq('id', data.id);
          data.join_code = codeRes;
          returnedJoinCode = codeRes;
        } else {
          console.error('[ClassFlow] Created classroom record is missing a valid join_code:', data);
          throw new Error('Classroom was created, but no valid join code was returned. Please verify migration 008 is applied in Supabase.');
        }
      }

      console.info(`[ClassFlow] Classroom created successfully. ID: ${data.id}, Join Code: ${returnedJoinCode}`);

      // 9. Normalize classroom object with actual database response
      const normalizedClassroom = normalizeClassroom(data);

      // 10. Display success notification showing the generated join code
      toast.success(
        `Classroom "${normalizedClassroom.name}" created! Join code: ${returnedJoinCode}`
      );

      // Reset form fields
      setName('');
      setSection('');
      setSubject('');
      setRoom('');

      // 11. Close modal only after successful creation
      onCreated(normalizedClassroom);
      onClose();
    } catch (err: unknown) {
      console.error('[ClassFlow] Failed to create classroom:', err);
      const msg = err instanceof Error ? err.message : 'Failed to create classroom. Please try again.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Create New Classroom</h3>
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
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Class Name (required)
            </label>
            <input
              type="text"
              required
              disabled={loading}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="e.g. AP Chemistry, World History 101"
              className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Section
              </label>
              <input
                type="text"
                disabled={loading}
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. Period 2, Fall 2026"
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Room
              </label>
              <input
                type="text"
                disabled={loading}
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Room 304"
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Subject
            </label>
            <input
              type="text"
              disabled={loading}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Science, Mathematics, Literature"
              className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
          </div>

          <div className="p-3 bg-blue-50/60 border border-blue-200/70 rounded-lg text-[11px] text-blue-800">
            A unique, permanent student join code will automatically be generated by Supabase and displayed immediately upon creation.
          </div>

          <div className="pt-3 flex justify-end gap-2.5">
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
                  <span>Creating Classroom...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Classroom</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
