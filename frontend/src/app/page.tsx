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
  MediaPreview,
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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingCaptions, setPendingCaptions] = useState<string[]>([]);
  const [pendingIndex, setPendingIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const selectedChatRef = useRef<Chat | null>(null);
  const fetchedPicsRef = useRef<Map<string, number>>(new Map()); // chatId -> timestamp

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

  const PROFILE_PIC_TTL = 15 * 60 * 1000; // 15 minutes

  const handleProfilePicError = useCallback((chatId: string) => {
    // Clear the cache entry so next poll cycle re-fetches with refresh=1
    fetchedPicsRef.current.delete(chatId);
    setProfilePics(prev => ({ ...prev, [chatId]: null }));
  }, []);

  const fetchProfilePic = useCallback(async (chatId: string) => {
    const now = Date.now();
    const lastFetched = fetchedPicsRef.current.get(chatId);
    const isStale = lastFetched && (now - lastFetched > PROFILE_PIC_TTL);
    if (lastFetched && !isStale) return;
    fetchedPicsRef.current.set(chatId, now);
    try {
      const url = await apiFetchProfilePic(chatId, !!isStale);
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
        const incoming = data.messages || (Array.isArray(data) ? data : []);
        if (isInitial) {
          setMessages(incoming);
          setHasMoreMessages(data.hasMore || false);
          setOldestTimestamp(data.oldestTimestamp || null);
        } else {
          // Merge new messages into existing state to preserve older loaded messages
          setMessages(prev => {
            const byId = new Map(prev.map(m => [m.msgId, m]));
            for (const msg of incoming) {
              byId.set(msg.msgId, msg);
            }
            return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
          });
          // Don't update hasMoreMessages/oldestTimestamp - preserve pagination state
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
      // Pass loaded count so backend knows how many messages to skip past
      const data = await apiFetchMessages(selectedChat.id, 15, oldestTimestamp, { sync: true, fetchNames: true, loaded: messages.length });
      if (data.messages && data.messages.length > 0) {
        setMessages(prev => {
          const byId = new Map(prev.map(m => [m.msgId, m]));
          for (const msg of data.messages) {
            byId.set(msg.msgId, msg);
          }
          return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
        });
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
  }, [connected, selectedChat, loadingMore, hasMoreMessages, oldestTimestamp, messages.length, log]);

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
      const quotedMsgId = replyingTo?.msgId;
      const success = await apiSendMessage(selectedChat.id, input.trim(), quotedMsgId);
      if (success) {
        setInput("");
        setReplyingTo(null);
        fetchMessages(selectedChat.id);
      }
    } catch (e) {
      console.error(e);
    }
    setSending(false);
  };

  const handleReply = useCallback((message: Message) => {
    setReplyingTo(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const sendMedia = async (file: File) => {
    if (!selectedChat || sendingMedia) return;
    setPendingFiles([file]);
    setPendingCaptions([""]);
    setPendingIndex(0);
  };

  const sendPendingFiles = async () => {
    if (!selectedChat || sendingMedia || pendingFiles.length === 0) return;
    setSendingMedia(true);
    log(`Sending ${pendingFiles.length} file(s)`);
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        const caption = pendingCaptions[i] || "";
        log(`Sending media: ${file.name} (${file.type})`);
        const base64 = await readFileAsDataUrl(file);
        await apiSendMedia(
          selectedChat.id,
          base64,
          file.type || "application/octet-stream",
          file.name,
          caption.trim() || undefined
        );
      }
      log("All media sent successfully");
      setPendingFiles([]);
      setPendingCaptions([]);
      setPendingIndex(0);
      fetchMessages(selectedChat.id);
    } catch (e) {
      log("Media send error: " + String(e));
    } finally {
      setSendingMedia(false);
    }
  };

  const handleClosePreview = useCallback(() => {
    if (sendingMedia) return;
    setPendingFiles([]);
    setPendingCaptions([]);
    setPendingIndex(0);
  }, [sendingMedia]);

  const handleFilesDropped = useCallback(
    (files: File[]) => {
      if (!selectedChat || files.length === 0) return;
      setPendingFiles((prev) => [...prev, ...files]);
      setPendingCaptions((prev) => [...prev, ...files.map(() => "")]);
    },
    [selectedChat]
  );

  const handleCaptionChange = useCallback((idx: number, caption: string) => {
    setPendingCaptions((prev) => {
      const next = [...prev];
      next[idx] = caption;
      return next;
    });
  }, []);

  const handleRemovePending = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    setPendingCaptions((prev) => prev.filter((_, i) => i !== idx));
    setPendingIndex((prev) => {
      if (idx < prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, []);

  // Clipboard paste: capture image/file paste anywhere in the chat view
  useEffect(() => {
    if (!selectedChat) return;
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Skip when pasting into a normal text input/textarea, unless it's empty and only files are present
      const isEditable =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const items = e.clipboardData?.files;
      if (!items || items.length === 0) return;
      const files = Array.from(items);
      // If the user is typing in a text field and there's no file content, do nothing
      if (isEditable && files.length === 0) return;
      e.preventDefault();
      handleFilesDropped(files);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [selectedChat, handleFilesDropped]);

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
      setReplyingTo(null);
      fetchMessages(selectedChat.id, true);
      const interval = setInterval(() => fetchMessages(selectedChat.id, false), 15000);
      return () => clearInterval(interval);
    } else {
      setMessages([]);
      setLoadingMessages(false);
      setLoadedMedia({});
      setLoadingMedia({});
      setReplyingTo(null);
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

  const hasDragFiles = (e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") return true;
    }
    return false;
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!selectedChat || !hasDragFiles(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!selectedChat || !hasDragFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!selectedChat) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!selectedChat) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) handleFilesDropped(files);
  };

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden bg-zinc-900"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Chat list - full width on mobile, fixed width on desktop */}
      {/* Hidden on mobile when a chat is selected */}
      <ChatList
        chats={chats}
        selectedChat={selectedChat}
        profilePics={profilePics}
        onSelectChat={handleSelectChat}
        onProfilePicError={handleProfilePicError}
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
              onProfilePicError={() => handleProfilePicError(selectedChat.id)}
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
              onReply={handleReply}
              containerRef={messagesContainerRef}
            />
            <MessageInput
              value={input}
              onChange={setInput}
              onSend={sendMessage}
              onSendMedia={sendMedia}
              sending={sending}
              sendingMedia={sendingMedia}
              replyingTo={replyingTo}
              onCancelReply={handleCancelReply}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            Select a chat
          </div>
        )}
      </div>

      {/* Drag-and-drop overlay */}
      {isDragging && selectedChat && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-emerald-500/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-emerald-400 bg-zinc-900/80 px-10 py-8 text-center">
            <svg className="mx-auto h-16 w-16 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M9 19l3-3m0 0l3 3m-3-3v12" />
            </svg>
            <div className="mt-3 text-lg font-medium text-white">Drop to send</div>
            <div className="mt-1 text-sm text-zinc-400">
              Images, videos, documents — release to attach
            </div>
          </div>
        </div>
      )}

      {/* Media preview modal */}
      {pendingFiles.length > 0 && selectedChat && (
        <MediaPreview
          files={pendingFiles}
          captions={pendingCaptions}
          currentIndex={pendingIndex}
          sending={sendingMedia}
          onIndexChange={setPendingIndex}
          onCaptionChange={handleCaptionChange}
          onRemove={handleRemovePending}
          onAddFiles={handleFilesDropped}
          onClose={handleClosePreview}
          onSend={sendPendingFiles}
        />
      )}
    </div>
  );
}
