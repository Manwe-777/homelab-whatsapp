import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

const DEBUG = process.env.DEBUG !== 'false'; // Set DEBUG=false to disable

function log(...args) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for media uploads

// State variables (defined before WebSocket setup)
let client = null;
let qrData = null;
let pairingCode = null;
let isReady = false;

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Track connected WebSocket clients
const wsClients = new Set();

wss.on('connection', (ws) => {
  log('WebSocket client connected');
  wsClients.add(ws);

  // Send current status immediately
  ws.send(JSON.stringify({
    type: 'status',
    data: { connected: isReady, hasQr: !!qrData, hasPairingCode: !!pairingCode }
  }));

  ws.on('close', () => {
    log('WebSocket client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (err) => {
    log('WebSocket error:', err.message);
    wsClients.delete(ws);
  });
});

// Broadcast to all connected WebSocket clients
function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  for (const ws of wsClients) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message);
    }
  }
}

// Cached stats for frequent polling
let cachedStats = null;
let statsLastUpdated = 0;
const STATS_CACHE_MS = 10000; // Cache stats for 10 seconds

function initClient() {
  if (client) return client;

  log('Initializing WhatsApp client...');
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080',
        '--disable-extensions',
        '--disable-plugins-discovery',
        '--disable-default-apps',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ],
    },
    // Use remote WhatsApp Web versions - often fixes "refused to sync" when scanning QR
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
    },
  });

  client.on('qr', async (qr) => {
    qrData = await qrcode.toDataURL(qr);
    pairingCode = null;
    log('QR received - scan with WhatsApp');
  });

  client.on('ready', () => {
    isReady = true;
    qrData = null;
    pairingCode = null;
    log('WhatsApp client ready');
    broadcast('status', { connected: true, hasQr: false, hasPairingCode: false });
  });

  client.on('authenticated', () => {
    qrData = null;
    pairingCode = null;
    log('Authenticated');
  });

  client.on('auth_failure', (msg) => {
    log('Auth failure:', msg);
    // Reset state on auth failure
    qrData = null;
    pairingCode = null;
    isReady = false;
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    log('Disconnected:', reason);
    // Cleanup and attempt reconnection
    client = null;
    qrData = null;
    pairingCode = null;
    log('Scheduling reconnection in 5 seconds...');
    setTimeout(() => {
      log('Attempting to reconnect...');
      initClient();
    }, 5000);
  });

  client.on('change_state', (state) => {
    log('State changed:', state);
  });

  client.on('loading_screen', (percent, message) => {
    log(`Loading: ${percent}% - ${message}`);
  });

  client.on('remote_session_saved', () => {
    log('Remote session saved');
  });

  // Real-time message events
  client.on('message', async (msg) => {
    log('New message from:', msg.from);
    const chat = await msg.getChat();
    broadcast('message', {
      id: msg.id._serialized || msg.id,
      chatId: msg.from,
      chatName: chat.name,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      type: msg.type,
      hasMedia: msg.hasMedia,
      isGroup: chat.isGroup,
    });
  });

  client.on('message_create', async (msg) => {
    // Only broadcast outgoing messages (fromMe)
    if (msg.fromMe) {
      log('Message sent to:', msg.to);
      broadcast('message_sent', {
        id: msg.id._serialized || msg.id,
        chatId: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
        type: msg.type,
      });
    }
  });

  client.on('message_ack', (msg, ack) => {
    // ack: 1=sent, 2=delivered, 3=read, 4=played
    const ackNames = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'played' };
    broadcast('message_ack', {
      id: msg.id._serialized || msg.id,
      chatId: msg.to || msg.from,
      ack: ack,
      ackName: ackNames[ack] || 'unknown',
    });
  });

  client.on('message_revoke_everyone', async (msg, revokedMsg) => {
    broadcast('message_deleted', {
      id: revokedMsg?.id?._serialized || msg.id._serialized,
      chatId: msg.from,
    });
  });

  // Typing indicators (if supported)
  client.on('typing', (chatId, isTyping) => {
    broadcast('typing', { chatId, isTyping });
  });

  // Chat updates
  client.on('chat_unread', (chat, unreadCount) => {
    broadcast('chat_update', {
      chatId: chat.id._serialized,
      unreadCount,
    });
  });

  client.initialize();
  return client;
}

initClient();

// Stats for dashboard integration (Glance, etc.)
// Cached to allow frequent polling without overloading
app.get('/api/stats', async (req, res) => {
  const noCache = req.query.nocache === '1';
  const now = Date.now();

  // Return cached stats if still fresh
  if (!noCache && cachedStats && (now - statsLastUpdated) < STATS_CACHE_MS) {
    return res.json(cachedStats);
  }

  if (!isReady || !client) {
    const stats = {
      status: client ? 'connecting' : 'disconnected',
      unreadTotal: 0,
      unreadChats: 0,
      unreadGroups: 0,
      unreadMentions: 0,
      totalChats: 0,
      cachedAt: new Date().toISOString(),
    };
    cachedStats = stats;
    statsLastUpdated = now;
    return res.json(stats);
  }

  try {
    const chats = await Promise.race([
      client.getChats(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
    ]);

    let unreadTotal = 0;
    let unreadChats = 0;
    let unreadGroups = 0;
    let unreadMentions = 0;

    for (const chat of chats) {
      if (chat.unreadCount > 0) {
        unreadTotal += chat.unreadCount;
        if (chat.isGroup) {
          unreadGroups++;
          if (chat.unreadMentionCount) {
            unreadMentions += chat.unreadMentionCount;
          }
        } else {
          unreadChats++;
        }
      }
    }

    const stats = {
      status: 'connected',
      unreadTotal,
      unreadChats,
      unreadGroups,
      unreadMentions,
      totalChats: chats.length,
      cachedAt: new Date().toISOString(),
    };

    cachedStats = stats;
    statsLastUpdated = now;
    res.json(stats);
  } catch (err) {
    log('Stats error:', err.message);
    const stats = {
      status: 'error',
      error: err.message,
      unreadTotal: 0,
      unreadChats: 0,
      unreadGroups: 0,
      unreadMentions: 0,
      totalChats: 0,
      cachedAt: new Date().toISOString(),
    };
    cachedStats = stats;
    statsLastUpdated = now;
    res.json(stats);
  }
});

// Debug screenshot - see what Puppeteer sees
app.get('/api/screenshot', async (req, res) => {
  if (!client || !client.pupPage) {
    return res.status(503).send('Browser not ready');
  }
  try {
    const screenshot = await client.pupPage.screenshot({ type: 'png' });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(screenshot);
  } catch (err) {
    log('Screenshot error:', err.message);
    res.status(500).send(err.message);
  }
});

// Status & QR
app.get('/api/status', (req, res) => {
  const status = { connected: isReady, hasQr: !!qrData, hasPairingCode: !!pairingCode };
  log('GET /api/status', status);
  res.json(status);
});

app.get('/api/qr', (req, res) => {
  if (!qrData) {
    log('GET /api/qr - 404 no QR');
    return res.status(404).json({ error: 'No QR available' });
  }
  log('GET /api/qr - 200');
  res.json({ qr: qrData });
});

// Pairing code (8-digit backup)
app.post('/api/pairing-code', async (req, res) => {
  if (isReady || !client) {
    return res.status(400).json({ error: 'Already connected' });
  }
  let { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber required' });
  }
  phoneNumber = String(phoneNumber).replace(/\D/g, '');
  if (phoneNumber.length < 10) {
    return res.status(400).json({ error: 'Invalid phone number (use country code, e.g. 5491112345678)' });
  }
  try {
    log('Requesting pairing code for', phoneNumber.replace(/\d(?=\d{4})/g, '*'));
    const code = await client.requestPairingCode(phoneNumber);
    pairingCode = code;
    qrData = null;
    log('Pairing code received:', code);
    res.json({ code });
  } catch (err) {
    log('Pairing code error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pairing-code', (req, res) => {
  if (!pairingCode) {
    return res.status(404).json({ error: 'No pairing code available' });
  }
  res.json({ code: pairingCode });
});

// Helper to normalize chat ID from frontend
function normalizeChatId(rawId) {
  let chatId = decodeURIComponent(rawId);
  if (!chatId.includes('@') && chatId.includes('-g.us')) {
    chatId = chatId.replace('-g.us', '@g.us');
  } else if (!chatId.includes('@') && chatId.includes('-c.us')) {
    chatId = chatId.replace('-c.us', '@c.us');
  }
  return chatId;
}

// Chats (compatible with ha-whatsapp-web-rest-api format)
// Supports filtering: ?type=group|direct|all (default: all)
app.get('/api/chats', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const timeout = parseInt(req.query.timeout) || 30000;
  const type = req.query.type || 'all'; // 'group', 'direct', or 'all'

  try {
    log(`Fetching chats (limit=${limit}, type=${type}, timeout=${timeout}ms)...`);

    // Add timeout to prevent hanging forever
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout fetching chats')), timeout)
    );

    const chats = await Promise.race([
      client.getChats(),
      timeoutPromise
    ]);

    // Filter by type if specified
    let filtered = chats;
    if (type === 'group') {
      filtered = chats.filter(c => c.isGroup);
    } else if (type === 'direct') {
      filtered = chats.filter(c => !c.isGroup);
    }

    // Sort by timestamp (most recent first) and limit
    const sorted = filtered
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    const list = sorted.map((c) => ({
      id: c.id._serialized || c.id,
      name: c.name,
      isGroup: c.isGroup,
      unreadCount: c.unreadCount,
      timestamp: c.timestamp,
      lastMessage: c.lastMessage ? { body: c.lastMessage.body?.substring?.(0, 50) } : null,
      // Include participant count for groups
      ...(c.isGroup && c.participants ? { participantCount: c.participants.length } : {}),
    }));

    log(`Returning ${list.length} chats (of ${filtered.length} filtered, ${chats.length} total)`);
    res.json(list);
  } catch (err) {
    log('Chats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Profile picture cache
const profilePicCache = new Map();
const PROFILE_PIC_CACHE_MS = 3600000; // 1 hour

// Get profile picture for a chat/contact
app.get('/api/profile-pic/:chatId', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }

  const chatId = normalizeChatId(req.params.chatId);

  // Check cache first
  const cached = profilePicCache.get(chatId);
  if (cached && (Date.now() - cached.timestamp) < PROFILE_PIC_CACHE_MS) {
    return res.json({ url: cached.url });
  }

  try {
    const contact = await client.getContactById(chatId);
    const url = await contact.getProfilePicUrl();

    // Cache the result (even if null)
    profilePicCache.set(chatId, { url: url || null, timestamp: Date.now() });

    res.json({ url: url || null });
  } catch (err) {
    log('Profile pic error:', err.message);
    // Cache failures too to avoid repeated attempts
    profilePicCache.set(chatId, { url: null, timestamp: Date.now() });
    res.json({ url: null });
  }
});

// ============================================
// GROUP-SPECIFIC ENDPOINTS
// ============================================

// Get detailed group info (participants, owner, description, etc.)
// Use ?fetchNames=1 to fetch pushnames for all participants (slower but gets real names)
app.get('/api/groups/:id', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const fetchNames = req.query.fetchNames === '1' || req.query.fetchNames === 'true';

  try {
    log(`Fetching group info for ${chatId} (fetchNames=${fetchNames})`);
    const chat = await client.getChatById(chatId);

    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    // Collect participant IDs
    const participantIds = [];
    const participantData = {};
    if (chat.participants) {
      for (const p of chat.participants) {
        const id = p.id._serialized || p.id;
        participantIds.push(id);
        participantData[id] = {
          isAdmin: p.isAdmin || false,
          isSuperAdmin: p.isSuperAdmin || false,
        };
      }
    }

    // Optionally fetch real names (pushnames) for all participants
    let contactInfoMap = {};
    if (fetchNames && participantIds.length > 0) {
      log(`Fetching pushnames for ${participantIds.length} participants...`);
      contactInfoMap = await batchGetContactInfo(participantIds, 10);
    } else {
      // Just use cache
      for (const id of participantIds) {
        const cached = contactNameCache.get(id);
        if (cached) {
          contactInfoMap[id] = cached;
        }
      }
    }

    // Build participant list with names
    const participants = participantIds.map(id => ({
      id,
      isAdmin: participantData[id]?.isAdmin || false,
      isSuperAdmin: participantData[id]?.isSuperAdmin || false,
      name: contactInfoMap[id]?.name || null,
      profilePic: contactInfoMap[id]?.profilePic || null,
    }));

    const groupInfo = {
      id: chat.id._serialized || chat.id,
      name: chat.name,
      description: chat.description || null,
      owner: chat.owner?._serialized || chat.owner || null,
      createdAt: chat.createdAt || null,
      participants,
      participantCount: participants.length,
      unreadCount: chat.unreadCount,
      isReadOnly: chat.isReadOnly || false,
      isMuted: chat.isMuted || false,
      muteExpiration: chat.muteExpiration || null,
    };

    log(`Group ${chat.name}: ${participants.length} participants`);
    res.json(groupInfo);
  } catch (err) {
    log('Group info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get group invite link
app.get('/api/groups/:id/invite-code', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    const code = await chat.getInviteCode();
    const inviteLink = code ? `https://chat.whatsapp.com/${code}` : null;

    res.json({ code, inviteLink });
  } catch (err) {
    log('Get invite code error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Leave a group
app.post('/api/groups/:id/leave', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    await chat.leave();
    log(`Left group: ${chat.name}`);
    res.json({ success: true });
  } catch (err) {
    log('Leave group error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add participants to a group (admin only)
app.post('/api/groups/:id/participants', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { participants } = req.body;

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'participants array required' });
  }

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    // Normalize participant IDs (ensure they have @c.us suffix)
    const normalizedIds = participants.map(p => {
      const cleaned = String(p).replace(/\D/g, '');
      return cleaned.includes('@') ? cleaned : `${cleaned}@c.us`;
    });

    const result = await chat.addParticipants(normalizedIds);
    log(`Added participants to ${chat.name}:`, normalizedIds);
    res.json({ success: true, result });
  } catch (err) {
    log('Add participants error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Remove participants from a group (admin only)
app.delete('/api/groups/:id/participants', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { participants } = req.body;

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'participants array required' });
  }

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    const result = await chat.removeParticipants(participants);
    log(`Removed participants from ${chat.name}:`, participants);
    res.json({ success: true, result });
  } catch (err) {
    log('Remove participants error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Promote participants to admin (admin only)
app.post('/api/groups/:id/promote', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { participants } = req.body;

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'participants array required' });
  }

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    const result = await chat.promoteParticipants(participants);
    log(`Promoted participants in ${chat.name}:`, participants);
    res.json({ success: true, result });
  } catch (err) {
    log('Promote participants error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Demote admins to regular participants (admin only)
app.post('/api/groups/:id/demote', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { participants } = req.body;

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'participants array required' });
  }

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    const result = await chat.demoteParticipants(participants);
    log(`Demoted participants in ${chat.name}:`, participants);
    res.json({ success: true, result });
  } catch (err) {
    log('Demote participants error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update group subject (name)
app.put('/api/groups/:id/subject', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { subject } = req.body;

  if (!subject) {
    return res.status(400).json({ error: 'subject required' });
  }

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    await chat.setSubject(subject);
    log(`Updated group subject: ${subject}`);
    res.json({ success: true });
  } catch (err) {
    log('Update subject error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update group description
app.put('/api/groups/:id/description', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { description } = req.body;

  try {
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Not a group chat' });
    }

    await chat.setDescription(description || '');
    log(`Updated group description`);
    res.json({ success: true });
  } catch (err) {
    log('Update description error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SEARCH ENDPOINT
// ============================================

// Search messages across all chats or a specific chat
app.get('/api/messages/search', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }

  const { query, chatId, limit: limitStr } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  const limit = Math.min(parseInt(limitStr) || 20, 50);

  try {
    log(`Searching messages: "${query}" (chatId=${chatId || 'all'}, limit=${limit})`);

    const searchOptions = { limit };
    if (chatId) {
      searchOptions.chatId = normalizeChatId(chatId);
    }

    const messages = await client.searchMessages(query, searchOptions);

    const results = messages.map(m => ({
      id: m.id._serialized || m.id,
      msgId: m.id?._serialized || m.id?.id || String(m.id || ''),
      body: m.body || '',
      from: m.from || '',
      fromMe: !!m.fromMe,
      timestamp: m.timestamp || 0,
      type: m.type || 'chat',
      hasMedia: !!m.hasMedia,
      chatId: m.from || m.to,
    }));

    log(`Search returned ${results.length} messages`);
    res.json({ query, results, count: results.length });
  } catch (err) {
    log('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// MEDIA ENDPOINTS
// ============================================

// Download media from a message
app.get('/api/media/:chatId/:msgId', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.chatId);
  const msgId = decodeURIComponent(req.params.msgId);

  try {
    log(`Fetching media for message ${msgId}`);
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });

    // Find the message by ID
    const message = messages.find(m => {
      const id = m.id._serialized || m.id.id || String(m.id);
      return id === msgId || id.includes(msgId);
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!message.hasMedia) {
      return res.status(400).json({ error: 'Message has no media' });
    }

    const media = await message.downloadMedia();
    if (!media) {
      return res.status(404).json({ error: 'Media not available' });
    }

    log(`Media fetched: ${media.mimetype}, ${Math.round(media.data.length / 1024)}KB`);

    // Return as data URL for easy display
    res.json({
      mimetype: media.mimetype,
      data: `data:${media.mimetype};base64,${media.data}`,
      filename: media.filename || null,
    });
  } catch (err) {
    log('Media fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Contact name cache for group messages
const contactNameCache = new Map();
const CONTACT_NAME_CACHE_MS = 1800000; // 30 minutes

async function getContactInfo(contactId) {
  if (!client || !isReady) return { name: null, profilePic: null };

  const cached = contactNameCache.get(contactId);
  if (cached && (Date.now() - cached.timestamp) < CONTACT_NAME_CACHE_MS) {
    return cached;
  }

  try {
    const contact = await client.getContactById(contactId);
    const name = contact.pushname || contact.name || contact.shortName || null;
    let profilePic = null;

    // Try to get profile pic (cached separately)
    const picCached = profilePicCache.get(contactId);
    if (picCached && (Date.now() - picCached.timestamp) < PROFILE_PIC_CACHE_MS) {
      profilePic = picCached.url;
    } else {
      try {
        profilePic = await contact.getProfilePicUrl() || null;
        profilePicCache.set(contactId, { url: profilePic, timestamp: Date.now() });
      } catch {
        profilePicCache.set(contactId, { url: null, timestamp: Date.now() });
      }
    }

    const info = { name, profilePic, timestamp: Date.now() };
    contactNameCache.set(contactId, info);
    return info;
  } catch {
    const info = { name: null, profilePic: null, timestamp: Date.now() };
    contactNameCache.set(contactId, info);
    return info;
  }
}

async function getContactName(contactId) {
  const info = await getContactInfo(contactId);
  return info.name;
}

// Batch fetch contact info for multiple IDs (with concurrency limit)
async function batchGetContactInfo(contactIds, concurrency = 5) {
  const results = {};
  const uncachedIds = [];

  // First, collect cached results and identify uncached IDs
  for (const id of contactIds) {
    const cached = contactNameCache.get(id);
    if (cached && cached.name && (Date.now() - cached.timestamp) < CONTACT_NAME_CACHE_MS) {
      results[id] = cached;
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) {
    return results;
  }

  log(`Batch fetching contact info for ${uncachedIds.length} uncached contacts`);

  // Fetch uncached contacts in batches with concurrency limit
  for (let i = 0; i < uncachedIds.length; i += concurrency) {
    const batch = uncachedIds.slice(i, i + concurrency);
    const promises = batch.map(async (id) => {
      try {
        const contact = await client.getContactById(id);
        // pushname is the key - it's the name the user set for themselves
        // This is available even for non-contacts!
        const name = contact.pushname || contact.name || contact.shortName || null;

        // Try to get profile pic from cache first
        let profilePic = null;
        const picCached = profilePicCache.get(id);
        if (picCached && (Date.now() - picCached.timestamp) < PROFILE_PIC_CACHE_MS) {
          profilePic = picCached.url;
        } else {
          try {
            profilePic = await contact.getProfilePicUrl() || null;
            profilePicCache.set(id, { url: profilePic, timestamp: Date.now() });
          } catch {
            profilePicCache.set(id, { url: null, timestamp: Date.now() });
          }
        }

        const info = { name, profilePic, timestamp: Date.now() };
        contactNameCache.set(id, info);
        results[id] = info;

        if (name) {
          log(`Contact ${id.split('@')[0]}: pushname="${name}"`);
        }
      } catch (err) {
        // Cache the failure to avoid retrying immediately
        const info = { name: null, profilePic: null, timestamp: Date.now() };
        contactNameCache.set(id, info);
        results[id] = info;
      }
    });

    await Promise.all(promises);
  }

  return results;
}

// Messages with improved pagination support
// Uses syncHistory() to load older messages and fetches pushnames for group senders
// Parameters:
//   - sync=1: Trigger syncHistory() to load older messages
//   - fetchNames=1: Fetch pushnames for unknown senders (default: true for initial load)
app.get('/api/chats/:id/messages', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const before = req.query.before ? parseInt(req.query.before) : null;
  const timeout = parseInt(req.query.timeout) || 30000;
  const sync = req.query.sync === '1' || req.query.sync === 'true';
  // fetchNames defaults to true for initial loads, false for polling
  const fetchNames = req.query.fetchNames !== '0' && req.query.fetchNames !== 'false';

  log(`Fetching messages for ${chatId} (limit=${limit}, before=${before || 'latest'}, sync=${sync}, fetchNames=${fetchNames})`);

  try {
    // Get chat with timeout
    let chat;
    try {
      log(`Getting chat by ID: ${chatId}`);
      chat = await Promise.race([
        client.getChatById(chatId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout getting chat')), 10000))
      ]);
      if (!chat) {
        throw new Error('Chat not found (null returned)');
      }
    } catch (chatErr) {
      const errMsg = chatErr?.message || String(chatErr) || 'Unknown error';
      log(`Error getting chat ${chatId}:`, errMsg);
      if (chatErr?.stack) log('Stack:', chatErr.stack);
      return res.status(500).json({ error: `Failed to get chat: ${errMsg}` });
    }

    const isGroup = chat.isGroup;
    log(`Chat found: ${chat.name}, isGroup=${isGroup}`);

    // For groups, pre-load participant info from chat.participants (no API calls!)
    // This gives us names and admin status for all group members instantly
    const participantMap = {};
    if (isGroup && chat.participants) {
      for (const p of chat.participants) {
        const id = p.id._serialized || p.id;
        participantMap[id] = {
          isAdmin: p.isAdmin || false,
          isSuperAdmin: p.isSuperAdmin || false,
        };
        // Also update contact cache with any new info
        const cached = contactNameCache.get(id);
        if (!cached) {
          // Pre-populate cache entry (will be enriched with name/pic later if needed)
          contactNameCache.set(id, {
            name: null,
            profilePic: null,
            isAdmin: p.isAdmin,
            isSuperAdmin: p.isSuperAdmin,
            timestamp: Date.now()
          });
        }
      }
      log(`Pre-loaded ${Object.keys(participantMap).length} participant entries for group`);
    }

    // If requesting older messages (before timestamp), try to sync more history first
    // This requests WhatsApp to load more historical messages into the chat
    if ((before || sync) && chat.syncHistory) {
      try {
        log('Syncing chat history to load older messages...');
        await Promise.race([
          chat.syncHistory(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout syncing history')), 15000))
        ]);
        log('History sync completed');
      } catch (syncErr) {
        // Non-fatal - continue with available messages
        log('History sync failed (non-fatal):', syncErr.message);
      }
    }

    // Fetch messages with timeout
    // Request more messages than needed to have buffer for filtering
    let allMessages;
    const fetchLimit = before ? limit * 2 : limit;
    try {
      log(`Fetching up to ${fetchLimit} messages...`);
      allMessages = await Promise.race([
        chat.fetchMessages({ limit: fetchLimit }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching messages')), timeout))
      ]);
      log(`Fetched ${allMessages?.length || 0} raw messages`);
    } catch (msgErr) {
      const errMsg = msgErr?.message || String(msgErr) || 'Unknown error';
      log(`Error fetching messages for ${chatId}:`, errMsg);
      if (msgErr?.stack) log('Stack:', msgErr.stack);
      return res.status(500).json({ error: `Failed to fetch messages: ${errMsg}` });
    }

    if (!allMessages || !Array.isArray(allMessages)) {
      log(`No messages array returned for ${chatId}`);
      return res.json({ messages: [], hasMore: false, oldestTimestamp: null, isGroup });
    }

    // Filter by timestamp if needed
    let messages = allMessages;
    if (before) {
      messages = allMessages.filter(m => m && m.timestamp && m.timestamp < before);
    }

    // Take only requested limit (from the end to get most recent matching)
    messages = messages.slice(-limit);

    const hasMore = messages.length === limit;
    const oldestTimestamp = messages.length > 0 ? messages[0]?.timestamp : null;

    // Collect all mentioned IDs and sender IDs for batch name lookup
    const allContactIds = new Set();
    for (const m of messages) {
      if (m?.mentionedIds?.length) {
        m.mentionedIds.forEach(id => allContactIds.add(id._serialized || id));
      }
      if (isGroup && !m?.fromMe && m?.author) {
        allContactIds.add(m.author);
      }
    }

    // Batch fetch contact info for all senders/mentions
    // This will get pushname (user's self-set name) even for non-contacts
    let contactInfoMap = {};
    if (allContactIds.size > 0) {
      if (fetchNames) {
        // Fetch pushnames from WhatsApp API
        try {
          contactInfoMap = await batchGetContactInfo([...allContactIds], 5);
        } catch (err) {
          log('Batch contact fetch failed:', err.message);
          // Fall back to cache-only on error
          for (const contactId of allContactIds) {
            const cached = contactNameCache.get(contactId);
            if (cached?.name) {
              contactInfoMap[contactId] = cached;
            } else {
              const phone = contactId?.split('@')[0];
              contactInfoMap[contactId] = { name: phone || null, profilePic: null };
            }
          }
        }
      } else {
        // Use cache only (faster for polling)
        for (const contactId of allContactIds) {
          const cached = contactNameCache.get(contactId);
          if (cached?.name) {
            contactInfoMap[contactId] = cached;
          } else {
            const phone = contactId?.split('@')[0];
            contactInfoMap[contactId] = { name: phone || null, profilePic: null };
          }
        }
      }
    }

    // Process messages safely - wrap each in try/catch
    const processedMessages = [];
    for (const m of messages) {
      try {
        if (!m) continue;

        let body = m.body || '';

        // Replace mentions with names
        if (m.mentionedIds?.length && body) {
          for (const mentionId of m.mentionedIds) {
            const id = mentionId._serialized || mentionId;
            const name = contactInfoMap[id]?.name;
            if (name) {
              const phone = id.split('@')[0];
              body = body.replace(new RegExp(`@${phone}\\b`, 'g'), `@${name}`);
            }
          }
        }

        const base = {
          id: m.id,
          msgId: m.id?._serialized || m.id?.id || String(m.id || ''),
          body: body,
          from: m.from || '',
          fromMe: !!m.fromMe,
          timestamp: m.timestamp || 0,
          type: m.type || 'chat',
          hasMedia: !!m.hasMedia,
          mentionedIds: m.mentionedIds?.map(id => id._serialized || id) || [],
        };

        // Add sender info for group messages (not from me)
        if (isGroup && !m.fromMe && m.author) {
          base.senderId = m.author;
          // Use notifyName from message data first (most accurate)
          base.senderName = m._data?.notifyName || contactInfoMap[m.author]?.name || m.author?.split('@')[0] || null;
          base.senderPic = contactInfoMap[m.author]?.profilePic || null;
          // Include admin status from participant map
          if (participantMap[m.author]) {
            base.isAdmin = participantMap[m.author].isAdmin;
            base.isSuperAdmin = participantMap[m.author].isSuperAdmin;
          }
        }

        // Add quoted message info if this is a reply
        if (m.hasQuotedMsg) {
          try {
            const quotedMsg = await m.getQuotedMessage();
            if (quotedMsg) {
              const quotedAuthor = quotedMsg.author || quotedMsg.from;
              const quotedAuthorName = quotedMsg.fromMe
                ? 'You'
                : (quotedMsg._data?.notifyName || contactInfoMap[quotedAuthor]?.name || quotedAuthor?.split('@')[0] || null);

              base.quotedMsg = {
                body: quotedMsg.body || '',
                type: quotedMsg.type || 'chat',
                hasMedia: !!quotedMsg.hasMedia,
                fromMe: !!quotedMsg.fromMe,
                senderName: quotedAuthorName,
              };
            }
          } catch (quotedErr) {
            log('Error fetching quoted message:', quotedErr.message);
          }
        }

        processedMessages.push(base);
      } catch (msgProcessErr) {
        log(`Error processing message:`, msgProcessErr.message);
        // Skip this message but continue with others
      }
    }

    log(`Returning ${processedMessages.length} messages (hasMore=${hasMore})`);
    res.json({
      messages: processedMessages,
      hasMore,
      oldestTimestamp,
      isGroup,
      participantCount: isGroup ? Object.keys(participantMap).length : undefined,
    });
  } catch (err) {
    const errMsg = err?.message || String(err) || 'Unknown error';
    const errStack = err?.stack || '';
    log('Messages endpoint error:', errMsg);
    if (errStack) log('Stack:', errStack);
    res.status(500).json({ error: errMsg });
  }
});

// Send message
app.post('/api/chats/:id/messages', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { msg, quotedMessageId } = req.body;
  if (!msg) {
    return res.status(400).json({ error: 'Message required' });
  }
  try {
    const options = {};
    if (quotedMessageId) {
      options.quotedMessageId = quotedMessageId;
    }
    await client.sendMessage(chatId, msg, options);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark chat as read
app.post('/api/chats/:id/read', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  try {
    log(`Marking chat as read: ${chatId}`);
    const chat = await client.getChatById(chatId);
    await chat.sendSeen();
    res.json({ success: true });
  } catch (err) {
    log('Mark read error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send media (image, video, document, audio)
app.post('/api/chats/:id/media', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { data, mimetype, filename, caption } = req.body;

  if (!data || !mimetype) {
    return res.status(400).json({ error: 'data and mimetype required' });
  }

  try {
    log(`Sending media to ${chatId}: ${mimetype}, ${filename || 'unnamed'}`);

    // Create MessageMedia from base64 data
    // data should be base64 string (without data:mimetype;base64, prefix)
    const base64Data = data.replace(/^data:[^;]+;base64,/, '');
    const media = new MessageMedia(mimetype, base64Data, filename || undefined);

    // Send with optional caption
    const options = caption ? { caption } : {};
    await client.sendMessage(chatId, media, options);

    log('Media sent successfully');
    res.json({ success: true });
  } catch (err) {
    log('Send media error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send media from URL
app.post('/api/chats/:id/media-url', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'Not connected' });
  }
  const chatId = normalizeChatId(req.params.id);
  const { url, caption } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  try {
    log(`Sending media from URL to ${chatId}: ${url}`);

    // Fetch media from URL
    const media = await MessageMedia.fromUrl(url, { unsafeMime: true });

    // Send with optional caption
    const options = caption ? { caption } : {};
    await client.sendMessage(chatId, media, options);

    log('Media from URL sent successfully');
    res.json({ success: true });
  } catch (err) {
    log('Send media URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3008;
server.listen(PORT, '0.0.0.0', () => {
  log(`WhatsApp API running on port ${PORT}`);
  log(`WebSocket server available at ws://0.0.0.0:${PORT}`);
});
