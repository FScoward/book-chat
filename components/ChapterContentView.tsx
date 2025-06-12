
import React from 'react';
import { Chapter } from '../types';
import { BookOpenIcon } from './Icons';

interface ChapterContentViewProps {
  chapter: Chapter | null;
}

// Helper function to highlight quoted text within chapter content
const highlightQuotedTextInContent = (text: string | null, baseKey: string): React.ReactNode[] => {
  if (!text) return [text === null ? null : <React.Fragment key={`${baseKey}-empty`}>{text}</React.Fragment>]; // Handle null/empty string with a key
  // Split by Japanese quotation marks (「...」), keeping the delimiters
  const parts = text.split(/(「.*?」)/g);
  return parts.map((part, i) => {
    const partKey = `${baseKey}-part-${i}`;
    if (part.startsWith('「') && part.endsWith('」')) {
      return <span key={partKey} className="text-yellow-400 font-semibold">{part}</span>;
    }
    // Ensure all parts, including plain text, have explicit keys
    return <React.Fragment key={partKey}>{part}</React.Fragment>;
  });
};

// Helper function to recursively render HTML nodes as React elements
const renderNode = (node: ChildNode, baseKey: string): React.ReactNode => {
  if (node.nodeType === Node.TEXT_NODE) {
    const textContent = node.textContent;
    // Only render text node if it has non-whitespace content
    if (textContent && textContent.trim() !== '') {
      return highlightQuotedTextInContent(textContent, baseKey);
    }
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    
    // Recursively render child nodes. Filter out null results (e.g. empty text nodes)
    const children = Array.from(element.childNodes)
                          .map((child, i) => renderNode(child, `${baseKey}-child-${i}`))
                          .filter(child => child !== null)
                          .flat(); // flat() to handle cases where highlightQuotedTextInContent returns an array

    switch (tagName) {
      case 'p':
        return <p key={baseKey}>{children.length > 0 ? children : '\u00A0'}</p>;
      case 'h1':
        return <h1 key={baseKey} className="text-3xl font-bold">{children}</h1>;
      case 'h2': 
        return <h2 key={baseKey} className="text-2xl font-bold">{children}</h2>;
      case 'h3':
        return <h3 key={baseKey} className="text-xl font-bold">{children}</h3>;
      case 'h4':
        return <h4 key={baseKey} className="text-lg font-bold">{children}</h4>;
      case 'h5':
        return <h5 key={baseKey} className="text-base font-bold">{children}</h5>;
      case 'h6':
        return <h6 key={baseKey} className="text-sm font-bold">{children}</h6>;
      case 'img':
        const src = element.getAttribute('src');
        const alt = element.getAttribute('alt') || '';
        if (!src) return null;
        return <img key={baseKey} src={src} alt={alt} className="my-4 mx-auto max-w-full h-auto rounded-md shadow-md" />;
      case 'br':
        return <br key={baseKey} />;
      case 'hr':
        return <hr key={baseKey} className="my-4 border-gray-600" />;
      case 'ul':
        return <ul key={baseKey} className="list-disc list-inside ml-4">{children}</ul>;
      case 'ol':
        return <ol key={baseKey} className="list-decimal list-inside ml-4">{children}</ol>;
      case 'li':
        return <li key={baseKey}>{children}</li>;
      case 'blockquote':
        return <blockquote key={baseKey} className="border-l-4 border-gray-500 pl-4 italic">{children}</blockquote>;
      case 'strong':
      case 'b':
        return <strong key={baseKey}>{children}</strong>;
      case 'em':
      case 'i':
        return <em key={baseKey}>{children}</em>;
      case 'u':
        return <u key={baseKey}>{children}</u>;
      case 'a':
        const href = element.getAttribute('href');
        return <a key={baseKey} href={href || undefined} className="text-sky-400 hover:text-sky-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>;
      case 'script':
      case 'style':
      case 'noscript':
      case 'meta':
      case 'link': 
      case 'title': 
      case 'head':
        return null;
      default:
        if (children && children.length > 0) {
          return <React.Fragment key={baseKey}>{children}</React.Fragment>;
        }
        return null; 
    }
  }
  return null;
};

const renderHtmlContentAsReact = (htmlString: string, chapterTitle?: string): React.ReactNode[] => {
  if (typeof DOMParser === 'undefined') { 
    return [<p key="html-parse-error">HTML parsing not available in this environment.</p>];
  }
  if (!htmlString || htmlString.trim() === '') {
    return [<p key="html-empty-content" className="italic text-gray-500">(この章には表示可能なHTMLコンテンツがありません)</p>];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  let nodesToRender: ChildNode[] = [];
  if (doc.body && doc.body.childNodes.length > 0) {
    nodesToRender = Array.from(doc.body.childNodes);
  } else if (doc.documentElement && doc.documentElement.childNodes.length > 0) {
    nodesToRender = Array.from(doc.documentElement.childNodes).filter(node => node.nodeName.toLowerCase() !== 'head');
  } else {
    return [<p key="html-parse-fallback" className="italic text-gray-500">(HTMLコンテンツの解析に問題がある可能性があります)</p>];
  }
  
  const reactNodes = nodesToRender
    .map((node, index) => renderNode(node, `doc-root-${index}`))
    .filter(node => node !== null)
    .flat(); 

  if (reactNodes.length === 0) {
     return [<p key="html-no-renderable-elements" className="italic text-gray-500">(抽出されたHTMLから表示可能な要素が見つかりませんでした)</p>];
  }
  return reactNodes;
};


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

  const renderPlainTextAsParagraphs = (text: string) => {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const paragraphs = normalizedText
      .split(/\n{2,}/g) 
      .map(p => p.trim())
      .filter(p => p !== ''); 

    if (paragraphs.length === 0) {
      const singleBlockText = normalizedText.trim();
      const pKey = "single-block-text"; 
      if (singleBlockText === '') {
        return <p key={`${pKey}-empty`} className="italic text-gray-500">(この章には表示可能なテキストコンテンツがありません)</p>;
      }
      const isSingleLine = !singleBlockText.includes('\n');
      const isShort = singleBlockText.length < 70;
      const isLikelySubheading = isSingleLine && isShort && singleBlockText.length > 0;


      if (isLikelySubheading) {
        return (
          <p key={pKey} className="font-bold" style={{ whiteSpace: 'pre-wrap' }}>
            {highlightQuotedTextInContent(singleBlockText, `${pKey}-content`)}
          </p>
        );
      }
      return (
        <p key={pKey} style={{ whiteSpace: 'pre-wrap' }}>
          {highlightQuotedTextInContent(singleBlockText, `${pKey}-content`)}
        </p>
      );
    }

    return paragraphs.map((paragraphText, index) => {
      const isSingleLine = !paragraphText.includes('\n');
      const isShort = paragraphText.length < 70;
      const isLikelySubheading = isSingleLine && isShort;
      const pKey = `para-${index}`;

      if (isLikelySubheading) {
        return (
            <p key={pKey} className="font-bold" style={{ whiteSpace: 'pre-wrap' }}>
              {highlightQuotedTextInContent(paragraphText, `${pKey}-content`)}
            </p>
        );
      } else {
        return (
          <p key={pKey} style={{ whiteSpace: 'pre-wrap' }}>
            {highlightQuotedTextInContent(paragraphText, `${pKey}-content`)}
          </p>
        );
      }
    });
  };

  return (
    <div className="h-full flex flex-col">
      <h2 className="flex items-center text-xl font-semibold text-sky-400 mb-3 pb-3 border-b border-gray-700">
        <BookOpenIcon className="w-6 h-6 mr-2 text-sky-400 flex-shrink-0" />
        {chapter.title}
      </h2>
      <div 
        className="flex-grow overflow-y-auto text-gray-200 pr-2 font-serif text-justify leading-relaxed prose prose-sm sm:prose-base prose-invert max-w-none prose-p:text-justify prose-headings:text-sky-400 [&>:first-child]:mt-0 min-h-0"
      >
        {chapter.isHtmlContent 
          ? renderHtmlContentAsReact(chapter.content, chapter.title)
          : renderPlainTextAsParagraphs(chapter.content)}
      </div>
    </div>
  );
};

export default ChapterContentView;
