import React from "react";

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function renderMessageBody(body: string, fromMe: boolean): React.ReactNode {
  if (!body) return null;

  const parts = body.split(/(@\S+)/g);

  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span
          key={i}
          className={`font-medium ${fromMe ? 'text-emerald-200' : 'text-emerald-400'}`}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
