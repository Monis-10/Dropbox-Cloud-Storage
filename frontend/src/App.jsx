import { useState, useEffect, useRef, useCallback } from 'react';
import { auth, files } from './api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fileIcon = (mime) => {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('zip') || mime.includes('tar')) return '🗜️';
  if (mime.includes('text') || mime.includes('json')) return '📝';
  return '📄';
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'IBM Plex Sans', sans-serif;
    background: #0d1117;
    color: #e6edf3;
    min-height: 100vh;
  }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #161b22; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

  .app { display: flex; min-height: 100vh; }

  /* Sidebar */
  .sidebar {
    width: 220px; min-height: 100vh;
    background: #161b22;
    border-right: 1px solid #21262d;
    padding: 24px 0;
    display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh;
  }
  .logo { padding: 0 20px 24px; border-bottom: 1px solid #21262d; }
  .logo h1 { font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #58a6ff; letter-spacing: -0.5px; }
  .logo span { font-size: 11px; color: #8b949e; display: block; margin-top: 2px; }
  .nav { padding: 16px 0; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 20px; cursor: pointer; font-size: 14px;
    color: #8b949e; border-left: 3px solid transparent;
    transition: all 0.15s;
  }
  .nav-item:hover { color: #e6edf3; background: #21262d; }
  .nav-item.active { color: #58a6ff; border-left-color: #58a6ff; background: #1f2937; }
  .sidebar-footer { padding: 16px 20px; border-top: 1px solid #21262d; font-size: 12px; color: #8b949e; }
  .quota-bar { width: 100%; height: 4px; background: #21262d; border-radius: 2px; margin-top: 8px; overflow: hidden; }
  .quota-fill { height: 100%; background: #58a6ff; transition: width 0.3s; }

  /* Main */
  .main { flex: 1; display: flex; flex-direction: column; }
  .topbar {
    height: 56px; background: #161b22; border-bottom: 1px solid #21262d;
    display: flex; align-items: center; padding: 0 24px;
    gap: 12px; position: sticky; top: 0; z-index: 10;
  }
  .topbar-title { font-size: 16px; font-weight: 500; flex: 1; }
  .btn {
    padding: 7px 14px; border-radius: 6px; border: 1px solid #30363d;
    cursor: pointer; font-size: 13px; font-weight: 500;
    background: #21262d; color: #e6edf3; transition: all 0.15s; white-space: nowrap;
  }
  .btn:hover { background: #30363d; border-color: #8b949e; }
  .btn.primary { background: #238636; border-color: #2ea043; color: #fff; }
  .btn.primary:hover { background: #2ea043; }
  .btn.danger { background: #b91c1c; border-color: #dc2626; color: #fff; }
  .btn.danger:hover { background: #dc2626; }
  .btn.small { padding: 4px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .content { padding: 24px; flex: 1; }
  .section-title { font-size: 13px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 16px; }

  /* Drop zone */
  .dropzone {
    border: 2px dashed #30363d; border-radius: 10px;
    padding: 40px; text-align: center; margin-bottom: 24px;
    cursor: pointer; transition: all 0.2s; position: relative;
  }
  .dropzone:hover, .dropzone.dragover { border-color: #58a6ff; background: #1f2937; }
  .dropzone-icon { font-size: 36px; margin-bottom: 10px; }
  .dropzone p { color: #8b949e; font-size: 14px; }
  .dropzone strong { color: #58a6ff; }
  .dropzone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  /* Upload progress */
  .upload-progress { margin-bottom: 20px; }
  .progress-item { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
  .progress-name { font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between; }
  .progress-bar { height: 4px; background: #21262d; border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: #58a6ff; transition: width 0.2s; }

  /* File table */
  .file-table { width: 100%; border-collapse: collapse; }
  .file-table th { text-align: left; padding: 8px 12px; font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #21262d; }
  .file-table td { padding: 10px 12px; border-bottom: 1px solid #21262d; font-size: 13px; vertical-align: middle; }
  .file-table tr:hover td { background: #161b22; }
  .file-row-name { display: flex; align-items: center; gap: 10px; }
  .file-row-name span { font-size: 18px; }
  .file-actions { display: flex; gap: 6px; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
  .tag.version { background: #1e3a5f; color: #58a6ff; }
  .tag.deleted { background: #3b1c1c; color: #f87171; }
  .empty-state { text-align: center; padding: 60px 20px; color: #8b949e; }
  .empty-state .icon { font-size: 48px; margin-bottom: 16px; }

  /* Stats */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 20px; }
  .stat-value { font-size: 28px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; color: #58a6ff; }
  .stat-label { font-size: 12px; color: #8b949e; margin-top: 4px; }

  /* Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .modal { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; width: 460px; max-width: 95vw; }
  .modal h3 { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
  .modal-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
  .modal-input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 8px 12px; color: #e6edf3; font-size: 13px; font-family: 'IBM Plex Mono', monospace; }
  .modal-input:focus { outline: none; border-color: #58a6ff; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

  /* Auth */
  .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0d1117; }
  .auth-card { background: #161b22; border: 1px solid #21262d; border-radius: 12px; padding: 40px; width: 380px; }
  .auth-card h1 { font-family: 'IBM Plex Mono', monospace; font-size: 22px; color: #58a6ff; margin-bottom: 8px; }
  .auth-card p { font-size: 13px; color: #8b949e; margin-bottom: 28px; }
  .input-group { margin-bottom: 16px; }
  .input-group label { display: block; font-size: 12px; color: #8b949e; margin-bottom: 6px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
  .input-group input { width: 100%; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 10px 12px; color: #e6edf3; font-size: 14px; }
  .input-group input:focus { outline: none; border-color: #58a6ff; }
  .auth-switch { text-align: center; margin-top: 20px; font-size: 13px; color: #8b949e; }
  .auth-switch a { color: #58a6ff; cursor: pointer; text-decoration: none; }
  .error-msg { background: #3b1c1c; color: #f87171; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  .success-msg { background: #1a3a1a; color: #4ade80; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
`;

// ── Auth Page ─────────────────────────────────────────────────────────────────

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async () => {
    setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        await auth.register(form);
        setMode('login');
      } else {
        const res = await auth.login(form.username, form.password);
        localStorage.setItem('token', res.data.access_token);
        onLogin();
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>☁️ CloudDrop</h1>
        <p>Distributed file storage powered by Apache Hadoop HDFS</p>
        {error && <div className="error-msg">{error}</div>}
        {mode === 'register' && (
          <div className="input-group">
            <label>Email</label>
            <input name="email" type="email" value={form.email} onChange={handle} placeholder="you@example.com" />
          </div>
        )}
        <div className="input-group">
          <label>Username</label>
          <input name="username" value={form.username} onChange={handle} placeholder="username" />
        </div>
        <div className="input-group">
          <label>Password</label>
          <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••"
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <button className="btn primary" style={{ width: '100%', padding: '11px' }} onClick={submit} disabled={loading}>
          {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
        <div className="auth-switch">
          {mode === 'login' ? (<>No account? <a onClick={() => setMode('register')}>Register</a></>) : (<>Have an account? <a onClick={() => setMode('login')}>Sign in</a></>)}
        </div>
      </div>
    </div>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({ file, onClose }) {
  const [link, setLink] = useState('');
  const [expires, setExpires] = useState(24);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    const res = await files.share(file.id, expires);
    setLink(window.location.origin + res.data.download_url);
  };

  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🔗 Share — {file.filename}</h3>
        <div className="modal-row">
          <label style={{ fontSize: 13, color: '#8b949e', whiteSpace: 'nowrap' }}>Expires in:</label>
          <select className="modal-input" value={expires} onChange={(e) => setExpires(Number(e.target.value))}>
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={168}>7 days</option>
            <option value={0}>Never</option>
          </select>
          <button className="btn primary" onClick={generate}>Generate</button>
        </div>
        {link && (
          <>
            <div className="modal-row">
              <input className="modal-input" readOnly value={link} />
              <button className="btn" onClick={copy}>{copied ? '✓' : 'Copy'}</button>
            </div>
            {copied && <div className="success-msg">Link copied to clipboard!</div>}
          </>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Versions Modal ────────────────────────────────────────────────────────────

function VersionsModal({ filename, onClose }) {
  const [versions, setVersions] = useState([]);
  useEffect(() => {
    files.versions(filename).then((r) => setVersions(r.data));
  }, [filename]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>📋 Versions — {filename}</h3>
        <table className="file-table">
          <thead><tr><th>Version</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td><span className="tag version">v{v.version}</span></td>
                <td>{fmt(v.size_bytes)}</td>
                <td>{fmtDate(v.created_at)}</td>
                <td><button className="btn small" onClick={() => files.download(v.id, v.filename)}>⬇</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

function Dashboard({ user, onLogout }) {
  const [tab, setTab] = useState('files');
  const [fileList, setFileList] = useState([]);
  const [trashList, setTrashList] = useState([]);
  const [stats, setStats] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [versionsTarget, setVersionsTarget] = useState(null);
  const fileInput = useRef();

  const loadFiles = useCallback(async () => {
    const [active, deleted, st] = await Promise.all([
      files.list(false),
      files.list(true),
      files.stats(),
    ]);
    setFileList(active.data);
    setTrashList(deleted.data.filter((f) => f.is_deleted));
    setStats(st.data);
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUpload = async (fileObjs) => {
    const arr = Array.from(fileObjs);
    const progMap = {};
    arr.forEach((f, i) => { progMap[i] = { name: f.name, progress: 0 }; });
    setUploads(Object.values(progMap));

    await Promise.all(arr.map((f, i) =>
      files.upload(f, (p) => {
        progMap[i].progress = p;
        setUploads([...Object.values(progMap)]);
      })
    ));
    setUploads([]);
    loadFiles();
  };

  const handleDelete = async (id) => {
    await files.delete(id);
    loadFiles();
  };

  const handleRestore = async (id) => {
    await files.restore(id);
    loadFiles();
  };

  const quotaPct = stats ? Math.min(100, (stats.used_bytes / stats.quota_bytes) * 100) : 0;

  return (
    <div className="app">
      {shareTarget && <ShareModal file={shareTarget} onClose={() => setShareTarget(null)} />}
      {versionsTarget && <VersionsModal filename={versionsTarget} onClose={() => setVersionsTarget(null)} />}

      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo">
          <h1>☁️ CloudDrop</h1>
          <span>HDFS Distributed Storage</span>
        </div>
        <div className="nav">
          {[
            { id: 'files', label: '📁 My Files' },
            { id: 'trash', label: '🗑️ Trash' },
            { id: 'stats', label: '📊 Stats' },
          ].map((n) => (
            <div key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
              {n.label}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <div style={{ fontWeight: 500, color: '#e6edf3', marginBottom: 4 }}>{user.username}</div>
          <div>{fmt(stats?.used_bytes || 0)} / {fmt(user.quota_bytes)}</div>
          <div className="quota-bar"><div className="quota-fill" style={{ width: `${quotaPct}%` }} /></div>
          <button className="btn" style={{ width: '100%', marginTop: 12, fontSize: 12 }} onClick={onLogout}>Sign Out</button>
        </div>
      </div>

      {/* Main */}
      <div className="main">
        <div className="topbar">
          <div className="topbar-title">
            {tab === 'files' && 'My Files'}
            {tab === 'trash' && 'Trash'}
            {tab === 'stats' && 'Storage Statistics'}
          </div>
          {tab === 'files' && (
            <button className="btn primary" onClick={() => fileInput.current?.click()}>⬆ Upload File</button>
          )}
          <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={(e) => handleUpload(e.target.files)} />
        </div>

        <div className="content">
          {/* ── Files Tab ── */}
          {tab === 'files' && (
            <>
              {/* Drop Zone */}
              <div
                className={`dropzone ${dragging ? 'dragover' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleUpload(e.dataTransfer.files); }}
                onClick={() => fileInput.current?.click()}
              >
                <div className="dropzone-icon">📂</div>
                <p>Drag & drop files here or <strong>click to browse</strong></p>
                <p style={{ marginTop: 4, fontSize: 12 }}>Files stored in HDFS with 3× replication + deduplication</p>
              </div>

              {/* Upload progress */}
              {uploads.length > 0 && (
                <div className="upload-progress">
                  {uploads.map((u, i) => (
                    <div key={i} className="progress-item">
                      <div className="progress-name"><span>{u.name}</span><span>{u.progress}%</span></div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${u.progress}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}

              {/* File list */}
              <div className="section-title">Files ({fileList.length})</div>
              {fileList.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">📭</div>
                  <p>No files yet. Upload something!</p>
                </div>
              ) : (
                <table className="file-table">
                  <thead>
                    <tr><th>Name</th><th>Size</th><th>Version</th><th>Uploaded</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {fileList.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <div className="file-row-name">
                            <span>{fileIcon(f.mime_type)}</span>
                            <div>
                              <div>{f.filename}</div>
                              <div style={{ fontSize: 11, color: '#8b949e' }}>{f.mime_type || 'unknown'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 12 }}>{fmt(f.size_bytes)}</td>
                        <td><span className="tag version">v{f.version}</span></td>
                        <td style={{ fontSize: 12, color: '#8b949e' }}>{fmtDate(f.created_at)}</td>
                        <td>
                          <div className="file-actions">
                            <button className="btn small" onClick={() => files.download(f.id, f.filename)}>⬇</button>
                            <button className="btn small" onClick={() => setVersionsTarget(f.filename)}>🕒</button>
                            <button className="btn small" onClick={() => setShareTarget(f)}>🔗</button>
                            <button className="btn small danger" onClick={() => handleDelete(f.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* ── Trash Tab ── */}
          {tab === 'trash' && (
            <>
              <div className="section-title">Trash ({trashList.length})</div>
              {trashList.length === 0 ? (
                <div className="empty-state"><div className="icon">🗑️</div><p>Trash is empty</p></div>
              ) : (
                <table className="file-table">
                  <thead><tr><th>Name</th><th>Size</th><th>Deleted</th><th>Actions</th></tr></thead>
                  <tbody>
                    {trashList.map((f) => (
                      <tr key={f.id}>
                        <td><div className="file-row-name"><span>{fileIcon(f.mime_type)}</span>{f.filename}</div></td>
                        <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 12 }}>{fmt(f.size_bytes)}</td>
                        <td style={{ fontSize: 12, color: '#8b949e' }}>{f.deleted_at ? fmtDate(f.deleted_at) : '—'}</td>
                        <td><button className="btn small primary" onClick={() => handleRestore(f.id)}>↩ Restore</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* ── Stats Tab ── */}
          {tab === 'stats' && stats && (
            <>
              <div className="stats-grid">
                {[
                  { label: 'Active Files', value: stats.active_files },
                  { label: 'Deleted Files', value: stats.deleted_files },
                  { label: 'Total Storage Used', value: fmt(stats.total_size_bytes) },
                  { label: 'Dedup Space Saved', value: fmt(stats.dedup_saved_bytes) },
                  { label: 'Quota Used', value: `${Math.round((stats.used_bytes / stats.quota_bytes) * 100)}%` },
                  { label: 'HDFS Replication', value: '3×' },
                ].map((s) => (
                  <div key={s.label} className="stat-card">
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="section-title">Architecture</div>
              <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 20, fontSize: 13, lineHeight: 1.8, fontFamily: 'IBM Plex Mono', color: '#8b949e' }}>
                <div>📡 <span style={{color:'#58a6ff'}}>Namenode</span>  — HDFS master (metadata)</div>
                <div>💾 <span style={{color:'#4ade80'}}>Datanode 1/2/3</span> — Storage nodes (replication factor: 3)</div>
                <div>🐍 <span style={{color:'#fbbf24'}}>FastAPI Backend</span> — REST API + WebHDFS bridge</div>
                <div>🗄️ <span style={{color:'#a78bfa'}}>PostgreSQL</span>   — File metadata + deduplication index</div>
                <div>📨 <span style={{color:'#f87171'}}>Apache Kafka</span>  — Sync events stream</div>
                <div>⚛️  <span style={{color:'#38bdf8'}}>React Frontend</span> — This interface</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      auth.me()
        .then((r) => setUser(r.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = async () => {
    const r = await auth.me();
    setUser(r.data);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0d1117',color:'#8b949e' }}>Loading...</div>;

  return (
    <>
      <style>{styles}</style>
      {user ? <Dashboard user={user} onLogout={handleLogout} /> : <AuthPage onLogin={handleLogin} />}
    </>
  );
}
