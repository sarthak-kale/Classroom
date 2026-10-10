import React, { useState, useRef } from 'react';
import { Material } from '../../types/database';
import { supabase, getSignedFileUrl } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { SeenBadge, PublicationBadge } from '../../components/ui/StatusBadge';
import { FileViewerModal } from '../../components/ui/PdfViewerModal';
import { ViewTrackingModal } from '../tracking/ViewTrackingModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  BookOpen,
  FileText,
  ExternalLink,
  Eye,
  MoreVertical,
  Edit2,
  Trash2,
  Download,
  CheckCircle,
  Clock,
  CheckCheck,
  FileSpreadsheet,
  FileImage,
  File,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

interface MaterialCardProps {
  material: Material;
  isTeacher: boolean;
  classroomName?: string;
  onEdit?: (m: Material) => void;
  onDeleted?: (id: string) => void;
  onStatusToggled?: (materialId: string, seen: boolean) => void;
}

export const MaterialCard: React.FC<MaterialCardProps> = ({
  material,
  isTeacher,
  classroomName,
  onEdit,
  onDeleted,
  onStatusToggled,
}) => {
  const { user } = useAuth();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resolvedFileUrl, setResolvedFileUrl] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [localSeen, setLocalSeen] = useState<boolean>(Boolean(material.user_view));

  // Guard against duplicate calls
  const viewRecordedRef = useRef(false);

  const getEffectiveFilePath = () => {
    return material.file_path || material.file_url || null;
  };

  const getDisplayFileName = () => {
    if (material.file_name) return material.file_name;
    const path = getEffectiveFilePath();
    if (!path) return 'Attached Document';
    const segment = path.split('/').pop() || '';
    return segment.replace(/^\d+_/, '') || segment;
  };

  const recordStudentView = async (): Promise<boolean> => {
    if (isTeacher || !user) return false;
    try {
      // 1. Try canonical RPC (exact signature: p_material_id UUID)
      const { data: rpcRes, error } = await supabase.rpc('record_material_view', {
        p_material_id: material.id,
      });

      let recorded = false;

      if (!error && rpcRes && typeof rpcRes === 'object') {
        if ((rpcRes as any).success === true) {
          recorded = true;
        } else {
          console.warn('[ClassFlow] record_material_view rejected by server:', rpcRes);
          return false;
        }
      } else if (error) {
        console.warn('[ClassFlow] record_material_view primary RPC failed, trying fallback overload:', error);
        // Fallback overload attempt if present in existing database
        const { data: fbRes, error: fbError } = await supabase.rpc('record_material_view', {
          p_classroom_id: material.classroom_id,
          p_material_id: material.id,
        });

        if (!fbError && fbRes && typeof fbRes === 'object' && (fbRes as any).success === true) {
          recorded = true;
        } else {
          console.error('[ClassFlow] View recording rejected:', fbError || fbRes);
          return false;
        }
      }

      if (recorded) {
        setLocalSeen(true);
        onStatusToggled?.(material.id, true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[ClassFlow] record_material_view exception:', err);
      return false;
    }
  };

  const handleOpenMaterial = async () => {
    const rawPath = getEffectiveFilePath();
    if (rawPath && !resolvedFileUrl) {
      const signed = await getSignedFileUrl('classroom-materials', rawPath);
      setResolvedFileUrl(signed || rawPath);
    }
    setViewerOpen(true);
    await recordStudentView();
  };

  const handleToggleStudentSeen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTeacher || !user || isTogglingStatus) return;

    setIsTogglingStatus(true);
    try {
      if (localSeen) {
        // Mark as unseen using secure RPC
        const { data: unRes, error } = await supabase.rpc('mark_material_unseen', {
          p_material_id: material.id,
        });

        if (error || (unRes && typeof unRes === 'object' && (unRes as any).success === false)) {
          // Direct fallback if permitted
          const { error: delErr } = await supabase
            .from('material_views')
            .delete()
            .eq('material_id', material.id)
            .eq('student_id', user.id);
          if (delErr) {
            toast.error('Could not update status');
            return;
          }
        }

        setLocalSeen(false);
        viewRecordedRef.current = false;
        toast.info(`Marked "${material.title}" as Unseen`);
        onStatusToggled?.(material.id, false);
      } else {
        // Mark as seen
        const success = await recordStudentView();
        if (success) {
          toast.success(`Marked "${material.title}" as Seen`);
        } else {
          toast.error('Could not record view status');
        }
      }
    } catch {
      toast.error('Could not update status');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('materials').delete().eq('id', material.id);
      if (error) throw error;
      toast.success(`Deleted "${material.title}"`);
      onDeleted?.(material.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete material');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const getFileIcon = (fileName?: string | null, fileType?: string | null) => {
    const name = (fileName || '').toLowerCase();
    const type = (fileType || '').toLowerCase();

    if (name.endsWith('.pdf') || type.includes('pdf')) {
      return <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">PDF</div>;
    }
    if (name.endsWith('.doc') || name.endsWith('.docx') || type.includes('word')) {
      return <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">DOC</div>;
    }
    if (/\.(png|jpg|jpeg|webp|gif)$/i.test(name) || type.startsWith('image/')) {
      return <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><FileImage className="w-4 h-4" /></div>;
    }
    return <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center"><File className="w-4 h-4" /></div>;
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const filePath = getEffectiveFilePath();

  return (
    <>
      <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group">
        <div>
          {/* Header row - Google Classroom style */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start space-x-3.5 min-w-0">
              {/* Round Google Classroom icon */}
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <BookOpen className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <h4
                  onClick={handleOpenMaterial}
                  className="text-base font-semibold text-gray-900 leading-snug truncate hover:text-blue-600 cursor-pointer"
                  title={material.title}
                >
                  {material.title}
                </h4>

                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                  <span>
                    Posted {new Date(material.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {(classroomName || material.classroom?.name) && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-gray-700">
                        {classroomName || material.classroom?.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Badges & Actions */}
            <div className="flex items-center space-x-2 shrink-0">
              {isTeacher ? (
                <>
                  <PublicationBadge isPublished={material.published ?? Boolean(material.published_at)} />
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen(!menuOpen)}
                      className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      aria-label="More actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                        <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-30 text-xs animate-in fade-in zoom-in-95">
                          {onEdit && (
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                onEdit(material);
                              }}
                              className="w-full px-3.5 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700 font-medium"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                              <span>Edit Details</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              setTrackingOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-gray-700 font-medium cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                            <span>Seen by Students</span>
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              setDeleteConfirmOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-left hover:bg-red-50 flex items-center space-x-2 text-red-600 font-medium border-t border-gray-100"
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
                /* Student Seen/Unseen status badge & toggle */
                <div className="flex items-center space-x-1.5">
                  <SeenBadge
                    status={localSeen ? 'seen' : 'unseen'}
                    firstViewedAt={material.user_view?.first_viewed_at}
                    viewCount={material.user_view?.view_count}
                  />
                  <button
                    onClick={handleToggleStudentSeen}
                    disabled={isTogglingStatus}
                    title={localSeen ? 'Mark as Unseen' : 'Mark as Seen'}
                    className="p-1 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {localSeen ? (
                      <RotateCcw className="w-3.5 h-3.5" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Description preview */}
          {material.description && (
            <p className="text-xs text-gray-600 line-clamp-2 mt-3 pl-13 leading-relaxed">
              {material.description}
            </p>
          )}

          {/* Attachment Tiles - Google Classroom Style */}
          <div className="mt-4 pl-13 flex flex-wrap gap-2.5">
            {/* File attachment card */}
            {filePath && (
              <div
                onClick={handleOpenMaterial}
                className="flex items-center space-x-3 p-2.5 bg-gray-50/80 hover:bg-gray-100 border border-gray-200 rounded-xl cursor-pointer transition-all max-w-sm group/att"
              >
                {getFileIcon(material.file_name, material.file_type || material.type)}
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-gray-900 truncate group-hover/att:text-blue-600">
                    {getDisplayFileName()}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {material.file_size ? formatFileSize(material.file_size) : 'Classroom Material'}
                  </p>
                </div>
              </div>
            )}

            {/* External URL card */}
            {material.external_url && (
              <a
                href={material.external_url}
                target="_blank"
                rel="noreferrer"
                onClick={async (e) => {
                  e.stopPropagation();
                  await recordStudentView();
                }}
                className="flex items-center space-x-3 p-2.5 bg-blue-50/40 hover:bg-blue-50 border border-blue-200 rounded-xl transition-all max-w-sm group/link"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <ExternalLink className="w-4 h-4" />
                </div>
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-blue-900 truncate group-link:underline">
                    External Resource Link
                  </p>
                  <p className="text-[11px] text-blue-600 truncate max-w-xs">
                    {material.external_url}
                  </p>
                </div>
              </a>
            )}
          </div>
        </div>

        {/* Footer row */}
        <div className="mt-4 pt-3.5 border-t border-gray-100 flex items-center justify-between pl-13">
          <button
            type="button"
            onClick={handleOpenMaterial}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
          >
            <span>View Material</span>
            <span>→</span>
          </button>

          {isTeacher && (
            <button
              type="button"
              onClick={() => setTrackingOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-gray-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="View student seen tracking dashboard"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>Seen by Students</span>
            </button>
          )}
        </div>
      </div>

      {/* Viewer Modal */}
      <FileViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title={material.title}
        fileUrl={resolvedFileUrl}
        fileName={material.file_name}
        fileType={material.file_type || material.type}
        externalUrl={material.external_url}
        description={material.description}
      />

      {/* Teacher View Tracking Modal */}
      {isTeacher && (
        <ViewTrackingModal
          isOpen={trackingOpen}
          onClose={() => setTrackingOpen(false)}
          entityType="material"
          entityId={material.id}
          title={material.title}
          fileName={material.file_name || getDisplayFileName()}
          classroomName={classroomName || material.classroom?.name}
          publicationDate={material.published_at || (material.published ? material.created_at : null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Study Material"
        message={`Are you sure you want to delete "${material.title}"? This will permanently remove the material and all student view tracking records.`}
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
};
