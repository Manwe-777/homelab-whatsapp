// WebSocket port (backend server port)
const WS_PORT = process.env.NEXT_PUBLIC_WS_PORT || "3008";

// WebSocket URL - needs to connect directly to the backend
// Uses current hostname so it works across different networks (e.g., Tailscale)
function getWsUrl(): string {
  // Check for explicit override first
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  // On client-side, derive from current hostname
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:${WS_PORT}`;
  }

  // SSR fallback (not used, but needed for module evaluation)
  return `ws://localhost:${WS_PORT}`;
}

export const WS_URL = getWsUrl();
export const DEBUG = typeof window !== "undefined" && (window.location.search.includes("debug=1") || sessionStorage.getItem("whatsapp-debug") === "1");
