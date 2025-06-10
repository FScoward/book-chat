
import React from 'react';
import { Chapter } from '../types';
import { TrashIcon, BookOpenIcon } from './Icons';

interface ChapterListProps {
  chapters: Pick<Chapter, 'id' | 'title'>[];
  activeChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onDeleteChapter: (id: string) => void;
}

const ChapterList: React.FC<ChapterListProps> = ({ chapters, activeChapterId, onSelectChapter, onDeleteChapter }) => {
  if (chapters.length === 0) {
    return <p className="text-gray-400 text-sm">まだ章が追加されていません。</p>;
  }

  return (
    <nav className="space-y-2">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">章一覧</h2>
      <ul>
        {chapters.map((chapter) => (
          <li key={chapter.id} className="group">
            <div
              onClick={() => onSelectChapter(chapter.id)}
              className={`flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-colors duration-150 ease-in-out
                ${activeChapterId === chapter.id 
                  ? 'bg-sky-500 text-white shadow-sm' 
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
            >
              <div className="flex items-center truncate">
                <BookOpenIcon className={`w-5 h-5 mr-3 flex-shrink-0 ${activeChapterId === chapter.id ? 'text-white' : 'text-sky-400'}`} />
                <span className="truncate font-medium">{chapter.title}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // li onClickが発火するのを防ぐ
                  if (window.confirm(`「${chapter.title}」の章を本当に削除しますか？`)) {
                    onDeleteChapter(chapter.id);
                  }
                }}
                className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150
                  ${activeChapterId === chapter.id 
                    ? 'text-sky-100 hover:bg-sky-400' 
                    : 'text-gray-400 hover:bg-red-500 hover:text-white'
                  }`}
                aria-label="章を削除"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default ChapterList;