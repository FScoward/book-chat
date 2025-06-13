import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chapter } from '../types';
import { BookOpenIcon, SpeakerWaveIcon, PlayIcon, PauseIcon, StopIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import { prepareTextForReadAloud } from '../services/geminiService';

interface ChapterContentViewProps {
  chapter: Chapter | null;
}

const highlightQuotedTextInContent = (text: string | null, baseKey: string): React.ReactNode[] => {
  if (!text) return [text === null ? null : <React.Fragment key={`${baseKey}-empty`}>{text}</React.Fragment>]; 
  const parts = text.split(/(「.*?」)/g);
  return parts.map((part, i) => {
    const partKey = `${baseKey}-part-${i}`;
    if (part.startsWith('「') && part.endsWith('」')) {
      return <span key={partKey} className="text-yellow-400 font-semibold">{part}</span>;
    }
    return <React.Fragment key={partKey}>{part}</React.Fragment>;
  });
};

const extractTextFromHtmlNodes = (nodes: ChildNode[]): string => {
  let text = '';
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (['script', 'style', 'noscript', 'meta', 'link', 'title', 'head'].includes(element.tagName.toLowerCase())) {
        continue;
      }
      text += extractTextFromHtmlNodes(Array.from(element.childNodes));
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br', 'hr', 'div', 'blockquote'].includes(element.tagName.toLowerCase())) {
        text += ' '; 
      }
    }
  }
  return text.replace(/\s+/g, ' ').trim();
};

const renderNode = (node: ChildNode, baseKey: string): React.ReactNode => {
  if (node.nodeType === Node.TEXT_NODE) {
    const textContent = node.textContent;
    if (textContent && textContent.trim() !== '') {
      return highlightQuotedTextInContent(textContent, baseKey);
    }
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    
    const children = Array.from(element.childNodes)
                          .map((child, i) => renderNode(child, `${baseKey}-child-${i}`))
                          .filter(child => child !== null)
                          .flat(); 

    switch (tagName) {
      case 'p':
        return <p key={baseKey} className="hover:bg-gray-700 transition-colors duration-150">{children.length > 0 ? children : '\u00A0'}</p>;
      case 'h1':
        return <h1 key={baseKey} className="text-3xl font-bold hover:bg-gray-700 transition-colors duration-150">{children}</h1>;
      case 'h2': 
        return <h2 key={baseKey} className="text-2xl font-bold hover:bg-gray-700 transition-colors duration-150">{children}</h2>;
      case 'h3':
        return <h3 key={baseKey} className="text-xl font-bold hover:bg-gray-700 transition-colors duration-150">{children}</h3>;
      case 'h4':
        return <h4 key={baseKey} className="text-lg font-bold hover:bg-gray-700 transition-colors duration-150">{children}</h4>;
      case 'h5':
        return <h5 key={baseKey} className="text-base font-bold hover:bg-gray-700 transition-colors duration-150">{children}</h5>;
      case 'h6':
        return <h6 key={baseKey} className="text-sm font-bold hover:bg-gray-700 transition-colors duration-150">{children}</h6>;
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
        return <li key={baseKey} className="hover:bg-gray-700 transition-colors duration-150">{children}</li>;
      case 'blockquote':
        return <blockquote key={baseKey} className="border-l-4 border-gray-500 pl-4 italic hover:bg-gray-700 transition-colors duration-150">{children}</blockquote>;
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
  const [isPreparingSpeech, setIsPreparingSpeech] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const preparedTextRef = useRef<string | null>(null);

  const plainTextContentForTTS = useCallback(() => {
    if (!chapter) return "";
    if (chapter.isHtmlContent) {
      if (typeof DOMParser === 'undefined') return "";
      const parser = new DOMParser();
      const doc = parser.parseFromString(chapter.content, 'text/html');
      return extractTextFromHtmlNodes(doc.body ? Array.from(doc.body.childNodes) : []);
    }
    return chapter.content;
  }, [chapter]);

  // Cleanup speech synthesis when chapter changes or component unmounts
  useEffect(() => {
    return () => {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      setIsPaused(false);
      setSpeechError(null);
      utteranceRef.current = null;
      preparedTextRef.current = null;
    };
  }, [chapter]);

  const handlePrepareAndPlay = async () => {
    if (!chapter || isPreparingSpeech ) return;
    // Do not check window.speechSynthesis.speaking here, as we will cancel it.

    setIsPreparingSpeech(true);
    setSpeechError(null);
    preparedTextRef.current = null;

    try {
      const rawText = plainTextContentForTTS();
      if (!rawText.trim()) {
        setSpeechError("読み上げる内容がありません。");
        setIsPreparingSpeech(false);
        return;
      }
      
      console.log("Preparing text for read aloud (Chapter)...");
      const enhancedText = await prepareTextForReadAloud(rawText);
      if (!enhancedText.trim()) {
        setSpeechError("AIによるテキスト整形後、読み上げる内容が空になりました。");
        setIsPreparingSpeech(false);
        return;
      }
      preparedTextRef.current = enhancedText;

      const utterance = new SpeechSynthesisUtterance(enhancedText);
      utterance.lang = 'ja-JP';
      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        setSpeechError(null);
      };
      utterance.onpause = () => {
        setIsPaused(true);
      };
      utterance.onresume = () => {
        setIsPaused(false);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null; 
      };
      utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event);
        setSpeechError(`音声読み上げエラー：${event.error}`);
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
      };
      
      utteranceRef.current = utterance;
      window.speechSynthesis.cancel(); // Ensure any prior speech is stopped
      window.speechSynthesis.speak(utterance);

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "音声の準備または生成中に不明なエラーが発生しました。";
      setSpeechError(`音声準備エラー：${errorMsg}`);
      console.error("Error in handlePrepareAndPlay (Chapter):", e);
    } finally {
      setIsPreparingSpeech(false);
    }
  };
  
  const handlePlayPauseToggle = () => {
    if (isPreparingSpeech) return;

    if (window.speechSynthesis.speaking) {
      if (utteranceRef.current && (window.speechSynthesis.paused === isPaused)) { // Check if the current utterance is ours
        if (isPaused) { 
          window.speechSynthesis.resume();
        } else { 
          window.speechSynthesis.pause();
        }
      } else { // Another speech is active or state is inconsistent, restart ours
        window.speechSynthesis.cancel();
        handlePrepareAndPlay();
      }
    } else if (preparedTextRef.current && utteranceRef.current) { 
      if (!utteranceRef.current.text || utteranceRef.current.onend === null) {
         window.speechSynthesis.cancel();
         handlePrepareAndPlay(); 
      } else {
         window.speechSynthesis.cancel();
         window.speechSynthesis.speak(utteranceRef.current);
      }
    } else {
      window.speechSynthesis.cancel();
      handlePrepareAndPlay();
    }
  };

  const handleStop = () => {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsPaused(false);
    if (utteranceRef.current) { 
        utteranceRef.current.onstart = null;
        utteranceRef.current.onpause = null;
        utteranceRef.current.onresume = null;
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
    }
    // utteranceRef.current = null; // Let onend handle this.
  };

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
          <p key={pKey} className="font-bold hover:bg-gray-700 transition-colors duration-150" style={{ whiteSpace: 'pre-wrap' }}>
            {highlightQuotedTextInContent(singleBlockText, `${pKey}-content`)}
          </p>
        );
      }
      return (
        <p key={pKey} className="hover:bg-gray-700 transition-colors duration-150" style={{ whiteSpace: 'pre-wrap' }}>
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
          <p key={pKey} className="font-bold hover:bg-gray-700 transition-colors duration-150" style={{ whiteSpace: 'pre-wrap' }}>
            {highlightQuotedTextInContent(paragraphText, `${pKey}-content`)}
          </p>
        );
      } else {
        return (
          <p key={pKey} className="hover:bg-gray-700 transition-colors duration-150" style={{ whiteSpace: 'pre-wrap' }}>
            {highlightQuotedTextInContent(paragraphText, `${pKey}-content`)}
          </p>
        );
      }
    });
  };

  const isPlayButtonActive = isSpeaking && !isPaused;

  return (
    <div className="h-full flex flex-col">
      <div className="pb-3 border-b border-gray-700">
        <div className="flex justify-between items-center mb-1">
            <h2 className="flex items-center text-xl font-semibold text-sky-400">
            <BookOpenIcon className="w-6 h-6 mr-2 text-sky-400 flex-shrink-0" />
            {chapter.title}
            </h2>
            <div className="flex items-center space-x-2">
                {isPreparingSpeech ? (
                    <div className="flex items-center text-xs text-sky-400">
                        <LoadingSpinner size="xs" />
                        <span className="ml-1.5">読み上げ準備中...</span>
                    </div>
                ) : (isSpeaking || isPaused || preparedTextRef.current) ? ( 
                    <>
                        <button
                            onClick={handlePlayPauseToggle}
                            className="p-1.5 rounded-full hover:bg-gray-700 transition-colors"
                            title={isPlayButtonActive ? "一時停止" : "再生"}
                            aria-label={isPlayButtonActive ? "読み上げを一時停止" : "読み上げを再生"}
                        >
                            {isPlayButtonActive ? <PauseIcon className="w-5 h-5 text-sky-400" /> : <PlayIcon className="w-5 h-5 text-sky-400" />}
                        </button>
                        <button
                            onClick={handleStop}
                            disabled={!isSpeaking && !isPaused && !preparedTextRef.current} 
                            className="p-1.5 rounded-full hover:bg-gray-700 disabled:opacity-50 transition-colors"
                            title="停止"
                            aria-label="読み上げを停止"
                        >
                            <StopIcon className="w-5 h-5 text-red-400" />
                        </button>
                    </>
                ) : (
                    <button
                        onClick={handlePrepareAndPlay}
                        disabled={isPreparingSpeech}
                        className="p-1.5 rounded-full hover:bg-gray-700 disabled:opacity-50 transition-colors"
                        title="この章を読み上げる (Geminiテキスト整形)"
                        aria-label="章の読み上げを開始 (Geminiテキスト整形)"
                    >
                        <SpeakerWaveIcon className="w-5 h-5 text-sky-400" />
                    </button>
                )}
            </div>
        </div>
        {speechError && <p className="text-xs text-red-400 mt-0.5" role="alert">{speechError}</p>}
      </div>

      <div 
        className="flex-grow overflow-y-auto text-gray-200 pr-2 pt-3 font-serif text-justify leading-relaxed prose prose-sm sm:prose-base prose-invert max-w-none prose-p:text-justify prose-headings:text-sky-400 [&>:first-child]:mt-0 min-h-0"
      >
        {chapter.isHtmlContent 
          ? renderHtmlContentAsReact(chapter.content, chapter.title)
          : renderPlainTextAsParagraphs(chapter.content)}
      </div>
    </div>
  );
};

export default ChapterContentView;
