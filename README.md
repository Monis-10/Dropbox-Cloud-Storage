# ☁️ CloudDrop — Dropbox Clone with Distributed Storage

**Group 16 | Cloud Computing Project**
- Muhammad Hassaan Adil (Leader)
- Syed Muhammad Monis

**Apache Projects:** Hadoop HDFS + Apache Ambari  
**Stack:** Python FastAPI · Hadoop HDFS · PostgreSQL · Apache Kafka · React

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      React Frontend                      │
│                   (Port 3000 → Nginx)                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP REST
┌────────────────────────▼────────────────────────────────┐
│              FastAPI Backend (Port 8000)                 │
│   Auth · Upload · Download · Share · Versioning         │
└──────┬─────────────┬──────────────┬─────────────────────┘
       │             │              │
  WebHDFS       PostgreSQL       Kafka
  REST API       Metadata       Events
       │             │              │
┌──────▼──────┐  ┌───▼───┐   ┌────▼────┐
│  Namenode   │  │  DB   │   │  Kafka  │
│  (metadata) │  │ :5432 │   │  :9092  │
└──┬──┬──┬───┘  └───────┘   └─────────┘
   │  │  │
┌──▼──▼──▼──────────────────────────┐
│  Datanode 1 · Datanode 2 · DN 3   │
│       (Replication Factor: 3)      │
└───────────────────────────────────┘
```

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Docker Desktop installed and running
- Git

### Step 1 — Clone & Start

```bash
git clone <your-repo-url>
cd dropbox-clone
docker-compose up --build -d
```

This starts:
- 3 HDFS Datanodes + 1 Namenode
- PostgreSQL database
- Kafka + Zookeeper
- FastAPI backend
- React frontend

### Step 2 — Wait for HDFS to initialize (~30 seconds)

```bash
docker-compose logs -f namenode
# Wait until you see "NameNode RPC up at: namenode/..."
```

### Step 3 — Open the app

| Service          | URL                        |
|-----------------|----------------------------|
| Web App          | http://localhost:3000      |
| API Docs         | http://localhost:8000/docs |
| HDFS Web UI      | http://localhost:9870      |

### Step 4 — Register & use

1. Go to http://localhost:3000
2. Click "Register" → create account
3. Upload files via drag & drop
4. Download, share, version, trash & restore!

---

## 📁 Project Structure

```
dropbox-clone/
├── docker-compose.yml          # Full stack orchestration
├── docker/
│   └── init.sql               # PostgreSQL schema
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                # All API routes
│   ├── database.py            # SQLAlchemy models
│   ├── auth.py                # JWT authentication
│   ├── hdfs_client.py         # WebHDFS REST client
│   ├── kafka_utils.py         # Kafka producer
│   └── config.py              # Settings
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx           # Entry point
│       ├── App.jsx            # Full UI
│       └── api.js             # API service layer
└── docs/
    └── report.md              # Project report
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, get JWT token |
| GET | `/auth/me` | Get current user info |
| POST | `/files/upload` | Upload file to HDFS |
| GET | `/files` | List all files |
| GET | `/files/{id}/download` | Download file |
| GET | `/files/{name}/versions` | Get all versions |
| DELETE | `/files/{id}` | Move to trash |
| POST | `/files/{id}/restore` | Restore from trash |
| POST | `/files/share` | Create share link |
| GET | `/shared/{token}/download` | Download via share link |
| GET | `/stats` | Storage statistics |

All authenticated routes require: `Authorization: Bearer <token>`

---

## ⚙️ Cloud Computing Concepts Implemented

### 1. Distributed File System (HDFS)
Files are uploaded via WebHDFS REST API to a 3-node Hadoop cluster. The Namenode manages metadata while Datanodes store actual file blocks.

### 2. Data Replication
HDFS default replication factor is 3 — every file block is stored on all 3 datanodes. If one node fails, data remains accessible.

### 3. Consistency Model
PostgreSQL handles strong consistency for metadata (users, files, shares). HDFS provides eventual consistency for file blocks with write-once semantics.

### 4. Block-level Deduplication
Every uploaded file is SHA-256 hashed. If the same hash exists in the `dedup_index` table, the file is NOT re-uploaded to HDFS — the existing path is reused and reference count is incremented.

### 5. File Versioning
Each upload of an existing filename creates a new version record with `parent_version_id` pointing to the previous version. All versions remain accessible.

### 6. Sync Events via Kafka
Every upload, delete, and restore publishes an event to the `file-sync` Kafka topic. This enables future desktop sync clients to consume events in real time.

---

## 🧪 Evaluation Metrics

Run these commands after starting:

```bash
# Upload throughput test (upload 100MB file)
time curl -X POST http://localhost:8000/files/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@testfile_100mb.bin"

# Check HDFS replication
docker exec namenode hdfs dfs -stat "%r" /dropbox/

# Check deduplication
curl http://localhost:8000/stats -H "Authorization: Bearer <token>"
# → dedup_saved_bytes shows storage saved

# Concurrent users (requires Apache Bench)
ab -n 100 -c 10 -H "Authorization: Bearer <token>" http://localhost:8000/files
```

---

## 🛑 Stopping the Project

```bash
docker-compose down          # Stop containers
docker-compose down -v       # Stop + delete all data
```

---

## 🔧 Troubleshooting

**HDFS upload fails?**
```bash
docker-compose logs namenode  # Check if namenode is ready
docker-compose restart backend  # Restart after HDFS is up
```

**Database errors?**
```bash
docker-compose logs postgres
docker-compose exec postgres psql -U dropbox_user -d dropbox_db
```

**Frontend can't reach backend?**
```bash
# Check backend is running
curl http://localhost:8000/health
```
