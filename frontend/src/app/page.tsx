"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDebugLog } from "@/hooks";
import { WS_URL } from "@/utils/config";
import {
  fetchStatus as apiFetchStatus,
  fetchQR,
  fetchPairingCode,
  fetchChats as apiFetchChats,
  fetchMessages as apiFetchMessages,
  sendMessage as apiSendMessage,
  sendMedia as apiSendMedia,
  markChatAsRead,
  fetchProfilePic as apiFetchProfilePic,
  fetchMedia as apiFetchMedia,
} from "@/utils/api";
import {
  LoadingScreen,
  ConnectingScreen,
  QRScreen,
  ChatList,
  ChatHeader,
  MessageList,
  MessageInput,
} from "@/components";
import type { Chat, Message } from "@/types";

export default function Home() {
  const { logs, add: log } = useDebugLog();
  const [connected, setConnected] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [hasPairingCode, setHasPairingCode] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState<number | null>(null);
  const [loadedMedia, setLoadedMedia] = useState<Record<string, string>>({});
  const [loadingMedia, setLoadingMedia] = useState<Record<string, boolean>>({});
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [profilePics, setProfilePics] = useState<Record<string, string | null>>({});
  const [sendingMedia, setSendingMedia] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const selectedChatRef = useRef<Chat | null>(null);
  const fetchedPicsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  const fetchStatus = useCallback(async () => {
    try {
      log("Fetching status...");
      const data = await apiFetchStatus();
      setApiReachable(true);
      log(`Status: connected=${data.connected} hasQr=${data.hasQr} hasPairingCode=${data.hasPairingCode}`);
      setConnected(data.connected);
      setHasPairingCode(data.hasPairingCode);
      if (data.hasQr) {
        const qrData = await fetchQR();
        setQr(qrData.qr);
        setPairingCode(null);
      } else if (data.hasPairingCode) {
        const codeData = await fetchPairingCode();
        if (codeData) setPairingCode(codeData.code);
        setQr(null);
      } else {
        setQr(null);
      }
    } catch (e) {
      log("Status error: " + String(e));
      setApiReachable(false);
      setConnected(false);
      setQr(null);
    }
  }, [log]);

  const fetchProfilePic = useCallback(async (chatId: string) => {
    if (fetchedPicsRef.current.has(chatId)) return;
    fetchedPicsRef.current.add(chatId);
    try {
      const url = await apiFetchProfilePic(chatId);
      setProfilePics(prev => ({ ...prev, [chatId]: url }));
    } catch {
      setProfilePics(prev => ({ ...prev, [chatId]: null }));
    }
  }, []);

  const fetchChats = useCallback(async () => {
    if (!connected) return;
    try {
      log("Fetching chats...");
      const data = await apiFetchChats();
      setChats(data);
      log(`Chats: ${data.length} loaded`);
      data.slice(0, 20).forEach((chat: Chat) => {
        fetchProfilePic(chat.id);
      });
    } catch (e) {
      log("Chats fetch failed: " + String(e));
    }
  }, [connected, log, fetchProfilePic]);

  const fetchMessages = useCallback(
    async (chatId: string, isInitial = false, retryCount = 0) => {
      if (!connected || !chatId) return;
      if (isInitial) {
        setLoadingMessages(true);
        setMessages([]);
        setHasMoreMessages(false);
        setOldestTimestamp(null);
      }
      try {
        // fetchNames=true for initial load (to get pushnames), false for polling
        const data = await apiFetchMessages(chatId, 20, undefined, { fetchNames: isInitial });
        if (data.messages) {
          setMessages(data.messages);
          setHasMoreMessages(data.hasMore || false);
          setOldestTimestamp(data.oldestTimestamp || null);
        } else {
          setMessages(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        log("Messages fetch failed: " + String(e));
        if (retryCount < 1) {
          await new Promise(r => setTimeout(r, 1000));
          return fetchMessages(chatId, isInitial, retryCount + 1);
        }
      } finally {
        if (isInitial) setLoadingMessages(false);
      }
    },
    [connected, log]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!connected || !selectedChat || loadingMore || !hasMoreMessages || !oldestTimestamp) return;
    setLoadingMore(true);
    try {
      // Use sync=true to trigger syncHistory(), fetchNames=true to get names for older messages
      const data = await apiFetchMessages(selectedChat.id, 15, oldestTimestamp, { sync: true, fetchNames: true });
      if (data.messages && data.messages.length > 0) {
        setMessages(prev => [...data.messages, ...prev]);
        setHasMoreMessages(data.hasMore || false);
        setOldestTimestamp(data.oldestTimestamp || null);
        log(`Loaded ${data.messages.length} more messages`);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      log("Load more failed: " + String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [connected, selectedChat, loadingMore, hasMoreMessages, oldestTimestamp, log]);

  const loadMedia = useCallback(async (msgId: string) => {
    if (!selectedChat || loadedMedia[msgId] || loadingMedia[msgId]) return;
    setLoadingMedia(prev => ({ ...prev, [msgId]: true }));
    try {
      const data = await apiFetchMedia(selectedChat.id, msgId);
      setLoadedMedia(prev => ({ ...prev, [msgId]: data }));
      log(`Media loaded for ${msgId}`);
    } catch (e) {
      log("Media fetch failed: " + String(e));
    } finally {
      setLoadingMedia(prev => ({ ...prev, [msgId]: false }));
    }
  }, [selectedChat, loadedMedia, loadingMedia, log]);

  const sendMessage = async () => {
    if (!selectedChat || !input.trim() || sending) return;
    setSending(true);
    try {
      const success = await apiSendMessage(selectedChat.id, input.trim());
      if (success) {
        setInput("");
        fetchMessages(selectedChat.id);
      }
    } catch (e) {
      console.error(e);
    }
    setSending(false);
  };

  const sendMedia = async (file: File) => {
    if (!selectedChat || sendingMedia) return;
    setSendingMedia(true);
    log(`Sending media: ${file.name} (${file.type})`);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await apiSendMedia(selectedChat.id, base64, file.type, file.name, input.trim() || undefined);
      setInput("");
      log("Media sent successfully");
      fetchMessages(selectedChat.id);
    } catch (e) {
      log("Media send error: " + String(e));
    } finally {
      setSendingMedia(false);
    }
  };

  const handleSelectChat = useCallback((chat: Chat) => {
    setSelectedChat(chat);
    fetchProfilePic(chat.id);
    if (chat.unreadCount > 0) {
      markChatAsRead(chat.id);
      setChats(prev => prev.map(c =>
        c.id === chat.id ? { ...c, unreadCount: 0 } : c
      ));
      log(`Marked ${chat.id} as read`);
    }
  }, [fetchProfilePic, log]);

  const handleBack = useCallback(() => {
    setSelectedChat(null);
  }, []);

  // Status polling
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(
      () => fetchStatus(),
      apiReachable === false ? 8000 : 3000
    );
    return () => clearInterval(interval);
  }, [fetchStatus, apiReachable]);

  // Initial load
  useEffect(() => {
    setLoading(false);
  }, []);

  // Chat list polling
  useEffect(() => {
    if (connected) {
      fetchChats();
      const interval = setInterval(fetchChats, 10000);
      return () => clearInterval(interval);
    }
  }, [connected, fetchChats]);

  // Message polling for selected chat
  useEffect(() => {
    if (selectedChat) {
      setLoadedMedia({});
      setLoadingMedia({});
      setHasMoreMessages(false);
      setOldestTimestamp(null);
      setLoadingMore(false);
      fetchMessages(selectedChat.id, true);
      const interval = setInterval(() => fetchMessages(selectedChat.id, false), 15000);
      return () => clearInterval(interval);
    } else {
      setMessages([]);
      setLoadingMessages(false);
      setLoadedMedia({});
      setLoadingMedia({});
    }
  }, [selectedChat, fetchMessages]);

  // WebSocket connection
  useEffect(() => {
    if (!connected) return;

    log("Connecting to WebSocket...");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => log("WebSocket connected");

    ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        switch (type) {
          case 'message':
            log(`WS: New message in ${data.chatName || data.chatId}`);
            setChats(prev => prev.map(chat => {
              if (chat.id === data.chatId) {
                const isSelected = selectedChatRef.current?.id === data.chatId;
                return {
                  ...chat,
                  unreadCount: isSelected ? chat.unreadCount : chat.unreadCount + 1,
                  lastMessage: { body: data.body?.substring(0, 50) }
                };
              }
              return chat;
            }));
            if (selectedChatRef.current?.id === data.chatId) {
              fetchMessages(data.chatId, false);
            }
            break;
          case 'message_sent':
            log(`WS: Message sent to ${data.chatId}`);
            if (selectedChatRef.current?.id === data.chatId) {
              fetchMessages(data.chatId, false);
            }
            break;
          case 'message_ack':
            log(`WS: Message ${data.ackName} in ${data.chatId}`);
            break;
          case 'status':
            log(`WS: Status update - connected=${data.connected}`);
            setConnected(data.connected);
            break;
          case 'chat_update':
            setChats(prev => prev.map(chat =>
              chat.id === data.chatId ? { ...chat, unreadCount: data.unreadCount } : chat
            ));
            break;
        }
      } catch (e) {
        log("WS message parse error: " + String(e));
      }
    };

    ws.onerror = (err) => log("WebSocket error: " + String(err));
    ws.onclose = () => {
      log("WebSocket disconnected");
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [connected, log, fetchMessages]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!connected && (qr || pairingCode || hasPairingCode)) {
    return (
      <QRScreen
        qr={qr}
        pairingCode={pairingCode}
        hasPairingCode={hasPairingCode}
        logs={logs}
        log={log}
        onPairingCodeReceived={(code) => {
          setPairingCode(code);
          setQr(null);
        }}
      />
    );
  }

  if (!connected && !qr && !pairingCode && !hasPairingCode) {
    return <ConnectingScreen apiReachable={apiReachable} logs={logs} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-900">
      {/* Chat list - full width on mobile, fixed width on desktop */}
      {/* Hidden on mobile when a chat is selected */}
      <ChatList
        chats={chats}
        selectedChat={selectedChat}
        profilePics={profilePics}
        onSelectChat={handleSelectChat}
        className={selectedChat ? "hidden md:flex" : "flex"}
      />

      {/* Chat view - full width on mobile, flex-1 on desktop */}
      {/* Hidden on mobile when no chat is selected */}
      <div className={`min-w-0 flex-1 flex-col ${selectedChat ? "flex" : "hidden md:flex"}`}>
        {selectedChat ? (
          <>
            <ChatHeader
              chat={selectedChat}
              profilePic={profilePics[selectedChat.id]}
              onBack={handleBack}
            />
            <MessageList
              messages={messages}
              chat={selectedChat}
              loading={loadingMessages}
              loadingMore={loadingMore}
              hasMore={hasMoreMessages}
              loadedMedia={loadedMedia}
              loadingMedia={loadingMedia}
              onLoadMore={loadMoreMessages}
              onLoadMedia={loadMedia}
              containerRef={messagesContainerRef}
            />
            <MessageInput
              value={input}
              onChange={setInput}
              onSend={sendMessage}
              onSendMedia={sendMedia}
              sending={sending}
              sendingMedia={sendingMedia}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            Select a chat
          </div>
        )}
      </div>
    </div>
  );
}
