import React, { useState } from 'react';
import { supabase, uploadFileToBucket, removeStorageFile, normalizeError } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { Material } from '../../types/database';
import { FileUpload } from '../../components/ui/FileUpload';
import { X, BookOpen, Link2, Plus, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  classrooms?: { id: string; name: string }[];
  initialMaterial?: Material | null;
  onSaved: () => void;
}

export const CreateMaterialModal: React.FC<CreateMaterialModalProps> = ({
  isOpen,
  onClose,
  classroomId,
  classrooms = [],
  initialMaterial,
  onSaved,
}) => {
  const { user } = useAuth();
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(
    initialMaterial?.classroom_id || classroomId || (classrooms[0]?.id ?? '')
  );
  const [title, setTitle] = useState(initialMaterial?.title || '');
  const [description, setDescription] = useState(initialMaterial?.description || '');
  const [externalUrl, setExternalUrl] = useState(initialMaterial?.external_url || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraft, setIsDraft] = useState(
    initialMaterial ? !(initialMaterial.published ?? Boolean(initialMaterial.published_at)) : false
  );
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetClassroomId = selectedClassroomId || classroomId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      setErrorMsg('You must be signed in as a teacher to upload study materials.');
      return;
    }

    if (!targetClassroomId) {
      setErrorMsg('Please select a classroom for this study material.');
      return;
    }

    if (!title.trim()) {
      setErrorMsg('Material title is required.');
      return;
    }

    setLoading(true);
    setUploadProgress(15);
    let newlyUploadedStoragePath: string | null = null;

    try {
      // Generate or retrieve material ID upfront for canonical path consistency
      const materialId = initialMaterial?.id || crypto.randomUUID();
      let fileUrl = initialMaterial?.file_url || initialMaterial?.file_path || null;
      let filePath = initialMaterial?.file_path || initialMaterial?.file_url || null;
      let fileName = initialMaterial?.file_name || null;
      let fileSize = initialMaterial?.file_size || null;
      let fileType = initialMaterial?.file_type || initialMaterial?.type || null;

      // STEP 2: Storage upload with canonical path: {classroom_id}/{material_id}/{sanitized_filename}
      if (selectedFile) {
        setUploadProgress(35);
        // Sanitize filename and prevent path traversal
        const sanitizedRaw = selectedFile.name
          .replace(/(\.\.\/|\.\.\\)/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFileName = `${Date.now()}_${sanitizedRaw}`;
        const storagePath = `${targetClassroomId}/${materialId}/${uniqueFileName}`;

        const { path, error: uploadErr } = await uploadFileToBucket(
          'classroom-materials',
          storagePath,
          selectedFile,
          { upsert: false }
        );

        if (uploadErr) {
          throw new Error(uploadErr.message || 'Storage upload failed');
        }

        newlyUploadedStoragePath = path || storagePath;
        setUploadProgress(75);

        fileUrl = newlyUploadedStoragePath;
        filePath = newlyUploadedStoragePath;
        fileName = selectedFile.name;
        fileSize = selectedFile.size;
        fileType = selectedFile.type || 'application/octet-stream';
      }

      const publishedAt = isDraft
        ? null
        : initialMaterial?.published_at || new Date().toISOString();
      const isPublished = !isDraft;

      // STEP 3: Save material metadata in database
      // Include all valid columns matching the PostgreSQL schema with safe fallback for description
      const payload: Record<string, any> = {
        classroom_id: targetClassroomId,
        teacher_id: user.id,
        title: title.trim(),
        description: description.trim() || '',
        type: selectedFile
          ? (selectedFile.name.toLowerCase().endsWith('.pdf')
              ? 'pdf'
              : selectedFile.name.toLowerCase().match(/\.(doc|docx)$/)
              ? 'doc'
              : selectedFile.name.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/)
              ? 'image'
              : 'doc')
          : (fileType || 'pdf'),
        file_path: filePath,
        file_url: filePath,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
        url: externalUrl.trim() || null,
        external_url: externalUrl.trim() || null,
        published: isPublished,
        published_at: publishedAt,
      };

      if (initialMaterial) {
        // Update existing material
        const { error: dbErr } = await supabase
          .from('materials')
          .update(payload)
          .eq('id', initialMaterial.id);

        if (dbErr) {
          // Rollback newly uploaded file on DB failure
          if (newlyUploadedStoragePath) {
            await removeStorageFile('classroom-materials', newlyUploadedStoragePath);
          }
          const norm = normalizeError(dbErr);
          throw new Error(norm.message);
        }
        toast.success(`Updated "${title.trim()}"`);
      } else {
        // Insert new material with canonical ID
        payload.id = materialId;
        const { error: dbErr } = await supabase
          .from('materials')
          .insert(payload);

        if (dbErr) {
          // Rollback newly uploaded file on DB failure to prevent orphaned files
          if (newlyUploadedStoragePath) {
            await removeStorageFile('classroom-materials', newlyUploadedStoragePath);
          }
          const norm = normalizeError(dbErr);
          throw new Error(norm.message);
        }
        toast.success(
          isDraft
            ? `Draft saved: "${title.trim()}"`
            : `Published study material: "${title.trim()}"`
        );
      }

      setUploadProgress(100);
      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('[ClassFlow] Error saving study material:', err);
      const message = err instanceof Error ? err.message : 'Failed to save study material';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
        {/* Header - Google Classroom inspired style */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 leading-tight">
                {initialMaterial ? 'Edit Study Material' : 'Add Study Material'}
              </h3>
              <p className="text-xs text-gray-500">
                Share lecture notes, PDFs, or educational links with your class
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{errorMsg}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Classroom Selector if multiple classrooms available */}
          {classrooms.length > 1 && !initialMaterial && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Classroom (required)
              </label>
              <select
                value={selectedClassroomId}
                onChange={(e) => setSelectedClassroomId(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 4: Photosynthesis & Cellular Respiration"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Description / Instructions (optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add key objectives, reading guidelines, or lecture slides summary..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
            />
          </div>

          {/* Supported File Upload Component */}
          <div>
            <FileUpload
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              existingFileName={initialMaterial?.file_name}
              isUploading={loading}
              uploadProgress={uploadProgress}
              label="Attach Document (PDF, DOC, DOCX, PNG, JPG)"
              helperText="Supported: PDF, DOC, DOCX, PNG, JPG up to 50MB"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-gray-400" />
              Reference Link / URL (optional)
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://khanacademy.org/... or https://youtube.com/..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono text-xs shadow-2xs"
            />
          </div>

          {/* Draft vs Published Toggle */}
          <div className="pt-2 p-3.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-900 block">Save as Draft</span>
              <span className="text-[11px] text-gray-500 block">
                Drafts are visible only to you. Students will not see or receive notifications until published.
              </span>
            </div>
            <input
              type="checkbox"
              id="draftToggle"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>
                {loading
                  ? 'Uploading & Saving...'
                  : isDraft
                  ? 'Save Draft'
                  : initialMaterial
                  ? 'Update Material'
                  : 'Publish Material'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
