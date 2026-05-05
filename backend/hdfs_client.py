"""
HDFS interaction via WebHDFS REST API.
No Java needed — just HTTP calls to the Namenode.
"""
import httpx
import io
from config import settings

WEBHDFS = f"{settings.hdfs_url}/webhdfs/v1"


async def hdfs_mkdir(path: str):
    """Create directory in HDFS."""
    url = f"{WEBHDFS}{path}?op=MKDIRS&user.name=root"
    async with httpx.AsyncClient() as client:
        r = await client.put(url)
        r.raise_for_status()


async def hdfs_upload(hdfs_path: str, data: bytes):
    """Upload bytes to HDFS path. Follows the 2-step WebHDFS redirect."""
    # Step 1: get redirect URL from namenode
    url = f"{WEBHDFS}{hdfs_path}?op=CREATE&overwrite=true&user.name=root"
    async with httpx.AsyncClient(follow_redirects=False) as client:
        r = await client.put(url, content=b"")
        # Step 2: namenode returns 307 redirect to datanode
        if r.status_code == 307:
            location = r.headers["Location"]
            # Replace internal hostname with accessible one if needed
            async with httpx.AsyncClient() as client2:
                r2 = await client2.put(location, content=data)
                r2.raise_for_status()
        else:
            r.raise_for_status()


async def hdfs_download(hdfs_path: str) -> bytes:
    """Download file bytes from HDFS."""
    url = f"{WEBHDFS}{hdfs_path}?op=OPEN&user.name=root"
    async with httpx.AsyncClient(follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


async def hdfs_delete(hdfs_path: str):
    """Delete file from HDFS."""
    url = f"{WEBHDFS}{hdfs_path}?op=DELETE&recursive=false&user.name=root"
    async with httpx.AsyncClient() as client:
        r = await client.delete(url)
        # 404 is fine — already gone
        if r.status_code not in (200, 404):
            r.raise_for_status()


async def hdfs_status(hdfs_path: str) -> dict:
    """Get file/dir status from HDFS."""
    url = f"{WEBHDFS}{hdfs_path}?op=GETFILESTATUS&user.name=root"
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.json()["FileStatus"]
