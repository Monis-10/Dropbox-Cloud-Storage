"""
Dropbox-Clone Backend — FastAPI + HDFS + PostgreSQL
Group 16: Muhammad Hassaan Adil, Syed Muhammad Monis
"""
import hashlib
import secrets
import io
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

import database as db
from database import get_db, User, File as FileModel, Share, DedupIndex, SyncEvent
from auth import hash_password, verify_password, create_access_token, get_current_user
import hdfs_client as hdfs
from kafka_utils import publish_event

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Dropbox-Clone API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    db.Base.metadata.create_all(bind=db.engine)
    # Create root HDFS directory
    try:
        await hdfs.hdfs_mkdir("/dropbox")
    except Exception as e:
        print(f"[HDFS] Startup mkdir failed (may already exist): {e}")

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    quota_bytes: int
    used_bytes: int
    class Config: from_attributes = True

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class FileOut(BaseModel):
    id: int
    filename: str
    size_bytes: int
    mime_type: Optional[str]
    version: int
    is_deleted: bool
    created_at: datetime
    class Config: from_attributes = True

class ShareOut(BaseModel):
    share_token: str
    expires_at: Optional[datetime]
    download_url: str

class StatsOut(BaseModel):
    total_files: int
    active_files: int
    deleted_files: int
    total_size_bytes: int
    dedup_saved_bytes: int
    quota_bytes: int
    used_bytes: int

# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=UserOut)
def register(data: UserRegister, session: Session = Depends(get_db)):
    if session.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")
    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_db)):
    user = session.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    token = create_access_token({"sub": user.id})
    return {"access_token": token}


@app.get("/auth/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

# ── File Upload ───────────────────────────────────────────────────────────────

@app.post("/files/upload", response_model=FileOut)
async def upload_file(
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    size = len(content)

    # Check quota
    if current_user.used_bytes + size > current_user.quota_bytes:
        raise HTTPException(400, "Storage quota exceeded")

    # Compute checksum for deduplication
    checksum = hashlib.sha256(content).hexdigest()

    # ── Deduplication check ──────────────────────────────────────────
    dedup = session.query(DedupIndex).filter(DedupIndex.checksum_sha256 == checksum).first()

    if dedup:
        # File already exists in HDFS — reuse the path
        hdfs_path = dedup.hdfs_path
        dedup.ref_count += 1
        saved = True
    else:
        # New file — upload to HDFS
        hdfs_path = f"/dropbox/{current_user.id}/{checksum[:8]}_{file.filename}"
        try:
            await hdfs.hdfs_mkdir(f"/dropbox/{current_user.id}")
            await hdfs.hdfs_upload(hdfs_path, content)
        except Exception as e:
            raise HTTPException(500, f"HDFS upload failed: {e}")
        dedup = DedupIndex(checksum_sha256=checksum, hdfs_path=hdfs_path, size_bytes=size)
        session.add(dedup)
        saved = False

    # ── Versioning ───────────────────────────────────────────────────
    existing = (
        session.query(FileModel)
        .filter(FileModel.owner_id == current_user.id, FileModel.filename == file.filename, FileModel.is_deleted == False)
        .order_by(FileModel.version.desc())
        .first()
    )
    next_version = (existing.version + 1) if existing else 1
    parent_id = existing.id if existing else None

    file_record = FileModel(
        owner_id=current_user.id,
        filename=file.filename,
        hdfs_path=hdfs_path,
        size_bytes=size,
        mime_type=file.content_type,
        checksum_sha256=checksum,
        version=next_version,
        parent_version_id=parent_id,
    )
    session.add(file_record)

    # Update user quota
    current_user.used_bytes += size

    session.commit()
    session.refresh(file_record)

    # Publish sync event
    publish_event("file-sync", {
        "event": "UPLOAD",
        "user_id": current_user.id,
        "file_id": file_record.id,
        "filename": file.filename,
        "version": next_version,
        "dedup_hit": saved,
    })

    return file_record

# ── File Download ─────────────────────────────────────────────────────────────

@app.get("/files/{file_id}/download")
async def download_file(
    file_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_record = session.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.owner_id == current_user.id,
        FileModel.is_deleted == False,
    ).first()
    if not file_record:
        raise HTTPException(404, "File not found")

    try:
        content = await hdfs.hdfs_download(file_record.hdfs_path)
    except Exception as e:
        raise HTTPException(500, f"HDFS download failed: {e}")

    return StreamingResponse(
        io.BytesIO(content),
        media_type=file_record.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_record.filename}"'},
    )

# ── List Files ────────────────────────────────────────────────────────────────

@app.get("/files", response_model=List[FileOut])
def list_files(
    include_deleted: bool = False,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = session.query(FileModel).filter(FileModel.owner_id == current_user.id)
    if not include_deleted:
        q = q.filter(FileModel.is_deleted == False)
    return q.order_by(FileModel.created_at.desc()).all()

# ── File Versions ─────────────────────────────────────────────────────────────

@app.get("/files/{filename}/versions", response_model=List[FileOut])
def get_versions(
    filename: str,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        session.query(FileModel)
        .filter(FileModel.owner_id == current_user.id, FileModel.filename == filename)
        .order_by(FileModel.version.desc())
        .all()
    )

# ── Soft Delete (Trash) ───────────────────────────────────────────────────────

@app.delete("/files/{file_id}")
def delete_file(
    file_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_record = session.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.owner_id == current_user.id,
        FileModel.is_deleted == False,
    ).first()
    if not file_record:
        raise HTTPException(404, "File not found")

    file_record.is_deleted = True
    file_record.deleted_at = datetime.utcnow()
    session.commit()

    publish_event("file-sync", {"event": "DELETE", "file_id": file_id, "user_id": current_user.id})
    return {"message": "File moved to trash"}

# ── Restore from Trash ────────────────────────────────────────────────────────

@app.post("/files/{file_id}/restore")
def restore_file(
    file_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_record = session.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.owner_id == current_user.id,
        FileModel.is_deleted == True,
    ).first()
    if not file_record:
        raise HTTPException(404, "File not in trash")

    file_record.is_deleted = False
    file_record.deleted_at = None
    session.commit()
    return {"message": "File restored"}

# ── Sharing ───────────────────────────────────────────────────────────────────

class ShareRequest(BaseModel):
    file_id: int
    expires_hours: Optional[int] = 24  # None = no expiry

@app.post("/files/share", response_model=ShareOut)
def create_share(
    req: ShareRequest,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_record = session.query(FileModel).filter(
        FileModel.id == req.file_id,
        FileModel.owner_id == current_user.id,
        FileModel.is_deleted == False,
    ).first()
    if not file_record:
        raise HTTPException(404, "File not found")

    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=req.expires_hours) if req.expires_hours else None

    share = Share(file_id=req.file_id, owner_id=current_user.id, share_token=token, expires_at=expires)
    session.add(share)
    session.commit()

    return ShareOut(
        share_token=token,
        expires_at=expires,
        download_url=f"/shared/{token}/download",
    )

@app.get("/shared/{token}/download")
async def shared_download(token: str, session: Session = Depends(get_db)):
    share = session.query(Share).filter(Share.share_token == token, Share.is_active == True).first()
    if not share:
        raise HTTPException(404, "Share link not found or inactive")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(410, "Share link has expired")

    file_record = session.query(FileModel).filter(FileModel.id == share.file_id).first()
    try:
        content = await hdfs.hdfs_download(file_record.hdfs_path)
    except Exception as e:
        raise HTTPException(500, f"HDFS download failed: {e}")

    return StreamingResponse(
        io.BytesIO(content),
        media_type=file_record.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_record.filename}"'},
    )

# ── Storage Stats ─────────────────────────────────────────────────────────────

@app.get("/stats", response_model=StatsOut)
def get_stats(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    files = session.query(FileModel).filter(FileModel.owner_id == current_user.id).all()
    active = [f for f in files if not f.is_deleted]
    deleted = [f for f in files if f.is_deleted]
    total_size = sum(f.size_bytes for f in active)

    # Dedup savings: count files that share an hdfs_path with another file
    from sqlalchemy import func
    saved = (
        session.query(func.sum(DedupIndex.size_bytes * (DedupIndex.ref_count - 1)))
        .scalar()
    ) or 0

    return StatsOut(
        total_files=len(files),
        active_files=len(active),
        deleted_files=len(deleted),
        total_size_bytes=total_size,
        dedup_saved_bytes=int(saved),
        quota_bytes=current_user.quota_bytes,
        used_bytes=current_user.used_bytes,
    )

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "dropbox-clone-backend"}
