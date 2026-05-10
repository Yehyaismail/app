// server.js

// ================= تحميل المتغيرات من ملف .env =================
require('dotenv').config();

// ================= استيراد المكتبات الأساسية =================
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const multer = require('multer');
const upload = multer();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ================= إعداد تطبيق Express =================
const app = express();

// تفعيل قراءة JSON من الطلبات
app.use(express.json());

// تفعيل قراءة الكوكيز
app.use(cookieParser());

// ================= إعداد CORS =================
app.use(
  cors({
    origin: [
      'https://app-three-inky-35.vercel.app',
      'http://localhost:3000',
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    credentials: true,
  })
);

// ================= إعداد الاتصال بقاعدة البيانات =================
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key-change-in-production';

// متغيرات خاصة بحساب الأدمن
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let db;

// ================= إعداد التخزين مع Emergent =================
const STORAGE_URL = 'https://integrations.emergentagent.com/objstore/api/v1/storage';
const EMERGENT_KEY = process.env.EMERGENT_LLM_KEY;
const APP_NAME = 'chatapp';

let storageKey = null;

async function initStorage() {
  if (storageKey) return storageKey;

  const resp = await axios.post(
    `${STORAGE_URL}/init`,
    { emergent_key: EMERGENT_KEY },
    { timeout: 30000 }
  );

  storageKey = resp.data.storage_key;
  return storageKey;
}

async function putObject(storagePath, dataBuffer, contentType) {
  const key = await initStorage();

  const resp = await axios.put(
    `${STORAGE_URL}/objects/${storagePath}`,
    dataBuffer,
    {
      headers: {
        'X-Storage-Key': key,
        'Content-Type': contentType,
      },
      timeout: 120000,
    }
  );

  return resp.data;
}

async function getObject(storagePath) {
  const key = await initStorage();

  const resp = await axios.get(`${STORAGE_URL}/objects/${storagePath}`, {
    headers: {
      'X-Storage-Key': key,
      responseType: 'arraybuffer',
      timeout: 60000,
    },
  });

  return {
    content: resp.data,
    contentType: resp.headers['content-type'] || 'application/octet-stream',
  };
}

// ================= دوال التشفير (كلمات المرور) =================
function hashPassword(password) {
  const salt = bcrypt.genSaltSync(10);
  const hashed = bcrypt.hashSync(password, salt);
  return hashed;
}

function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compareSync(plainPassword, hashedPassword);
}

// ================= دوال إنشاء JWT =================
const JWT_ALGORITHM = 'HS256';

function createAccessToken(userId, email) {
  const payload = {
    sub: userId,
    email: email,
    type: 'access',
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: '1h',
  });
}

function createRefreshToken(userId) {
  const payload = {
    sub: userId,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: '7d',
  });
}

// ================= التحقق من البيانات =================
function validateRegister(body) {
  if (!body.name || !body.email || !body.password) {
    return 'الاسم والبريد وكلمة المرور مطلوبة';
  }
  return null;
}

function validateLogin(body) {
  if (!body.email || !body.password) {
    return 'البريد وكلمة المرور مطلوبة';
  }
  return null;
}

// ================= Middleware: getCurrentUser =================
async function getCurrentUser(req, res, next) {
  try {
    let token = req.cookies['access_token'];

    if (!token) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }

    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });

    if (payload.type !== 'access') {
      return res.status(401).json({ detail: 'Invalid token type' });
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(payload.sub) });

    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }

    const safeUser = {
      ...user,
      id: user._id.toString(),
    };
    delete safeUser._id;
    delete safeUser.password_hash;

    req.user = safeUser;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ detail: 'Token expired' });
    }
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

// ================= صلاحيات الأدمن =================
async function getAdminUser(req, res, next) {
  const user = req.user;

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ detail: 'Admin access required' });
  }

  next();
}

// ================= Auth Routes =================
app.post('/api/auth/register', async (req, res) => {
  try {
    const error = validateRegister(req.body);
    if (error) return res.status(400).json({ detail: error });

    const { name, email, password } = req.body;
    const emailLower = email.toLowerCase();

    const existing = await db.collection('users').findOne({ email: emailLower });
    if (existing) {
      return res.status(400).json({ detail: 'Email already registered' });
    }

    const passwordHash = hashPassword(password);

    const userDoc = {
      name,
      email: emailLower,
      password_hash: passwordHash,
      avatar: null,
      online: true,
      last_seen: new Date(),
      created_at: new Date(),
      role: 'user',
    };

    const result = await db.collection('users').insertOne(userDoc);
    const userId = result.insertedId.toString();

    const accessToken = createAccessToken(userId, emailLower);
    const refreshToken = createRefreshToken(userId);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 900000,
      path: '/',
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 604800000,
      path: '/',
    });

    return res.json({
      id: userId,
      name,
      email: emailLower,
      avatar: null,
      online: true,
      role: 'user',
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const error = validateLogin(req.body);
    if (error) return res.status(400).json({ detail: error });

    const { email, password } = req.body;
    const emailLower = email.toLowerCase();

    const user = await db.collection('users').findOne({ email: emailLower });
    if (!user) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    const userId = user._id.toString();

    const accessToken = createAccessToken(userId, emailLower);
    const refreshToken = createRefreshToken(userId);

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { online: true, last_seen: new Date() } }
    );

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 900000,
      path: '/',
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 604800000,
      path: '/',
    });

    return res.json({
      id: userId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      online: true,
      role: user.role || 'user',
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

app.get('/api/auth/me', getCurrentUser, (req, res) => {
  return res.json(req.user);
});

app.post('/api/auth/logout', getCurrentUser, async (req, res) => {
  try {
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { $set: { online: false, last_seen: new Date() } }
    );

    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const token = req.cookies['refresh_token'];
    if (!token) {
      return res.status(401).json({ detail: 'No refresh token' });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    if (payload.type !== 'refresh') {
      return res.status(401).json({ detail: 'Invalid token type' });
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(payload.sub) });
    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }

    const userId = user._id.toString();
    const accessToken = createAccessToken(userId, user.email);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 900000,
      path: '/',
    });

    return res.json({
      id: userId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      online: true,
      role: user.role || 'user',
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ detail: 'Refresh token expired' });
    }
    return res.status(401).json({ detail: 'Invalid refresh token' });
  }
});

// ================= Users =================
app.get('/api/users', getCurrentUser, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const users = await db.collection('users')
      .find(
        { _id: { $ne: new ObjectId(currentUserId) } },
        {
          projection: {
            name: 1,
            email: 1,
            avatar: 1,
            online: 1,
            last_seen: 1,
          },
        }
      )
      .toArray();

    const formatted = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      online: u.online || false,
      last_seen: u.last_seen,
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('Get users error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= إعداد رفع الملفات =================
const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mpeg', 'mpg', '3gp'];

// ================= File Upload =================
app.post('/api/upload', getCurrentUser, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }

    const originalName = file.originalname;
    const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : 'bin';

    const fileId = crypto.randomUUID();
    const fileName = `${fileId}.${ext}`;
    const storagePath = `uploads/${req.user.id}/${fileName}`;

    let category = 'file';
    if (imageExts.includes(ext)) category = 'image';
    else if (videoExts.includes(ext)) category = 'video';

    const userFolder = path.join(__dirname, 'uploads', req.user.id);

    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }

    const fullPath = path.join(userFolder, fileName);
    fs.writeFileSync(fullPath, file.buffer);

    const fileDoc = {
      file_id: fileId,
      storage_path: storagePath,
      original_filename: originalName,
      content_type: file.mimetype,
      size: file.size,
      category,
      uploader_id: req.user.id,
      is_deleted: false,
      created_at: new Date(),
    };

    await db.collection('files').insertOne(fileDoc);

    return res.json({
      file_id: fileId,
      storage_path: storagePath,
      original_filename: originalName,
      content_type: file.mimetype,
      category,
      size: file.size,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= File Download =================
app.get('/api/files/:path(*)', getCurrentUser, async (req, res) => {
  try {
    const filePathParam = req.params.path;

    const record = await db.collection('files').findOne({
      storage_path: filePathParam,
      is_deleted: false,
    });

    if (!record) {
      return res.status(404).json({ detail: 'File not found' });
    }

    const fullPath = path.join(__dirname, filePathParam);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ detail: 'File not found' });
    }

    res.setHeader('Content-Type', record.content_type);
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Send Message =================
app.post('/api/messages', getCurrentUser, async (req, res) => {
  try {
    const data = req.body;

    const messageDoc = {
      sender_id: new ObjectId(req.user.id),
      receiver_id: new ObjectId(data.receiver_id),
      text: data.text,
      message_type: data.message_type || 'text',
      file_url: data.file_url,
      file_name: data.file_name,
      file_type: data.file_type,
      reply_to: data.reply_to,
      timestamp: new Date(),
      status: 'sent',
      edited: false,
      deleted: false,
      reactions: {},
    };

    const result = await db.collection('messages').insertOne(messageDoc);

    return res.json({
      id: result.insertedId.toString(),
      sender_id: req.user.id,
      receiver_id: data.receiver_id,
      text: data.text,
      message_type: data.message_type,
      file_url: data.file_url,
      file_name: data.file_name,
      file_type: data.file_type,
      reply_to: data.reply_to,
      timestamp: messageDoc.timestamp,
      status: 'sent',
      edited: false,
      deleted: false,
      reactions: {},
    });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Get Messages =================
app.get('/api/messages/:otherUserId', getCurrentUser, async (req, res) => {
  try {
    const otherUserId = req.params.otherUserId;
    const after = req.query.after;

    const currentUserOid = new ObjectId(req.user.id);
    const otherUserOid = new ObjectId(otherUserId);

    const query = {
      $or: [
        { sender_id: currentUserOid, receiver_id: otherUserOid },
        { sender_id: otherUserOid, receiver_id: currentUserOid },
      ],
      hidden_for: { $nin: [req.user.id] },
    };

    if (after) {
      try {
        query._id = { $gt: new ObjectId(after) };
      } catch {}
    }

    let cursor = db.collection('messages').find(query).sort({ timestamp: 1 });

    if (!after) cursor = cursor.limit(200);

    const messages = await cursor.toArray();

    await db.collection('messages').updateMany(
      {
        sender_id: otherUserOid,
        receiver_id: currentUserOid,
        status: { $ne: 'read' },
      },
      { $set: { status: 'read' } }
    );

    const result = messages.map((msg) => {
      if (msg.deleted) {
        return {
          id: msg._id.toString(),
          sender_id: msg.sender_id.toString(),
          receiver_id: msg.receiver_id.toString(),
          text: 'تم حذف هذه الرسالة',
          message_type: 'text',
          file_url: null,
          file_name: null,
          file_type: null,
          reply_to: msg.reply_to,
          timestamp: msg.timestamp,
          status: msg.status || 'sent',
          edited: false,
          deleted: true,
          reactions: {},
        };
      }

      return {
        id: msg._id.toString(),
        sender_id: msg.sender_id.toString(),
        receiver_id: msg.receiver_id.toString(),
        text: msg.text || '',
        message_type: msg.message_type || 'text',
        file_url: msg.file_url,
        file_name: msg.file_name,
        file_type: msg.file_type,
        reply_to: msg.reply_to,
        timestamp: msg.timestamp,
        status: msg.status || 'sent',
        edited: msg.edited || false,
        deleted: false,
        reactions: msg.reactions || {},
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Edit Message =================
app.put('/api/messages/:messageId', getCurrentUser, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const data = req.body;

    const msg = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    if (!msg) return res.status(404).json({ detail: 'Message not found' });
    if (msg.sender_id.toString() !== req.user.id)
      return res.status(403).json({ detail: 'Can only edit your own messages' });
    if (msg.deleted)
      return res.status(400).json({ detail: 'Cannot edit deleted message' });

    await db.collection('messages').updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { text: data.text, edited: true } }
    );

    return res.json({ message: 'Message edited', id: messageId, text: data.text, edited: true });
  } catch (err) {
    console.error('Edit message error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Delete Message =================
app.delete('/api/messages/:messageId', getCurrentUser, async (req, res) => {
  try {
    const messageId = req.params.messageId;

    const msg = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    if (!msg) return res.status(404).json({ detail: 'Message not found' });
    if (msg.sender_id.toString() !== req.user.id)
      return res.status(403).json({ detail: 'Can only delete your own messages' });

    await db.collection('messages').updateOne(
      { _id: new ObjectId(messageId) },
      {
        $set: {
          deleted: true,
          text: '',
          file_url: null,
          file_name: null,
          file_type: null,
          message_type: 'text',
        },
      }
    );

    return res.json({ message: 'Message deleted', id: messageId });
  } catch (err) {
    console.error('Delete message error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= React to Message =================
app.post('/api/messages/:messageId/react', getCurrentUser, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const { emoji } = req.body;

    const msg = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    if (!msg) return res.status(404).json({ detail: 'Message not found' });
    if (msg.deleted) return res.status(400).json({ detail: 'Cannot react to deleted message' });

    const userId = req.user.id;
    const reactions = msg.reactions || {};

    if (reactions[userId] === emoji) {
      delete reactions[userId];
    } else {
      reactions[userId] = emoji;
    }

    await db.collection('messages').updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { reactions } }
    );

    return res.json({ message: 'Reaction updated', id: messageId, reactions });
  } catch (err) {
    console.error('Reaction error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Clear Conversation =================
app.delete('/api/messages/conversation/:otherUserId', getCurrentUser, async (req, res) => {
  try {
    const otherUserId = req.params.otherUserId;

    const currentUserOid = new ObjectId(req.user.id);
    const otherUserOid = new ObjectId(otherUserId);

    const result = await db.collection('messages').deleteMany({
      $or: [
        { sender_id: currentUserOid, receiver_id: otherUserOid },
        { sender_id: otherUserOid, receiver_id: currentUserOid },
      ],
    });

    return res.json({ message: 'Conversation cleared', deleted_count: result.deletedCount });
  } catch (err) {
    console.error('Clear conversation error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Nicknames =================
app.put('/api/nicknames/:otherUserId', getCurrentUser, async (req, res) => {
  try {
    const otherUserId = req.params.otherUserId;
    const { nickname } = req.body;

    await db.collection('nicknames').updateOne(
      { user_id: req.user.id, other_user_id: otherUserId },
      {
        $set: {
          user_id: req.user.id,
          other_user_id: otherUserId,
          nickname,
        },
      },
      { upsert: true }
    );

    return res.json({ message: 'Nickname updated', nickname });
  } catch (err) {
    console.error('Set nickname error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

app.delete('/api/nicknames/:otherUserId', getCurrentUser, async (req, res) => {
  try {
    const otherUserId = req.params.otherUserId;

    await db.collection('nicknames').deleteOne({
      user_id: req.user.id,
      other_user_id: otherUserId,
    });

    return res.json({ message: 'Nickname removed' });
  } catch (err) {
    console.error('Remove nickname error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

app.get('/api/nicknames', getCurrentUser, async (req, res) => {
  try {
    const cursor = db.collection('nicknames').find(
      { user_id: req.user.id },
      { projection: { _id: 0, other_user_id: 1, nickname: 1 } }
    );

    const result = {};
    const docs = await cursor.toArray();

    for (const doc of docs) {
      result[doc.other_user_id] = doc.nickname;
    }

    return res.json(result);
  } catch (err) {
    console.error('Get nicknames error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Delete for me / for all =================
app.post('/api/messages/:messageId/delete', getCurrentUser, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const { mode } = req.body;

    const msg = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });
    if (!msg) return res.status(404).json({ detail: 'Message not found' });

    if (mode === 'for_me') {
      const hiddenFor = msg.hidden_for || [];
      if (!hiddenFor.includes(req.user.id)) hiddenFor.push(req.user.id);

      await db.collection('messages').updateOne(
        { _id: new ObjectId(messageId) },
        { $set: { hidden_for: hiddenFor } }
      );

      return res.json({ message: 'Message hidden for you', id: messageId });
    } else if (mode === 'for_all') {
      if (msg.sender_id.toString() !== req.user.id) {
        return res.status(403).json({
          detail: 'Can only delete your own messages for everyone',
        });
      }

      await db.collection('messages').updateOne(
        { _id: new ObjectId(messageId) },
        {
          $set: {
            deleted: true,
            text: '',
            file_url: null,
            file_name: null,
            file_type: null,
            message_type: 'text',
          },
        }
      );

      return res.json({ message: 'Message deleted for everyone', id: messageId });
    }

    return res.status(400).json({ detail: 'Invalid mode' });
  } catch (err) {
    console.error('Delete mode error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Export Chat HTML =================
app.get('/api/messages/:otherUserId/export', getCurrentUser, async (req, res) => {
  try {
    const otherUserId = req.params.otherUserId;

    const currentUserOid = new ObjectId(req.user.id);
    const otherUserOid = new ObjectId(otherUserId);

    const otherUser = await db.collection('users').findOne(
      { _id: otherUserOid },
      { projection: { name: 1 } }
    );

    const otherName = otherUser ? otherUser.name : 'مستخدم';

    const messages = await db.collection('messages')
      .find({
        $or: [
          { sender_id: currentUserOid, receiver_id: otherUserOid },
          { sender_id: otherUserOid, receiver_id: currentUserOid },
        ],
        hidden_for: { $nin: [req.user.id] },
        deleted: { $ne: true },
      })
      .sort({ timestamp: 1 })
      .limit(5000)
      .toArray();

    const now = new Date();
    const exportTime = now.toISOString().slice(0, 16).replace('T', ' ');

    let html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><style>
body { font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f8fafc; direction: rtl; }
h1 { text-align: center; color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
.info { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 20px; }
.msg { margin: 8px 0; padding: 10px 14px; border-radius: 12px; max-width: 80%; }
.sent { background: #d1fae5; margin-left: auto; margin-right: 0; text-align: right; }
.received { background: #ffffff; border: 1px solid #e2e8f0; margin-right: auto; margin-left: 0; text-align: right; }
.sender { font-weight: 600; font-size: 12px; color: #059669; margin-bottom: 2px; }
.text { font-size: 14px; color: #1e293b; white-space: pre-wrap; }
.time { font-size: 11px; color: #94a3b8; margin-top: 4px; }
.file { color: #3b82f6; font-size: 13px; }
</style></head>
<body>
<h1>محادثة مع ${otherName}</h1>
<p class="info">تصدير بتاريخ ${exportTime}</p>
`;

    for (const msg of messages) {
      const isOwn = msg.sender_id.toString() === currentUserOid.toString();
      const cls = isOwn ? 'sent' : 'received';
      const sender = isOwn ? (req.user.name || 'أنا') : otherName;

      let ts = '';
      if (msg.timestamp instanceof Date) {
        const d = msg.timestamp;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        ts = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
      }

      let text = msg.text || '';
      const mt = msg.message_type || 'text';

      if (mt === 'voice') text = 'رسالة صوتية';
      else if (mt === 'image') text = 'صورة';
      else if (mt === 'file') text = `ملف: ${msg.file_name || ''}`;

      html += `<div class="msg ${cls}"><div class="sender">${sender}</div><div class="text">${text}</div><div class="time">${ts}</div></div>\n`;
    }

    html += '</body></html>';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=chat_export.html');
    return res.send(html);
  } catch (err) {
    console.error('Export chat error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Conversation Routes =================
app.get('/api/conversations', getCurrentUser, async (req, res) => {
  try {
    const currentUserOid = new ObjectId(req.user.id);

    await db.collection('messages').updateMany(
      { receiver_id: currentUserOid, status: 'sent' },
      { $set: { status: 'delivered' } }
    );

    const pipeline = [
      {
        $match: {
          $or: [
            { sender_id: currentUserOid },
            { receiver_id: currentUserOid },
          ],
        },
      },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender_id', currentUserOid] },
              '$receiver_id',
              '$sender_id',
            ],
          },
          last_message: { $first: '$text' },
          last_message_type: { $first: '$message_type' },
          last_message_time: { $first: '$timestamp' },
        },
      },
    ];

    const conversations = await db.collection('messages')
      .aggregate(pipeline)
      .toArray();

    if (!conversations || conversations.length === 0) {
      return res.json([]);
    }

    const otherUserIds = conversations.map((c) => c._id);

    const usersCursor = db.collection('users').find(
      { _id: { $in: otherUserIds } },
      {
        projection: {
          name: 1,
          email: 1,
          avatar: 1,
          online: 1,
          last_seen: 1,
        },
      }
    );

    const usersArr = await usersCursor.toArray();
    const usersMap = {};
    for (const u of usersArr) {
      usersMap[u._id.toString()] = u;
    }

    const unreadPipeline = [
      {
        $match: {
          receiver_id: currentUserOid,
          sender_id: { $in: otherUserIds },
          status: { $ne: 'read' },
        },
      },
      {
        $group: {
          _id: '$sender_id',
          count: { $sum: 1 },
        },
      },
    ];

    const unreadDocs = await db.collection('messages')
      .aggregate(unreadPipeline)
      .toArray();

    const unreadMap = {};
    for (const doc of unreadDocs) {
      unreadMap[doc._id.toString()] = doc.count;
    }

    const result = [];

    for (const conv of conversations) {
      const otherIdStr = conv._id.toString();
      const otherUser = usersMap[otherIdStr];
      if (!otherUser) continue;

      let lastMsgText = conv.last_message || '';
      const lastMsgType = conv.last_message_type || 'text';

      if (lastMsgType === 'image') lastMsgText = 'صورة';
      else if (lastMsgType === 'file') lastMsgText = 'ملف';
      else if (lastMsgType === 'voice') lastMsgText = 'رسالة صوتية';

      result.push({
        id: otherIdStr,
        other_user: {
          id: otherUser._id.toString(),
          name: otherUser.name,
          email: otherUser.email,
          avatar: otherUser.avatar,
          online: otherUser.online || false,
          last_seen: otherUser.last_seen,
        },
        last_message: lastMsgText,
        last_message_time: conv.last_message_time,
        unread_count: unreadMap[otherIdStr] || 0,
      });
    }

    result.sort((a, b) => {
      const ta = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const tb = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return tb - ta;
    });

    return res.json(result);
  } catch (err) {
    console.error('Get conversations error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Typing Indicator =================
app.post('/api/typing', getCurrentUser, async (req, res) => {
  try {
    const { receiver_id, is_typing } = req.body;

    await db.collection('typing_status').updateOne(
      { user_id: req.user.id, receiver_id },
      {
        $set: {
          user_id: req.user.id,
          receiver_id,
          is_typing: !!is_typing,
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('Typing update error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

app.get('/api/typing/:otherUserId', getCurrentUser, async (req, res) => {
  try {
    const otherUserId = req.params.otherUserId;

    const status = await db.collection('typing_status').findOne(
      { user_id: otherUserId, receiver_id: req.user.id },
      { projection: { _id: 0 } }
    );

    if (!status) return res.json({ is_typing: false });

    if (status.updated_at instanceof Date) {
      const diffSec = (Date.now() - status.updated_at.getTime()) / 1000;
      if (diffSec > 5) return res.json({ is_typing: false });
    }

    return res.json({ is_typing: !!status.is_typing });
  } catch (err) {
    console.error('Get typing status error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Admin: Get Users =================
app.get('/api/admin/users', getCurrentUser, getAdminUser, async (req, res) => {
  try {
    const users = await db.collection('users')
      .find(
        {},
        {
          projection: {
            name: 1,
            email: 1,
            online: 1,
            last_seen: 1,
            created_at: 1,
            role: 1,
          },
        }
      )
      .limit(500)
      .toArray();

    if (!users || users.length === 0) return res.json([]);

    const userOids = users.map((u) => u._id);

    const countPipeline = [
      {
        $match: {
          $or: [
            { sender_id: { $in: userOids } },
            { receiver_id: { $in: userOids } },
          ],
        },
      },
      {
        $project: {
          user: {
            $cond: [
              { $in: ['$sender_id', userOids] },
              '$sender_id',
              '$receiver_id',
            ],
          },
        },
      },
      {
        $group: {
          _id: '$user',
          count: { $sum: 1 },
        },
      },
    ];

    const counts = await db.collection('messages')
      .aggregate(countPipeline)
      .toArray();

    const msgCountMap = {};
    for (const doc of counts) {
      msgCountMap[doc._id.toString()] = doc.count;
    }

    const result = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      online: u.online || false,
      last_seen: u.last_seen,
      created_at: u.created_at,
      role: u.role || 'user',
      message_count: msgCountMap[u._id.toString()] || 0,
    }));

    return res.json(result);
  } catch (err) {
    console.error('Admin get users error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Admin: Delete User =================
app.delete('/api/admin/users/:userId', getCurrentUser, getAdminUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (userId === req.user.id) {
      return res.status(400).json({ detail: 'Cannot delete yourself' });
    }

    const targetUser = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!targetUser) return res.status(404).json({ detail: 'User not found' });

    if (targetUser.role === 'admin') {
      return res.status(400).json({ detail: 'Cannot delete admin users' });
    }

    const userOid = new ObjectId(userId);

    await db.collection('messages').deleteMany({
      $or: [{ sender_id: userOid }, { receiver_id: userOid }],
    });

    await db.collection('typing_status').deleteMany({
      $or: [{ user_id: userId }, { receiver_id: userId }],
    });

    await db.collection('users').deleteOne({ _id: userOid });

    return res.json({ message: 'User deleted successfully', deleted_user_id: userId });
  } catch (err) {
    console.error('Admin delete user error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= Admin: Stats =================
app.get('/api/admin/stats', getCurrentUser, getAdminUser, async (req, res) => {
  try {
    const totalUsers = await db.collection('users').countDocuments({});
    const onlineUsers = await db.collection('users').countDocuments({ online: true });
    const totalMessages = await db.collection('messages').countDocuments({});
    const totalFiles = await db.collection('files').countDocuments({ is_deleted: false });

    return res.json({
      total_users: totalUsers,
      online_users: onlineUsers,
      total_messages: totalMessages,
      total_files: totalFiles,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ detail: 'Server error' });
  }
});

// ================= إنشاء الفهارس (Indexes) + إنشاء الأدمن =================
async function initIndexes() {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('messages').createIndex(
    { sender_id: 1, receiver_id: 1, timestamp: -1 }
  );
  await db.collection('messages').createIndex(
    { receiver_id: 1, status: 1 }
  );
  await db.collection('messages').createIndex({ timestamp: 1 });
  await db.collection('typing_status').createIndex(
    { user_id: 1, receiver_id: 1 }
  );
  await db.collection('nicknames').createIndex(
    { user_id: 1, other_user_id: 1 },
    { unique: true }
  );
  await db.collection('files').createIndex({ storage_path: 1 });
}

async function initAdminUser() {
  const adminEmail = ADMIN_EMAIL;
  const adminPassword = ADMIN_PASSWORD;

  const existingAdmin = await db.collection('users').findOne({ email: adminEmail });

  if (!existingAdmin) {
    const hashed = hashPassword(adminPassword);
    await db.collection('users').insertOne({
      email: adminEmail,
      password_hash: hashed,
      name: 'Admin',
      avatar: null,
      online: false,
      role: 'admin',
      created_at: new Date(),
    });
    console.log(`✅ Admin user created: ${adminEmail}`);
  } else {
    console.log('✅ Admin user already exists');
  }
}

async function initDatabase() {
  await initIndexes();
  await initAdminUser();
}

// ================= اتصال MongoDB وتشغيل السيرفر =================
async function connectToDatabase() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('✅ Connected to MongoDB:', DB_NAME);

  await initDatabase();
}

connectToDatabase().catch((err) => {
  console.error('❌ Error connecting to MongoDB:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
