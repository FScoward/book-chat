
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

export const startNewChatSession = (chapterContent: string, modelName: string): Chat => {
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
    model: modelName,
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
  isHtmlContent?: boolean;
}

export const generateConversationalCommentary = async (textContent: string, modelName: string): Promise<string> => {
  const genAI = getGenAI();
  
  const prompt = `あなたは、これから提供される本の章について、二人のAI文学解説者「アナリスト」と「エクスプローラー」が会話する短い日本語のオーディオコメンタリースクリプト（SSML形式）を作成します。

ペルソナ定義とSSMLマークアップ：
- アナリスト：テキストからの事実、文学的手法、構造に焦点を当て、客観的かつ分析的なトーンで話します。アナリストの発言は <mark name="SPEAKER_A">...</mark> タグで囲んでください。例：「<mark name="SPEAKER_A">作者は第3段落で「嵐の予兆」という言葉を使い、伏線を張っていますね。</mark>」
- エクスプローラー：テーマ、登場人物の動機、象徴性について議論し、章が提起する広範な問いを探求します。好奇心旺盛で思索的なトーンで話します。エクスプローラーの発言は <mark name="SPEAKER_B">...</mark> タグで囲んでください。例：「<mark name="SPEAKER_B">繰り返される籠の中の鳥のイメージは、主人公の閉塞感を象徴しているのでしょうか。</mark>」

指示：
1. 以下の章の内容に基づき、アナリストとエクスプローラーの短い会話（例：アナリストが話し、次にエクスプローラーが応答する、合計2～4ターン程度）を日本語で生成してください。
2. 全体のスクリプトは <speak>...</speak> タグで囲んでください。
3. 各ペルソナの発言は、指示通りに <mark name="SPEAKER_A">...</mark> または <mark name="SPEAKER_B">...</mark> タグで囲んでください。タグ内にペルソナ名（「アナリスト：」など）を含めないでください。
4. 会話は、章の主要なポイントや興味深い点を取り上げ、自然で魅力的なものにしてください。
5. これは音声解説用なので、話し言葉に近いスタイルでお願いします。
6. マークされた発言同士の間には、必要に応じて半角スペースを入れてください。

章の内容：
--- START OF CHAPTER CONTENT ---
${textContent || "（ユーザーにより内容はまだ提供されていません）"}
--- END OF CHAPTER CONTENT ---

期待される出力形式の例：
<speak>
<mark name="SPEAKER_A">この章の冒頭の描写は非常に印象的ですね。</mark> <mark name="SPEAKER_B">ええ、特に天候の描写が物語の不穏な雰囲気を暗示しているように感じます。</mark> <mark name="SPEAKER_A">確かに。そして主人公の心情描写も巧みです。</mark> <mark name="SPEAKER_B">その心情が、後の彼の行動にどう繋がっていくのか気になりますね。</mark>
</speak>
`;

  try {
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    // Ensure the response is wrapped in <speak> tags, Gemini might sometimes omit it if the content is short.
    let ssmlText = response.text.trim();
    if (!ssmlText.startsWith('<speak>')) {
        ssmlText = `<speak>${ssmlText}`;
    }
    if (!ssmlText.endsWith('</speak>')) {
        ssmlText = `${ssmlText}</speak>`;
    }
    // Basic validation for mark tags
    if (!ssmlText.includes('<mark name="SPEAKER_A">') && !ssmlText.includes('<mark name="SPEAKER_B">')) {
        // If no speaker marks, attempt a fallback to a generic single speaker SSML
        console.warn("Generated commentary does not contain speaker marks. Falling back to generic SSML.");
        return `<speak><mark name="SPEAKER_A">${textContent || "解説を生成できませんでした。"}</mark></speak>`;
    }
    return ssmlText;
  } catch (error) {
    console.error("Geminiでの会話風コメンタリー生成エラー:", error);
    if (error instanceof Error) {
      throw new Error(`SSMLコメンタリーの生成に失敗しました：${error.message}`);
    }
    throw new Error("SSMLコメンタリー生成中に不明なエラーが発生しました。");
  }
};

export const generateSpeechAudioFromSsml = async (ssmlText: string): Promise<string> => {
  // const genAI = getGenAI(); // Not needed if we're not calling the AI
  // const ttsModel = 'text-to-speech-1';

  if (!ssmlText || !ssmlText.trim().startsWith('<speak>') || !ssmlText.trim().endsWith('</speak>')) {
    // This validation can still be useful if the SSML is generated but TTS is attempted elsewhere.
    // However, for this function's purpose now, it's less critical as it will always throw the "not available" error.
    // For robustness, keeping it doesn't harm.
    // throw new Error("無効なSSML形式です。SSMLは <speak> タグで囲まれている必要があります。");
  }

  // The @google/genai SDK does not directly support Text-to-Speech via an ai.textToSpeech namespace.
  // This functionality typically requires the Google Cloud Text-to-Speech API and its specific SDKs or REST calls.
  throw new Error("Text-to-Speech (TTS) 機能は、現在の @google/genai SDK を通じては利用できません。この機能を利用するには、Google Cloud Text-to-Speech API と専用のSDKまたはREST API呼び出しが必要です。");
};


export const extractKeywordsFromDiscussion = async (discussionText: string, modelName: string): Promise<string[]> => {
  const genAI = getGenAI();

  const prompt = `以下のAIディスカッションのテキスト内容から、議論されている主要なトピック、概念、または言及されている重要な要素を日本語で3つから5つ抽出し、キーワードとしてJSON文字列配列の形式で返してください。各キーワードは簡潔なものにしてください。例: ["文学的手法", "主人公の葛藤", "伏線", "シンボリズム", "物語の構造"]

ディスカッションテキスト:
---
${discussionText}
---
`;

  try {
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsedData = JSON.parse(jsonStr);
      if (Array.isArray(parsedData) && parsedData.every(item => typeof item === 'string')) {
        return parsedData as string[];
      }
      console.warn("Parsed keyword data is not an array of strings:", parsedData, "Raw text:", response.text);
      return [];
    } catch (parseError) {
      console.error("Failed to parse JSON response for keywords:", parseError, "Raw text:", response.text);
      throw new Error("キーワード抽出結果の解析に失敗しました。AIの応答形式が不正である可能性があります。");
    }
  } catch (error) {
    console.error("Geminiでのキーワード抽出エラー:", error);
    if (error instanceof Error) {
      throw new Error(`キーワードの抽出に失敗しました：${error.message}`);
    }
    throw new Error("キーワード抽出中に不明なエラーが発生しました。");
  }
};
