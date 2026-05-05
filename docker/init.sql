-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    quota_bytes BIGINT DEFAULT 5368709120,  -- 5 GB default
    used_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    hdfs_path VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100),
    checksum_sha256 VARCHAR(64) NOT NULL,   -- for deduplication
    version INTEGER DEFAULT 1,
    parent_version_id INTEGER REFERENCES files(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Shares table
CREATE TABLE IF NOT EXISTS shares (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    owner_id INTEGER REFERENCES users(id),
    share_token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- File permissions table
CREATE TABLE IF NOT EXISTS file_permissions (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    can_read BOOLEAN DEFAULT TRUE,
    can_write BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(file_id, user_id)
);

-- Dedup index (sha256 -> hdfs_path mapping)
CREATE TABLE IF NOT EXISTS dedup_index (
    checksum_sha256 VARCHAR(64) PRIMARY KEY,
    hdfs_path VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    ref_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Sync events table
CREATE TABLE IF NOT EXISTS sync_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    file_id INTEGER REFERENCES files(id),
    event_type VARCHAR(20) NOT NULL,  -- UPLOAD, DELETE, RESTORE, SHARE
    device_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);
