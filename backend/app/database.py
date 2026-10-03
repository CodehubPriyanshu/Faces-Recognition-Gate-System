import os
from threading import Lock

from pymongo import MongoClient

_lock = Lock()
_client = None
_database = None


def get_database():
    global _client, _database
    with _lock:
        if _database is not None:
            return _database
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("Set MONGODB_URI before starting the application.")
        client = MongoClient(uri, maxPoolSize=10, serverSelectionTimeoutMS=5000,
                             tz_aware=True)
        try:
            db = client[os.getenv("MONGODB_DB_NAME") or "vigil_guardian_pass"]
            db.users.create_index("email", unique=True)
            db.sessions.create_index("expires_at", expireAfterSeconds=0)
            db.sessions.create_index("user_id")
            db.login_attempts.create_index("expires_at", expireAfterSeconds=0)
            db.visitors.create_index("pass_no", unique=True)
            db.visitors.create_index([("entry_time", -1)])
            db.visitors.create_index([("status", 1), ("exit_time", 1)])
            db.audit_logs.create_index([("ts", -1)])
        except Exception:
            client.close()
            raise
        _client, _database = client, db
        return db


def close_database():
    global _client, _database
    with _lock:
        if _client is not None:
            _client.close()
        _client = _database = None
