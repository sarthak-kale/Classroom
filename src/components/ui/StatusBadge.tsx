import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle, FileCheck, Lock, EyeOff } from 'lucide-react';
import { AssignmentStudentStatus } from '../../types/database';

interface SeenBadgeProps {
  status: 'seen' | 'unseen';
  firstViewedAt?: string | null;
  viewCount?: number;
  className?: string;
  showViewCount?: boolean;
}

export const SeenBadge: React.FC<SeenBadgeProps> = ({
  status,
  firstViewedAt,
  viewCount,
  className = '',
  showViewCount = true,
}) => {
  if (status === 'seen') {
    return (
      <span
        title={firstViewedAt ? `First viewed: ${new Date(firstViewedAt).toLocaleString()}${viewCount ? ` • Total views: ${viewCount}` : ''}` : 'Viewed by student'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold tracking-wide bg-blue-50 text-blue-700 border border-blue-300 shadow-2xs ${className}`}
      >
        <CheckCheck className="w-3.5 h-3.5 text-blue-600 stroke-[2.5]" aria-hidden="true" />
        <span>SEEN</span>
        {showViewCount && viewCount && viewCount > 1 ? (
          <span className="text-[10px] font-semibold bg-blue-200/70 text-blue-800 px-1 rounded-sm ml-0.5">
            {viewCount}×
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      title="Not yet opened by student"
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold tracking-wide bg-gray-100 text-gray-700 border border-gray-300 shadow-2xs ${className}`}
    >
      <EyeOff className="w-3.5 h-3.5 text-gray-500 stroke-[2]" aria-hidden="true" />
      <span>UNSEEN</span>
    </span>
  );
};

interface AssignmentStatusBadgeProps {
  status: AssignmentStudentStatus;
  marksObtained?: number | null;
  maxMarks?: number;
  gradesReleased?: boolean;
  className?: string;
}

export const AssignmentStatusBadge: React.FC<AssignmentStatusBadgeProps> = ({
  status,
  marksObtained,
  maxMarks,
  gradesReleased,
  className = '',
}) => {
  switch (status) {
    case 'graded':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 ${className}`}
        >
          <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>
            Graded {gradesReleased && marksObtained !== null && marksObtained !== undefined && maxMarks ? `(${marksObtained}/${maxMarks})` : ''}
          </span>
        </span>
      );

    case 'late_submitted':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 ${className}`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Turned in Late</span>
        </span>
      );

    case 'submitted':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 ${className}`}
        >
          <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>Turned In</span>
        </span>
      );

    case 'overdue':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 ${className}`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
          <span>Missing / Overdue</span>
        </span>
      );

    case 'not_submitted':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 ${className}`}
        >
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span>Assigned</span>
        </span>
      );
  }
};

export const PublicationBadge: React.FC<{ isPublished: boolean; className?: string }> = ({
  isPublished,
  className = '',
}) => {
  if (isPublished) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Published
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 ${className}`}
    >
      <Lock className="w-3 h-3 text-amber-500" />
      Draft
    </span>
  );
};
