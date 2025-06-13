import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { PaperAirplaneIcon, UserCircleIcon, SparklesIcon, SpeakerWaveIcon, PlayIcon, PauseIcon, StopIcon } from './Icons';
import { generateConversationalCommentary, extractKeywordsFromDiscussion, prepareTextForReadAloud } from '../services/geminiService';

interface ChatViewProps {
  messages: Message[];
  onSendMessage: (messageText: string) => Promise<void>;
  isLoading: boolean;
  chapterTitle: string;
  chapterContent: string;
  onPlayAudio: (text: string) => Promise<void>;
  isPlayingAudio: boolean;
  children?: React.ReactNode;
}

const ChatView: React.FC<ChatViewProps> = ({
  messages,
  onSendMessage,
  isLoading,
  chapterTitle,
  chapterContent,
  onPlayAudio,
  isPlayingAudio,
  children
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isPreparingCommentarySpeech, setIsPreparingCommentarySpeech] = useState<boolean>(false);
  const [isCommentarySpeaking, setIsCommentarySpeaking] = useState<boolean>(false);
  const [isCommentaryPaused, setIsCommentaryPaused] = useState<boolean>(false);
  const [commentarySpeechError, setCommentarySpeechError] = useState<string | null>(null);
  const commentaryUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const preparedCommentaryTextRef = useRef<string | null>(null);


  const [extractedTags, setExtractedTags] = useState<string[]>([]);
  const [isExtractingTags, setIsExtractingTags] = useState<boolean>(false);
  const [tagExtractionError, setTagExtractionError] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => { 
    return () => {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
         // Cancelling all speech on chapter change, assuming commentary belongs to the chapter.
         window.speechSynthesis.cancel();
      }
      setIsCommentarySpeaking(false);
      setIsCommentaryPaused(false);
      setCommentarySpeechError(null);
      commentaryUtteranceRef.current = null;
      preparedCommentaryTextRef.current = null;
    };
  }, [chapterTitle]); 

  useEffect(() => {
    const fetchTags = async () => {
      const lastAiMessage = messages.filter(m => m.role === 'model').pop();

      if (lastAiMessage && lastAiMessage.text.trim() !== '' && !isLoading && !isPreparingCommentarySpeech) {
        setIsExtractingTags(true);
        setTagExtractionError(null); 
        try {
          const tags = await extractKeywordsFromDiscussion(lastAiMessage.text);
          setExtractedTags(tags);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "タグの抽出中に不明なエラーが発生しました。";
          console.error("Error extracting tags:", errorMsg);
          setTagExtractionError(errorMsg);
          setExtractedTags([]);
        } finally {
          setIsExtractingTags(false);
        }
      } else if (!isLoading && !isPreparingCommentarySpeech) { 
        setExtractedTags([]);
        setTagExtractionError(null);
      }
    };

    fetchTags();
  // eslint-disable-next-line react-hooks/exhaustive-deps  
  }, [messages, chapterTitle, isLoading, isPreparingCommentarySpeech]);


  const handleGenerateAndPlayAudioCommentary = async () => {
    if (!chapterContent) {
      setCommentarySpeechError("解説のための章の内容がありません。");
      return;
    }
    if (isPreparingCommentarySpeech) return;
    // Do not check window.speechSynthesis.speaking here, as we will cancel it.


    setIsPreparingCommentarySpeech(true);
    setCommentarySpeechError(null);
    preparedCommentaryTextRef.current = null;

    try {
      console.log("Generating conversational commentary script...");
      const conversationalScript = await generateConversationalCommentary(chapterContent);

      if (!conversationalScript.trim()) {
        setCommentarySpeechError("AIによって生成された解説スクリプトが空です。");
        setIsPreparingCommentarySpeech(false);
        return;
      }
      
      console.log("Preparing commentary script for read aloud...");
      const preparedScript = await prepareTextForReadAloud(conversationalScript);
       if (!preparedScript.trim()) {
        setCommentarySpeechError("AIによるテキスト整形後、読み上げる解説スクリプトが空になりました。");
        setIsPreparingCommentarySpeech(false);
        return;
      }
      preparedCommentaryTextRef.current = preparedScript;

      const utterance = new SpeechSynthesisUtterance(preparedScript);
      utterance.lang = 'ja-JP';
      utterance.onstart = () => {
        setIsCommentarySpeaking(true);
        setIsCommentaryPaused(false);
        setCommentarySpeechError(null);
      };
      utterance.onpause = () => {
        setIsCommentaryPaused(true);
      };
      utterance.onresume = () => {
        setIsCommentaryPaused(false);
      };
      utterance.onend = () => {
        setIsCommentarySpeaking(false);
        setIsCommentaryPaused(false);
        commentaryUtteranceRef.current = null;
      };
      utterance.onerror = (event) => {
        console.error("Commentary speech synthesis error:", event);
        setCommentarySpeechError(`音声解説エラー：${event.error}`);
        setIsCommentarySpeaking(false);
        setIsCommentaryPaused(false);
        commentaryUtteranceRef.current = null;
      };
      
      commentaryUtteranceRef.current = utterance;
      window.speechSynthesis.cancel(); // Ensure any prior speech is stopped
      window.speechSynthesis.speak(utterance);

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "不明なエラーが発生しました。";
      console.error("音声解説の準備または再生に失敗しました:", e);
      setCommentarySpeechError(`音声解説準備エラー：${errorMsg}`);
    } finally {
      setIsPreparingCommentarySpeech(false);
    }
  };
  

  const handlePlayPauseAudioCommentary = () => {
     if (isPreparingCommentarySpeech) return;

    if (window.speechSynthesis.speaking) {
      // Check if the currently speaking/paused utterance is our commentary one by checking the ref
      if (commentaryUtteranceRef.current && (window.speechSynthesis.paused === isCommentaryPaused) ) {
          if (isCommentaryPaused) {
            window.speechSynthesis.resume();
          } else {
            window.speechSynthesis.pause();
          }
      } else {
          // Another speech is active or state is inconsistent, stop it and start ours
          window.speechSynthesis.cancel(); 
          handleGenerateAndPlayAudioCommentary(); 
      }
    } else if (preparedCommentaryTextRef.current && commentaryUtteranceRef.current) {
        if(!commentaryUtteranceRef.current.text || commentaryUtteranceRef.current.onend === null) {
            window.speechSynthesis.cancel();
            handleGenerateAndPlayAudioCommentary();
        } else {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(commentaryUtteranceRef.current);
        }
    } else {
      window.speechSynthesis.cancel();
      handleGenerateAndPlayAudioCommentary();
    }
  };

  const handleStopAudioCommentary = () => {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
       window.speechSynthesis.cancel();
    }
    setIsCommentarySpeaking(false);
    setIsCommentaryPaused(false);
    if (commentaryUtteranceRef.current) {
        commentaryUtteranceRef.current.onstart = null;
        commentaryUtteranceRef.current.onpause = null;
        commentaryUtteranceRef.current.onresume = null;
        commentaryUtteranceRef.current.onend = null;
        commentaryUtteranceRef.current.onerror = null;
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handlePlayMessage = async (text: string) => {
    if (!isLoading && !isPlayingAudio) {
      await onPlayAudio(text);
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
          return <p key={lineKey} className="my-1 text-gray-200">{highlightQuotedText(line, `${lineKey}-default`)}</p>;
        })}
      </>
    );
  };

  const isCommentaryPlayButtonActive = isCommentarySpeaking && !isCommentaryPaused;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-sky-600 text-white'
                  : 'bg-gray-700 text-gray-100'
              }`}
            >
              <div className="flex items-start gap-2">
                {message.role === 'user' ? (
                  <UserCircleIcon className="w-6 h-6 flex-shrink-0" />
                ) : (
                  <SparklesIcon className="w-6 h-6 flex-shrink-0" />
                )}
                <div className="flex-1">
                  {message.role === 'model' ? (
                    renderModelMessageContent(message.id, message.text)
                  ) : (
                    <p>{message.text}</p>
                  )}
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => handlePlayMessage(message.text)}
                      className="text-gray-300 hover:text-white"
                      title="音声で再生"
                    >
                      <SpeakerWaveIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 音声プレーヤーを表示 */}
      {children}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="メッセージを入力..."
          className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !inputText.trim()}
          className="bg-sky-600 text-white rounded-lg px-4 py-2 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PaperAirplaneIcon className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};

export default ChatView;
