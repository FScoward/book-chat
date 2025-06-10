
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
  chatInstance: Chat | null;
  messages: Message[];
}
