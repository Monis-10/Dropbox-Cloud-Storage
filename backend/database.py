from sqlalchemy import create_engine, Column, Integer, String, BigInteger, Boolean, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    quota_bytes = Column(BigInteger, default=5 * 1024**3)
    used_bytes = Column(BigInteger, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    files = relationship("File", back_populates="owner")

class File(Base):
    __tablename__ = "files"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    filename = Column(String(255), nullable=False)
    hdfs_path = Column(String(500), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(100))
    checksum_sha256 = Column(String(64), nullable=False)
    version = Column(Integer, default=1)
    parent_version_id = Column(Integer, ForeignKey("files.id"), nullable=True)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    owner = relationship("User", back_populates="files")
    shares = relationship("Share", back_populates="file")

class Share(Base):
    __tablename__ = "shares"
    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("files.id", ondelete="CASCADE"))
    owner_id = Column(Integer, ForeignKey("users.id"))
    share_token = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    file = relationship("File", back_populates="shares")

class DedupIndex(Base):
    __tablename__ = "dedup_index"
    checksum_sha256 = Column(String(64), primary_key=True)
    hdfs_path = Column(String(500), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    ref_count = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

class SyncEvent(Base):
    __tablename__ = "sync_events"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    file_id = Column(Integer, ForeignKey("files.id"))
    event_type = Column(String(20), nullable=False)
    device_id = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
