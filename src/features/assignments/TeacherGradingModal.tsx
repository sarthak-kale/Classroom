import React, { useState, useEffect } from 'react';
import { Assignment, AssignmentSubmission, ClassroomMember } from '../../types/database';
import { supabase, getSignedFileUrl } from '../../lib/supabase';
import { Avatar } from '../../components/ui/Avatar';
import { SearchBar, EmptyState, Skeleton } from '../../components/ui/FeedbackStates';
import { X, Award, FileText, Download, CheckCircle2, Clock, Send, CheckCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface TeacherGradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
  classroomId: string;
}

export const TeacherGradingModal: React.FC<TeacherGradingModalProps> = ({
  isOpen,
  onClose,
  assignment,
  classroomId,
}) => {
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<AssignmentSubmission | null>(null);
  const [marks, setMarks] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [releaseImmediately, setReleaseImmediately] = useState<boolean>(true);
  const [signedFileUrl, setSignedFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasingAll, setReleasingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('assignment_submissions')
        .select(`
          *,
          student:profiles!assignment_submissions_student_id_fkey(*)
        `)
        .eq('assignment_id', assignment.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      const list = (data || []) as AssignmentSubmission[];
      setSubmissions(list);

      // Select first submission by default if none selected
      if (list.length > 0 && !selectedSubmission) {
        selectSubmission(list[0]);
      }
    } catch (err: unknown) {
      console.error('Failed to load submissions:', err);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const selectSubmission = async (sub: AssignmentSubmission) => {
    setSelectedSubmission(sub);
    setMarks(sub.marks_obtained !== null && sub.marks_obtained !== undefined ? String(sub.marks_obtained) : '');
    setFeedback(sub.feedback || '');
    setReleaseImmediately(sub.grades_released || true);

    if (sub.file_url) {
      const signed = await getSignedFileUrl('student-submissions', sub.file_url);
      setSignedFileUrl(signed);
    } else {
      setSignedFileUrl(null);
    }
  };

  useEffect(() => {
    if (!isOpen || !assignment.id) return;
    fetchSubmissions();
  }, [isOpen, assignment.id]);

  if (!isOpen) return null;

  const handleGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmission) return;

    const numericMarks = parseFloat(marks);
    if (isNaN(numericMarks) || numericMarks < 0 || numericMarks > assignment.max_marks) {
      toast.error(`Marks must be between 0 and ${assignment.max_marks}`);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('grade_submission', {
        p_submission_id: selectedSubmission.id,
        p_marks_obtained: numericMarks,
        p_feedback: feedback.trim() || null,
        p_release_grades: releaseImmediately,
      });

      if (error) throw error;

      toast.success(
        releaseImmediately
          ? 'Grade saved and released to student!'
          : 'Grade saved (unreleased).'
      );

      // Refresh list
      await fetchSubmissions();
    } catch (err: unknown) {
      console.error('Grading error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save grade');
    } finally {
      setSaving(false);
    }
  };

  const handleReleaseAll = async () => {
    setReleasingAll(true);
    try {
      const { data, error } = await supabase.rpc('release_assignment_grades', {
        p_assignment_id: assignment.id,
      });

      if (error) throw error;
      const res = data as { success: boolean; released_count: number };
      toast.success(`Successfully released grades for ${res.released_count} student(s)!`);
      await fetchSubmissions();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to release grades');
    } finally {
      setReleasingAll(false);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = s.student?.full_name?.toLowerCase() || '';
    const email = s.student?.email?.toLowerCase() || '';
    return name.includes(q) || email.includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Submissions & Grading
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {assignment.title} • Max {assignment.max_marks} marks
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleReleaseAll}
              disabled={releasingAll || submissions.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{releasingAll ? 'Releasing...' : 'Release All Grades'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-Column Layout: Left list, Right grading details */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Submissions List Column */}
          <div className="w-full md:w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
            <div className="p-3 border-b border-gray-200">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search submissions..."
                className="w-full text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {loading ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  No submissions turned in yet.
                </div>
              ) : (
                filteredSubmissions.map((sub) => {
                  const isSelected = selectedSubmission?.id === sub.id;
                  const isGraded = sub.graded_at !== null;
                  return (
                    <div
                      key={sub.id}
                      onClick={() => selectSubmission(sub)}
                      className={`p-3.5 flex items-start space-x-3 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/90 border-l-4 border-blue-600'
                          : 'hover:bg-white'
                      }`}
                    >
                      <Avatar
                        name={sub.student?.full_name || 'Student'}
                        url={sub.student?.avatar_url}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs font-semibold text-gray-900 truncate">
                            {sub.student?.full_name || 'Student'}
                          </p>
                          {sub.is_late && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                              Late
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                          <span>
                            {new Date(sub.submitted_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                          {isGraded ? (
                            <span className="font-semibold text-emerald-700">
                              {sub.marks_obtained}/{assignment.max_marks} pts
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium">Needs grading</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Grading Editor Column */}
          <div className="flex-1 overflow-y-auto p-6 bg-white flex flex-col justify-between">
            {selectedSubmission ? (
              <div className="space-y-6">
                {/* Student Submission Meta */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                  <div className="flex items-center space-x-3">
                    <Avatar
                      name={selectedSubmission.student?.full_name || 'Student'}
                      url={selectedSubmission.student?.avatar_url}
                      size="md"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">
                        {selectedSubmission.student?.full_name}
                      </h4>
                      <p className="text-xs text-gray-400">
                        Turned in on {new Date(selectedSubmission.submitted_at).toLocaleString()}
                        {selectedSubmission.is_late && ' (Past due date)'}
                      </p>
                    </div>
                  </div>

                  {selectedSubmission.graded_at && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Graded {selectedSubmission.grades_released ? '(Released)' : '(Unreleased)'}
                    </span>
                  )}
                </div>

                {/* Submission Content */}
                <div className="space-y-4">
                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Submitted Text
                    </h5>
                    {selectedSubmission.submission_text ? (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                        {selectedSubmission.submission_text}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No text provided.</p>
                    )}
                  </div>

                  {selectedSubmission.file_name && signedFileUrl && (
                    <div>
                      <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Attached Submission File
                      </h5>
                      <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center space-x-2.5 truncate">
                          <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                          <span className="text-xs font-medium text-gray-900 truncate">
                            {selectedSubmission.file_name}
                          </span>
                        </div>
                        <a
                          href={signedFileUrl}
                          download={selectedSubmission.file_name}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors shadow-2xs"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Grading Form */}
                <form onSubmit={handleGrade} className="pt-4 border-t border-gray-200 space-y-4">
                  <h5 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                    Grade & Feedback
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Marks (out of {assignment.max_marks})
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={assignment.max_marks}
                        required
                        value={marks}
                        onChange={(e) => setMarks(e.target.value)}
                        placeholder={`0 - ${assignment.max_marks}`}
                        className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-bold"
                      />
                    </div>

                    <div className="flex items-center sm:pt-6">
                      <label className="flex items-center space-x-2 cursor-pointer text-xs font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={releaseImmediately}
                          onChange={(e) => setReleaseImmediately(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                        />
                        <span>Release Grade to Student Immediately</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Private Teacher Feedback
                    </label>
                    <textarea
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Constructive feedback, comments, and areas for improvement..."
                      className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>{saving ? 'Saving...' : 'Save Grade'}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <EmptyState
                title="Select a submission"
                description="Choose a student submission from the list on the left to grade."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
