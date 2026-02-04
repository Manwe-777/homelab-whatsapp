"use client";

import { useEffect } from "react";
import { Avatar } from "./Avatar";
import { formatTime, renderMessageBody } from "@/utils/formatters";
import type { Message as MessageType } from "@/types";

type MessageProps = {
  message: MessageType;
  isGroup: boolean;
  chatName?: string;
  loadedMedia?: string;
  loadingMedia?: boolean;
  onLoadMedia: () => void;
  onReply?: (message: MessageType) => void;
};

// Detect security code change notifications
// - type is "e2e_notification" OR
// - body matches pattern like "180002180063299@lid"
const SECURITY_CODE_PATTERN = /^\d+@lid$/;

function isSecurityNotification(m: MessageType): boolean {
  return m.type === "e2e_notification" || !!(m.body && SECURITY_CODE_PATTERN.test(m.body.trim()));
}

// Album messages are containers for multiple images sent together
function isAlbumMessage(m: MessageType): boolean {
  return m.type === "album";
}

// Group notifications (joins, leaves, etc.)
function isGroupNotification(m: MessageType): boolean {
  return m.type === "gp2";
}

// Format phone number for display
function formatPhone(id: string): string {
  const phone = id.split("@")[0];
  if (!phone) return "Someone";
  // Format as +XX X XXX XXX-XXXX (Argentine style from example)
  return `+${phone.replace(/^(\d{2})(\d)(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3 $4-$5")}`;
}

// Build notification text from gp2 message data
function getGroupNotificationText(m: MessageType): string | null {
  // If body is already set, use it
  if (m.body) return m.body;

  const { subtype, recipients } = m;
  if (!subtype || !recipients?.length) return null;

  const who = recipients.map(formatPhone).join(", ");

  switch (subtype) {
    case "invite":
      return `${who} joined using this group's invite link`;
    case "add":
      return `${who} was added`;
    case "remove":
      return `${who} was removed`;
    case "leave":
      return `${who} left`;
    case "create":
      return `${who} created this group`;
    case "subject":
      return `${who} changed the group subject`;
    case "description":
      return `${who} changed the group description`;
    case "icon":
      return `${who} changed the group icon`;
    case "announce":
      return `${who} changed group settings`;
    default:
      return `Group notification: ${subtype}`;
  }
}

export function Message({
  message: m,
  isGroup,
  chatName,
  loadedMedia,
  loadingMedia,
  onLoadMedia,
  onReply,
}: MessageProps) {
  // Auto-load images and stickers
  useEffect(() => {
    if (m.hasMedia && (m.type === "image" || m.type === "sticker") && !loadedMedia && !loadingMedia) {
      onLoadMedia();
    }
  }, [m.hasMedia, m.type, loadedMedia, loadingMedia, onLoadMedia]);

  // Render security notifications as subtle system messages
  if (isSecurityNotification(m)) {
    // Use e2eContactName from backend if available, otherwise fallback
    const contactName = m.e2eContactName
      || (isGroup ? (m.senderName || "a contact") : (chatName || "this contact"));

    return (
      <div className="flex justify-center py-1">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Security code changed with {contactName}</span>
        </div>
      </div>
    );
  }

  // Album messages are containers - the actual images appear as separate messages
  // Hide the album container since it has no content to display
  if (isAlbumMessage(m)) {
    return null;
  }

  // Render group notifications as subtle system messages
  if (isGroupNotification(m)) {
    const notificationText = getGroupNotificationText(m);
    if (!notificationText) {
      return null;
    }
    return (
      <div className="flex justify-center py-1">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{notificationText}</span>
        </div>
      </div>
    );
  }

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
              className={`mb-2 flex gap-2 rounded border-l-4 px-2 py-1 text-xs ${
                m.fromMe
                  ? "border-emerald-300 bg-emerald-700/50"
                  : "border-emerald-500 bg-zinc-700/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${m.fromMe ? "text-emerald-200" : "text-emerald-400"}`}>
                  {m.quotedMsg.senderName || "Unknown"}
                </p>
                {m.quotedMsg.hasMedia && !m.quotedMsg.thumbnail && (
                  <p className="italic text-zinc-400">
                    [{m.quotedMsg.type === "image" ? "Photo" : m.quotedMsg.type === "video" ? "Video" : m.quotedMsg.type === "audio" || m.quotedMsg.type === "ptt" ? "Audio" : "Media"}]
                  </p>
                )}
                {m.quotedMsg.body && (
                  <p className={`line-clamp-2 ${m.fromMe ? "text-emerald-100/80" : "text-zinc-300"}`}>
                    {m.quotedMsg.body}
                  </p>
                )}
                {m.quotedMsg.thumbnail && !m.quotedMsg.body && (
                  <p className="flex items-center gap-1 text-zinc-400">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Photo
                  </p>
                )}
              </div>
              {m.quotedMsg.thumbnail && (
                <img
                  src={m.quotedMsg.thumbnail}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 rounded object-cover"
                />
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
              <div className="flex h-32 w-48 items-center justify-center rounded bg-zinc-700/50">
                <svg className="h-6 w-6 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
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
