import React, { useState, useEffect, useRef } from 'react';
import { Assignment, AssignmentSubmission } from '../../types/database';
import { supabase, uploadFileToBucket, getSignedFileUrl } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { FileUpload } from '../../components/ui/FileUpload';
import { AssignmentStatusBadge } from '../../components/ui/StatusBadge';
import { X, FileText, Download, CheckCircle2, AlertTriangle, Clock, Lock, Send, Award } from 'lucide-react';
import { toast } from 'sonner';

interface StudentSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
  classroomId: string;
  onSubmitted: () => void;
}

export const StudentSubmissionModal: React.FC<StudentSubmissionModalProps> = ({
  isOpen,
  onClose,
  assignment,
  classroomId,
  onSubmitted,
}) => {
  const { user } = useAuth();
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentSignedUrl, setAttachmentSignedUrl] = useState<string | null>(null);
  const [submissionFileSignedUrl, setSubmissionFileSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const viewRecordedRef = useRef(false);

  // Fetch current submission & record view
  useEffect(() => {
    if (!isOpen || !assignment.id || !user) return;

    // 1. Record assignment view atomically
    if (!viewRecordedRef.current) {
      viewRecordedRef.current = true;
      supabase
        .rpc('record_assignment_view', {
          p_assignment_id: assignment.id,
        })
        .then(
          () => {},
          (err: unknown) => console.error('Failed to record view:', err)
        );
    }

    // 2. Fetch submission
    const fetchSub = async () => {
      const { data, error } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignment.id)
        .eq('student_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setSubmission(data as AssignmentSubmission);
        setSubmissionText(data.submission_text || '');

        if (data.file_url) {
          const signed = await getSignedFileUrl('student-submissions', data.file_url);
          setSubmissionFileSignedUrl(signed);
        }
      }
    };
    fetchSub();

    // 3. Resolve attachment signed URL if present
    if (assignment.attachment_url) {
      getSignedFileUrl('assignment-attachments', assignment.attachment_url).then((signed) => {
        setAttachmentSignedUrl(signed);
      });
    }
  }, [isOpen, assignment, user]);

  if (!isOpen) return null;

  const isGraded = Boolean(submission?.graded_at);
  const isPastDue = assignment.due_at ? new Date() > new Date(assignment.due_at) : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!submissionText.trim() && !selectedFile && !submission?.file_url) {
      toast.error('Please provide a submission text or attach a file.');
      return;
    }

    if (isGraded) {
      toast.error('Cannot modify submission after it has been graded.');
      return;
    }

    setLoading(true);
    setUploadProgress(20);

    try {
      let fileUrl = submission?.file_url || null;
      let fileName = submission?.file_name || null;
      let fileSize = submission?.file_size || null;

      if (selectedFile) {
        setUploadProgress(40);
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${classroomId}/${assignment.id}/${user.id}/${safeName}`;

        const { path, error: uploadErr } = await uploadFileToBucket(
          'student-submissions',
          storagePath,
          selectedFile
        );

        if (uploadErr) {
          throw new Error(`Upload failed: ${uploadErr.message}`);
        }

        setUploadProgress(70);
        fileUrl = path;
        fileName = selectedFile.name;
        fileSize = selectedFile.size;
      }

      // Submit atomically through RPC, with direct table upsert fallback
      let isLate = false;
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_assignment', {
        p_assignment_id: assignment.id,
        p_submission_text: submissionText.trim() || null,
        p_file_url: fileUrl,
        p_file_name: fileName,
        p_file_size: fileSize,
      });

      if (rpcErr) {
        const isPastDue = (assignment.due_at || (assignment as any).due_date)
          ? new Date() > new Date(assignment.due_at || (assignment as any).due_date!)
          : false;
        isLate = isPastDue;

        const subPayload: Record<string, any> = {
          assignment_id: assignment.id,
          student_id: user.id,
          submission_text: submissionText.trim() || null,
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize,
          submitted_at: new Date().toISOString(),
          is_late: isPastDue,
        };

        if (submission?.id) {
          const { error: updateErr } = await supabase
            .from('assignment_submissions')
            .update(subPayload)
            .eq('id', submission.id);
          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('assignment_submissions')
            .insert(subPayload);
          if (insertErr) throw insertErr;
        }
      } else if (rpcRes) {
        isLate = Boolean((rpcRes as any).is_late);
      }

      if (isLate) {
        toast.warning('Assignment submitted late (past due date).');
      } else {
        toast.success('Assignment turned in successfully!');
      }

      setUploadProgress(100);
      onSubmitted();
      onClose();
    } catch (err: unknown) {
      console.error('Submission error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit assignment');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">
                Assignment
              </span>
              {assignment.due_at && (
                <span className={`text-[11px] font-medium flex items-center gap-1 ${isPastDue ? 'text-red-600' : 'text-gray-500'}`}>
                  <Clock className="w-3 h-3" />
                  Due {new Date(assignment.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-gray-900 truncate leading-tight">
              {assignment.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Instructions */}
          {assignment.instructions && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Instructions
              </h4>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {assignment.instructions}
              </p>
            </div>
          )}

          {/* Worksheet / Attachment if provided by teacher */}
          {assignment.attachment_name && attachmentSignedUrl && (
            <div className="flex items-center justify-between p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl">
              <div className="flex items-center space-x-3 overflow-hidden">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {assignment.attachment_name}
                  </p>
                  <p className="text-[11px] text-gray-500">Instructor Material</p>
                </div>
              </div>
              <a
                href={attachmentSignedUrl}
                download={assignment.attachment_name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </div>
          )}

          {/* Graded Feedback Card if grades released */}
          {isGraded && submission?.grades_released && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Award className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-900">Graded Result</span>
                </div>
                <span className="text-base font-extrabold text-emerald-800">
                  {submission.marks_obtained} / {assignment.max_marks} pts
                </span>
              </div>
              {submission.feedback && (
                <div className="pt-2 border-t border-emerald-200/60">
                  <span className="text-xs font-semibold text-emerald-800 block mb-0.5">Teacher Feedback:</span>
                  <p className="text-xs text-emerald-950 whitespace-pre-line leading-relaxed">
                    {submission.feedback}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Student Submission Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-900">Your Work</h4>
              {submission ? (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Turned In {submission.is_late ? '(Late)' : ''}
                </span>
              ) : isPastDue ? (
                <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Past Due
                </span>
              ) : null}
            </div>

            {isGraded && (
              <div className="p-3 bg-gray-100 border border-gray-200 rounded-lg flex items-center gap-2 text-xs text-gray-600">
                <Lock className="w-4 h-4 text-gray-500 shrink-0" />
                <span>This assignment has been graded. Submissions are now locked.</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Written Response / Notes
              </label>
              <textarea
                rows={4}
                disabled={isGraded || loading}
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Type your response, essay, or link to work here..."
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Submission File */}
            {!isGraded && (
              <FileUpload
                onFileSelect={setSelectedFile}
                selectedFile={selectedFile}
                existingFileName={submission?.file_name}
                isUploading={loading}
                uploadProgress={uploadProgress}
                label="Attach Submission File"
                helperText="PDF, Word document, TXT, or ZIP up to 50MB"
              />
            )}

            {isGraded && submission?.file_name && submissionFileSignedUrl && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-xs text-gray-800 font-medium truncate">{submission.file_name}</span>
                </div>
                <a
                  href={submissionFileSignedUrl}
                  download={submission.file_name}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  Download File
                </a>
              </div>
            )}

            {!isGraded && (
              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Submitting...'
                      : submission
                      ? 'Resubmit Assignment'
                      : 'Turn In'}
                  </span>
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
