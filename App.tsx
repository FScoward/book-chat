
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chapter, Message } from './types';
import { getGenAI, startNewChatSession, sendMessage as sendGeminiMessage, ChapterWithContent } from './services/geminiService';
import ChapterList from './components/ChapterList';
import ChapterContentView from './components/ChapterContentView';
import ChatView from './components/ChatView';
import ChapterInputModal from './components/ChapterInputModal';
import AlertMessage from './components/AlertMessage';
import { PlusIcon, BookOpenIcon, ChatBubbleLeftRightIcon, XMarkIcon, Cog6ToothIcon } from './components/Icons';

const READ_STATUS_LOCAL_STORAGE_KEY = 'bookChatAi_readStatus_v1';
const SELECTED_MODEL_LOCAL_STORAGE_KEY = 'bookChatAi_selectedModel_v1_object'; // Changed key name for new structure

export interface ModelDefinition {
  id: string; // e.g., 'gemini-2.5-flash-preview-04-17' or 'gpt-4o'
  name: string; // e.g., 'Gemini 2.5 Flash Preview' or 'OpenAI GPT-4o (Not Functional)'
  apiProvider: 'gemini' | 'openai';
  isDefault?: boolean;
}

export const AVAILABLE_MODELS: ModelDefinition[] = [
  { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash (04-17)', apiProvider: 'gemini', isDefault: true },
  { id: 'imagen-3.0-generate-002', name: 'Gemini Imagen 3.0 (画像生成)', apiProvider: 'gemini' },
  // OpenAI models - these will be listed but are not functional with the current Gemini-focused backend
  { id: 'gpt-4o', name: 'OpenAI GPT-4o (非機能)', apiProvider: 'openai' },
  { id: 'gpt-4-turbo', name: 'OpenAI GPT-4 Turbo (非機能)', apiProvider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'OpenAI GPT-3.5 Turbo (非機能)', apiProvider: 'openai' },
];

const getDefaultModelId = (): string => {
  const defaultModel = AVAILABLE_MODELS.find(model => model.isDefault);
  return defaultModel ? defaultModel.id : AVAILABLE_MODELS[0].id;
};


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

const loadSelectedModelFromLocalStorage = (): string => {
  try {
    const storedModelId = localStorage.getItem(SELECTED_MODEL_LOCAL_STORAGE_KEY);
    if (storedModelId && AVAILABLE_MODELS.some(model => model.id === storedModelId)) {
      return storedModelId;
    }
  } catch (error) {
    console.error("Error loading selected model ID from localStorage:", error);
  }
  return getDefaultModelId();
};

const saveSelectedModelToLocalStorage = (modelId: string) => {
  try {
    localStorage.setItem(SELECTED_MODEL_LOCAL_STORAGE_KEY, modelId);
  } catch (error) {
    console.error("Error saving selected model ID to localStorage:", error);
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
  const [selectedModelId, setSelectedModelId] = useState<string>(loadSelectedModelFromLocalStorage());

  useEffect(() => {
    try {
      getGenAI(); // This checks for process.env.API_KEY for Gemini
      setIsApiKeyOk(true);
    } catch (e) {
      if (e instanceof Error) {
        setError(`初期化に失敗しました：${e.message}。Gemini API用の API_KEY 環境変数が正しく設定されていることを確認してください。`);
      } else {
        setError("不明な初期化エラーが発生しました。");
      }
      setIsApiKeyOk(false);
    }
  }, []);

  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newModelId = event.target.value;
    setSelectedModelId(newModelId);
    saveSelectedModelToLocalStorage(newModelId);
    setError(null); 
  };

  const handleSelectChapter = useCallback(async (chapterId: string, chapterContentParam?: string) => {
    setActiveChapterId(chapterId);
    setError(null);
    const chapterToUpdate = chapters.find(chap => chap.id === chapterId);
    const currentSelectedModelDefinition = AVAILABLE_MODELS.find(m => m.id === selectedModelId);

    if (currentSelectedModelDefinition?.apiProvider === 'openai') {
      setError(`選択されたモデル (${currentSelectedModelDefinition.name}) はOpenAIモデルです。このアプリケーションは現在Gemini APIにのみ対応しているため、チャットを開始できません。Geminiモデルを選択してください。`);
      setChapters(prevChapters =>
        prevChapters.map(chap =>
          chap.id === chapterId
            ? { ...chap, messages: [{
                id: crypto.randomUUID(),
                role: 'model',
                text: `エラー：OpenAIモデル (${currentSelectedModelDefinition.name}) は現在サポートされていません。Geminiモデルを選択してください。`,
                timestamp: new Date()
              }] }
            : chap
        )
      );
      setIsInitializingChat(false);
      return;
    }

    if (chapterToUpdate && !chapterToUpdate.chatInstance) {
      if (!isApiKeyOk) {
        setError("チャットセッションを開始できません：Gemini APIキーが利用できません。");
        return;
      }
      setIsInitializingChat(true);
      try {
        const currentContent = chapterContentParam || chapterToUpdate.content;
        // Pass selectedModelId (which should be a Gemini model ID here)
        const chat = startNewChatSession(currentContent, selectedModelId);

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
  }, [isApiKeyOk, chapters, selectedModelId]);

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
       const currentSelectedModelDefinition = AVAILABLE_MODELS.find(m => m.id === selectedModelId);
       if (currentSelectedModelDefinition?.apiProvider === 'openai') {
         setError(`選択されたモデル (${currentSelectedModelDefinition.name}) はOpenAIモデルです。このアプリケーションは現在Gemini APIにのみ対応しているため、メッセージを送信できません。Geminiモデルを選択してください。`);
       } else {
         setError("アクティブな章またはチャットセッションが見つかりません。AIペルソナが初期化されていない可能性があります。");
       }
      return;
    }
    
    // Check again before sending, in case model was changed after chat init
    const currentSelectedModelDefinition = AVAILABLE_MODELS.find(m => m.id === selectedModelId);
    if (currentSelectedModelDefinition?.apiProvider === 'openai' && activeChapter.chatInstance) {
        // If chatInstance exists, it must be a Gemini chat. But selected model is OpenAI.
        // This is a confusing state. For now, we'll prevent sending.
        // Or, we could allow sending to the existing Gemini chat, regardless of current dropdown.
        // Let's prevent to be less confusing and enforce the error message more strictly.
        setError(`現在選択されているモデル (${currentSelectedModelDefinition.name}) はOpenAIモデルです。既存のGeminiチャットセッションには送信できません。Geminiモデルを選択し直してください。`);
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
  }, [activeChapterId, chapters, selectedModelId]);

  const handleDeleteChapter = useCallback((chapterId: string) => {
    setChapters(prevChapters => prevChapters.filter(chap => chap.id !== chapterId));
    if (activeChapterId === chapterId) {
      setActiveChapterId(null);
    }
    const currentReadStatus = loadReadStatusFromLocalStorage();
    delete currentReadStatus[chapterId];
    saveReadStatusToLocalStorage(currentReadStatus);
  }, [activeChapterId]);


  const activeChapter = chapters.find(c => c.id === activeChapterId);

  if (!isApiKeyOk) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white p-4">
        <AlertMessage type="error" message={error || "Gemini APIキーが設定されていません。"} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex bg-gray-900 text-gray-100 font-sans overflow-hidden">
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
            onToggleReadStatus={handleToggleReadStatus}
          />
        </div>
        
        <div className="mt-auto pt-4 border-t border-gray-700">
          <label htmlFor="modelSelector" className="flex items-center text-sm font-medium text-gray-300 mb-1">
            <Cog6ToothIcon className="w-5 h-5 mr-2 text-gray-400" />
            AIモデル設定
          </label>
          <select
            id="modelSelector"
            value={selectedModelId}
            onChange={handleModelChange}
            className="w-full bg-gray-700 text-gray-200 border border-gray-600 rounded-md p-2.5 focus:ring-sky-500 focus:border-sky-500 shadow-sm text-xs appearance-none"
            aria-label="使用するAIモデルを選択"
          >
            {AVAILABLE_MODELS.map(model => (
              <option key={model.id} value={model.id} disabled={model.apiProvider === 'openai' && model.name.includes('非機能')}>
                {model.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-400 leading-tight">
            <strong>Geminiモデル:</strong> <code className="bg-gray-600 px-1 rounded">gemini-2.5-flash-preview-04-17</code> (テキスト推奨) などは、設定済みのGemini APIキーで動作します。<br/>
            <strong>OpenAIモデル (非機能):</strong> OpenAIのモデル (例: GPT-4o) はリストに表示されていますが、このアプリケーションの現在のバックエンド (Gemini API専用) では**動作しません**。選択するとエラーが発生します。OpenAIモデルの利用にはアプリの大幅な改修が必要です。
          </p>
        </div>
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
                selectedModelId={selectedModelId} 
              />
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
