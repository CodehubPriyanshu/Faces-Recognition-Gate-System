import logging
import math
import re
import secrets
import time
from datetime import timedelta
from uuid import uuid4

from fastapi import Request
from pydantic import ValidationError
from pymongo import ReturnDocument
from starlette.responses import JSONResponse, Response

from .database import get_database
from .schemas import Exit, Login, Password, User, Visitor
from .security import (ApiError, assert_role, check_origin, current_user, decode_image,
                       digest, hash_password, iso_now, js_number, now, public_user,
                       read_json, read_token, session_cookie, session_max_age,
                       verify_password)

DATABASE_ERROR = "Database request failed. Check the MongoDB connection and server configuration."
HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
logger = logging.getLogger("uvicorn.error")


def json_response(data, status=200, headers=None):
    return JSONResponse(data, status_code=status, headers={**HEADERS, **(headers or {})})


def audit(db, user, action, target, metadata=None):
    db.audit_logs.insert_one({
        "_id": str(uuid4()), "action": action, "actor_id": user["_id"],
        "actor_email": user["email"], "actor_role": user["role"],
        "target": target, "metadata": metadata, "ts": iso_now(),
    })


def record_json(record, images=False):
    return {**{key: value for key, value in record.items()
               if key != "_id" and (not images or key not in ("photo", "signature"))},
            "id": record["_id"]}


def dispatch(request, path):
    path = path.removesuffix("/")
    method = request.method
    if method not in ("GET", "POST"):
        return json_response({"error": "Method not allowed"}, 405)
    if method == "POST":
        check_origin(request)
    if path == "auth/session" and method == "GET" and not read_token(request):
        return json_response({"user": None})
    db = get_database()
    if path == "auth/login" and method == "POST":
        data = Login.model_validate(read_json(request, 4096))
        attempt_id = digest(f"login:{data.email}:{math.floor(time.time() / 900)}")
        attempts = db.login_attempts.find_one_and_update(
            {"_id": attempt_id},
            {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now() + timedelta(minutes=30)}},
            upsert=True, return_document=ReturnDocument.AFTER,
        )
        if attempts["count"] > 10:
            raise ApiError(429, "Too many login attempts. Try again in 15 minutes.")
        user = db.users.find_one({"email": data.email})
        encoded = (user or {}).get("password_hash") or f"scrypt:{'0' * 32}:{'0' * 128}"
        if not verify_password(data.password, encoded) or not user:
            raise ApiError(401, "Invalid email or password")
        assert_role(user)
        token, max_age = secrets.token_hex(32), session_max_age()
        old_token = read_token(request)
        if old_token:
            db.sessions.delete_one({"_id": digest(old_token)})
        db.sessions.insert_one({
            "_id": digest(token), "user_id": user["_id"],
            "auth_version": user.get("auth_version") or 0,
            "expires_at": now() + timedelta(seconds=max_age),
        })
        db.login_attempts.delete_one({"_id": attempt_id})
        return json_response({"user": public_user(user)}, headers={"Set-Cookie": session_cookie(token, max_age)})
    if path == "auth/logout" and method == "POST":
        token = read_token(request)
        if token:
            db.sessions.delete_one({"_id": digest(token)})
        return json_response({"ok": True}, headers={"Set-Cookie": session_cookie("", 0)})
    user = current_user(db, request)
    if path == "auth/session" and method == "GET":
        return json_response({"user": public_user(user) if user else None})
    if not user:
        raise ApiError(401, "Please sign in")
    assert_role(user)
    if path == "users" and method == "GET":
        assert_role(user, ("admin",))
        return json_response([public_user(item) for item in
                              db.users.find({}, {"password_hash": 0}).sort("created_at", 1)])
    if path == "users" and method == "POST":
        assert_role(user, ("admin",))
        data = User.model_validate(read_json(request, 8192))
        created = {"_id": str(uuid4()), "email": data.email, "full_name": data.full_name,
                   "role": data.role, "password_hash": hash_password(data.password),
                   "created_at": iso_now()}
        db.users.insert_one(created)
        audit(db, user, "USER.CREATE", created["email"], {"role": created["role"]})
        return json_response({"ok": True, "id": created["_id"]}, 201)
    action_match = re.fullmatch(r"users/([^/]+)/(delete|password)", path)
    if action_match and method == "POST":
        user_id, action = action_match.groups()
        if action == "delete" or user_id != user["_id"]:
            assert_role(user, ("admin",))
        if action == "delete" and user_id == user["_id"]:
            raise ApiError(400, "Cannot delete your own account")
        target = db.users.find_one({"_id": user_id})
        if not target:
            raise ApiError(404, "User not found")
        if action == "delete":
            db.users.delete_one({"_id": user_id})
        else:
            data = Password.model_validate(read_json(request, 4096))
            db.users.update_one({"_id": user_id}, {
                "$set": {"password_hash": hash_password(data.password), "updated_at": iso_now()},
                "$inc": {"auth_version": 1},
            })
        db.sessions.delete_many({"user_id": user_id})
        audit(db, user, "USER.DELETE" if action == "delete" else "USER.PASSWORD_UPDATE", target["email"])
        return json_response({"ok": True})
    if path == "audit" and method == "GET":
        assert_role(user, ("admin",))
        return json_response([record_json(item) for item in db.audit_logs.find().sort("ts", -1).limit(500)])
    if path == "visitors" and method == "GET":
        limit = js_number(request.query_params.get("limit") or "1000")
        if not math.isfinite(limit) or limit != int(limit) or not 1 <= limit <= 10000:
            raise ApiError(400, "Invalid limit")
        query = {"status": "in_campus", "exit_time": None} if request.query_params.get("active") == "true" else {}
        records = db.visitors.find(query, {"photo": 0, "signature": 0}).sort("entry_time", -1).limit(int(limit))
        return json_response([record_json(item, images=True) for item in records])
    if path == "visitors" and method == "POST":
        data = Visitor.model_validate(read_json(request)).model_dump(exclude_unset=True)
        photo, signature = data.pop("photo"), data.pop("signature")
        visitor_id, timestamp = str(uuid4()), iso_now()
        visitor = {
            **data, "_id": visitor_id,
            "pass_no": f"BSF-{time.localtime().tm_year}-{secrets.token_hex(6).upper()}",
            "entry_by": user["_id"], "entry_time": timestamp, "created_at": timestamp,
            "status": "in_campus", "exit_time": None, "exit_by": None,
            "exit_method": None, "exit_confidence": None,
            "photo": decode_image(photo), "signature": decode_image(signature),
            "photo_url": f"/api/visitors/{visitor_id}/photo",
            "signature_url": f"/api/visitors/{visitor_id}/signature",
        }
        db.visitors.insert_one(visitor)
        audit(db, user, "visitor.entry", visitor["pass_no"],
              {"full_name": visitor["full_name"], "visitor_id": visitor_id})
        return json_response(record_json(visitor, images=True), 201)
    visitor_match = re.fullmatch(r"visitors/([^/]+)(?:/(photo|signature|exit))?", path)
    if visitor_match:
        visitor_id, action = visitor_match.groups()
        if action == "exit" and method == "POST":
            data = Exit.model_validate(read_json(request, 4096))
            visitor = db.visitors.find_one_and_update(
                {"_id": visitor_id, "status": "in_campus", "exit_time": None},
                {"$set": {"status": "exited", "exit_time": iso_now(), "exit_by": user["_id"],
                          "exit_method": "ai_face", "exit_confidence": data.confidence}},
                return_document=ReturnDocument.AFTER, projection={"photo": 0, "signature": 0},
            )
            if not visitor:
                raise ApiError(409, "Visitor has already exited or no longer exists")
            audit(db, user, "visitor.exit", visitor["pass_no"],
                  {"visitor_id": visitor_id, "confidence": data.confidence, "method": "ai_face"})
            return json_response(record_json(visitor, images=True))
        if method == "GET" and action != "exit":
            visitor = db.visitors.find_one({"_id": visitor_id},
                                           {action: 1} if action else {"photo": 0, "signature": 0})
            if not visitor:
                raise ApiError(404, "Visitor not found")
            if not action:
                return json_response(record_json(visitor, images=True))
            image = visitor.get(action)
            if not image or not image.get("data"):
                raise ApiError(404, "Image not found")
            return Response(bytes(image["data"]), media_type=image["contentType"],
                            headers={**HEADERS, "Cache-Control": "private, no-store"})
    raise ApiError(404, "Endpoint not found")


def handle_api(request: Request, path: str = ""):
    try:
        return dispatch(request, path)
    except ApiError as error:
        return json_response({"error": str(error)}, error.status)
    except ValidationError as error:
        # Never include Pydantic input/context: it may contain a password or image.
        messages = [issue["msg"] for issue in error.errors(include_input=False, include_context=False)]
        return json_response({"error": "; ".join(messages)}, 400)
    except Exception as error:
        if getattr(error, "code", None) == 11000:
            return json_response({"error": "That email or pass number already exists"}, 409)
        logger.error("API operation failed: %s", type(error).__name__)
        return json_response({"error": DATABASE_ERROR}, 503)
