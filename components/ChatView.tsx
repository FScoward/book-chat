
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { PaperAirplaneIcon, UserCircleIcon, SparklesIcon, SpeakerWaveIcon, PlayIcon, PauseIcon, StopIcon } from './Icons';
import { generateConversationalCommentary } from '../services/geminiService';

interface ChatViewProps {
  messages: Message[];
  onSendMessage: (messageText: string) => void;
  isLoading: boolean;
  chapterTitle?: string;
  chapterContent: string;
}

const ChatView: React.FC<ChatViewProps> = ({ messages, onSendMessage, isLoading, chapterTitle, chapterContent }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [audioSummaryText, setAudioSummaryText] = useState<string | null>(null);
  const [isGeneratingAudioSummary, setIsGeneratingAudioSummary] = useState<boolean>(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [isAudioPaused, setIsAudioPaused] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    // Cleanup function: called on component unmount or when chapterTitle changes
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel(); // Stop any speech
      }
      // Clear event listeners from the potentially active utterance
      if (currentUtteranceRef.current) {
        currentUtteranceRef.current.onstart = null;
        currentUtteranceRef.current.onend = null;
        currentUtteranceRef.current.onerror = null;
        currentUtteranceRef.current = null; // Clear the ref
      }
    };
  }, [chapterTitle]); 


  const playAudio = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      setAudioError("このブラウザは音声合成をサポートしていません。");
      return;
    }
    
    // Ensure any previous utterance is fully cleaned up before starting a new one.
    if (currentUtteranceRef.current) {
        currentUtteranceRef.current.onstart = null;
        currentUtteranceRef.current.onend = null;
        currentUtteranceRef.current.onerror = null;
    }
    window.speechSynthesis.cancel(); // Cancel any ongoing or queued speech

    const utterance = new SpeechSynthesisUtterance(text);
    currentUtteranceRef.current = utterance;

    utterance.onstart = () => {
      setIsAudioPlaying(true);
      setIsAudioPaused(false);
      setAudioError(null);
    };
    utterance.onend = () => {
      setIsAudioPlaying(false);
      setIsAudioPaused(false);
      if (currentUtteranceRef.current === utterance) {
        currentUtteranceRef.current = null;
      }
    };
    utterance.onerror = (event) => {
      console.error("音声合成エラー:", event.error);
      // Don't show "interrupted" as a user-facing error, as it's often due to user action.
      if (event.error !== 'interrupted') {
        setAudioError(`音声再生エラー：${event.error}`);
      } else {
        setAudioError(null); // Clear previous errors if any
         // console.log("Speech was interrupted, likely intentionally.");
      }
      setIsAudioPlaying(false);
      setIsAudioPaused(false);
      if (currentUtteranceRef.current === utterance) {
        currentUtteranceRef.current = null;
      }
    };
    
    const setJapaneseVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      let bestVoice = voices.find(voice => voice.lang === 'ja-JP' && voice.localService);
      if (!bestVoice) {
          bestVoice = voices.find(voice => voice.lang === 'ja-JP');
      }
      if (!bestVoice) {
          bestVoice = voices.find(voice => voice.lang.startsWith('ja') && voice.localService);
      }
      if (!bestVoice) {
          bestVoice = voices.find(voice => voice.lang.startsWith('ja'));
      }

      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang; 
      } else {
        utterance.lang = 'ja-JP'; 
        console.warn("特定の日本語音声が見つかりませんでした。デフォルトの音声で 'ja-JP' を試みます。");
      }
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        setJapaneseVoice();
        window.speechSynthesis.onvoiceschanged = null; 
      };
    } else {
      setJapaneseVoice();
    }

  }, []);


  const handleGenerateAudioSummary = async () => {
    if (!chapterContent) {
      setAudioError("解説のための章の内容がありません。");
      return;
    }
    setIsGeneratingAudioSummary(true);
    setAudioSummaryText(null);
    setAudioError(null);
    setIsAudioPlaying(false);
    setIsAudioPaused(false);
    if (window.speechSynthesis) {
      // Cancel any existing speech before generating new one
      // This will also clean up currentUtteranceRef via its onend or onerror if speech was active
      window.speechSynthesis.cancel();
    }

    try {
      const conversationalScript = await generateConversationalCommentary(chapterContent);
      setAudioSummaryText(conversationalScript);
      playAudio(conversationalScript);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "不明なエラーが発生しました。";
      console.error("音声解説の生成に失敗しました:", errorMsg);
      setAudioError(`音声解説の生成に失敗しました：${errorMsg}`);
    } finally {
      setIsGeneratingAudioSummary(false);
    }
  };

  const handlePlayPauseAudio = () => {
    if (!window.speechSynthesis) return;

    if (isAudioPlaying && !isAudioPaused) { 
      window.speechSynthesis.pause();
      setIsAudioPaused(true);
    } else { 
      if (isAudioPaused) {
        window.speechSynthesis.resume();
         setIsAudioPlaying(true); // Ensure playing is true when resuming
      } else if (audioSummaryText) {
        playAudio(audioSummaryText); 
      }
      setIsAudioPaused(false);
    }
  };

  const handleStopAudio = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // This will trigger onend or onerror of currentUtteranceRef
    setIsAudioPlaying(false);
    setIsAudioPaused(false);
    // Explicitly clear listeners and ref, as cancel() might not synchronously trigger onend/onerror
    // or another utterance might be queued.
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onstart = null;
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const renderModelMessageContent = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return (
      <>
        {lines.map((line, index) => {
          const analystMatch = line.match(/^(?:アナリスト|Analyst):\s*(.*)/i);
          const explorerMatch = line.match(/^(?:エクスプローラー|Explorer):\s*(.*)/i);

          if (analystMatch) {
            return <p key={index} className="mb-1"><strong className="font-semibold text-sky-300">アナリスト:</strong> {analystMatch[1]}</p>;
          } else if (explorerMatch) {
            return <p key={index} className="mb-1"><strong className="font-semibold text-teal-300">エクスプローラー:</strong> {explorerMatch[1]}</p>;
          }
          return <p key={index} className="mb-1">{line}</p>;
        })}
      </>
    );
  };


  return (
    <div className="h-full flex flex-col bg-gray-800 text-gray-100">
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-sky-400">
            AIディスカッション：{chapterTitle || "現在の章"}
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleGenerateAudioSummary}
              disabled={isGeneratingAudioSummary || !chapterContent || isLoading}
              className="p-2 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="章のAI音声解説を聞く (アナリスト & エクスプローラー)"
            >
              {isGeneratingAudioSummary ? <LoadingSpinner size="xs" /> : <SpeakerWaveIcon className="w-5 h-5 text-sky-400" />}
            </button>
            {audioSummaryText && !isGeneratingAudioSummary && (isAudioPlaying || isAudioPaused) && (
              <>
                <button
                  onClick={handlePlayPauseAudio}
                  className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                  title={(isAudioPlaying && !isAudioPaused) ? "一時停止" : "再生"}
                >
                  {(isAudioPlaying && !isAudioPaused) ? <PauseIcon className="w-5 h-5 text-sky-400" /> : <PlayIcon className="w-5 h-5 text-sky-400" />}
                </button>
                <button
                  onClick={handleStopAudio}
                  disabled={!isAudioPlaying && !isAudioPaused}
                  className="p-2 rounded-full hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  title="停止"
                >
                  <StopIcon className="w-5 h-5 text-red-400" />
                </button>
              </>
            )}
          </div>
        </div>
         {audioError && <p className="text-xs text-red-400 mt-1">{audioError}</p>}
      </div>
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex items-start max-w-xl ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'model' && <SparklesIcon className="w-8 h-8 p-1.5 rounded-full bg-gray-600 text-sky-300 mr-2 flex-shrink-0" />}
              {msg.role === 'user' && <UserCircleIcon className="w-8 h-8 p-1.5 rounded-full bg-indigo-500 text-white ml-2 flex-shrink-0" />}
              <div
                className={`px-4 py-2.5 rounded-xl shadow ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-gray-700 text-gray-200 rounded-bl-none'
                }`}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} 
              >
                {msg.role === 'model' ? renderModelMessageContent(msg.text) : msg.text}
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
                <SparklesIcon className="w-8 h-8 p-1.5 rounded-full bg-gray-600 text-sky-300 mr-2 flex-shrink-0" />
                <div className="px-4 py-2.5 rounded-xl shadow bg-gray-700 text-gray-200 rounded-bl-none">
                    <LoadingSpinner size="sm" />
                </div>
            </div>
          </div>
        )}
         {isLoading && messages.length === 0 && ( // AIによる最初の議論のローディングインジケータ
          <div className="flex justify-start">
             <div className="flex items-start max-w-xl">
                <SparklesIcon className="w-8 h-8 p-1.5 rounded-full bg-gray-600 text-sky-300 mr-2 flex-shrink-0" />
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
            disabled={isLoading || isGeneratingAudioSummary}
          />
          <button
            type="submit"
            disabled={isLoading || isGeneratingAudioSummary || !inputText.trim()}
            className="bg-sky-500 text-white p-2.5 rounded-md hover:bg-sky-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition duration-150 ease-in-out"
            aria-label="メッセージを送信"
          >
            {isLoading ? <LoadingSpinner size="xs" /> : <PaperAirplaneIcon className="w-5 h-5" />}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatView;
