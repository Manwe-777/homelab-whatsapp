"use client";

import React from "react";
import type { DebugLog } from "@/types";

type DebugPanelProps = {
  logs: DebugLog[];
  className?: string;
};

export function DebugPanel({ logs, className = "" }: DebugPanelProps) {
  return (
    <div className={`rounded border border-zinc-700 bg-zinc-900/80 p-3 font-mono text-xs text-zinc-400 ${className}`}>
      <p className="mb-1 font-semibold text-zinc-300">Debug logs</p>
      <div className="max-h-32 overflow-y-auto">
        {logs.map((l, i) => (
          <div key={i}>
            <span className="text-zinc-600">[{l.ts}]</span> {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
