# Chat App - PRD

## Problem Statement
موقع تواصل محادثات شبيه بالواتساب مع تسجيل دخول ومراسلة

## Architecture
- Backend: FastAPI + MongoDB + Emergent Object Storage
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT httpOnly cookies with refresh tokens
- Real-time: Polling every 2-3 seconds

## Implemented (April 14, 2026)
### Phase 1 - MVP
- User auth (register/login/logout/refresh) with JWT
- Chat interface (sidebar + chat window)
- Send/receive text messages with timestamps
- Real-time polling, User online status, Search users

### Phase 2 - File & Notifications
- File & image upload via Emergent Object Storage
- Image preview in chat, File download
- Read receipts (✓ sent, ✓✓ delivered, ✓✓ read blue)
- Browser notifications + sound + unread badge

### Phase 3 - Admin & Typing
- Admin panel (/admin) with stats dashboard
- User management (view all users, delete non-admin users)
- Delete user cascade (removes messages)
- Typing indicator (يكتب الآن...)
- Token refresh endpoint

## Prioritized Backlog
### P1
- WebSocket for real-time messaging
- Group chats
- Profile picture upload

### P2
- Voice messages
- Message search, Message deletion
- Dark mode
