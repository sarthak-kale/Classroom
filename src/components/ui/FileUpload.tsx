import React, { useRef, useState } from 'react';
import { UploadCloud, File, X, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile?: File | null;
  existingFileName?: string | null;
  maxSizeBytes?: number; // default 50MB
  accept?: string;
  label?: string;
  helperText?: string;
  isUploading?: boolean;
  uploadProgress?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  selectedFile,
  existingFileName,
  maxSizeBytes = 52428800, // 50 MB
  accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.zip',
  label = 'Attach File',
  helperText = 'PDF, DOCX, Images, or TXT up to 50MB',
  isUploading = false,
  uploadProgress = 0,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const validateAndSet = (file: File) => {
    setError(null);
    if (file.size > maxSizeBytes) {
      setError(`File size exceeds ${formatSize(maxSizeBytes)} limit.`);
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSet(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSet(e.target.files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      {label && <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{label}</label>}

      {selectedFile || existingFileName ? (
        <div className="flex items-center justify-between p-3.5 bg-blue-50/60 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 rounded-md bg-blue-100 flex items-center justify-center shrink-0 text-blue-700">
              <File className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {selectedFile ? selectedFile.name : existingFileName}
              </p>
              {selectedFile && (
                <p className="text-xs text-gray-500">{formatSize(selectedFile.size)}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isUploading}
            className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-white transition-colors"
            title="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50'
              : 'border-gray-300 hover:border-blue-400 bg-gray-50/50 hover:bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-semibold text-blue-600 hover:underline">Choose file</span> or drag and drop here
            </div>
            {helperText && <p className="text-xs text-gray-400">{helperText}</p>}
          </div>
        </div>
      )}

      {isUploading && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Uploading...</span>
            <span>{Math.round(uploadProgress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
