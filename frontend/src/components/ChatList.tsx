"use client";

import React from "react";
import { API_URL } from "@/utils/config";
import { Avatar } from "./Avatar";
import type { Chat } from "@/types";

type ChatListProps = {
  chats: Chat[];
  selectedChat: Chat | null;
  profilePics: Record<string, string | null>;
  onSelectChat: (chat: Chat) => void;
};

export function ChatList({ chats, selectedChat, profilePics, onSelectChat }: ChatListProps) {
  return (
    <div className="flex w-80 flex-col border-r border-zinc-800">
      <div className="border-b border-zinc-800 p-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-medium text-white">WhatsApp</h1>
          <button
            onClick={() => window.open(`${API_URL}/api/screenshot`, '_blank')}
            className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300"
            title="View browser screenshot"
          >
            [debug]
          </button>
        </div>
        <p className="text-xs text-emerald-500">Connected</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelectChat(chat)}
            className={`w-full cursor-pointer px-3 py-3 text-left transition-colors hover:bg-zinc-800 ${
              selectedChat?.id === chat.id ? "bg-zinc-800" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <Avatar
                src={profilePics[chat.id]}
                name={chat.name}
                isGroup={chat.isGroup}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-white">
                    {chat.name}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span className="ml-2 flex-shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
                {chat.lastMessage?.body && (
                  <p className="truncate text-xs text-zinc-500">
                    {chat.lastMessage.body}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
