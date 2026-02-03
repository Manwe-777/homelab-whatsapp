"use client";

import React from "react";
import { Message } from "./Message";
import type { Message as MessageType, Chat } from "@/types";

type MessageListProps = {
  messages: MessageType[];
  chat: Chat;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadedMedia: Record<string, string>;
  loadingMedia: Record<string, boolean>;
  onLoadMore: () => void;
  onLoadMedia: (msgId: string) => void;
  onReply: (message: MessageType) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function MessageList({
  messages,
  chat,
  loading,
  loadingMore,
  hasMore,
  loadedMedia,
  loadingMedia,
  onLoadMore,
  onLoadMedia,
  onReply,
  containerRef,
}: MessageListProps) {
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollBottom = target.scrollHeight + target.scrollTop - target.clientHeight;
    if (scrollBottom < 100 && hasMore && !loadingMore) {
      onLoadMore();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-zinc-500">Loading messages...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-zinc-500">No messages</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto p-4"
      onScroll={handleScroll}
    >
      <div className="flex flex-col gap-2">
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="cursor-pointer rounded-lg bg-zinc-800 px-4 py-2 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:cursor-wait disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading older messages...
                </span>
              ) : (
                "Load older messages"
              )}
            </button>
          </div>
        )}
        {messages.map((m) => (
          <Message
            key={typeof m.id === "object" ? JSON.stringify(m.id) : String(m.id)}
            message={m}
            isGroup={chat.isGroup}
            loadedMedia={loadedMedia[m.msgId]}
            loadingMedia={loadingMedia[m.msgId]}
            onLoadMedia={() => onLoadMedia(m.msgId)}
            onReply={onReply}
          />
        ))}
      </div>
    </div>
  );
}
