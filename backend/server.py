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
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
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

class TypingUpdate(BaseModel):
    receiver_id: str
    is_typing: bool

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
    
    return {"id": user_id, "name": data.name, "email": email_lower, "avatar": None, "online": True}

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
    
    return {"id": user_id, "name": user["name"], "email": user["email"], "avatar": user.get("avatar"), "online": True}

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
        "timestamp": datetime.now(timezone.utc),
        "status": "sent"
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
        "timestamp": message_doc["timestamp"],
        "status": "sent"
    }

@api_router.get("/messages/{other_user_id}")
async def get_messages(other_user_id: str, current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    other_user_oid = ObjectId(other_user_id)
    
    messages_cursor = db.messages.find({
        "$or": [
            {"sender_id": current_user_oid, "receiver_id": other_user_oid},
            {"sender_id": other_user_oid, "receiver_id": current_user_oid}
        ]
    }).sort("timestamp", 1)
    
    messages = await messages_cursor.to_list(1000)
    
    # Mark incoming messages as read
    await db.messages.update_many(
        {"sender_id": other_user_oid, "receiver_id": current_user_oid, "status": {"$ne": "read"}},
        {"$set": {"status": "read"}}
    )
    
    result = []
    for msg in messages:
        result.append({
            "id": str(msg["_id"]),
            "sender_id": str(msg["sender_id"]),
            "receiver_id": str(msg["receiver_id"]),
            "text": msg.get("text", ""),
            "message_type": msg.get("message_type", "text"),
            "file_url": msg.get("file_url"),
            "file_name": msg.get("file_name"),
            "file_type": msg.get("file_type"),
            "timestamp": msg["timestamp"],
            "status": msg.get("status", "sent")
        })
    return result

# ===================== Conversation Routes =====================
@api_router.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    
    # Mark all messages sent TO current user as delivered (if still "sent")
    await db.messages.update_many(
        {"receiver_id": current_user_oid, "status": "sent"},
        {"$set": {"status": "delivered"}}
    )
    
    pipeline = [
        {
            "$match": {
                "$or": [
                    {"sender_id": current_user_oid},
                    {"receiver_id": current_user_oid}
                ]
            }
        },
        {"$sort": {"timestamp": -1}},
        {
            "$group": {
                "_id": {
                    "$cond": [
                        {"$eq": ["$sender_id", current_user_oid]},
                        "$receiver_id",
                        "$sender_id"
                    ]
                },
                "last_message": {"$first": "$text"},
                "last_message_type": {"$first": "$message_type"},
                "last_message_time": {"$first": "$timestamp"},
                "last_sender_id": {"$first": "$sender_id"}
            }
        }
    ]
    
    conversations = await db.messages.aggregate(pipeline).to_list(100)
    
    result = []
    for conv in conversations:
        other_user_id = conv["_id"]
        other_user = await db.users.find_one(
            {"_id": other_user_id},
            {"_id": 1, "name": 1, "email": 1, "avatar": 1, "online": 1, "last_seen": 1}
        )
        
        if other_user:
            unread_count = await db.messages.count_documents({
                "sender_id": other_user_id,
                "receiver_id": current_user_oid,
                "status": {"$ne": "read"}
            })
            
            last_msg_text = conv.get("last_message", "")
            last_msg_type = conv.get("last_message_type", "text")
            if last_msg_type == "image":
                last_msg_text = "صورة"
            elif last_msg_type == "file":
                last_msg_text = "ملف"
            
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
                "unread_count": unread_count
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
        if status.get("updated_at") and (datetime.now(timezone.utc) - status["updated_at"]).total_seconds() > 5:
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
    result = []
    for u in users:
        user_id = str(u["_id"])
        msg_count = await db.messages.count_documents({
            "$or": [{"sender_id": u["_id"]}, {"receiver_id": u["_id"]}]
        })
        result.append({
            "id": user_id,
            "name": u["name"],
            "email": u["email"],
            "online": u.get("online", False),
            "last_seen": u.get("last_seen"),
            "created_at": u.get("created_at"),
            "role": u.get("role", "user"),
            "message_count": msg_count
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
    await db.typing_status.create_index([("user_id", 1), ("receiver_id", 1)])
    
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
