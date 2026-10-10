import React, { useState } from 'react';
import { Classroom, getJoinCode } from '../../types/database';
import { Link } from 'react-router-dom';
import { Copy, Check, Users, BookOpen, FileText, MoreVertical, Archive } from 'lucide-react';
import { toast } from 'sonner';

interface ClassroomCardProps {
  classroom: Classroom;
  isTeacher?: boolean;
  onArchiveToggle?: (id: string, isArchived: boolean) => void;
}

export const ClassroomCard: React.FC<ClassroomCardProps> = ({
  classroom,
  isTeacher = false,
  onArchiveToggle,
}) => {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayCode = getJoinCode(classroom);

  const copyCode = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!displayCode) {
      toast.error('No join code available for this classroom');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(displayCode);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = displayCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success(`Class code "${displayCode}" copied to clipboard!`);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ClassFlow] Clipboard write failed:', err);
      toast.error(`Code: ${displayCode}`);
    }
  };

  // Unique theme color based on classroom ID
  const themes = [
    'from-blue-600 to-indigo-700',
    'from-teal-600 to-emerald-700',
    'from-violet-600 to-purple-700',
    'from-amber-600 to-orange-700',
    'from-rose-600 to-pink-700',
  ];
  const themeIndex = (classroom.name.length + (classroom.section?.length || 0)) % themes.length;
  const gradientClass = themes[themeIndex];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col group relative">
      {/* Top Banner */}
      <div className={`p-5 bg-gradient-to-r ${gradientClass} text-white relative`}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-white/80 truncate">
            {classroom.subject || 'Course'}
          </span>

          {isTeacher && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Classroom options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                    }}
                  />
                  <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-30 text-gray-700 text-xs">
                    {onArchiveToggle && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpen(false);
                          onArchiveToggle(classroom.id, !classroom.is_archived);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                      >
                        <Archive className="w-3.5 h-3.5 text-gray-400" />
                        <span>{classroom.is_archived ? 'Unarchive' : 'Archive'}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <Link to={`/classrooms/${classroom.id}`} className="block">
          <h3 className="text-lg font-bold text-white leading-snug truncate hover:underline">
            {classroom.name}
          </h3>
          <p className="text-xs text-white/80 truncate mt-0.5">
            {classroom.section || 'General Section'} {classroom.room ? `• ${classroom.room}` : ''}
          </p>
        </Link>
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        {/* Join code section (teachers can copy, students see instructor) */}
        <div className="mb-4 flex items-center justify-between text-xs">
          {isTeacher ? (
            <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200/80 px-2.5 py-1.5 rounded-lg w-full justify-between">
              <span className="text-gray-500 font-medium">Join Code:</span>
              <div className="flex items-center space-x-1.5">
                <span className="font-mono font-bold text-gray-900 tracking-wider">
                  {displayCode || '—'}
                </span>
                <button
                  type="button"
                  onClick={copyCode}
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Copy code"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 truncate">
              Instructor: <span className="text-gray-900 font-medium">{classroom.teacher?.full_name || 'Teacher'}</span>
            </div>
          )}
        </div>

        {/* Footer Meta */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-3">
            <span className="flex items-center gap-1" title="Enrolled students">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span>{classroom._count?.members ?? 0}</span>
            </span>
            <span className="flex items-center gap-1" title="Materials">
              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
              <span>{classroom._count?.materials ?? 0}</span>
            </span>
            <span className="flex items-center gap-1" title="Assignments">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span>{classroom._count?.assignments ?? 0}</span>
            </span>
          </div>

          <Link
            to={`/classrooms/${classroom.id}`}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            Enter Class →
          </Link>
        </div>
      </div>
    </div>
  );
};
