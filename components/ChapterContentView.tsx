
import React from 'react';
import { Chapter } from '../types';
import { BookOpenIcon } from './Icons';

interface ChapterContentViewProps {
  chapter: Pick<Chapter, 'title' | 'content'> | null;
}

const ChapterContentView: React.FC<ChapterContentViewProps> = ({ chapter }) => {
  if (!chapter) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <BookOpenIcon className="w-12 h-12 mb-4 text-gray-600" />
        <p>章が選択されていません。</p>
        <p className="text-sm">リストから章を選択するか、新しい章を追加してください。</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-xl font-semibold text-sky-400 mb-3 pb-3 border-b border-gray-700">
        {chapter.title}
      </h2>
      <div className="prose prose-sm prose-invert max-w-none flex-grow overflow-y-auto text-gray-300 pr-2">
        {/* Using whitespace-pre-wrap to preserve line breaks and spacing from user input */}
        <p style={{ whiteSpace: 'pre-wrap' }}>{chapter.content}</p>
      </div>
    </div>
  );
};

export default ChapterContentView;