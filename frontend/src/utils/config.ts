export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3008";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || API_URL.replace(/^http/, 'ws');
export const DEBUG = typeof window !== "undefined" && (window.location.search.includes("debug=1") || sessionStorage.getItem("whatsapp-debug") === "1");
