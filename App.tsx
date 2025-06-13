import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chapter, Message } from './types';
import { getGenAI, startNewChatSession, sendMessage as sendGeminiMessage, ChapterWithContent, prepareTextForReadAloud } from './services/geminiService';
import { generateSpeech, playAudio } from './services/ttsService';
import ChapterList from './components/ChapterList';
import ChapterContentView from './components/ChapterContentView';
import ChatView from './components/ChatView';
import ChapterInputModal from './components/ChapterInputModal';
import AlertMessage from './components/AlertMessage';
import FontSizeControl from './components/FontSizeControl'; // New Import
import { PlusIcon, BookOpenIcon, ChatBubbleLeftRightIcon, XMarkIcon } from './components/Icons';
import { AudioPlayer } from './components/AudioPlayer';

const READ_STATUS_LOCAL_STORAGE_KEY = 'bookChatAi_readStatus_v1';
const FONT_SIZE_CLASS_LOCAL_STORAGE_KEY = 'bookChatAi_fontSizeClass_v1'; // New Key

const loadReadStatusFromLocalStorage = (): { [id: string]: boolean } => {
  try {
    const storedStatus = localStorage.getItem(READ_STATUS_LOCAL_STORAGE_KEY);
    return storedStatus ? JSON.parse(storedStatus) : {};
  } catch (error) {
    console.error("Error loading read status from localStorage:", error);
    return {};
  }
};

const saveReadStatusToLocalStorage = (readStatus: { [id: string]: boolean }) => {
  try {
    localStorage.setItem(READ_STATUS_LOCAL_STORAGE_KEY, JSON.stringify(readStatus));
  } catch (error) {
    console.error("Error saving read status to localStorage:", error);
  }
};

const loadFontSizeClassFromLocalStorage = (): string => {
  try {
    const storedClass = localStorage.getItem(FONT_SIZE_CLASS_LOCAL_STORAGE_KEY);
    return storedClass && ['text-sm', 'text-base', 'text-lg'].includes(storedClass) ? storedClass : 'text-base';
  } catch (error) {
    console.error("Error loading font size class from localStorage:", error);
    return 'text-base';
  }
};

const saveFontSizeClassToLocalStorage = (fontSizeClass: string) => {
  try {
    localStorage.setItem(FONT_SIZE_CLASS_LOCAL_STORAGE_KEY, fontSizeClass);
  } catch (error) {
    console.error("Error saving font size class to localStorage:", error);
  }
};


const App: React.FC = () => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializingChat, setIsInitializingChat] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiKeyOk, setIsApiKeyOk] = useState<boolean>(false);
  const [showAddChapterModal, setShowAddChapterModal] = useState<boolean>(false);
  const [fontSizeClass, setFontSizeClass] = useState<string>(loadFontSizeClassFromLocalStorage());
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [currentAudioBuffer, setCurrentAudioBuffer] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    try {
      getGenAI();
      setIsApiKeyOk(true);
    } catch (e) {
      if (e instanceof Error) {
        setError(`初期化に失敗しました：${e.message}。API_KEY 環境変数が正しく設定されていることを確認してください。`);
      } else {
        setError("不明な初期化エラーが発生しました。");
      }
      setIsApiKeyOk(false);
    }
  }, []);

  useEffect(() => {
    document.body.classList.remove('text-sm', 'text-base', 'text-lg');
    document.body.classList.add(fontSizeClass);
    saveFontSizeClassToLocalStorage(fontSizeClass);
  }, [fontSizeClass]);

  const handleSelectChapter = useCallback(async (chapterId: string, chapterContentParam?: string) => {
    setActiveChapterId(chapterId);
    setError(null);
    const chapterToUpdate = chapters.find(chap => chap.id === chapterId);

    if (chapterToUpdate && !chapterToUpdate.chatInstance) {
      if (!isApiKeyOk) {
        setError("チャットセッションを開始できません：APIキーが利用できません。");
        return;
      }
      setIsInitializingChat(true);
      try {
        const currentContent = chapterContentParam || chapterToUpdate.content;
        const chat = startNewChatSession(currentContent);

        const initialUserPrompt = "この章について議論を始めてください。";
        const initialAiResponseText = await sendGeminiMessage(chat, initialUserPrompt);

        const initialAiMessage: Message = {
          id: crypto.randomUUID(),
          role: 'model',
          text: initialAiResponseText,
          timestamp: new Date(),
        };

        setChapters(prevChapters =>
          prevChapters.map(chap =>
            chap.id === chapterId
              ? { ...chap, chatInstance: chat, messages: [initialAiMessage] }
              : chap
          )
        );
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "不明なエラーが発生しました。";
        setError(`チャットセッションの開始または最初のAIディスカッションの取得に失敗しました：${errorMessage}`);
        setChapters(prevChapters =>
          prevChapters.map(chap =>
            chap.id === chapterId
              ? { ...chap, messages: [{
                  id: crypto.randomUUID(),
                  role: 'model',
                  text: `議論の初期化エラー：${errorMessage}`,
                  timestamp: new Date()
                }] }
              : chap
          )
        );
      } finally {
        setIsInitializingChat(false);
      }
    }
  }, [isApiKeyOk, chapters]);

  const handleToggleReadStatus = useCallback((chapterId: string) => {
    setChapters(prevChapters =>
      prevChapters.map(chap =>
        chap.id === chapterId ? { ...chap, isRead: !chap.isRead } : chap
      )
    );
    const currentReadStatus = loadReadStatusFromLocalStorage();
    const chapterToToggle = chapters.find(chap => chap.id === chapterId);
    if (chapterToToggle) {
      currentReadStatus[chapterId] = !chapterToToggle.isRead; 
      saveReadStatusToLocalStorage(currentReadStatus);
    }
  }, [chapters]);


  const handleAddChapter = useCallback((title: string, content: string) => {
    const newChapterId = crypto.randomUUID();
    const readStatus = loadReadStatusFromLocalStorage();
    const newChapter: Chapter = {
      id: newChapterId,
      title,
      content,
      isHtmlContent: false,
      chatInstance: null,
      messages: [],
      isRead: readStatus[newChapterId] || false, 
    };
    setChapters(prev => [...prev, newChapter]);
    if (!activeChapterId || chapters.length === 0) {
      handleSelectChapter(newChapterId, content);
    }
  }, [handleSelectChapter, activeChapterId, chapters.length]);

  const handleAddChaptersBatch = useCallback((chaptersData: ChapterWithContent[]) => {
    const readStatus = loadReadStatusFromLocalStorage();
    const newChapterIds: string[] = []; 

    const newChapters: Chapter[] = chaptersData.map(data => {
      const id = crypto.randomUUID();
      newChapterIds.push(id);
      return {
        id: id,
        title: data.title,
        content: data.content,
        isHtmlContent: data.isHtmlContent || false,
        chatInstance: null,
        messages: [],
        isRead: readStatus[id] || false, 
      };
    });

    const prevChaptersLength = chapters.length;
    setChapters(prev => [...prev, ...newChapters]);

    const updatedReadStatus = { ...readStatus };
    newChapterIds.forEach(id => {
      if (!(id in updatedReadStatus)) {
        updatedReadStatus[id] = false;
      }
    });
    saveReadStatusToLocalStorage(updatedReadStatus);

    if (newChapters.length > 0 && (prevChaptersLength === 0 || !activeChapterId)) {
      handleSelectChapter(newChapters[0].id, newChapters[0].content);
    }
  }, [handleSelectChapter, chapters.length, activeChapterId]);


  const handleSendMessage = useCallback(async (messageText: string) => {
    if (!activeChapterId) return;

    const activeChapter = chapters.find(c => c.id === activeChapterId);
    if (!activeChapter || !activeChapter.chatInstance) {
      setError("アクティブな章またはチャットセッションが見つかりません。AIペルソナが初期化されていない可能性があります。");
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: messageText,
      timestamp: new Date(),
    };

    setChapters(prev => prev.map(chap =>
      chap.id === activeChapterId
        ? { ...chap, messages: [...chap.messages, userMessage] }
        : chap
    ));
    setIsLoading(true);
    setError(null);

    try {
      const aiResponseText = await sendGeminiMessage(activeChapter.chatInstance, messageText);
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        text: aiResponseText,
        timestamp: new Date(),
      };
      setChapters(prev => prev.map(chap =>
        chap.id === activeChapterId
          ? { ...chap, messages: [...chap.messages, aiMessage] }
          : chap
      ));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "不明なエラーが発生しました。";
      setError(`AIの応答取得に失敗しました：${errorMessage}`);
      const aiErrorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        text: `エラー：AIの応答を取得できませんでした。${errorMessage}`,
        timestamp: new Date(),
      };
      setChapters(prev => prev.map(chap =>
        chap.id === activeChapterId
          ? { ...chap, messages: [...chap.messages, aiErrorMessage] }
          : chap
      ));
    } finally {
      setIsLoading(false);
    }
  }, [activeChapterId, chapters]);

  const handleDeleteChapter = useCallback((chapterId: string) => {
    setChapters(prevChapters => prevChapters.filter(chap => chap.id !== chapterId));
    if (activeChapterId === chapterId) {
      setActiveChapterId(null);
    }
    const currentReadStatus = loadReadStatusFromLocalStorage();
    delete currentReadStatus[chapterId];
    saveReadStatusToLocalStorage(currentReadStatus);
  }, [activeChapterId]);

  const handlePlayAudio = async (text: string) => {
    if (!isApiKeyOk) {
      setError("音声再生を開始できません：APIキーが利用できません。");
      return;
    }

    setError(null);
    try {
      const audioText = text.replace(/[「」]/g, '');
      const audioBuffer = await generateSpeech(audioText);
      setCurrentAudioBuffer(audioBuffer);
    } catch (error) {
      console.error('音声の生成に失敗しました:', error);
      setError('音声の生成に失敗しました。');
    }
  };

  const activeChapter = chapters.find(c => c.id === activeChapterId);

  if (!isApiKeyOk) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white p-4">
        <AlertMessage type="error" message={error || "APIキーが設定されていません。"} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex bg-gray-900 text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-800 p-4 space-y-4 flex flex-col shadow-lg"> {/* Reduced space-y slightly */}
        <h1 className="text-2xl font-bold text-sky-400 flex items-center">
          <ChatBubbleLeftRightIcon className="w-8 h-8 mr-2" />
          ブックチャットAI
        </h1>
        <button
          onClick={() => setShowAddChapterModal(true)}
          className="w-full flex items-center justify-center bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-150 ease-in-out shadow hover:shadow-md"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          新しい章を追加
        </button>
        <div className="flex-grow overflow-y-auto pr-1">
          <ChapterList
            chapters={chapters} 
            activeChapterId={activeChapterId}
            onSelectChapter={(id) => handleSelectChapter(id)}
            onDeleteChapter={handleDeleteChapter}
            onToggleReadStatus={handleToggleReadStatus}
          />
        </div>
        <FontSizeControl
          currentFontSizeClass={fontSizeClass}
          onChangeFontSizeClass={setFontSizeClass}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 overflow-hidden min-h-0">
        {error && (
          <div className="mb-6">
            <AlertMessage type="error" message={error} onClose={() => setError(null)} />
          </div>
        )}

        {!activeChapter && chapters.length > 0 && (
          <div className="flex-1 flex items-center justify-center bg-gray-800 rounded-lg shadow">
            <p className="text-gray-400 text-lg">章を選択して議論を開始してください。</p>
          </div>
        )}
        {!activeChapter && chapters.length === 0 && (
           <div className="flex-1 flex flex-col items-center justify-center bg-gray-800 rounded-lg shadow p-8 text-center">
            <BookOpenIcon className="w-16 h-16 text-sky-400 mb-4" />
            <h2 className="text-2xl font-semibold mb-2 text-gray-200">ブックチャットAIへようこそ！</h2>
            <p className="text-gray-400 mb-6">左側のボタンから最初の章を追加して、AIアナリストとの対話的な読書体験を始めましょう。</p>
            <p className="text-sm text-gray-500">AIペルソナの「アナリスト」と「エクスプローラー」が章について議論します。あなたは会話に割り込んだり、質問したりできます。</p>
          </div>
        )}

        {activeChapter && (
          <div className="flex flex-row flex-1 space-x-6 overflow-hidden min-h-0">
            <section className="w-1/2 h-full bg-gray-800 p-6 rounded-lg shadow-md flex flex-col overflow-hidden">
              <ChapterContentView chapter={activeChapter} />
            </section>
            <section className="w-1/2 h-full bg-gray-800 p-6 rounded-lg shadow-md flex flex-col overflow-hidden">
              <ChatView
                messages={activeChapter.messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading || isInitializingChat}
                chapterTitle={activeChapter.title}
                chapterContent={activeChapter.content}
                onPlayAudio={handlePlayAudio}
                isPlayingAudio={isPlayingAudio}
              >
                {currentAudioBuffer && (
                  <div className="mt-4">
                    <AudioPlayer
                      audioBuffer={currentAudioBuffer}
                      fileName={`${activeChapter?.title || 'chapter'}_${new Date().toISOString().slice(0, 10)}.wav`}
                      onPlay={() => console.log('再生開始')}
                      onPause={() => console.log('一時停止')}
                      onEnd={() => console.log('再生終了')}
                    />
                  </div>
                )}
              </ChatView>
            </section>
          </div>
        )}
      </main>

      {showAddChapterModal && (
        <ChapterInputModal
          onAddChapter={handleAddChapter}
          onAddChaptersBatch={handleAddChaptersBatch}
          onClose={() => {
            setShowAddChapterModal(false);
            setError(null); 
          }}
        />
      )}
    </div>
  );
};

export default App;
