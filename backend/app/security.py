import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
from datetime import datetime, timezone
from urllib.parse import urlsplit

from anyio import from_thread

ROLES = ("admin", "security_guard", "gate_operator")
COOKIE_NAME = "vigil_session"


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(timezone.utc)


def iso_now():
    return now().isoformat(timespec="milliseconds").replace("+00:00", "Z")


def js_length(value):
    return len(value.encode("utf-16-le", errors="surrogatepass")) // 2


def js_number(value):
    # Match Number() for the JSON primitives accepted by z.coerce.number().
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, list):
        if not value:
            return 0.0
        if len(value) == 1:
            return js_number("" if value[0] is None else str(value[0]))
        return float("nan")
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return 0.0
        try:
            if re.fullmatch(r"0(?:x[0-9a-f]+|o[0-7]+|b[01]+)", value, re.I | re.ASCII):
                return float(int(value, 0))
            if value in ("Infinity", "+Infinity", "-Infinity") or re.fullmatch(
                    r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", value, re.ASCII):
                return float(value)
        except ValueError:
            pass
    return float("nan")


def utf8(value):
    # Node replaces unpaired UTF-16 surrogates with U+FFFD before hashing.
    return value.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace").encode("utf-8")


def hash_password(password):
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(utf8(password), salt=salt.encode("ascii"),
                         n=16384, r=8, p=1, dklen=64)
    return f"scrypt:{salt}:{key.hex()}"


def verify_password(password, encoded):
    parts = (encoded or "").split(":")
    if len(parts) < 3 or parts[0] != "scrypt" or not parts[1] or not parts[2]:
        return False
    # Buffer.from(hex) consumes complete valid byte pairs up to the first invalid pair.
    prefix = re.match(r"^(?:[a-fA-F0-9]{2})*", parts[2]).group()
    expected = bytes.fromhex(prefix)
    actual = hashlib.scrypt(utf8(password), salt=utf8(parts[1]),
                            n=16384, r=8, p=1, dklen=64)
    return len(expected) == len(actual) and hmac.compare_digest(expected, actual)


def digest(value):
    secret = os.getenv("AUTH_SECRET", "")
    if js_length(secret) < 32:
        raise RuntimeError("AUTH_SECRET must contain at least 32 characters.")
    return hmac.new(utf8(secret), utf8(value), hashlib.sha256).hexdigest()


def public_user(user):
    result = {"id": user["_id"]}
    result.update({key: user[key] for key in ("email", "full_name", "role", "created_at")
                   if key in user})
    return result


def assert_role(user, allowed=ROLES):
    if not user or user.get("role") not in allowed:
        raise ApiError(403, "Forbidden")


def read_token(request):
    for part in request.headers.get("cookie", "").split(";"):
        part = part.strip()
        if part.startswith(f"{COOKIE_NAME}="):
            return part[len(COOKIE_NAME) + 1:]
    return None


def url_origin(value):
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Invalid application URL")
    host = parsed.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    port = parsed.port
    default = 443 if parsed.scheme == "https" else 80
    return f"{parsed.scheme}://{host}" + (f":{port}" if port and port != default else "")


def session_cookie(token, max_age):
    app_url = os.getenv("APP_URL")
    secure = (url_origin(app_url).startswith("https:") if app_url
              else os.getenv("NODE_ENV") == "production")
    age = format(max_age, ".15g")
    return (f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}"
            + ("; Secure" if secure else ""))


def session_max_age():
    hours = js_number(os.getenv("SESSION_TTL_HOURS") or "12")
    return max(1, min(hours if math.isfinite(hours) else 12, 168)) * 3600


def current_user(db, request):
    token = read_token(request)
    if not token or not re.fullmatch(r"[a-f0-9]{64}", token):
        return None
    session = db.sessions.find_one({"_id": digest(token), "expires_at": {"$gt": now()}})
    if not session:
        return None
    user = db.users.find_one({"_id": session["user_id"]})
    if user and (user.get("auth_version") or 0) == (session.get("auth_version") or 0):
        return user
    return None


def check_origin(request):
    expected = url_origin(os.getenv("APP_URL") or str(request.url))
    if (request.headers.get("origin") != expected
            or request.headers.get("sec-fetch-site") == "cross-site"):
        raise ApiError(403, "Request origin is not allowed")


async def _read_json(request, max_bytes):
    if not request.headers.get("content-type", "").startswith("application/json"):
        raise ApiError(415, "Expected JSON")
    if js_number(request.headers.get("content-length")) > max_bytes:
        raise ApiError(413, "Request is too large")
    parts, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > max_bytes:
            raise ApiError(413, "Request is too large")
        parts.append(chunk)
    try:
        return json.loads(b"".join(parts).decode("utf-8", errors="replace"),
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError):
        raise ApiError(400, "Invalid JSON") from None


def read_json(request, max_bytes=6 * 1024 * 1024):
    # FastAPI executes sync routes in a worker; only the bounded body read uses ASGI.
    return from_thread.run(_read_json, request, max_bytes)


def decode_image(data_url):
    match = re.fullmatch(r"data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})", data_url)
    if not match:
        raise ApiError(400, "Images must be JPEG or PNG")
    encoded = match[2].rstrip("=")
    # Node's Buffer base64 decoder tolerates omitted padding and a final single sextet.
    if len(encoded) % 4 == 1:
        encoded = encoded[:-1]
    data = base64.b64decode(encoded + "=" * (-len(encoded) % 4))
    if not data or len(data) > 2 * 1024 * 1024:
        raise ApiError(400, "Each image must be at most 2 MB")
    magic = b"\x89PNG\r\n\x1a\n" if match[1] == "image/png" else b"\xff\xd8\xff"
    if not data.startswith(magic):
        raise ApiError(400, "Invalid image content")
    return {"data": data, "contentType": match[1]}
