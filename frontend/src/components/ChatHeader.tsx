"use client";

import React from "react";
import { Avatar } from "./Avatar";
import type { Chat } from "@/types";

type ChatHeaderProps = {
  chat: Chat;
  profilePic?: string | null;
  onBack?: () => void;
};

export function ChatHeader({ chat, profilePic, onBack }: ChatHeaderProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-3">
      {onBack && (
        <button
          onClick={onBack}
          className="mr-1 cursor-pointer rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white md:hidden"
          aria-label="Back to chat list"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <Avatar
        src={profilePic}
        name={chat.name}
        isGroup={chat.isGroup}
      />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-medium text-white">{chat.name}</h2>
        <p className="text-xs text-zinc-500">
          {chat.isGroup ? "Group" : "Chat"}
        </p>
      </div>
    </div>
  );
}
