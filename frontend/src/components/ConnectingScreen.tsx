"use client";

import React from "react";
import { API_URL, DEBUG } from "@/utils/config";
import { DebugPanel } from "./DebugPanel";
import type { DebugLog } from "@/types";

type ConnectingScreenProps = {
  apiReachable: boolean | null;
  logs: DebugLog[];
};

export function ConnectingScreen({ apiReachable, logs }: ConnectingScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-900 p-6">
      <div className="text-zinc-400">
        {apiReachable === false ? "Can't reach API" : "Connecting..."}
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        {apiReachable === false
          ? "The WhatsApp API may be starting (Chrome takes ~30s). Check docker compose logs whatsapp-api"
          : "Waiting for WhatsApp to initialize"}
      </p>
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => window.open(`${API_URL}/api/screenshot`, '_blank')}
          className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
        >
          View browser
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem("whatsapp-debug", "1");
            window.location.reload();
          }}
          className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
        >
          Enable debug logs
        </button>
      </div>
      {DEBUG && <DebugPanel logs={logs} className="mt-6 w-full max-w-md" />}
    </div>
  );
}
