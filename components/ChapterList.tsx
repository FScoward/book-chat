
import React from 'react';
import { Chapter } from '../types';
import { BookOpenIcon, EyeIcon, EyeSlashIcon, TrashIcon } from './Icons'; // Import TrashIcon

interface ChapterListProps {
  chapters: Chapter[];
  activeChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onDeleteChapter: (id: string) => void; 
  onToggleReadStatus: (id: string) => void; 
}

const ChapterList: React.FC<ChapterListProps> = ({ chapters, activeChapterId, onSelectChapter, onDeleteChapter, onToggleReadStatus }) => {
  if (chapters.length === 0) {
    return <p className="text-gray-400 text-sm">まだ章が追加されていません。</p>;
  }

  return (
    <nav className="space-y-1">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">章一覧</h2>
      <ul>
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <div
              onClick={() => onSelectChapter(chapter.id)}
              className={`flex items-center justify-between p-2 h-9 rounded-md transition-colors duration-150 ease-in-out cursor-pointer group
                ${activeChapterId === chapter.id
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              title={chapter.title}
            >
              {/* Left part: Book Icon and Title */}
              <div className="flex items-center truncate">
                <BookOpenIcon className={`w-5 h-5 mr-2 flex-shrink-0 ${activeChapterId === chapter.id ? 'text-white' : 'text-sky-400 group-hover:text-white'}`} />
                <span
                  className="block truncate font-medium leading-5"
                >
                  {chapter.title}
                </span>
              </div>

              {/* Right part: Action Buttons */}
              <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent chapter selection when clicking the toggle
                    onToggleReadStatus(chapter.id);
                  }}
                  title={chapter.isRead ? "未読にする" : "既読にする"}
                  aria-label={chapter.isRead ? "この章を未読としてマーク" : "この章を既読としてマーク"}
                  className={`p-1 rounded-full transition-colors
                    ${activeChapterId === chapter.id 
                      ? 'text-white hover:bg-sky-400' 
                      : 'text-gray-400 hover:bg-gray-600 hover:text-gray-200 group-hover:text-gray-200'}
                    focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-gray-700 focus:ring-sky-500`}
                >
                  {chapter.isRead ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent chapter selection
                    onDeleteChapter(chapter.id);
                  }}
                  title="この章を削除"
                  aria-label={`章「${chapter.title}」を削除`}
                  className={`p-1 rounded-full transition-colors
                    ${activeChapterId === chapter.id 
                      ? 'text-white hover:bg-red-400 hover:bg-opacity-80' 
                      : 'text-gray-400 hover:bg-gray-600 hover:text-red-400 group-hover:text-red-400'}
                    focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-gray-700 focus:ring-red-500`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default ChapterList;
