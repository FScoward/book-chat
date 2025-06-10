
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chapter, Message } from './types';
import { getGenAI, startNewChatSession, sendMessage as sendGeminiMessage, ChapterWithContent } from './services/geminiService';
import ChapterList from './components/ChapterList';
import ChapterContentView from './components/ChapterContentView';
import ChatView from './components/ChatView';
import ChapterInputModal from './components/ChapterInputModal';
import AlertMessage from './components/AlertMessage';
import { PlusIcon, BookOpenIcon, ChatBubbleLeftRightIcon, XMarkIcon } from './components/Icons';


const App: React.FC = () => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); 
  const [isInitializingChat, setIsInitializingChat] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiKeyOk, setIsApiKeyOk] = useState<boolean>(false);
  const [showAddChapterModal, setShowAddChapterModal] = useState<boolean>(false);

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

  const handleAddChapter = useCallback((title: string, content: string) => {
    const newChapterId = crypto.randomUUID();
    const newChapter: Chapter = {
      id: newChapterId,
      title,
      content,
      chatInstance: null, 
      messages: [],
    };
    setChapters(prev => [...prev, newChapter]);
    if (!activeChapterId || chapters.length === 0) {
      handleSelectChapter(newChapterId, content);
    } else {
       // If there's already an active chapter, don't switch, just add.
       // User can select the new chapter from the list.
    }
  }, [handleSelectChapter, activeChapterId, chapters.length]);

  const handleAddChaptersBatch = useCallback((chaptersData: ChapterWithContent[]) => {
    const newChapters: Chapter[] = chaptersData.map(data => ({
      id: crypto.randomUUID(),
      title: data.title,
      content: data.content,
      chatInstance: null,
      messages: [],
    }));

    const prevChaptersLength = chapters.length;
    setChapters(prev => [...prev, ...newChapters]);

    if (newChapters.length > 0 && (prevChaptersLength === 0 || !activeChapterId)) {
      // Automatically select the first chapter of the newly added batch
      // if no chapter was active or if the list was empty.
      handleSelectChapter(newChapters[0].id, newChapters[0].content);
    }
    // If chapters were already present and one was active, we don't auto-switch.
    // The user can select any of the new chapters from the list.
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
  }, [activeChapterId]);


  const activeChapter = chapters.find(c => c.id === activeChapterId);

  if (!isApiKeyOk) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white p-4">
        <AlertMessage type="error" message={error || "APIキーが設定されていません。"} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-800 p-4 space-y-6 flex flex-col shadow-lg">
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
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 space-y-6 overflow-hidden">
        {error && <AlertMessage type="error" message={error} onClose={() => setError(null)} />}
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
          <>
            <section className="h-1/2 bg-gray-800 p-6 rounded-lg shadow-md flex flex-col overflow-hidden">
              <ChapterContentView chapter={activeChapter} />
            </section>
            <section className="h-1/2 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
              <ChatView
                messages={activeChapter.messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading || isInitializingChat} 
                chapterTitle={activeChapter.title}
                chapterContent={activeChapter.content} 
              />
            </section>
          </>
        )}
      </main>

      {showAddChapterModal && (
        <ChapterInputModal
          onAddChapter={handleAddChapter}
          onAddChaptersBatch={handleAddChaptersBatch}
          onClose={() => {
            setShowAddChapterModal(false);
            setError(null); // Clear any modal-related errors when closing
          }}
        />
      )}
    </div>
  );
};

export default App;
