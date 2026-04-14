from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
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
import secrets

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

# Password hashing functions
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# JWT Token functions
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

# Auth dependency
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

# Pydantic Models
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    avatar: Optional[str] = None
    online: bool = False
    last_seen: Optional[datetime] = None

class MessageCreate(BaseModel):
    receiver_id: str
    text: str

class MessageResponse(BaseModel):
    id: str
    sender_id: str
    receiver_id: str
    text: str
    timestamp: datetime
    read: bool = False

class ConversationResponse(BaseModel):
    id: str
    other_user: UserResponse
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    unread_count: int = 0

# Auth Routes
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
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=900,
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=604800,
        path="/"
    )
    
    return {
        "id": user_id,
        "name": data.name,
        "email": email_lower,
        "avatar": None,
        "online": True
    }

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
    
    # Update user online status
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"online": True, "last_seen": datetime.now(timezone.utc)}}
    )
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=900,
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=604800,
        path="/"
    )
    
    return {
        "id": user_id,
        "name": user["name"],
        "email": user["email"],
        "avatar": user.get("avatar"),
        "online": True
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@api_router.post("/auth/logout")
async def logout(response: Response, current_user: dict = Depends(get_current_user)):
    # Update user online status
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {"online": False, "last_seen": datetime.now(timezone.utc)}}
    )
    
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

# User Routes
@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    users_cursor = db.users.find(
        {"_id": {"$ne": ObjectId(current_user["id"])}},
        {"_id": 1, "name": 1, "email": 1, "avatar": 1, "online": 1, "last_seen": 1}
    )
    users = await users_cursor.to_list(100)
    
    result = []
    for user in users:
        result.append({
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "avatar": user.get("avatar"),
            "online": user.get("online", False),
            "last_seen": user.get("last_seen")
        })
    return result

# Message Routes
@api_router.post("/messages")
async def send_message(data: MessageCreate, current_user: dict = Depends(get_current_user)):
    message_doc = {
        "sender_id": ObjectId(current_user["id"]),
        "receiver_id": ObjectId(data.receiver_id),
        "text": data.text,
        "timestamp": datetime.now(timezone.utc),
        "read": False
    }
    result = await db.messages.insert_one(message_doc)
    
    return {
        "id": str(result.inserted_id),
        "sender_id": current_user["id"],
        "receiver_id": data.receiver_id,
        "text": data.text,
        "timestamp": message_doc["timestamp"],
        "read": False
    }

@api_router.get("/messages/{other_user_id}")
async def get_messages(other_user_id: str, current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    other_user_oid = ObjectId(other_user_id)
    
    # Get all messages between current user and other user
    messages_cursor = db.messages.find({
        "$or": [
            {"sender_id": current_user_oid, "receiver_id": other_user_oid},
            {"sender_id": other_user_oid, "receiver_id": current_user_oid}
        ]
    }).sort("timestamp", 1)
    
    messages = await messages_cursor.to_list(1000)
    
    # Mark messages as read
    await db.messages.update_many(
        {"sender_id": other_user_oid, "receiver_id": current_user_oid, "read": False},
        {"$set": {"read": True}}
    )
    
    result = []
    for msg in messages:
        result.append({
            "id": str(msg["_id"]),
            "sender_id": str(msg["sender_id"]),
            "receiver_id": str(msg["receiver_id"]),
            "text": msg["text"],
            "timestamp": msg["timestamp"],
            "read": msg.get("read", False)
        })
    return result

# Conversation Routes
@api_router.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    current_user_oid = ObjectId(current_user["id"])
    
    # Get all messages involving current user
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
                "last_message_time": {"$first": "$timestamp"},
                "messages": {"$push": "$$ROOT"}
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
            # Count unread messages
            unread_count = await db.messages.count_documents({
                "sender_id": other_user_id,
                "receiver_id": current_user_oid,
                "read": False
            })
            
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
                "last_message": conv["last_message"],
                "last_message_time": conv["last_message_time"],
                "unread_count": unread_count
            })
    
    # Sort by last message time
    result.sort(key=lambda x: x["last_message_time"], reverse=True)
    return result

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
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Startup event
@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.messages.create_index([("sender_id", 1), ("receiver_id", 1), ("timestamp", -1)])
    
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Admin",
            "avatar": None,
            "online": False,
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Admin password updated")
    
    # Write test credentials
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write(f"- Role: admin\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/register\n")
        f.write("- POST /api/auth/login\n")
        f.write("- GET /api/auth/me\n")
        f.write("- POST /api/auth/logout\n")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
