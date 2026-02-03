import React from "react";

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// URL regex that matches http, https, and www links
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export function renderMessageBody(body: string, fromMe: boolean): React.ReactNode {
  if (!body) return null;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  // Reset regex state
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(body)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      const textBefore = body.slice(lastIndex, match.index);
      elements.push(...renderTextWithMentions(textBefore, fromMe, keyIndex));
      keyIndex += textBefore.split(/(@\S+)/g).length;
    }

    // Add the URL as a link
    let url = match[0];
    const href = url.startsWith("www.") ? `https://${url}` : url;

    elements.push(
      <a
        key={`link-${keyIndex++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline decoration-1 underline-offset-2 ${
          fromMe
            ? "text-emerald-100 hover:text-white"
            : "text-emerald-400 hover:text-emerald-300"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last URL
  if (lastIndex < body.length) {
    const textAfter = body.slice(lastIndex);
    elements.push(...renderTextWithMentions(textAfter, fromMe, keyIndex));
  }

  return elements.length > 0 ? elements : body;
}

function renderTextWithMentions(text: string, fromMe: boolean, startKey: number): React.ReactNode[] {
  const parts = text.split(/(@\S+)/g);

  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      return (
        <span
          key={`mention-${startKey + i}`}
          className={`font-medium ${fromMe ? "text-emerald-200" : "text-emerald-400"}`}
        >
          {part}
        </span>
      );
    }
    return <span key={`text-${startKey + i}`}>{part}</span>;
  });
}
