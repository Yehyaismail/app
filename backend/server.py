from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query
from fastapi.responses import Response as FastAPIResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import uuid
import requests as http_requests

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# JWT Configuration
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "default-secret-key-change-in-production")

# ===================== Object Storage =====================
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "chatapp"
storage_key = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = http_requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = http_requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = http_requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ===================== Password Hashing =====================
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# ===================== JWT Token =====================
def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# ===================== Auth Dependency =====================
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ===================== Pydantic Models =====================
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class MessageCreate(BaseModel):
    receiver_id: str
    text: str
    message_type: str = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    reply_to: Optional[str] = None

class MessageEdit(BaseModel):
    text: str

class ReactionUpdate(BaseModel):
    emoji: str

class TypingUpdate(BaseModel):
    receiver_id: str
    is_typing: bool

class NicknameUpdate(BaseModel):
    nickname: str

class DeleteMode(BaseModel):
    mode: str  # "for_me" or "for_all"

# ===================== Admin Dependency =====================
async def get_admin_user(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ===================== Auth Routes =====================
@api_router.post("/auth/register")
async def register(data: RegisterRequest, response: Response):
    email_lower = data.email.lower()
    existing = await db.users.find_one({"email": email_lower})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    password_hash = hash_password(data.password)
    user_doc = {
        "name": data.name,
        "email": email_lower,
        "password_hash": password_hash,
        "avatar": None,
        "online": True,
        "last_seen": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email_lower)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {"id": user_id, "name": data.name, "email": email_lower, "avatar": None, "online": True, "role": "user"}

@api_router.post("/auth/login")
async def login(data: LoginRequest, response: Response):
    email_lower = data.email.lower()
    user = await db.users.find_one({"email": email_lower})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email_lower)
    refresh_token = create_refresh_token(user_id)
    
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"online": True, "last_seen": datetime.now(timezone.utc)}})
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {"id": user_id, "name": user["name"], "email": user["email"], "avatar": user.get("avatar"), "online": True, "role": user.get("role", "user")}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@api_router.post("/auth/logout")
async def logout(response: Response, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {"online": False, "last_seen": datetime.now(timezone.utc)}}
    )
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
        return {"id": user_id, "name": user["name"], "email": user["email"], "avatar": user.get("avatar"), "online": True, "role": user.get("role", "user")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ===================== User Routes =====================
@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    users_cursor = db.users.find(
        {"_id": {"$ne": ObjectId(current_user["id"])}},
        {"_id": 1, "name": 1, "email": 1, "avatar": 1, "online": 1, "last_seen": 1}
    )
    users = await users_cursor.to_list(100)
    return [
        {
            "id": str(u["_id"]),
            "name": u["name"],
            "email": u["email"],
            "avatar": u.get("avatar"),
            "online": u.get("online", False),
            "last_seen": u.get("last_seen")
        }
        for u in users
    ]

# ===================== File Upload =====================
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{current_user['id']}/{file_id}.{ext}"
    
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    
    result = put_object(path, data, content_type)
    
    # Determine file category
    image_exts = {"jpg", "jpeg", "png", "gif", "webp"}
    file_category = "image" if ext in image_exts else "file"
    
    # Store file reference in DB
    file_doc = {
        "file_id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "category": file_category,
        "uploader_id": current_user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.files.insert_one(file_doc)
    
    return {
        "file_id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "category": file_category,
        "size": result.get("size", len(data))
    }

@api_router.get("/files/{path:path}")
async def download_file(path: str, current_user: dict = Depends(get_current_user)):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(path)
    return FastAPIResponse(content=data, media_type=record.get("content_type", content_type))

# ===================== Message Routes =====================
@api_router.post("/messages")
async def send_message(data: MessageCreate, current_user: dict = Depends(get_current_user)):
    message_doc = {
        "sender_id": ObjectId(current_user["id"]),
        "receiver_id": ObjectId(data.receiver_id),
        "text": data.text,
        "message_type": data.message_type,
        "file_url": data.file_url,
        "file_name": data.file_name,
        "file_type": data.file_type,
        "reply_to": data.reply_to,
        "timestamp": datetime.now(timezone.utc),
        "status": "sent",
        "edited": False,
        "deleted": False,
        "reactions": {}
    }
    result = await db.messages.insert_one(message_doc)
    
    return {
        "id": str(result.inserted_id),
        "sender_id": current_user["id"],
        "receiver_id": data.receiver_id,
        "text": data.text,
        "message_type": data.message_type,
        "file_url": data.file_url,
        "file_name": data.file_name,
        "file_type": data.file_type,
        "reply_to": data.reply_to,
        "timestamp": message_doc["timestamp"],
        "status": "sent",
        "edited": False,
        "deleted": False,
        "reactions": {}
    }

@api_router.get("/messages/{other_user_id}")
async def get_messages(other_user_id: str, after: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    other_user_oid = ObjectId(other_user_id)
    
    query = {
        "$or": [
            {"sender_id": current_user_oid, "receiver_id": other_user_oid},
            {"sender_id": other_user_oid, "receiver_id": current_user_oid}
        ],
        "hidden_for": {"$nin": [current_user["id"]]}
    }
    
    # If 'after' param given, only fetch newer messages
    if after:
        try:
            query["_id"] = {"$gt": ObjectId(after)}
        except Exception:
            pass
    
    messages_cursor = db.messages.find(query).sort("timestamp", 1)
    if not after:
        messages_cursor = messages_cursor.limit(200)
    
    messages = await messages_cursor.to_list(1000)
    
    # Mark incoming messages as read
    await db.messages.update_many(
        {"sender_id": other_user_oid, "receiver_id": current_user_oid, "status": {"$ne": "read"}},
        {"$set": {"status": "read"}}
    )
    
    result = []
    for msg in messages:
        if msg.get("deleted"):
            result.append({
                "id": str(msg["_id"]),
                "sender_id": str(msg["sender_id"]),
                "receiver_id": str(msg["receiver_id"]),
                "text": "تم حذف هذه الرسالة",
                "message_type": "text",
                "file_url": None, "file_name": None, "file_type": None,
                "reply_to": msg.get("reply_to"),
                "timestamp": msg["timestamp"],
                "status": msg.get("status", "sent"),
                "edited": False, "deleted": True,
                "reactions": {}
            })
        else:
            result.append({
                "id": str(msg["_id"]),
                "sender_id": str(msg["sender_id"]),
                "receiver_id": str(msg["receiver_id"]),
                "text": msg.get("text", ""),
                "message_type": msg.get("message_type", "text"),
                "file_url": msg.get("file_url"),
                "file_name": msg.get("file_name"),
                "file_type": msg.get("file_type"),
                "reply_to": msg.get("reply_to"),
                "timestamp": msg["timestamp"],
                "status": msg.get("status", "sent"),
                "edited": msg.get("edited", False),
                "deleted": False,
                "reactions": msg.get("reactions", {})
            })
    return result

@api_router.put("/messages/{message_id}")
async def edit_message(message_id: str, data: MessageEdit, current_user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if str(msg["sender_id"]) != current_user["id"]:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")
    if msg.get("deleted"):
        raise HTTPException(status_code=400, detail="Cannot edit deleted message")
    
    await db.messages.update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"text": data.text, "edited": True}}
    )
    return {"message": "Message edited", "id": message_id, "text": data.text, "edited": True}

@api_router.delete("/messages/{message_id}")
async def delete_message_legacy(message_id: str, current_user: dict = Depends(get_current_user)):
    """Legacy delete - defaults to delete for all"""
    msg = await db.messages.find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if str(msg["sender_id"]) != current_user["id"]:
        raise HTTPException(status_code=403, detail="Can only delete your own messages")
    await db.messages.update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"deleted": True, "text": "", "file_url": None, "file_name": None, "file_type": None, "message_type": "text"}}
    )
    return {"message": "Message deleted", "id": message_id}

@api_router.post("/messages/{message_id}/react")
async def react_to_message(message_id: str, data: ReactionUpdate, current_user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.get("deleted"):
        raise HTTPException(status_code=400, detail="Cannot react to deleted message")
    
    user_id = current_user["id"]
    reactions = msg.get("reactions", {})
    
    # Toggle: if user already reacted with same emoji, remove it
    if reactions.get(user_id) == data.emoji:
        reactions.pop(user_id, None)
    else:
        reactions[user_id] = data.emoji
    
    await db.messages.update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"reactions": reactions}}
    )
    return {"message": "Reaction updated", "id": message_id, "reactions": reactions}

@api_router.delete("/messages/conversation/{other_user_id}")
async def clear_conversation(other_user_id: str, current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    other_user_oid = ObjectId(other_user_id)
    
    result = await db.messages.delete_many({
        "$or": [
            {"sender_id": current_user_oid, "receiver_id": other_user_oid},
            {"sender_id": other_user_oid, "receiver_id": current_user_oid}
        ]
    })
    return {"message": "Conversation cleared", "deleted_count": result.deleted_count}

# ===================== Nicknames =====================
@api_router.put("/nicknames/{other_user_id}")
async def set_nickname(other_user_id: str, data: NicknameUpdate, current_user: dict = Depends(get_current_user)):
    await db.nicknames.update_one(
        {"user_id": current_user["id"], "other_user_id": other_user_id},
        {"$set": {"user_id": current_user["id"], "other_user_id": other_user_id, "nickname": data.nickname}},
        upsert=True
    )
    return {"message": "Nickname updated", "nickname": data.nickname}

@api_router.delete("/nicknames/{other_user_id}")
async def remove_nickname(other_user_id: str, current_user: dict = Depends(get_current_user)):
    await db.nicknames.delete_one({"user_id": current_user["id"], "other_user_id": other_user_id})
    return {"message": "Nickname removed"}

@api_router.get("/nicknames")
async def get_nicknames(current_user: dict = Depends(get_current_user)):
    cursor = db.nicknames.find({"user_id": current_user["id"]}, {"_id": 0, "other_user_id": 1, "nickname": 1})
    result = {}
    async for doc in cursor:
        result[doc["other_user_id"]] = doc["nickname"]
    return result

# ===================== Delete for me / for all =====================
@api_router.post("/messages/{message_id}/delete")
async def delete_message_mode(message_id: str, data: DeleteMode, current_user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if data.mode == "for_me":
        # Add current user to hidden_for list
        hidden_for = msg.get("hidden_for", [])
        if current_user["id"] not in hidden_for:
            hidden_for.append(current_user["id"])
        await db.messages.update_one({"_id": ObjectId(message_id)}, {"$set": {"hidden_for": hidden_for}})
        return {"message": "Message hidden for you", "id": message_id}
    
    elif data.mode == "for_all":
        if str(msg["sender_id"]) != current_user["id"]:
            raise HTTPException(status_code=403, detail="Can only delete your own messages for everyone")
        await db.messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"deleted": True, "text": "", "file_url": None, "file_name": None, "file_type": None, "message_type": "text"}}
        )
        return {"message": "Message deleted for everyone", "id": message_id}
    
    raise HTTPException(status_code=400, detail="Invalid mode")

# ===================== Export Chat PDF =====================
@api_router.get("/messages/{other_user_id}/export")
async def export_chat(other_user_id: str, current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    other_user_oid = ObjectId(other_user_id)
    
    other_user = await db.users.find_one({"_id": other_user_oid}, {"_id": 0, "name": 1})
    other_name = other_user["name"] if other_user else "مستخدم"
    
    messages = await db.messages.find({
        "$or": [
            {"sender_id": current_user_oid, "receiver_id": other_user_oid},
            {"sender_id": other_user_oid, "receiver_id": current_user_oid}
        ],
        "hidden_for": {"$nin": [current_user["id"]]},
        "deleted": {"$ne": True}
    }).sort("timestamp", 1).to_list(5000)
    
    # Build HTML for PDF
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><style>
body {{ font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f8fafc; direction: rtl; }}
h1 {{ text-align: center; color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 10px; }}
.info {{ text-align: center; color: #64748b; font-size: 13px; margin-bottom: 20px; }}
.msg {{ margin: 8px 0; padding: 10px 14px; border-radius: 12px; max-width: 80%; }}
.sent {{ background: #d1fae5; margin-left: auto; margin-right: 0; text-align: right; }}
.received {{ background: #ffffff; border: 1px solid #e2e8f0; margin-right: auto; margin-left: 0; text-align: right; }}
.sender {{ font-weight: 600; font-size: 12px; color: #059669; margin-bottom: 2px; }}
.text {{ font-size: 14px; color: #1e293b; white-space: pre-wrap; }}
.time {{ font-size: 11px; color: #94a3b8; margin-top: 4px; }}
.file {{ color: #3b82f6; font-size: 13px; }}
</style></head>
<body>
<h1>محادثة مع {other_name}</h1>
<p class="info">تصدير بتاريخ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}</p>
"""
    for msg in messages:
        is_own = msg["sender_id"] == current_user_oid
        cls = "sent" if is_own else "received"
        sender = current_user.get("name", "أنا") if is_own else other_name
        ts = msg["timestamp"].strftime("%Y-%m-%d %H:%M") if msg.get("timestamp") else ""
        text = msg.get("text", "")
        mt = msg.get("message_type", "text")
        
        if mt == "voice":
            text = "رسالة صوتية"
        elif mt == "image":
            text = "صورة"
        elif mt == "file":
            text = f'ملف: {msg.get("file_name", "")}'
        
        html += f'<div class="msg {cls}"><div class="sender">{sender}</div><div class="text">{text}</div><div class="time">{ts}</div></div>\n'
    
    html += "</body></html>"
    
    return FastAPIResponse(content=html, media_type="text/html; charset=utf-8", headers={
        "Content-Disposition": "attachment; filename=chat_export.html"
    })

# ===================== Conversation Routes =====================
@api_router.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    
    # Mark delivered in background (non-blocking)
    await db.messages.update_many(
        {"receiver_id": current_user_oid, "status": "sent"},
        {"$set": {"status": "delivered"}}
    )
    
    pipeline = [
        {"$match": {"$or": [{"sender_id": current_user_oid}, {"receiver_id": current_user_oid}]}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": {"$cond": [{"$eq": ["$sender_id", current_user_oid]}, "$receiver_id", "$sender_id"]},
            "last_message": {"$first": "$text"},
            "last_message_type": {"$first": "$message_type"},
            "last_message_time": {"$first": "$timestamp"},
        }}
    ]
    conversations = await db.messages.aggregate(pipeline).to_list(100)
    if not conversations:
        return []
    
    # Batch fetch all other users in ONE query
    other_user_ids = [c["_id"] for c in conversations]
    users_cursor = db.users.find(
        {"_id": {"$in": other_user_ids}},
        {"_id": 1, "name": 1, "email": 1, "avatar": 1, "online": 1, "last_seen": 1}
    )
    users_map = {}
    async for u in users_cursor:
        users_map[u["_id"]] = u
    
    # Batch count unread in ONE aggregation
    unread_pipeline = [
        {"$match": {"receiver_id": current_user_oid, "sender_id": {"$in": other_user_ids}, "status": {"$ne": "read"}}},
        {"$group": {"_id": "$sender_id", "count": {"$sum": 1}}}
    ]
    unread_map = {}
    async for doc in db.messages.aggregate(unread_pipeline):
        unread_map[doc["_id"]] = doc["count"]
    
    result = []
    for conv in conversations:
        other_user_id = conv["_id"]
        other_user = users_map.get(other_user_id)
        if not other_user:
            continue
        
        last_msg_text = conv.get("last_message", "")
        last_msg_type = conv.get("last_message_type", "text")
        if last_msg_type == "image":
            last_msg_text = "صورة"
        elif last_msg_type == "file":
            last_msg_text = "ملف"
        elif last_msg_type == "voice":
            last_msg_text = "رسالة صوتية"
        
        result.append({
            "id": str(other_user_id),
            "other_user": {
                "id": str(other_user["_id"]),
                "name": other_user["name"],
                "email": other_user["email"],
                "avatar": other_user.get("avatar"),
                "online": other_user.get("online", False),
                "last_seen": other_user.get("last_seen")
            },
            "last_message": last_msg_text,
            "last_message_time": conv["last_message_time"],
            "unread_count": unread_map.get(other_user_id, 0)
        })
    
    result.sort(key=lambda x: x["last_message_time"], reverse=True)
    return result

# ===================== Typing Indicator =====================
@api_router.post("/typing")
async def update_typing(data: TypingUpdate, current_user: dict = Depends(get_current_user)):
    await db.typing_status.update_one(
        {"user_id": current_user["id"], "receiver_id": data.receiver_id},
        {"$set": {
            "user_id": current_user["id"],
            "receiver_id": data.receiver_id,
            "is_typing": data.is_typing,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    return {"ok": True}

@api_router.get("/typing/{other_user_id}")
async def get_typing_status(other_user_id: str, current_user: dict = Depends(get_current_user)):
    status = await db.typing_status.find_one(
        {"user_id": other_user_id, "receiver_id": current_user["id"]},
        {"_id": 0}
    )
    if status:
        # Auto-expire after 5 seconds
        if status.get("updated_at"):
            updated = status["updated_at"]
            if updated.tzinfo is None:
                updated = updated.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - updated).total_seconds() > 5:
                return {"is_typing": False}
        return {"is_typing": status.get("is_typing", False)}
    return {"is_typing": False}

# ===================== Admin Routes =====================
@api_router.get("/admin/users")
async def admin_get_users(current_user: dict = Depends(get_admin_user)):
    users_cursor = db.users.find(
        {},
        {"_id": 1, "name": 1, "email": 1, "online": 1, "last_seen": 1, "created_at": 1, "role": 1}
    )
    users = await users_cursor.to_list(500)
    if not users:
        return []
    
    # Batch fetch message counts in ONE aggregation
    user_oids = [u["_id"] for u in users]
    count_pipeline = [
        {"$match": {"$or": [{"sender_id": {"$in": user_oids}}, {"receiver_id": {"$in": user_oids}}]}},
        {"$project": {"user": {"$cond": [{"$in": ["$sender_id", user_oids]}, "$sender_id", "$receiver_id"]}}},
        {"$group": {"_id": "$user", "count": {"$sum": 1}}}
    ]
    counts = await db.messages.aggregate(count_pipeline).to_list(1000)
    msg_count_map = {doc["_id"]: doc["count"] for doc in counts}
    
    result = []
    for u in users:
        result.append({
            "id": str(u["_id"]),
            "name": u["name"],
            "email": u["email"],
            "online": u.get("online", False),
            "last_seen": u.get("last_seen"),
            "created_at": u.get("created_at"),
            "role": u.get("role", "user"),
            "message_count": msg_count_map.get(u["_id"], 0)
        })
    return result

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, current_user: dict = Depends(get_admin_user)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin users")
    
    user_oid = ObjectId(user_id)
    
    # Delete all messages from/to this user
    await db.messages.delete_many({
        "$or": [{"sender_id": user_oid}, {"receiver_id": user_oid}]
    })
    
    # Delete typing status
    await db.typing_status.delete_many({
        "$or": [{"user_id": user_id}, {"receiver_id": user_id}]
    })
    
    # Delete user
    await db.users.delete_one({"_id": user_oid})
    
    return {"message": "User deleted successfully", "deleted_user_id": user_id}

@api_router.get("/admin/stats")
async def admin_get_stats(current_user: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    online_users = await db.users.count_documents({"online": True})
    total_messages = await db.messages.count_documents({})
    total_files = await db.files.count_documents({"is_deleted": False})
    return {
        "total_users": total_users,
        "online_users": online_users,
        "total_messages": total_messages,
        "total_files": total_files
    }

# Include the router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Startup event
@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.messages.create_index([("sender_id", 1), ("receiver_id", 1), ("timestamp", -1)])
    await db.messages.create_index([("receiver_id", 1), ("status", 1)])
    await db.messages.create_index("timestamp")
    await db.typing_status.create_index([("user_id", 1), ("receiver_id", 1)])
    await db.nicknames.create_index([("user_id", 1), ("other_user_id", 1)], unique=True)
    await db.files.create_index("storage_path")
    
    # Init storage
    try:
        init_storage()
        logger.info("Object storage initialized successfully")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email, "password_hash": hashed, "name": "Admin",
            "avatar": None, "online": False, "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Admin password updated")
    
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write(f"- Role: admin\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/register\n- POST /api/auth/login\n- GET /api/auth/me\n- POST /api/auth/logout\n\n")
        f.write("## Message Endpoints\n")
        f.write("- POST /api/messages\n- GET /api/messages/{other_user_id}\n- GET /api/conversations\n\n")
        f.write("## File Endpoints\n")
        f.write("- POST /api/upload\n- GET /api/files/{path}\n")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
