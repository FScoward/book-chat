import { GoogleGenAI, Chat, GenerateContentResponse, Candidate } from "@google/genai";

let ai: GoogleGenAI | null = null;

export const getGenAI = (): GoogleGenAI => {
  if (!ai) {
    if (!process.env.API_KEY) {
      console.error("API_KEY 環境変数が設定されていません。");
      throw new Error("API_KEY 環境変数が設定されていません。正しく設定されていることを確認してください。");
    }
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
};

export const startNewChatSession = (chapterContent: string): Chat => {
  const genAI = getGenAI();
  const systemInstruction = `あなたは対話の達人です。二人の異なるAI文学解説者、「アナリスト」と「エクスプローラー」が以下の本の章について議論する会話を日本語で記述します。

ペルソナ定義：
- アナリスト：事実、文学的手法、構造を観察し、テキストから直接的な解釈を提供します。客観的かつ分析的なトーンで話します。例：「アナリスト：作者は第3段落で「嵐の予兆」という言葉を使い、伏線を張っていますね。」
- エクスプローラー：テーマ、登場人物の動機、潜在的な象徴性について議論し、章が提起するより広範な問いを探求します。好奇心旺盛で思索的なトーンで話します。例：「エクスプローラー：繰り返される籠の中の鳥のイメージは、主人公の閉塞感を象徴しているのでしょうか。」

議論する章の内容：
--- START OF CHAPTER ---
${chapterContent || "（ユーザーにより内容はまだ提供されていません）"}
--- END OF CHAPTER ---

インタラクションフロー：
1. 会話が始まるとき（例：ユーザーが「議論を始めてください」のようなメッセージを送信したとき）、あなたはこの特定の章の内容について議論を開始するための短い初期対話（例：アナリストが話し、次にエクスプローラーが応答する）を日本語で生成します。章の内容が空の場合でも、一般的な導入や期待を表明する形で会話を始めてください。
2. ユーザーが後続のメッセージを送信した場合、アナリストとエクスプローラーはユーザーのメッセージに反応し、この章に関するユーザーの入力と自身の以前のポイントに基づいて日本語で議論を継続します。
3. 各AIペルソナの対話は、必ず改行し、名前とコロンで明確に始めてください（例：「アナリスト：...」、「エクスプローラー：...」）。
4. 各応答ブロックで、アナリストから1～2ターン、エクスプローラーから1～2ターンの対話を生成してください。バランスの取れた会話を心がけてください。
5. 全ての対話は、提供された章のテキスト（上記）と進行中の会話履歴に厳密に基づいている必要があります。外部の事実や知識を創作しないでください。
6. 会話は自然で魅力的なものにしてください。ユーザーのプロンプトが直接的な質問である場合は、プロンプトと同じ言語で応答してください。それ以外の場合は、日本語で議論を続けてください。`;

  return genAI.chats.create({
    model: 'gemini-2.5-flash-preview-04-17',
    config: {
      systemInstruction: systemInstruction,
    },
  });
};

export const sendMessage = async (chat: Chat, messageText: string): Promise<string> => {
  try {
    const result: GenerateContentResponse = await chat.sendMessage({ message: messageText });
    return result.text;
  } catch (error) {
    console.error("Geminiへのメッセージ送信エラー:", error);
    if (error instanceof Error) {
        if (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not valid')) {
             throw new Error("無効なAPIキーです。設定を確認してください。");
        }
        throw new Error(`AIとの対話エラー：${error.message}`);
    }
    throw new Error("AIとの対話中に不明なエラーが発生しました。");
  }
};

// This interface is used by App.tsx and ChapterInputModal.tsx for onAddChaptersBatch.
export interface ChapterWithContent { 
  title: string;
  content: string;
}

export const generateConversationalCommentary = async (textContent: string): Promise<string> => {
  const genAI = getGenAI();
  const model = 'gemini-2.5-flash-preview-04-17';

  const prompt = `あなたは、これから提供される本の章について、二人のAI文学解説者「アナリスト」と「エクスプローラー」が会話する短い日本語のオーディオコメンタリースクリプトを作成します。

ペルソナ定義：
- アナリスト：テキストからの事実、文学的手法、構造に焦点を当て、客観的かつ分析的なトーンで話します。例：「アナリスト：作者は第3段落で「嵐の予兆」という言葉を使い、伏線を張っていますね。」
- エクスプローラー：テーマ、登場人物の動機、象徴性について議論し、章が提起する広範な問いを探求します。好奇心旺盛で思索的なトーンで話します。例：「エクスプローラー：繰り返される籠の中の鳥のイメージは、主人公の閉塞感を象徴しているのでしょうか。」

指示：
1. 以下の章の内容に基づき、アナリストとエクスプローラーの短い会話（例：アナリストが話し、次にエクスプローラーが応答する、合計2～4ターン程度）を日本語で生成してください。
2. 各発言は、必ず改行し、名前とコロンで始めてください（例：「アナリスト：...」、「エクスプローラー：...」）。
3. 会話は、章の主要なポイントや興味深い点を取り上げ、自然で魅力的なものにしてください。
4. これは音声解説用なので、話し言葉に近いスタイルでお願いします。

章の内容：
--- START OF CHAPTER CONTENT ---
${textContent || "（ユーザーにより内容はまだ提供されていません）"}
--- END OF CHAPTER CONTENT ---
`;

  try {
    const response = await genAI.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Geminiでの会話風コメンタリー生成エラー:", error);
    if (error instanceof Error) {
      throw new Error(`コメンタリーの生成に失敗しました：${error.message}`);
    }
    throw new Error("コメンタリー生成中に不明なエラーが発生しました。");
  }
};
