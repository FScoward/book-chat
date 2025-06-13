import { VoiceConfig } from "../types";

// 音声設定の型定義
interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

interface AudioPlaybackState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlaybackEnd?: () => void;
}

// デフォルトの音声設定
const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  voiceName: 'Zephyr', // 明るい音声
  style: '明るい',
  tone: '元気な',
  pace: '普通',
  accent: '標準'
};

// シングルトンとしてAudioContextを管理
let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentBuffer: AudioBuffer | null = null;
let playbackState: AudioPlaybackState = {
  currentTime: 0,
  duration: 0,
  isPlaying: false
};

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

// PCMデータをAudioBufferに変換
const convertPcmToAudioBuffer = (pcmData: ArrayBuffer): AudioBuffer => {
  const context = getAudioContext();
  const raw = new Uint8Array(pcmData);
  const buffer = context.createBuffer(1, raw.length / 2, 24000);
  const buf = buffer.getChannelData(0);
  const dv = new DataView(raw.buffer);

  for (let i = 0; i < buf.length; i++) {
    buf[i] = dv.getInt16(i * 2, true) / 0x8000;
  }

  return buffer;
};

const API_KEY = process.env.API_KEY || "";
const API_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

export async function generateSpeech(text: string, voiceConfig: VoiceConfig = DEFAULT_VOICE_CONFIG): Promise<ArrayBuffer> {
  try {
    const request = {
      input: { text: `${voiceConfig.style}${voiceConfig.tone}${voiceConfig.pace}${voiceConfig.accent}な口調で: ${text}` },
      voice: { languageCode: 'ja-JP', ssmlGender: 'FEMALE' },
      audioConfig: { 
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000,
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0
      },
    };

    console.log("TTS API Request:", JSON.stringify(request, null, 2));

    const response = await fetch(`${API_ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("TTS API Error:", errorData);
      throw new Error(`音声生成に失敗しました: ${errorData.error?.message || response.statusText}`);
    }

    const responseData = await response.json();
    console.log("TTS API Response received");

    if (!responseData.audioContent) {
      throw new Error("音声データの生成に失敗しました。");
    }

    // Base64エンコードされた音声データをArrayBufferに変換
    const audioContent = responseData.audioContent;
    const binaryString = atob(audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("TTS API Error:", error);
    throw error;
  }
}

// 音声の再生状態を取得
export const getPlaybackState = (): AudioPlaybackState => {
  return { ...playbackState };
};

// 音声の再生位置を設定
export const seekTo = (time: number): void => {
  if (!currentBuffer || !audioContext) return;
  
  // 再生位置を制限
  time = Math.max(0, Math.min(time, currentBuffer.duration));
  
  if (currentSource) {
    currentSource.stop();
    currentSource.disconnect();
  }

  const source = audioContext.createBufferSource();
  currentSource = source;
  
  source.connect(audioContext.destination);
  
  // 新しい位置から再生開始
  source.start(0, time);
  playbackState.currentTime = time;
  playbackState.isPlaying = true;
  
  if (playbackState.onTimeUpdate) {
    playbackState.onTimeUpdate(time);
  }
};

export const playAudio = async (
  audioBuffer: ArrayBuffer,
  callbacks?: {
    onTimeUpdate?: (time: number) => void;
    onDurationChange?: (duration: number) => void;
    onPlaybackEnd?: () => void;
  }
): Promise<void> => {
  try {
    const context = getAudioContext();
    
    // 既存の再生を停止
    if (currentSource) {
      currentSource.stop();
      currentSource.disconnect();
      currentSource = null;
    }

    // PCMデータをAudioBufferに変換
    const audioBufferSource = convertPcmToAudioBuffer(audioBuffer);
    currentBuffer = audioBufferSource;
    const source = context.createBufferSource();
    currentSource = source;
    
    // コールバックの設定
    playbackState = {
      currentTime: 0,
      duration: audioBufferSource.duration,
      isPlaying: true,
      onTimeUpdate: callbacks?.onTimeUpdate,
      onDurationChange: callbacks?.onDurationChange,
      onPlaybackEnd: callbacks?.onPlaybackEnd
    };

    if (callbacks?.onDurationChange) {
      callbacks.onDurationChange(audioBufferSource.duration);
    }
    
    source.buffer = audioBufferSource;
    source.connect(context.destination);
    source.start(0);

    // 再生位置の更新
    const updateTime = () => {
      if (playbackState.isPlaying) {
        const currentTime = context.currentTime - source.startTime;
        playbackState.currentTime = currentTime;
        if (callbacks?.onTimeUpdate) {
          callbacks.onTimeUpdate(currentTime);
        }
        requestAnimationFrame(updateTime);
      }
    };
    requestAnimationFrame(updateTime);

    // 再生完了を待機
    return new Promise((resolve, reject) => {
      source.onended = () => {
        currentSource = null;
        playbackState.isPlaying = false;
        playbackState.currentTime = 0;
        if (callbacks?.onPlaybackEnd) {
          callbacks.onPlaybackEnd();
        }
        resolve();
      };

      // エラーハンドリング
      context.onstatechange = () => {
        if (context.state === "suspended") {
          currentSource = null;
          playbackState.isPlaying = false;
          reject(new Error(`音声の再生が中断されました: ${context.state}`));
        }
      };
    });
  } catch (error) {
    console.error("音声再生エラー:", error);
    throw new Error("音声の再生に失敗しました。");
  }
};

// 音声の停止
export const stopAudio = (): void => {
  if (currentSource) {
    currentSource.stop();
    currentSource.disconnect();
    currentSource = null;
  }
  playbackState.isPlaying = false;
  playbackState.currentTime = 0;
  if (playbackState.onPlaybackEnd) {
    playbackState.onPlaybackEnd();
  }
};

// 音声の一時停止/再開
export const togglePlayback = (): void => {
  if (!audioContext || !currentBuffer) return;

  if (playbackState.isPlaying) {
    stopAudio();
  } else {
    seekTo(playbackState.currentTime);
  }
}; 