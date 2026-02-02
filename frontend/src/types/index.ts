export type Chat = {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: { body?: string };
  profilePic?: string | null;
};

export type Message = {
  id: string | object;
  msgId: string;
  body: string;
  from: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  hasMedia: boolean;
  senderName?: string;
  senderPic?: string;
  senderId?: string;
  mentionedIds?: string[];
};

export type DebugLog = {
  ts: string;
  msg: string;
};
