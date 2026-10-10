import React from 'react';
import { Search, AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}> = ({ title, description, icon, action, className = '' }) => (
  <div className={`text-center py-12 px-4 rounded-xl border border-dashed border-gray-200 bg-white/50 ${className}`}>
    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
      {icon || <Inbox className="w-6 h-6" />}
    </div>
    <h3 className="text-base font-semibold text-gray-800 mb-1">{title}</h3>
    <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">{description}</p>
    {action && (
      <button
        onClick={action.onClick}
        className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors"
      >
        {action.label}
      </button>
    )}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}> = ({
  title = 'Something went wrong',
  message = 'An error occurred while loading this data. Please try again.',
  onRetry,
  className = '',
}) => (
  <div className={`p-6 rounded-xl border border-red-200 bg-red-50/50 text-center ${className}`}>
    <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center text-red-600">
      <AlertCircle className="w-5 h-5" />
    </div>
    <h4 className="text-sm font-semibold text-red-900 mb-1">{title}</h4>
    <p className="text-xs text-red-700 max-w-md mx-auto mb-4">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-red-800 bg-white border border-red-300 hover:bg-red-50 shadow-xs"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry
      </button>
    )}
  </div>
);

export const Skeleton: React.FC<{
  className?: string;
}> = ({ className = 'h-4 w-full' }) => (
  <div className={`animate-pulse bg-gray-200/80 rounded ${className}`} />
);

export const SearchBar: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
    />
  </div>
);

export const Pagination: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}> = ({ currentPage, totalPages, onPageChange, className = '' }) => {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-between text-xs text-gray-600 py-3 ${className}`}>
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
