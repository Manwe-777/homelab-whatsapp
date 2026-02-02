import { API_URL } from "./config";

export async function fetchWithTimeout(
  url: string,
  opts?: RequestInit,
  ms = 15000
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function fetchStatus() {
  const res = await fetchWithTimeout(`${API_URL}/api/status`);
  return res.json();
}

export async function fetchQR() {
  const res = await fetchWithTimeout(`${API_URL}/api/qr`);
  return res.json();
}

export async function fetchPairingCode() {
  const res = await fetchWithTimeout(`${API_URL}/api/pairing-code`);
  if (!res.ok) return null;
  return res.json();
}

export async function requestPairingCode(phoneNumber: string) {
  const res = await fetch(`${API_URL}/api/pairing-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to request pairing code");
  }
  return data;
}

export async function fetchChats(limit = 50, type?: 'group' | 'direct' | 'all') {
  let url = `${API_URL}/api/chats?limit=${limit}&timeout=30000`;
  if (type && type !== 'all') {
    url += `&type=${type}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.status }));
    throw new Error(err.error || String(res.status));
  }
  return res.json();
}

export async function fetchMessages(
  chatId: string,
  limit = 20,
  before?: number,
  options: { sync?: boolean; fetchNames?: boolean } = {}
) {
  const id = encodeURIComponent(chatId);
  let url = `${API_URL}/api/chats/${id}/messages?limit=${limit}&timeout=30000`;
  if (before) {
    url += `&before=${before}`;
  }
  if (options.sync) {
    url += `&sync=1`;
  }
  if (options.fetchNames === false) {
    url += `&fetchNames=0`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return res.json();
}

export async function sendMessage(chatId: string, msg: string) {
  const id = encodeURIComponent(chatId);
  const res = await fetch(`${API_URL}/api/chats/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg }),
  });
  return res.ok;
}

export async function sendMedia(
  chatId: string,
  data: string,
  mimetype: string,
  filename: string,
  caption?: string
) {
  const id = encodeURIComponent(chatId);
  const res = await fetch(`${API_URL}/api/chats/${id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, mimetype, filename, caption }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

export async function markChatAsRead(chatId: string) {
  const id = encodeURIComponent(chatId);
  await fetch(`${API_URL}/api/chats/${id}/read`, { method: 'POST' });
}

export async function fetchProfilePic(chatId: string) {
  const id = encodeURIComponent(chatId);
  const res = await fetch(`${API_URL}/api/profile-pic/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.url;
}

export async function fetchMedia(chatId: string, msgId: string) {
  const cid = encodeURIComponent(chatId);
  const mid = encodeURIComponent(msgId);
  const res = await fetch(`${API_URL}/api/media/${cid}/${mid}`);
  if (!res.ok) {
    throw new Error(`Failed to load media: ${res.status}`);
  }
  const data = await res.json();
  return data.data;
}

// ============================================
// GROUP API FUNCTIONS
// ============================================

export type GroupParticipant = {
  id: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  name: string | null;
  profilePic: string | null;
};

export type GroupInfo = {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  createdAt: number | null;
  participants: GroupParticipant[];
  participantCount: number;
  unreadCount: number;
  isReadOnly: boolean;
  isMuted: boolean;
  muteExpiration: number | null;
};

export async function fetchGroupInfo(groupId: string, fetchNames = false): Promise<GroupInfo> {
  const id = encodeURIComponent(groupId);
  let url = `${API_URL}/api/groups/${id}`;
  if (fetchNames) {
    url += '?fetchNames=1';
  }
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return res.json();
}

export async function fetchGroupInviteCode(groupId: string): Promise<{ code: string; inviteLink: string }> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/invite-code`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return res.json();
}

export async function leaveGroup(groupId: string): Promise<boolean> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/leave`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

export async function addGroupParticipants(groupId: string, participants: string[]): Promise<boolean> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participants }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

export async function removeGroupParticipants(groupId: string, participants: string[]): Promise<boolean> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/participants`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participants }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

export async function promoteGroupParticipants(groupId: string, participants: string[]): Promise<boolean> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participants }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

export async function demoteGroupParticipants(groupId: string, participants: string[]): Promise<boolean> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/demote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participants }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

export async function updateGroupSubject(groupId: string, subject: string): Promise<boolean> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/subject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

export async function updateGroupDescription(groupId: string, description: string): Promise<boolean> {
  const id = encodeURIComponent(groupId);
  const res = await fetch(`${API_URL}/api/groups/${id}/description`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return true;
}

// ============================================
// SEARCH API FUNCTIONS
// ============================================

export type SearchResult = {
  id: string;
  msgId: string;
  body: string;
  from: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  hasMedia: boolean;
  chatId: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  count: number;
};

export async function searchMessages(query: string, chatId?: string, limit = 20): Promise<SearchResponse> {
  let url = `${API_URL}/api/messages/search?query=${encodeURIComponent(query)}&limit=${limit}`;
  if (chatId) {
    url += `&chatId=${encodeURIComponent(chatId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(res.status));
  }
  return res.json();
}
