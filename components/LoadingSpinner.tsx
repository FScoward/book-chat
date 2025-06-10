
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  color?: string; // Tailwind color class e.g. text-blue-500
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', color = 'text-sky-400' }) => {
  const sizeClasses = {
    xs: 'w-4 h-4 border-2',
    sm: 'w-6 h-6 border-2',
    md: 'w-8 h-8 border-[3px]',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div className="flex justify-center items-center">
      <div
        className={`animate-spin rounded-full ${sizeClasses[size]} ${color} border-t-transparent`}
        role="status"
        aria-label="読み込み中..."
      >
        <span className="sr-only">読み込み中...</span>
      </div>
    </div>
  );
};

export default LoadingSpinner;