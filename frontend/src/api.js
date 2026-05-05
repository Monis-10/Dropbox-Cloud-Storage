import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

// Attach token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const auth = {
  register: (data) => API.post('/auth/register', data),
  login: (username, password) => {
    const form = new URLSearchParams();
    form.append('username', username);
    form.append('password', password);
    return API.post('/auth/login', form, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  },
  me: () => API.get('/auth/me'),
};

export const files = {
  list: (includeDeleted = false) => API.get(`/files?include_deleted=${includeDeleted}`),
  upload: (file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return API.post('/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
    });
  },
  download: (fileId, filename) => {
    return API.get(`/files/${fileId}/download`, { responseType: 'blob' }).then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  },
  versions: (filename) => API.get(`/files/${encodeURIComponent(filename)}/versions`),
  delete: (fileId) => API.delete(`/files/${fileId}`),
  restore: (fileId) => API.post(`/files/${fileId}/restore`),
  share: (fileId, expiresHours = 24) => API.post('/files/share', { file_id: fileId, expires_hours: expiresHours }),
  stats: () => API.get('/stats'),
};
