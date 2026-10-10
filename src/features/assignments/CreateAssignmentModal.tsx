import React, { useState } from 'react';
import { supabase, uploadFileToBucket, removeStorageFile, normalizeError } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { Assignment } from '../../types/database';
import { FileUpload } from '../../components/ui/FileUpload';
import { X, FileText, Plus, Calendar, Award, AlertCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  initialAssignment?: Assignment | null;
  onSaved: () => void;
  onDeleted?: (id: string) => void;
}

export const CreateAssignmentModal: React.FC<CreateAssignmentModalProps> = ({
  isOpen,
  onClose,
  classroomId,
  initialAssignment,
  onSaved,
  onDeleted,
}) => {
  const { user } = useAuth();
  const [title, setTitle] = useState(initialAssignment?.title || '');
  const [instructions, setInstructions] = useState(initialAssignment?.instructions || '');
  const [maxMarks, setMaxMarks] = useState<number>(
    initialAssignment?.max_marks ?? (initialAssignment as any)?.points ?? 100
  );
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = initialAssignment?.due_at || (initialAssignment as any)?.due_date;
    return d ? new Date(d).toISOString().slice(0, 16) : '';
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraft, setIsDraft] = useState(
    initialAssignment
      ? (initialAssignment as any)?.status === 'draft' || !initialAssignment.published_at
      : false
  );
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (!initialAssignment) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', initialAssignment.id);
      if (error) {
        throw error;
      }
      toast.success(`Deleted assignment "${initialAssignment.title}"`);
      onDeleted?.(initialAssignment.id);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const norm = normalizeError(err);
      toast.error(norm.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      setErrorMsg('You must be signed in to create assignments.');
      return;
    }

    if (!title.trim()) {
      setErrorMsg('Assignment title is required');
      return;
    }
    if (maxMarks <= 0) {
      setErrorMsg('Maximum marks must be greater than 0');
      return;
    }

    setLoading(true);
    setUploadProgress(20);
    const entityId = initialAssignment?.id || crypto.randomUUID();
    let newlyUploadedPath: string | null = null;

    try {
      let attachmentUrl = initialAssignment?.attachment_url || null;
      let attachmentName = initialAssignment?.attachment_name || null;
      let attachmentSize = initialAssignment?.attachment_size || null;

      if (selectedFile) {
        setUploadProgress(40);
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${classroomId}/${entityId}/${safeName}`;

        const { path, error: uploadErr } = await uploadFileToBucket(
          'assignment-attachments',
          storagePath,
          selectedFile
        );

        if (uploadErr) {
          throw new Error(uploadErr.message || 'File upload failed');
        }

        newlyUploadedPath = path || storagePath;
        setUploadProgress(70);
        attachmentUrl = newlyUploadedPath;
        attachmentName = selectedFile.name;
        attachmentSize = selectedFile.size;
      }

      const publishedAt = isDraft ? null : (initialAssignment?.published_at || new Date().toISOString());
      const dueAt = dueDate ? new Date(dueDate).toISOString() : null;

      // Canonical payload including both standard and legacy columns
      const canonicalPayload: Record<string, any> = {
        classroom_id: classroomId,
        teacher_id: user.id,
        title: title.trim(),
        instructions: instructions.trim() || '',
        max_marks: maxMarks,
        points: maxMarks,
        due_at: dueAt,
        due_date: dueAt,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        attachment_size: attachmentSize,
        published_at: publishedAt,
        published: !isDraft,
        status: isDraft ? 'draft' : 'published',
      };

      if (initialAssignment) {
        let { error: updateErr } = await supabase
          .from('assignments')
          .update(canonicalPayload)
          .eq('id', initialAssignment.id);

        // Fallback for pre-migration 008 schemas where legacy columns are missing
        if (updateErr && (updateErr.code === '42703' || updateErr.code === 'PGRST204' || updateErr.message?.includes('does not exist') || updateErr.message?.includes('schema cache'))) {
          const fallbackUpdate = {
            title: title.trim(),
            instructions: instructions.trim() || '',
            max_marks: maxMarks,
            due_at: dueAt,
            published_at: publishedAt,
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            attachment_size: attachmentSize,
          };
          const retry = await supabase
            .from('assignments')
            .update(fallbackUpdate)
            .eq('id', initialAssignment.id);
          updateErr = retry.error;
        }

        if (updateErr) {
          if (newlyUploadedPath) {
            await removeStorageFile('assignment-attachments', newlyUploadedPath);
          }
          throw updateErr;
        }

        toast.success(`Assignment "${title}" updated.`);
      } else {
        canonicalPayload.id = entityId;
        let { error: insertErr } = await supabase
          .from('assignments')
          .insert(canonicalPayload);

        // Fallback for pre-migration 008 schemas where legacy columns are missing
        if (insertErr && (insertErr.code === '42703' || insertErr.code === 'PGRST204' || insertErr.message?.includes('does not exist') || insertErr.message?.includes('schema cache'))) {
          const fallbackInsert = {
            id: entityId,
            classroom_id: classroomId,
            title: title.trim(),
            instructions: instructions.trim() || '',
            max_marks: maxMarks,
            due_at: dueAt,
            published_at: publishedAt,
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            attachment_size: attachmentSize,
          };
          const retry = await supabase
            .from('assignments')
            .insert(fallbackInsert);
          insertErr = retry.error;
        }

        if (insertErr) {
          if (newlyUploadedPath) {
            await removeStorageFile('assignment-attachments', newlyUploadedPath);
          }
          throw insertErr;
        }

        toast.success(
          isDraft
            ? `Assignment draft saved: "${title}"`
            : `Assignment published: "${title}"!`
        );
      }

      setUploadProgress(100);
      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('Error saving assignment:', err);
      const normalized = normalizeError(err);
      setErrorMsg(normalized.message);
      toast.error(normalized.message);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">
              {initialAssignment ? 'Edit Assignment' : 'Create Assignment'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Title (required)
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Essay 1: The French Revolution"
              className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Instructions
            </label>
            <textarea
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Explain expectations, prompt questions, rubric guidelines, and formatting requirements..."
              className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-gray-400" />
                Maximum Marks
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                required
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                Due Date & Time (optional)
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* File Upload Component */}
          <div>
            <FileUpload
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              existingFileName={initialAssignment?.attachment_name}
              isUploading={loading}
              uploadProgress={uploadProgress}
              label="Attach Worksheet / Rubric (Optional)"
            />
          </div>

          {/* Draft toggle */}
          <div className="pt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-900 block">Save as Draft</span>
              <span className="text-[11px] text-gray-500 block">
                Visible only to instructor. Students will not see it or receive notifications until published.
              </span>
            </div>
            <input
              type="checkbox"
              id="draftAssignToggle"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
          </div>

          <div className="pt-3 flex items-center justify-between gap-2.5">
            {initialAssignment ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading || isDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Assignment'}</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading || isDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || isDeleting}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {loading
                    ? 'Saving...'
                    : isDraft
                    ? 'Save Draft'
                    : initialAssignment
                    ? 'Update Assignment'
                    : 'Assign'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
