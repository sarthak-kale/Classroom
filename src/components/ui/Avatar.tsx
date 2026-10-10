import React from 'react';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  url,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = React.useState(false);

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base font-semibold',
    xl: 'w-16 h-16 text-xl font-bold',
  };

  const getInitials = (n: string) => {
    if (!n) return '?';
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setImgError(true)}
        className={`rounded-full object-cover shrink-0 border border-gray-200 ${sizeClasses[size]} ${className}`}
      />
    );
  }

  // Consistent background color based on name hash
  const colors = [
    'bg-blue-600',
    'bg-indigo-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-violet-600',
    'bg-rose-600',
    'bg-amber-600',
  ];
  const charCodeSum = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorClass = colors[charCodeSum % colors.length];

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white shrink-0 font-medium select-none shadow-xs ${colorClass} ${sizeClasses[size]} ${className}`}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
};
