"use client";

import React, { useRef } from "react";
import type { Message } from "@/types";

type MessageInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onSendMedia: (file: File) => void;
  sending: boolean;
  sendingMedia: boolean;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
};

export function MessageInput({
  value,
  onChange,
  onSend,
  onSendMedia,
  sending,
  sendingMedia,
  replyingTo,
  onCancelReply,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMedia(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSend();
  };

  return (
    <div className="flex-shrink-0 border-t border-zinc-800">
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-800/50 px-3 py-2">
          <div className="flex-1 truncate">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span className="text-xs font-medium text-emerald-400">
                Replying to {replyingTo.fromMe ? "yourself" : (replyingTo.senderName || "Unknown")}
              </span>
            </div>
            <p className="truncate text-xs text-zinc-400">
              {replyingTo.hasMedia && !replyingTo.body
                ? `[${replyingTo.type === "image" ? "Photo" : replyingTo.type === "video" ? "Video" : replyingTo.type === "audio" || replyingTo.type === "ptt" ? "Audio" : "Media"}]`
                : replyingTo.body || "(empty)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="cursor-pointer rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
            title="Cancel reply"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {/* Input form */}
      <div className="p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendingMedia}
            className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Send media"
          >
            {sendingMedia ? (
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
          </button>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={sendingMedia ? "Sending media..." : "Message"}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={!value.trim() || sending || sendingMedia}
            className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
