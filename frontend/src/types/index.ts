export type Chat = {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: { body?: string };
  profilePic?: string | null;
};

export type QuotedMessage = {
  body: string;
  type: string;
  hasMedia: boolean;
  fromMe: boolean;
  senderName?: string;
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
  quotedMsg?: QuotedMessage;
};

export type DebugLog = {
  ts: string;
  msg: string;
};
