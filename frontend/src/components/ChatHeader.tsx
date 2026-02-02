"use client";

import React from "react";
import { Avatar } from "./Avatar";
import type { Chat } from "@/types";

type ChatHeaderProps = {
  chat: Chat;
  profilePic?: string | null;
};

export function ChatHeader({ chat, profilePic }: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
      <Avatar
        src={profilePic}
        name={chat.name}
        isGroup={chat.isGroup}
      />
      <div>
        <h2 className="font-medium text-white">{chat.name}</h2>
        <p className="text-xs text-zinc-500">
          {chat.isGroup ? "Group" : "Chat"}
        </p>
      </div>
    </div>
  );
}
