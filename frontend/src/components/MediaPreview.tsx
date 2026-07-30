"use client";

import React, { useEffect, useMemo, useRef } from "react";

type MediaPreviewProps = {
  files: File[];
  captions: string[];
  currentIndex: number;
  sending: boolean;
  onIndexChange: (idx: number) => void;
  onCaptionChange: (idx: number, caption: string) => void;
  onRemove: (idx: number) => void;
  onAddFiles: (files: File[]) => void;
  onClose: () => void;
  onSend: () => void;
};

function isImage(file: File) {
  return file.type.startsWith("image/");
}
function isVideo(file: File) {
  return file.type.startsWith("video/");
}
function isAudio(file: File) {
  return file.type.startsWith("audio/");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function MediaPreview({
  files,
  captions,
  currentIndex,
  sending,
  onIndexChange,
  onCaptionChange,
  onRemove,
  onAddFiles,
  onClose,
  onSend,
}: MediaPreviewProps) {
  const addInputRef = useRef<HTMLInputElement>(null);

  // Object URLs for previews — keyed by file identity
  const previewUrls = useMemo(
    () =>
      files.map((f) =>
        isImage(f) || isVideo(f) || isAudio(f) ? URL.createObjectURL(f) : null
      ),
    [files]
  );
  useEffect(() => {
    return () => {
      previewUrls.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
    };
  }, [previewUrls]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, sending]);

  if (files.length === 0) return null;

  const safeIndex = Math.min(currentIndex, files.length - 1);
  const current = files[safeIndex];
  const currentUrl = previewUrls[safeIndex];

  const handleCaptionKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          className="cursor-pointer rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          title="Cancel (Esc)"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="truncate text-sm text-zinc-300">
          {files.length === 1
            ? current.name
            : `${safeIndex + 1} of ${files.length} · ${current.name}`}
        </div>
        <div className="w-9" />
      </div>

      {/* Preview area */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="flex max-h-full max-w-3xl flex-col items-center gap-3">
          {isImage(current) && currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt={current.name}
              className="max-h-[60vh] max-w-full rounded-lg object-contain"
            />
          ) : isVideo(current) && currentUrl ? (
            <video
              src={currentUrl}
              controls
              className="max-h-[60vh] max-w-full rounded-lg"
            />
          ) : isAudio(current) && currentUrl ? (
            <div className="flex flex-col items-center gap-3 rounded-lg bg-zinc-900 p-6">
              <svg className="h-16 w-16 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <audio src={currentUrl} controls className="w-80 max-w-full" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg bg-zinc-900 p-10 text-zinc-300">
              <FileIcon />
              <div className="text-center">
                <div className="max-w-md truncate text-sm font-medium">{current.name}</div>
                <div className="text-xs text-zinc-500">{current.type || "file"}</div>
              </div>
            </div>
          )}
          <div className="text-xs text-zinc-500">{formatSize(current.size)}</div>
        </div>
      </div>

      {/* Caption + send */}
      <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900/80 p-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            type="text"
            value={captions[safeIndex] || ""}
            onChange={(e) => onCaptionChange(safeIndex, e.target.value)}
            onKeyDown={handleCaptionKey}
            placeholder="Add a caption..."
            disabled={sending}
            autoFocus
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || files.length === 0}
            className="cursor-pointer rounded-full bg-emerald-600 p-3 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            title="Send"
          >
            {sending ? (
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l14-7-7 14-2-5-5-2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Thumbnail strip */}
        <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2 overflow-x-auto">
          {files.map((f, i) => {
            const url = previewUrls[i];
            const selected = i === safeIndex;
            return (
              <div key={`${f.name}-${f.size}-${i}`} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onIndexChange(i)}
                  className={`relative block h-14 w-14 overflow-hidden rounded border-2 transition-colors ${
                    selected ? "border-emerald-500" : "border-zinc-700 hover:border-zinc-500"
                  }`}
                  title={f.name}
                >
                  {isImage(f) && url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : isVideo(f) && url ? (
                    <video src={url} className="h-full w-full object-cover" muted />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-400">
                      <FileIcon className="h-6 w-6" />
                    </div>
                  )}
                </button>
                {files.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    disabled={sending}
                    className="absolute -right-1 -top-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-zinc-700 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Remove"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addInputRef.current?.click()}
            disabled={sending}
            className="flex h-14 w-14 flex-shrink-0 cursor-pointer items-center justify-center rounded border-2 border-dashed border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Add more"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <input
            ref={addInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            onChange={(e) => {
              const incoming = Array.from(e.target.files || []);
              if (incoming.length > 0) onAddFiles(incoming);
              if (addInputRef.current) addInputRef.current.value = "";
            }}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
