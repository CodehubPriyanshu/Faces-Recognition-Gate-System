"""uvicorn main:app; CLI: python main.py --check-db / --seed-admin."""
import argparse
import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Host environment wins over the repository's private local file.
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

from app.api import handle_api  # noqa: E402
from app.database import close_database, get_database  # noqa: E402
from app.schemas import User  # noqa: E402
from app.security import hash_password, iso_now, url_origin  # noqa: E402


@asynccontextmanager
async def lifespan(app):
    yield
    close_database()


app = FastAPI(title="Vigil Guardian Pass API", lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)
try:
    allowed_origins = [url_origin(os.getenv("APP_URL") or "http://localhost:8080")]
except ValueError:
    allowed_origins = []  # The request handler returns a sanitized 503 for invalid APP_URL.
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                   allow_credentials=True, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type"])


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


app.add_api_route("/api/{path:path}", handle_api,
                  methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])


def check_database():
    db = get_database()
    db.command({"ping": 1})
    print("MongoDB connection and application indexes are ready.")


def seed_admin():
    data = User.model_validate({"email": os.getenv("ADMIN_EMAIL"),
                                "full_name": os.getenv("ADMIN_NAME"),
                                "password": os.getenv("ADMIN_PASSWORD"), "role": "admin"})
    db = get_database()
    existing = db.users.find_one({"email": data.email})
    if existing:
        if existing.get("role") != "admin":
            raise RuntimeError("Existing account is not an administrator")
        print("Administrator already exists; no credentials changed.")
        return
    db.users.insert_one({"_id": str(uuid4()), "email": data.email, "full_name": data.full_name,
                         "role": "admin", "password_hash": hash_password(data.password),
                         "auth_version": 0, "created_at": iso_now()})
    print("Initial administrator created.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-db", action="store_true")
    mode.add_argument("--seed-admin", action="store_true")
    args = parser.parse_args()
    try:
        check_database() if args.check_db else seed_admin()
    except Exception as error:
        # Do not print MongoDB exception text, URI, or Pydantic validation inputs.
        print(f"{'Database check' if args.check_db else 'Administrator seed'} failed "
              f"({type(error).__name__}, code={getattr(error, 'code', None)}). "
              "Check server environment and MongoDB access.")
        raise SystemExit(1) from None
    finally:
        close_database()
