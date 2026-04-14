# Chat App - PRD

## Problem Statement
موقع تواصل محادثات شبيه بالواتساب مع تسجيل دخول ومراسلة

## Architecture
- Backend: FastAPI + MongoDB + Emergent Object Storage
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT httpOnly cookies
- Real-time: Polling every 2-3 seconds

## User Personas
- مستخدمين عاديين يتواصلون عبر الرسائل النصية والملفات

## Core Requirements
- تسجيل دخول/إنشاء حساب
- محادثات فردية بين المستخدمين
- إرسال رسائل نصية
- إرسال صور وملفات
- علامات القراءة
- إشعارات الرسائل

## Implemented (April 14, 2026)
### Phase 1 - MVP
- User auth (register/login/logout) with JWT
- Chat interface (sidebar + chat window)
- Send/receive text messages
- Message timestamps
- Real-time polling
- User online status
- Search users
- Arabic RTL UI

### Phase 2 - New Features
- File & image upload via Emergent Object Storage
- Image preview in chat bubbles
- File download from chat
- Read receipts (✓ sent, ✓✓ delivered, ✓✓ read blue)
- Browser notifications for new messages
- Notification sound
- Unread message count badge

## Prioritized Backlog
### P0 (Done)
- All core features implemented

### P1
- WebSocket for real-time messaging
- Group chats
- Profile picture upload

### P2
- Voice messages
- Message search
- Typing indicator
- Message deletion
- Dark mode
