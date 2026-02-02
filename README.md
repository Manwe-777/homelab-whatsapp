# Homelab WhatsApp

A self-hosted WhatsApp Web client with REST API for homelab use. Built with [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

## Features

- **Web Interface**: Clean, responsive chat UI built with Next.js
- **REST API**: Full API for automation, integrations, and custom clients
- **Real-time Updates**: WebSocket support for instant message notifications
- **Group Management**: View participants, invite links, admin controls
- **Message Search**: Search across all chats or specific conversations
- **Media Support**: Send and receive images, videos, documents
- **Docker Ready**: Easy deployment with Docker Compose

## Use Cases

- Access WhatsApp from any device on your network
- Embed in dashboards (Glance, Homepage, Heimdall, etc.)
- Build automations with the REST API
- Monitor group activity
- Backup/archive conversations

## Quick Start

### 1. Configure

Copy the example environment file and edit if needed:

```bash
cp .env.example .env
```

Edit `docker-compose.yml` and set `NEXT_PUBLIC_API_URL` to your server's IP:

```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://192.168.1.100:3008
```

### 2. Start

```bash
docker compose up -d
```

### 3. Link WhatsApp

1. Open `http://your-server-ip:3009` in a browser
2. Scan the QR code with WhatsApp: **Settings → Linked Devices → Link a Device**
3. Once connected, your chats will appear

## API Endpoints

### Status & Auth
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Connection status |
| `/api/qr` | GET | QR code for linking |
| `/api/pairing-code` | POST | Request 8-digit pairing code |

### Chats
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chats` | GET | List chats (`?type=group\|direct&limit=50`) |
| `/api/chats/:id/messages` | GET | Get messages (`?limit=20&sync=1&fetchNames=1`) |
| `/api/chats/:id/messages` | POST | Send message |
| `/api/chats/:id/media` | POST | Send media |
| `/api/chats/:id/read` | POST | Mark as read |

### Groups
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/groups/:id` | GET | Group info (`?fetchNames=1` for participant names) |
| `/api/groups/:id/invite-code` | GET | Get invite link |
| `/api/groups/:id/leave` | POST | Leave group |
| `/api/groups/:id/participants` | POST | Add participants |
| `/api/groups/:id/participants` | DELETE | Remove participants |
| `/api/groups/:id/promote` | POST | Promote to admin |
| `/api/groups/:id/demote` | POST | Demote from admin |

### Search & Media
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/messages/search` | GET | Search messages (`?query=...&chatId=...`) |
| `/api/media/:chatId/:msgId` | GET | Download media |
| `/api/profile-pic/:id` | GET | Get profile picture |

### Stats
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Unread counts for dashboard widgets |

## WebSocket

Connect to `ws://your-server-ip:3008` for real-time events:

- `message` - New incoming message
- `message_sent` - Outgoing message confirmed
- `message_ack` - Delivery/read receipts
- `status` - Connection status changes

## Local Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:3008` for local development.

## Session Persistence

The WhatsApp session is stored in the `whatsapp_auth` Docker volume. You only need to scan the QR code once; the session persists across restarts.

## Troubleshooting

### WhatsApp refuses to link

1. **Clear session**:
   ```bash
   docker compose down
   docker volume rm homelab-whatsapp_whatsapp_auth
   docker compose up -d
   ```

2. **Try pairing code**: In WhatsApp settings, choose "Link with phone number instead"

3. **Check device limit**: Unlink old devices in WhatsApp settings

4. **Wait**: WhatsApp may temporarily block linking; retry later

### View logs

```bash
docker compose logs -f whatsapp-api
```

### Debug browser

Visit `/api/screenshot` to see what the headless browser sees.

## Disclaimer

This project uses an unofficial WhatsApp Web client. WhatsApp does not officially support third-party clients or automation. Use at your own risk and responsibility. This project is not affiliated with WhatsApp or Meta.
