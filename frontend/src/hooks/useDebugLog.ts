"use client";

import { useState, useCallback } from "react";
import { DEBUG } from "@/utils/config";
import type { DebugLog } from "@/types";

export function useDebugLog() {
  const [logs, setLogs] = useState<DebugLog[]>([]);

  const add = useCallback((msg: string) => {
    const entry = { ts: new Date().toLocaleTimeString(), msg };
    setLogs((prev) => [...prev.slice(-49), entry]);
    if (DEBUG) console.log("[WhatsApp]", msg);
  }, []);

  return { logs, add };
}
