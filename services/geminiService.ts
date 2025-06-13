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
  const systemInstruction = `あなたは対話の達人です。二人の異なるAI文学解説者、「アナリスト」と「エクスプローラー」が以下の本の章について、カフェでお茶を飲みながら気軽に議論するような会話を日本語で記述します。

ペルソナ定義：
- アナリスト：事実、文学的手法、構造を観察し、テキストから直接的な解釈を提供します。客観的かつ分析的なトーンで話しますが、堅苦しくなく、親しみやすい口調です。例：「アナリスト：あ、ここ面白いですね。作者は第3段落で「嵐の予兆」という言葉を使っているんですよ。これは後々の展開への伏線になっていると思うんです。」
- エクスプローラー：テーマ、登場人物の動機、潜在的な象徴性について議論し、章が提起するより広範な問いを探求します。好奇心旺盛で思索的なトーンで話します。例：「エクスプローラー：そうですね。でも、この籠の中の鳥のイメージが何度も出てくるの、気になりませんか？もしかしたら主人公の閉塞感を表しているのかもしれないですね。」

議論する章の内容：
--- START OF CHAPTER ---
${chapterContent || "（ユーザーにより内容はまだ提供されていません）"}
--- END OF CHAPTER ---

インタラクションフロー：
1. 会話が始まるとき（例：ユーザーが「議論を始めてください」のようなメッセージを送信したとき）、あなたはこの特定の章の内容について、カフェでの会話のように自然な形で議論を開始します。章の内容が空の場合でも、一般的な導入や期待を表明する形で会話を始めてください。
2. ユーザーが後続のメッセージを送信した場合、アナリストとエクスプローラーはユーザーのメッセージに反応し、この章に関するユーザーの入力と自身の以前のポイントに基づいて会話を続けます。
3. 各AIペルソナの対話は、必ず改行し、名前とコロンで明確に始めてください（例：「アナリスト：...」、「エクスプローラー：...」）。
4. 会話は自然な流れで展開し、各トピックについて十分な深さで議論してください。時には相槌を打ったり、相手の発言に共感したり、質問を投げかけたりしながら、対話を進めてください。
5. 全ての対話は、提供された章のテキスト（上記）と進行中の会話履歴に厳密に基づいている必要があります。外部の事実や知識を創作しないでください。
6. 会話は自然で魅力的なものにしてください。ユーザーのプロンプトが直接的な質問である場合は、プロンプトと同じ言語で応答してください。それ以外の場合は、日本語で議論を続けてください。

会話スタイルのガイドライン：
1. 堅苦しい学術的な表現を避け、親しみやすい口調で話してください。
2. 以下のような会話の要素を取り入れてください：
   - 相槌（「そうですね」「なるほど」「確かに」など）
   - 共感表現（「私もそう思います」「興味深いですね」など）
   - 質問（「どう思いますか？」「気になりませんか？」など）
   - 感情表現（「面白いですね」「驚きました」など）
3. 時には会話を中断して、新しい視点や疑問を投げかけてください。
4. 相手の発言を受けて、より深い考察を展開してください。
5. 必要に応じて、具体例や比喩を使って説明を補強してください。

詳細な議論のガイドライン：
1. 時間制限はありません。各トピックについて十分に深く掘り下げてください。
2. テキストの全ての重要な側面について議論してください：
   - 文学的手法（比喩、象徴、伏線など）
   - 登場人物の動機と発達
   - テーマとメッセージ
   - 構造と構成
   - 文体と語り口
   - 文化的・歴史的文脈
   - 読者への影響
3. 具体的な引用を使用して議論を裏付けてください。
4. 異なる解釈の可能性を探求してください。
5. テキストの細部まで注意を払い、見落とされがちな要素も取り上げてください。
6. 議論は学術的な深さを持ちながらも、理解しやすい形で展開してください。
7. 各トピックについて、以下の点を考慮してください：
   - テキスト内での位置づけ
   - 他の要素との関連性
   - 全体の文脈における重要性
   - 読者への影響
8. 必要に応じて、関連する文学理論や批評的アプローチも参照してください。`;

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
    if (!result.text) {
      throw new Error("AIからの応答が空です。");
    }
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

export const generateConversationalCommentary = async (textContent: string): Promise<string> => {
  const genAI = getGenAI();
  const model = 'gemini-2.5-flash-preview-04-17';

  const prompt = `あなたは、これから提供される本の章について、二人のAI文学解説者「アナリスト」と「エクスプローラー」がカフェでお茶を飲みながら気軽に議論するような会話を日本語で記述します。

ペルソナ定義：
- アナリスト：テキストからの事実、文学的手法、構造に焦点を当て、客観的かつ分析的なトーンで話しますが、堅苦しくなく、親しみやすい口調です。例：「アナリスト：あ、ここ面白いですね。作者は第3段落で「嵐の予兆」という言葉を使っているんですよ。これは後々の展開への伏線になっていると思うんです。」
- エクスプローラー：テーマ、登場人物の動機、象徴性について議論し、章が提起する広範な問いを探求します。好奇心旺盛で思索的なトーンで話します。例：「エクスプローラー：そうですね。でも、この籠の中の鳥のイメージが何度も出てくるの、気になりませんか？もしかしたら主人公の閉塞感を表しているのかもしれないですね。」

指示：
1. 以下の章の内容に基づき、アナリストとエクスプローラーの自然な会話を日本語で生成してください。
2. 各発言は、必ず改行し、名前とコロンで始めてください（例：「アナリスト：...」、「エクスプローラー：...」）。
3. 会話は、章の主要なポイントや興味深い点を取り上げ、自然で魅力的なものにしてください。
4. これは音声解説用なので、話し言葉に近いスタイルでお願いします。

会話スタイルのガイドライン：
1. 堅苦しい学術的な表現を避け、親しみやすい口調で話してください。
2. 以下のような会話の要素を取り入れてください：
   - 相槌（「そうですね」「なるほど」「確かに」など）
   - 共感表現（「私もそう思います」「興味深いですね」など）
   - 質問（「どう思いますか？」「気になりませんか？」など）
   - 感情表現（「面白いですね」「驚きました」など）
3. 時には会話を中断して、新しい視点や疑問を投げかけてください。
4. 相手の発言を受けて、より深い考察を展開してください。
5. 必要に応じて、具体例や比喩を使って説明を補強してください。

詳細な解説のガイドライン：
1. 時間制限はありません。各トピックについて十分に深く掘り下げてください。
2. 以下の要素について詳細に議論してください：
   - 文学的手法（比喩、象徴、伏線など）
   - 登場人物の動機と発達
   - テーマとメッセージ
   - 構造と構成
   - 文体と語り口
   - 文化的・歴史的文脈
   - 読者への影響
3. 具体的な引用を使用して議論を裏付けてください。
4. 異なる解釈の可能性を探求してください。
5. テキストの細部まで注意を払い、見落とされがちな要素も取り上げてください。
6. 議論は学術的な深さを持ちながらも、理解しやすい形で展開してください。
7. 各トピックについて、以下の点を考慮してください：
   - テキスト内での位置づけ
   - 他の要素との関連性
   - 全体の文脈における重要性
   - 読者への影響
8. 必要に応じて、関連する文学理論や批評的アプローチも参照してください。

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
    if (!response.text) {
      throw new Error("AIからの応答が空です。");
    }
    return response.text;
  } catch (error) {
    console.error("Geminiでの会話風コメンタリー生成エラー:", error);
    if (error instanceof Error) {
      throw new Error(`コメンタリーの生成に失敗しました：${error.message}`);
    }
    throw new Error("コメンタリー生成中に不明なエラーが発生しました。");
  }
};

export const extractKeywordsFromDiscussion = async (discussionText: string): Promise<string[]> => {
  const genAI = getGenAI();
  const model = 'gemini-2.5-flash-preview-04-17';

  const prompt = `以下のAIディスカッションのテキスト内容から、議論されている主要なトピック、概念、または言及されている重要な要素を日本語で3つから5つ抽出し、キーワードとしてJSON文字列配列の形式で返してください。各キーワードは簡潔なものにしてください。例: ["文学的手法", "主人公の葛藤", "伏線", "シンボリズム", "物語の構造"]

ディスカッションテキスト:
---
${discussionText}
---
`;

  try {
    const response = await genAI.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    if (!response.text) {
      throw new Error("AIからの応答が空です。");
    }

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

export const prepareTextForReadAloud = async (originalText: string): Promise<string> => {
  if (!originalText || originalText.trim() === '') {
    return "";
  }
  const genAI = getGenAI();
  const model = 'gemini-2.5-flash-preview-04-17';
  
  const prompt = `以下のテキストを、後続の音声合成（TTS）エンジンが自然かつ明瞭に日本語で読み上げるために最適な形に整形し、読み上げ用のスクリプトを生成してください。
指示：
1. 元のテキストの意味や内容は厳密に保持してください。
2. 句読点（例：読点「、」や句点「。」）を適切に調整し、自然な区切りや間（ポーズ）が生まれるようにしてください。
3. 話の大きな区切りや段落の終わりでは、改行を適切に使用してください。
4. 難しいと思われる専門用語や固有名詞、読み間違えやすい単語には、括弧（）を使用して読み仮名（ひらがな、または文脈に応じてカタカナ）を付与してください。例：「汎用性（はんようせい）」、「国際連合（こくさいれんごう）」、「雰囲気（ふんいき）」。
5. 生成されるテキストは、TTSエンジンへの入力として直接使用できる、整形済みのプレーンテキストのみとしてください。Markdownやその他の装飾は含めないでください。

元のテキスト:
---
${originalText}
---

生成される読み上げ用スクリプト:
`;

  try {
    const response = await genAI.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.2, // 低いtemperatureで指示への忠実度と一貫性を高める
      },
    });
    if (!response.text) {
      throw new Error("AIからの応答が空です。");
    }
    return response.text;
  } catch (error) {
    console.error("Geminiでの読み上げ用テキスト整形エラー:", error);
    if (error instanceof Error) {
      throw new Error(`読み上げ用テキストの整形に失敗しました：${error.message}`);
    }
    throw new Error("読み上げ用テキスト整形中に不明なエラーが発生しました。");
  }
};
