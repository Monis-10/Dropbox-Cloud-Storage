#!/usr/bin/env python3
import requests

BASE = "http://localhost:8000"

def sep(title):
    print(f"\n{'='*50}")
    print(f"  {title}")
    print('='*50)

# 1. Register
sep("1. Register User")
r = requests.post(f"{BASE}/auth/register", json={
    "username": "hassaan2", "email": "hassaan2@demo.com", "password": "demo1234"
})
print(f"Register status: {r.status_code}")

# 2. Login
sep("2. Login")
r = requests.post(f"{BASE}/auth/login", data={"username": "hassaan2", "password": "demo1234"})
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"Login successful. Token: {token[:30]}...")

# 3. Upload File 1
sep("3. Upload test_file.txt")
content = b"Hello from CloudDrop! This is a test file." * 100
r = requests.post(f"{BASE}/files/upload", headers=headers,
    files={"file": ("test_file.txt", content, "text/plain")})
print(f"Upload response: {r.status_code} {r.text[:200]}")
file1 = r.json()
print(f"Uploaded: {file1['filename']} | Size: {file1['size_bytes']} bytes | Version: {file1['version']}")

# 4. Deduplication
sep("4. Deduplication Test")
r = requests.post(f"{BASE}/files/upload", headers=headers,
    files={"file": ("copy_of_test.txt", content, "text/plain")})
file2 = r.json()
print(f"Uploaded: {file2['filename']} | Dedup hit expected (same content)")

# 5. Versioning
sep("5. Versioning - upload new version")
content_v2 = b"Version 2 content - updated!" * 100
r = requests.post(f"{BASE}/files/upload", headers=headers,
    files={"file": ("test_file.txt", content_v2, "text/plain")})
file_v2 = r.json()
print(f"New version: {file_v2['filename']} v{file_v2['version']}")

r = requests.get(f"{BASE}/files/test_file.txt/versions", headers=headers)
versions = r.json()
version_labels = ["v" + str(v["version"]) for v in versions]
print(f"Versions found: {version_labels}")

# 6. List Files
sep("6. List Active Files")
r = requests.get(f"{BASE}/files", headers=headers)
for f in r.json():
    print(f"  {f['filename']} | v{f['version']} | {f['size_bytes']} bytes")

# 7. Download
sep("7. Download test_file.txt")
r = requests.get(f"{BASE}/files/{file_v2['id']}/download", headers=headers)
if r.status_code == 200:
    print(f"Downloaded {len(r.content)} bytes successfully")

# 8. Share Link
sep("8. Create Share Link")
r = requests.post(f"{BASE}/files/share", headers=headers,
    json={"file_id": file_v2["id"], "expires_hours": 1})
share = r.json()
print(f"Share token: {share['share_token'][:20]}...")
print(f"Download URL: {BASE}{share['download_url']}")

# 9. Trash and Restore
sep("9. Trash and Restore")
r = requests.delete(f"{BASE}/files/{file1['id']}", headers=headers)
print(f"Deleted: {r.json()['message']}")
r = requests.post(f"{BASE}/files/{file1['id']}/restore", headers=headers)
print(f"Restored: {r.json()['message']}")

# 10. Stats
sep("10. Storage Statistics")
r = requests.get(f"{BASE}/stats", headers=headers)
s = r.json()
print(f"  Active Files:  {s['active_files']}")
print(f"  Deleted Files: {s['deleted_files']}")
print(f"  Total Size:    {s['total_size_bytes']:,} bytes")
print(f"  Dedup Saved:   {s['dedup_saved_bytes']:,} bytes")
print(f"  Quota Used:    {s['used_bytes']:,} / {s['quota_bytes']:,} bytes")

print("\nAll demo steps completed successfully!")
