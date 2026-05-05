# Cloud Computing Project Report
## CloudDrop — Dropbox Clone with Distributed Storage and Replication

| Field | Details |
|-------|---------|
| **Group** | 16 |
| **Members** | Muhammad Hassaan Adil (Leader), Syed Muhammad Monis |
| **Apache Projects** | Apache Hadoop HDFS, Apache Ambari |
| **Course** | Cloud Computing |

---

## 1. Introduction

CloudDrop is a cloud-based file storage and synchronization service inspired by Dropbox. It uses Apache Hadoop HDFS as the distributed storage backend, providing automatic replication, fault tolerance, and horizontal scalability. The system allows users to upload, download, version, share, and manage files through a modern web interface.

The project demonstrates core cloud computing concepts including distributed file systems, data replication, consistency models, and event-driven synchronization.

---

## 2. System Architecture

### 2.1 High-Level Architecture

The system consists of five major layers:

**Presentation Layer** — React single-page application served via Nginx. Provides drag-and-drop uploads, file management, sharing UI, version history, and storage statistics.

**API Layer** — Python FastAPI application exposing a RESTful API. Handles authentication, file operations, and coordinates between HDFS, PostgreSQL, and Kafka.

**Storage Layer** — Apache Hadoop HDFS with 1 Namenode and 3 Datanodes. Files are stored as blocks distributed across all three nodes with a replication factor of 3.

**Metadata Layer** — PostgreSQL database storing user accounts, file metadata, version history, share tokens, and the deduplication index.

**Event Layer** — Apache Kafka for publishing sync events. Every file operation (upload, delete, restore, share) emits a message to the `file-sync` topic, enabling future real-time desktop sync clients.

### 2.2 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Storage | Apache Hadoop HDFS 3.2.1 | Distributed file storage |
| Cluster Mgmt | Apache Ambari (via Docker) | HDFS cluster management |
| Sync Events | Apache Kafka 7.4.0 | File sync event streaming |
| Backend | Python FastAPI | REST API |
| ORM | SQLAlchemy + PostgreSQL | Metadata persistence |
| Auth | JWT (python-jose + bcrypt) | Stateless authentication |
| Frontend | React 18 + Vite | Web interface |
| Serving | Nginx | Static file server + proxy |
| Containers | Docker Compose | Orchestration |

### 2.3 HDFS Cluster Configuration

The HDFS cluster runs with:
- 1 Namenode (port 9000 RPC, 9870 Web UI)
- 3 Datanodes
- Default replication factor: 3
- File storage path: `/dropbox/{user_id}/{hash}_{filename}`

Communication with HDFS uses the WebHDFS REST API — no Java client required. The FastAPI backend calls the Namenode's HTTP endpoint which redirects to the appropriate Datanode for data transfer.

---

## 3. Implemented Features

### 3.1 File Upload / Download
Users upload files via multipart HTTP POST. The backend reads the file bytes, computes SHA-256 checksum, checks the deduplication index, then uploads to HDFS via WebHDFS if the file is new. Downloads retrieve bytes from HDFS and stream them to the browser.

### 3.2 File Versioning
Every upload of an existing filename creates a new database record with an incremented version number and a `parent_version_id` reference to the previous version. Users can view the complete version history and download any specific version.

### 3.3 Block-Level Deduplication
The `dedup_index` table stores `(sha256_checksum → hdfs_path)` mappings. Before uploading, the backend checks if the checksum already exists. If it does, no HDFS upload occurs — the existing path is reused and the reference count incremented. Storage savings are reported in the stats endpoint.

**Deduplication ratio** = `dedup_saved_bytes / total_logical_bytes`

### 3.4 File Sharing with Expiration Links
Users can generate shareable download links with configurable expiry (1 hour, 24 hours, 7 days, or never). Share tokens are cryptographically random 32-byte URL-safe strings. Anyone with the link can download the file without authentication until the link expires.

### 3.5 Trash / Recovery System
Deleting a file performs a soft delete — setting `is_deleted = true` and `deleted_at = now()` in PostgreSQL. The file remains in HDFS. Users can restore deleted files from the Trash tab, or they can be permanently purged (future extension).

### 3.6 Storage Quota Management
Each user has a configurable quota (default 5 GB). The `used_bytes` field is incremented on upload and checked before accepting new files. The sidebar displays a quota usage bar in real time.

### 3.7 Sync Events (Kafka)
Every file operation publishes a JSON event to the Kafka `file-sync` topic:
```json
{
  "event": "UPLOAD",
  "user_id": 1,
  "file_id": 42,
  "filename": "report.pdf",
  "version": 2,
  "dedup_hit": true
}
```
Desktop sync clients can consume this topic to keep local folders in sync.

---

## 4. Database Schema

### users
Stores registered users with hashed passwords, quota, and usage tracking.

### files
Each row is one version of a file. The `parent_version_id` creates a linked list of versions. `is_deleted` enables soft-delete/trash.

### dedup_index
Maps SHA-256 checksums to HDFS paths. `ref_count` tracks how many file records share the same HDFS block.

### shares
Share tokens linked to files with optional expiry timestamps.

### sync_events
Audit log of all file operations for Kafka replay and history.

---

## 5. API Design

The REST API follows standard HTTP conventions:

- `POST /auth/register` — Create account
- `POST /auth/login` — Authenticate, receive JWT
- `POST /files/upload` — Multipart upload
- `GET /files` — List active files
- `GET /files/{id}/download` — Download file
- `GET /files/{name}/versions` — Version history
- `DELETE /files/{id}` — Soft delete
- `POST /files/{id}/restore` — Restore from trash
- `POST /files/share` — Generate share link
- `GET /shared/{token}/download` — Public share download
- `GET /stats` — Storage analytics

All private endpoints use JWT Bearer authentication.

---

## 6. Cloud Computing Concepts Demonstrated

### Distributed File System
Files are stored in HDFS, a distributed file system that partitions large files into blocks (default 128 MB) and stores them across multiple physical nodes. The Namenode maintains a filesystem namespace and tracks which Datanodes hold each block.

### Data Replication
HDFS replicates every block to 3 Datanodes. If a Datanode fails, data remains accessible from the other two copies. The Namenode monitors Datanode heartbeats and re-replicates data if a node goes offline.

### Consistency Model
The system uses a hybrid consistency model: strong consistency for metadata operations (via PostgreSQL ACID transactions) and write-once strong consistency for file data (HDFS enforces single-writer semantics). File versioning handles concurrent write conflicts by creating new versions rather than overwriting.

### Erasure Coding (Concept)
While the implementation uses standard 3× replication, HDFS 3.x supports erasure coding (EC) as an alternative. EC reduces storage overhead from 200% (3× replication) to ~50% (e.g., RS-6-3 policy) while maintaining the same fault tolerance. This would be enabled via: `hdfs ec -setPolicy -policy RS-6-3-1024k -path /dropbox`.

---

## 7. Evaluation Metrics

### Upload/Download Throughput
Measured using `time curl` for single-file transfers and Apache Bench for concurrent load testing. HDFS throughput scales linearly with additional Datanodes.

### Sync Latency
Kafka event publish latency is typically <5ms on the local Docker network. End-to-end sync latency (upload → event published) is dominated by HDFS write time.

### Storage Deduplication Ratio
```
dedup_ratio = dedup_saved_bytes / (total_logical_size + dedup_saved_bytes)
```
In workloads with many duplicate files (e.g., identical backups), ratios of 60–80% are achievable.

### Replication Factor Verification
```bash
docker exec namenode hdfs dfs -stat "%r" /dropbox/
# Output: 3  (confirms 3× replication)
```

### Concurrent User Capacity
The FastAPI backend uses async I/O (uvicorn + asyncio), capable of handling hundreds of concurrent connections. Horizontal scaling is achieved by running multiple backend replicas behind a load balancer.

---

## 8. Challenges and Solutions

| Challenge | Solution |
|-----------|---------|
| HDFS WebHDFS 307 redirect | Followed redirect chain in `hdfs_client.py` manually |
| No Java client needed | Used WebHDFS REST API — pure HTTP from Python |
| Kafka unavailability at startup | Made Kafka publishing non-blocking with try/catch |
| CORS for frontend-backend | Added FastAPI CORS middleware |
| Internal Docker hostnames | Nginx proxy rewrites `/api/` to backend container |

---

## 9. Future Extensions

1. **File Encryption** — Encrypt file bytes with AES-256 before HDFS upload using user-derived keys
2. **Full-text Search** — Index file contents with Elasticsearch or Apache Solr
3. **Collaborative Editing** — WebSocket-based real-time co-editing using operational transforms
4. **Desktop Sync Client** — Python background daemon consuming Kafka events
5. **Erasure Coding** — Enable HDFS EC policy to reduce storage overhead
6. **Permanent Deletion** — Scheduled job to purge trash older than 30 days from HDFS

---

## 10. Conclusion

CloudDrop successfully implements a Dropbox-like distributed file storage system using industry-grade open-source technologies. The project demonstrates practical application of distributed systems concepts including HDFS-based storage with automatic 3× replication, SHA-256 block-level deduplication, JWT-authenticated REST APIs, event-driven architecture with Kafka, and a complete web UI. All components are containerized with Docker Compose for reproducible deployment.

---

*Submitted for Cloud Computing Course — Group 16*
