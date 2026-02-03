"use client";

import { Avatar } from "./Avatar";
import { formatTime, renderMessageBody } from "@/utils/formatters";
import type { Message as MessageType } from "@/types";

type MessageProps = {
  message: MessageType;
  isGroup: boolean;
  loadedMedia?: string;
  loadingMedia?: boolean;
  onLoadMedia: () => void;
  onReply?: (message: MessageType) => void;
};

export function Message({
  message: m,
  isGroup,
  loadedMedia,
  loadingMedia,
  onLoadMedia,
  onReply,
}: MessageProps) {
  return (
    <div className={`group flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
      {isGroup && !m.fromMe && (
        <div className="mr-2 flex-shrink-0">
          <Avatar
            src={m.senderPic}
            name={m.senderName}
            size="sm"
          />
        </div>
      )}
      <div className="flex items-center gap-1">
        {/* Reply button - shows on hover, positioned based on message direction */}
        {m.fromMe && onReply && (
          <button
            onClick={() => onReply(m)}
            className="cursor-pointer rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100"
            title="Reply"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
        )}
        <div
          className={`rounded-lg px-3 py-2 ${
            m.fromMe
              ? "bg-emerald-600 text-white"
              : "bg-zinc-800 text-zinc-100"
          }`}
        >
          {isGroup && !m.fromMe && m.senderName && (
            <p className="mb-1 text-xs font-medium text-emerald-400">
              {m.senderName}
            </p>
          )}
          {m.quotedMsg && (
            <div
              className={`mb-2 rounded border-l-4 px-2 py-1 text-xs ${
                m.fromMe
                  ? "border-emerald-300 bg-emerald-700/50"
                  : "border-emerald-500 bg-zinc-700/50"
              }`}
            >
              <p className={`font-medium ${m.fromMe ? "text-emerald-200" : "text-emerald-400"}`}>
                {m.quotedMsg.senderName || "Unknown"}
              </p>
              {m.quotedMsg.hasMedia && (
                <p className="italic text-zinc-400">
                  [{m.quotedMsg.type === "image" ? "Photo" : m.quotedMsg.type === "video" ? "Video" : m.quotedMsg.type === "audio" || m.quotedMsg.type === "ptt" ? "Audio" : "Media"}]
                </p>
              )}
              {m.quotedMsg.body && (
                <p className={`line-clamp-2 ${m.fromMe ? "text-emerald-100/80" : "text-zinc-300"}`}>
                  {m.quotedMsg.body}
                </p>
              )}
            </div>
          )}
          {m.hasMedia && (m.type === "image" || m.type === "sticker") ? (
            loadedMedia ? (
              <img
                src={loadedMedia}
                alt="Media"
                className="max-h-64 max-w-full rounded"
              />
            ) : (
              <button
                onClick={onLoadMedia}
                disabled={loadingMedia}
                className="cursor-pointer text-sm text-emerald-400 hover:text-emerald-300 disabled:cursor-wait disabled:text-zinc-500"
              >
                {loadingMedia ? "Loading..." : `[Load ${m.type}]`}
              </button>
            )
          ) : m.hasMedia && m.type === "video" ? (
            loadedMedia ? (
              <video
                src={loadedMedia}
                controls
                className="max-h-64 max-w-full rounded"
                playsInline
              />
            ) : (
              <button
                onClick={onLoadMedia}
                disabled={loadingMedia}
                className="cursor-pointer text-sm text-emerald-400 hover:text-emerald-300 disabled:cursor-wait disabled:text-zinc-500"
              >
                {loadingMedia ? "Loading..." : "[Load video]"}
              </button>
            )
          ) : m.hasMedia && (m.type === "audio" || m.type === "ptt") ? (
            loadedMedia ? (
              <audio
                src={loadedMedia}
                controls
                className="max-w-full"
              />
            ) : (
              <button
                onClick={onLoadMedia}
                disabled={loadingMedia}
                className="cursor-pointer text-sm text-emerald-400 hover:text-emerald-300 disabled:cursor-wait disabled:text-zinc-500"
              >
                {loadingMedia ? "Loading..." : `[Load ${m.type === "ptt" ? "voice message" : "audio"}]`}
              </button>
            )
          ) : m.hasMedia ? (
            <div className="text-sm italic text-zinc-400">
              [Media]
            </div>
          ) : null}
          {m.body && <p className="whitespace-pre-wrap break-words text-sm">{renderMessageBody(m.body, m.fromMe)}</p>}
          {!m.body && !m.hasMedia && <p className="text-sm text-zinc-400">(empty)</p>}
          <p className="mt-1 text-right text-xs opacity-70">
            {formatTime(m.timestamp)}
          </p>
        </div>
        {/* Reply button for received messages */}
        {!m.fromMe && onReply && (
          <button
            onClick={() => onReply(m)}
            className="cursor-pointer rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100"
            title="Reply"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
