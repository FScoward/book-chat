
import React from 'react';

interface FontSizeControlProps {
  currentFontSizeClass: string;
  onChangeFontSizeClass: (newClass: 'text-sm' | 'text-base' | 'text-lg') => void;
}

const fontSizes: { label: string; className: 'text-sm' | 'text-base' | 'text-lg'; aria: string }[] = [
  { label: '小', className: 'text-sm', aria: 'フォントサイズを小にする' },
  { label: '標準', className: 'text-base', aria: 'フォントサイズを標準にする' },
  { label: '大', className: 'text-lg', aria: 'フォントサイズを大にする' },
];

const FontSizeControl: React.FC<FontSizeControlProps> = ({ currentFontSizeClass, onChangeFontSizeClass }) => {
  return (
    <div className="pt-3 border-t border-gray-700">
      <label className="block text-xs font-medium text-gray-400 mb-1.5 text-center">
        フォントサイズ
      </label>
      <div className="flex justify-around items-center space-x-1 bg-gray-700 p-1 rounded-md shadow">
        {fontSizes.map((size) => (
          <button
            key={size.className}
            onClick={() => onChangeFontSizeClass(size.className)}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 focus:ring-offset-gray-700
              ${currentFontSizeClass === size.className
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
              }`}
            aria-label={size.aria}
            aria-pressed={currentFontSizeClass === size.className}
          >
            {size.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FontSizeControl;
