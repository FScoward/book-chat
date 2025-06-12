
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { PaperAirplaneIcon, UserCircleIcon, SparklesIcon, SpeakerWaveIcon } from './Icons';
import { generateConversationalCommentary, extractKeywordsFromDiscussion } from '../services/geminiService';
import { AVAILABLE_MODELS } from '../App'; // Import AVAILABLE_MODELS

interface ChatViewProps {
  messages: Message[];
  onSendMessage: (messageText: string) => void;
  isLoading: boolean;
  chapterTitle?: string;
  chapterContent: string;
  selectedModelId: string; // Changed prop name
}

const ChatView: React.FC<ChatViewProps> = ({ messages, onSendMessage, isLoading, chapterTitle, chapterContent, selectedModelId }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isProcessingAudioAction, setIsProcessingAudioAction] = useState<boolean>(false);
  const [audioFeatureMessage, setAudioFeatureMessage] = useState<string | null>(null);

  const [extractedTags, setExtractedTags] = useState<string[]>([]);
  const [isExtractingTags, setIsExtractingTags] = useState<boolean>(false);
  const [tagExtractionError, setTagExtractionError] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    return () => {
      setAudioFeatureMessage(null);
    };
  }, [chapterTitle]);

  useEffect(() => {
    const fetchTags = async () => {
      const lastAiMessage = messages.filter(m => m.role === 'model').pop();
      const currentSelectedModelDefinition = AVAILABLE_MODELS.find(m => m.id === selectedModelId);

      if (currentSelectedModelDefinition?.apiProvider === 'openai') {
        setTagExtractionError("OpenAIモデルではキーワード抽出は利用できません。");
        setExtractedTags([]);
        setIsExtractingTags(false);
        return;
      }

      if (lastAiMessage && lastAiMessage.text.trim() !== '' && !isLoading && !isProcessingAudioAction) {
        setIsExtractingTags(true);
        setTagExtractionError(null); 
        try {
          const tags = await extractKeywordsFromDiscussion(lastAiMessage.text, selectedModelId);
          setExtractedTags(tags);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "タグの抽出中に不明なエラーが発生しました。";
          console.error("Error extracting tags:", errorMsg);
          setTagExtractionError(errorMsg);
          setExtractedTags([]);
        } finally {
          setIsExtractingTags(false);
        }
      } else if (!isLoading && !isProcessingAudioAction) { 
        setExtractedTags([]);
        setTagExtractionError(null);
      }
    };

    fetchTags();
  }, [messages, chapterTitle, isLoading, isProcessingAudioAction, selectedModelId]);


  const handleAudioCommentaryAction = async () => {
    if (!chapterContent) {
      setAudioFeatureMessage("解説のための章の内容がありません。");
      return;
    }

    const currentSelectedModelDefinition = AVAILABLE_MODELS.find(m => m.id === selectedModelId);
    if (currentSelectedModelDefinition?.apiProvider === 'openai') {
      setAudioFeatureMessage(
        `OpenAIモデル (${currentSelectedModelDefinition.name}) では音声解説機能は利用できません。Geminiモデルを選択してください。`
      );
      return;
    }
    
    setIsProcessingAudioAction(true);
    setAudioFeatureMessage(null);

    try {
      // const ssmlText = await generateConversationalCommentary(chapterContent, selectedModelId);
      // console.log("Generated SSML for commentary (TTS feature unavailable):", ssmlText);

      setAudioFeatureMessage(
        `音声解説機能は、現在の設定ではご利用いただけません (Gemini TTS API別途設定要)。\n（内部処理: 選択されたGeminiモデル「${selectedModelId}」でSSMLスクリプト生成試行）`
      );
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "SSML生成中に不明なエラーが発生しました。";
        setAudioFeatureMessage(`音声解説用SSMLの生成に失敗しました (使用モデル: ${selectedModelId}): ${errorMsg}`);
        console.error("Error in handleAudioCommentaryAction (SSML generation):", e);
    } finally {
      setIsProcessingAudioAction(false);
    }
  };
  

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentSelectedModelDefinition = AVAILABLE_MODELS.find(m => m.id === selectedModelId);
    if (currentSelectedModelDefinition?.apiProvider === 'openai') {
        setTagExtractionError(null); // Clear previous errors
        setAudioFeatureMessage(`OpenAIモデル (${currentSelectedModelDefinition.name}) でメッセージを送信することはできません。Geminiモデルを選択してください。`);
        return;
    }
    if (inputText.trim() && !isLoading && !isProcessingAudioAction && !isExtractingTags) {
      onSendMessage(inputText.trim());
      setInputText('');
      setAudioFeatureMessage(null); // Clear audio/OpenAI related messages on successful send
    }
  };

  const highlightQuotedText = (text: string, baseKey: string): React.ReactNode[] => {
    if (!text) return [<React.Fragment key={`${baseKey}-empty`}>{text}</React.Fragment>];
    const parts = text.split(/(「.*?」)/g);
    return parts.map((part, i) => {
      const partKey = `${baseKey}-part-${i}`;
      if (part.startsWith('「') && part.endsWith('」')) {
        return <span key={partKey} className="text-yellow-400 font-semibold">{part}</span>;
      }
      return <React.Fragment key={partKey}>{part}</React.Fragment>;
    });
  };

  const renderModelMessageContent = (msgId: string, text: string) => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return (
      <>
        {lines.map((line, index) => {
          const trimmedLine = line.trim();
          const analystMatch = trimmedLine.match(/^(?:アナリスト|Analyst)\s*(:|：)\s*(.*)/i);
          const explorerMatch = trimmedLine.match(/^(?:エクスプローラー|Explorer)\s*(:|：)\s*(.*)/i);
          const lineKey = `msg-${msgId}-line-${index}`;

          if (analystMatch) {
            return (
              <p key={lineKey} className="p-2.5 rounded-lg bg-sky-700 my-1.5 shadow-md text-sky-100">
                <strong className="font-bold text-sky-200">アナリスト:</strong>{' '}
                {highlightQuotedText(analystMatch[2], `${lineKey}-analyst`)}
              </p>
            );
          } else if (explorerMatch) {
            return (
              <p key={lineKey} className="p-2.5 rounded-lg bg-teal-700 my-1.5 shadow-md text-teal-100">
                <strong className="font-bold text-teal-200">エクスプローラー:</strong>{' '}
                {highlightQuotedText(explorerMatch[2], `${lineKey}-explorer`)}
              </p>
            );
          }
          // Default styling for lines that don't match Analyst/Explorer
          // This ensures error messages or other AI responses are still displayed.
           return <p key={lineKey} className="my-1 text-gray-200">{highlightQuotedText(line, `${lineKey}-default`)}</p>;
        })}
      </>
    );
  };


  return (
    <div className="h-full flex flex-col bg-gray-800 text-gray-100">
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold text-sky-400">
            AIディスカッション：{chapterTitle || "現在の章"}
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleAudioCommentaryAction}
              disabled={isProcessingAudioAction || !chapterContent || isLoading || isExtractingTags}
              className="p-2 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="章のAI音声解説について (情報)"
              aria-label="音声解説機能の情報表示"
            >
              {isProcessingAudioAction ? <LoadingSpinner size="xs" /> : <SpeakerWaveIcon className="w-5 h-5 text-sky-400" />}
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
          {isExtractingTags && <LoadingSpinner size="xs" />}
          {tagExtractionError && !isExtractingTags && (
            <p className="text-xs text-red-400" role="alert">
              タグ抽出エラー: {tagExtractionError.length > 50 ? tagExtractionError.substring(0,50) + "..." : tagExtractionError}
            </p>
          )}
          {!isExtractingTags && !tagExtractionError && extractedTags.length > 0 && (
            extractedTags.map(tag => (
              <span 
                key={tag} 
                className="bg-gray-600 text-gray-200 text-xs px-2.5 py-1 rounded-full shadow"
                title={tag}
              >
                {tag.length > 20 ? tag.substring(0, 18) + "..." : tag}
              </span>
            ))
          )}
          {!isExtractingTags && !tagExtractionError && extractedTags.length === 0 && messages.some(m => m.role === 'model') && !isLoading && (
            <p className="text-xs text-gray-500">関連タグはありません。</p>
          )}
        </div>

        {audioFeatureMessage && <p className="text-xs text-yellow-300 bg-yellow-700 bg-opacity-40 p-2 rounded mt-1 whitespace-pre-line" role="status">{audioFeatureMessage}</p>}
      </div>
      
      <div className="flex-grow overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex items-start max-w-xl ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'model' && <SparklesIcon className="w-8 h-8 p-1.5 rounded-full bg-gray-600 text-sky-300 mr-2 flex-shrink-0" aria-hidden="true" />}
              {msg.role === 'user' && <UserCircleIcon className="w-8 h-8 p-1.5 rounded-full bg-indigo-500 text-white ml-2 flex-shrink-0" aria-hidden="true" />}
              <div
                className={`px-4 py-2.5 rounded-xl shadow ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-gray-700 text-gray-200 rounded-bl-none'
                }`}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {msg.role === 'model' ? renderModelMessageContent(msg.id, msg.text) : <p className="text-gray-100">{msg.text}</p>}
                 <p className="text-xs opacity-60 mt-1.5 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}
        {isLoading && messages.length > 0 && messages[messages.length-1].role === 'user' && (
          <div className="flex justify-start">
             <div className="flex items-start max-w-xl">
                <SparklesIcon className="w-8 h-8 p-1.5 rounded-full bg-gray-600 text-sky-300 mr-2 flex-shrink-0" aria-hidden="true" />
                <div className="px-4 py-2.5 rounded-xl shadow bg-gray-700 text-gray-200 rounded-bl-none">
                    <LoadingSpinner size="sm" />
                </div>
            </div>
          </div>
        )}
         {isLoading && messages.length === 0 && ( 
          <div className="flex justify-start">
             <div className="flex items-start max-w-xl">
                <SparklesIcon className="w-8 h-8 p-1.5 rounded-full bg-gray-600 text-sky-300 mr-2 flex-shrink-0" aria-hidden="true" />
                <div className="px-4 py-2.5 rounded-xl shadow bg-gray-700 text-gray-200 rounded-bl-none flex items-center">
                    <LoadingSpinner size="sm" />
                    <p className="ml-2 text-sm text-gray-400">AIペルソナが議論を開始しています...</p>
                </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex items-center bg-gray-700 rounded-lg p-1 shadow">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="AIの議論に割り込むか、質問してください..."
            className="flex-grow bg-transparent p-2.5 text-gray-100 placeholder-gray-400 focus:outline-none"
            disabled={isLoading || isProcessingAudioAction || isExtractingTags}
            aria-label="メッセージ入力欄"
          />
          <button
            type="submit"
            disabled={isLoading || isProcessingAudioAction || isExtractingTags || !inputText.trim()}
            className="bg-sky-500 text-white p-2.5 rounded-md hover:bg-sky-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition duration-150 ease-in-out"
            aria-label="メッセージを送信"
          >
            {(isLoading || isExtractingTags || isProcessingAudioAction) ? <LoadingSpinner size="xs" /> : <PaperAirplaneIcon className="w-5 h-5" />}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatView;
