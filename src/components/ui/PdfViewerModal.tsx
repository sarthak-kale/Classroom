import React from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  externalUrl?: string | null;
  description?: string | null;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  fileUrl,
  fileName,
  fileType,
  externalUrl,
  description,
}) => {
  if (!isOpen) return null;

  const isPdf = fileType?.includes('pdf') || fileName?.toLowerCase().endsWith('.pdf');
  const isImage = fileType?.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(fileName || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
              {fileName && <p className="text-xs text-gray-500 truncate">{fileName}</p>}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Link</span>
              </a>
            )}
            {fileUrl && (
              <a
                href={fileUrl}
                download={fileName || 'download'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 bg-gray-100 overflow-auto p-4 flex flex-col items-center justify-center">
          {description && (
            <div className="w-full max-w-3xl mb-4 p-4 bg-white rounded-lg border border-gray-200 text-sm text-gray-700 whitespace-pre-line shadow-xs">
              <span className="font-semibold text-xs text-gray-500 uppercase tracking-wider block mb-1">Description</span>
              {description}
            </div>
          )}

          {fileUrl && isPdf ? (
            <iframe
              src={fileUrl}
              title={title}
              className="w-full h-full rounded-lg border border-gray-300 bg-white"
            />
          ) : fileUrl && isImage ? (
            <div className="max-h-full max-w-full flex items-center justify-center p-4">
              <img
                src={fileUrl}
                alt={title}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md"
              />
            </div>
          ) : fileUrl ? (
            <div className="text-center p-8 bg-white rounded-xl shadow-xs border border-gray-200 max-w-md">
              <FileText className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <h4 className="text-base font-medium text-gray-900 mb-1">{fileName || 'File Attachment'}</h4>
              <p className="text-xs text-gray-500 mb-4">Preview not available directly in browser. Please download the file to view.</p>
              <a
                href={fileUrl}
                download={fileName || 'file'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-xs"
              >
                <Download className="w-4 h-4" />
                Download File
              </a>
            </div>
          ) : externalUrl ? (
            <div className="text-center p-8 bg-white rounded-xl shadow-xs border border-gray-200 max-w-md">
              <ExternalLink className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <h4 className="text-base font-medium text-gray-900 mb-1">External Resource</h4>
              <p className="text-xs text-gray-500 mb-4 truncate">{externalUrl}</p>
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-xs"
              >
                Open in new tab
              </a>
            </div>
          ) : (
            <div className="text-center text-gray-500 text-sm">
              No preview or attachment provided.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
