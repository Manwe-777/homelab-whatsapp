"use client";

import React, { useState } from "react";
import { DEBUG } from "@/utils/config";
import { requestPairingCode } from "@/utils/api";
import { DebugPanel } from "./DebugPanel";
import type { DebugLog } from "@/types";

type QRScreenProps = {
  qr: string | null;
  pairingCode: string | null;
  hasPairingCode: boolean;
  logs: DebugLog[];
  log: (msg: string) => void;
  onPairingCodeReceived: (code: string) => void;
};

export function QRScreen({
  qr,
  pairingCode,
  hasPairingCode,
  logs,
  log,
  onPairingCodeReceived,
}: QRScreenProps) {
  const [phoneInput, setPhoneInput] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  const handleRequestPairingCode = async () => {
    if (!phoneInput.trim() || pairingLoading) return;
    setPairingLoading(true);
    setPairingError(null);
    try {
      log("Requesting pairing code for " + phoneInput.replace(/\d(?=\d{4})/g, "*"));
      const data = await requestPairingCode(phoneInput.trim());
      onPairingCodeReceived(data.code);
      log("Pairing code received");
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setPairingError(error);
      log("Pairing request failed: " + error);
    } finally {
      setPairingLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-900 p-6">
      <h1 className="mb-4 text-xl font-medium text-white">
        {pairingCode || hasPairingCode ? "Enter 8-digit code in WhatsApp" : "Scan QR with WhatsApp"}
      </h1>
      <p className="mb-6 text-sm text-zinc-400">
        Open WhatsApp → Settings → Linked Devices → Link a Device
      </p>

      {qr && (
        <img
          src={qr}
          alt="QR Code"
          className="mb-8 rounded-lg border border-zinc-700 bg-white p-2"
        />
      )}

      {(pairingCode || hasPairingCode) && !qr && (
        <div className="mb-8 flex flex-col items-center gap-2">
          <p className="text-sm text-zinc-500">Your 8-digit code:</p>
          <div className="rounded-lg border-2 border-emerald-500 bg-zinc-800 px-6 py-4 font-mono text-2xl font-bold tracking-widest text-white">
            {pairingCode || "…"}
          </div>
          <p className="max-w-xs text-center text-xs text-zinc-500">
            In WhatsApp, tap &quot;Link with phone number instead&quot; and enter this code
          </p>
        </div>
      )}

      <div className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Or link with phone number
        </p>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="5491112345678"
            className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
          />
          <button
            onClick={handleRequestPairingCode}
            disabled={!phoneInput.trim() || pairingLoading}
            className="cursor-pointer rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pairingLoading ? "…" : "Get code"}
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">Country code + number, no + or spaces</p>
        {pairingError && (
          <p className="mt-2 text-sm text-red-400">{pairingError}</p>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => window.open("/api/screenshot", '_blank')}
          className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
        >
          View browser
        </button>
        {!DEBUG ? (
          <button
            onClick={() => {
              sessionStorage.setItem("whatsapp-debug", "1");
              window.location.reload();
            }}
            className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
          >
            Show debug logs
          </button>
        ) : (
          <button
            onClick={() => {
              sessionStorage.removeItem("whatsapp-debug");
              window.location.reload();
            }}
            className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
          >
            Hide debug
          </button>
        )}
      </div>
      {DEBUG && <DebugPanel logs={logs} className="mt-4 w-full max-w-md" />}
    </div>
  );
}
