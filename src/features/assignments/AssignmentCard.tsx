import React, { useState } from 'react';
import { Assignment, AssignmentStudentStatus } from '../../types/database';
import { supabase, getSignedFileUrl, removeStorageFile } from '../../lib/supabase';
import { SeenBadge, AssignmentStatusBadge, PublicationBadge } from '../../components/ui/StatusBadge';
import { StudentSubmissionModal } from './StudentSubmissionModal';
import { TeacherGradingModal } from './TeacherGradingModal';
import { ViewTrackingModal } from '../tracking/ViewTrackingModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FileText, Calendar, Clock, Award, Eye, MoreVertical, Edit2, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';

interface AssignmentCardProps {
  assignment: Assignment;
  classroomId: string;
  isTeacher: boolean;
  onEdit?: (a: Assignment) => void;
  onDeleted?: (id: string) => void;
  onStatusChanged?: () => void;
}

export const AssignmentCard: React.FC<AssignmentCardProps> = ({
  assignment,
  classroomId,
  isTeacher,
  onEdit,
  onDeleted,
  onStatusChanged,
}) => {
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [gradingModalOpen, setGradingModalOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openingAttachment, setOpeningAttachment] = useState(false);

  // Derive Student Status in exact precedence order
  const getDerivedStudentStatus = (): AssignmentStudentStatus => {
    const sub = assignment.user_submission;
    const dueDateVal = assignment.due_at || (assignment as any).due_date;
    const isPastDue = dueDateVal ? new Date() > new Date(dueDateVal) : false;

    if (sub?.grades_released && sub?.graded_at) {
      return 'graded';
    }
    if (sub) {
      if (sub.is_late) return 'late_submitted';
      return 'submitted';
    }
    if (isPastDue) {
      return 'overdue';
    }
    return 'not_submitted';
  };

  const studentStatus = getDerivedStudentStatus();
  const isSeen = Boolean(assignment.user_view);

  const handleDownloadAttachment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assignment.attachment_url) return;
    setOpeningAttachment(true);
    try {
      const url = await getSignedFileUrl('assignment-attachments', assignment.attachment_url, 60);
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.error('Unable to generate secure download link');
      }
    } catch {
      toast.error('Failed to open attachment');
    } finally {
      setOpeningAttachment(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (assignment.attachment_url) {
        await removeStorageFile('assignment-attachments', assignment.attachment_url);
      }
      const { error } = await supabase.from('assignments').delete().eq('id', assignment.id);
      if (error) throw error;
      toast.success(`Deleted assignment "${assignment.title}"`);
      onDeleted?.(assignment.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete assignment');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const displayMaxMarks = assignment.max_marks ?? (assignment as any).points ?? 100;
  const displayDueDate = assignment.due_at || (assignment as any).due_date;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between group">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4
                  onClick={() => (isTeacher ? setGradingModalOpen(true) : setSubmissionModalOpen(true))}
                  className="text-base font-semibold text-gray-900 leading-tight truncate hover:text-blue-600 cursor-pointer"
                >
                  {assignment.title}
                </h4>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    Max {displayMaxMarks} marks
                  </span>
                  {displayDueDate && (
                    <span className="flex items-center gap-1 text-gray-500">
                      <Clock className="w-3 h-3" />
                      Due {new Date(displayDueDate).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {isTeacher ? (
                <>
                  <PublicationBadge isPublished={Boolean(assignment.published_at || (assignment as any).status === 'published')} />
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen(!menuOpen)}
                      className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      aria-label="Actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                        <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-30 text-xs">
                          {onEdit && (
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                onEdit(assignment);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              setDeleteConfirmOpen(true);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                /* Student Badges: Submission status + Viewed status shown separately */
                <div className="flex items-center space-x-2">
                  <SeenBadge
                    status={isSeen ? 'seen' : 'unseen'}
                    firstViewedAt={assignment.user_view?.first_viewed_at}
                    viewCount={assignment.user_view?.view_count}
                  />
                  <AssignmentStatusBadge
                    status={studentStatus}
                    marksObtained={assignment.user_submission?.marks_obtained}
                    maxMarks={displayMaxMarks}
                    gradesReleased={assignment.user_submission?.grades_released}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Instructions preview */}
          {assignment.instructions && (
            <p className="text-xs text-gray-600 line-clamp-2 mt-2 leading-relaxed">
              {assignment.instructions}
            </p>
          )}

          {/* Attachment */}
          {assignment.attachment_url && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleDownloadAttachment}
                disabled={openingAttachment}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 hover:bg-gray-100 text-gray-700 max-w-xs truncate border border-gray-200 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate">{assignment.attachment_name || 'Download Attachment'}</span>
                <Download className="w-3 h-3 text-gray-400 shrink-0 ml-1" />
              </button>
            </div>
          )}
        </div>

        {/* Footer row */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
          {isTeacher ? (
            <button
              type="button"
              onClick={() => setGradingModalOpen(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Review Submissions →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSubmissionModalOpen(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              {assignment.user_submission ? 'View Your Submission →' : 'Open & Turn In →'}
            </button>
          )}

          {isTeacher && (
            <button
              type="button"
              onClick={() => setTrackingOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>View Tracking</span>
            </button>
          )}
        </div>
      </div>

      {/* Student Submission Modal */}
      {!isTeacher && (
        <StudentSubmissionModal
          isOpen={submissionModalOpen}
          onClose={() => setSubmissionModalOpen(false)}
          assignment={assignment}
          classroomId={classroomId}
          onSubmitted={() => onStatusChanged?.()}
        />
      )}

      {/* Teacher Grading Modal */}
      {isTeacher && (
        <TeacherGradingModal
          isOpen={gradingModalOpen}
          onClose={() => setGradingModalOpen(false)}
          assignment={assignment}
          classroomId={classroomId}
        />
      )}

      {/* Teacher View Tracking Modal */}
      {isTeacher && (
        <ViewTrackingModal
          isOpen={trackingOpen}
          onClose={() => setTrackingOpen(false)}
          entityType="assignment"
          entityId={assignment.id}
          title={assignment.title}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Assignment"
        message={`Are you sure you want to delete "${assignment.title}"? This will delete the assignment and all student submissions.`}
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
};
