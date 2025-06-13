import { Chat } from "@google/genai";

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  isHtmlContent?: boolean; // True if content is HTML, false/undefined for plain text
  chatInstance: Chat | null;
  messages: Message[];
  isRead: boolean; // True if the chapter has been opened/read
}

export interface VoiceConfig {
  voiceName: string;
  style?: string;
  tone?: string;
  pace?: string;
  accent?: string;
}