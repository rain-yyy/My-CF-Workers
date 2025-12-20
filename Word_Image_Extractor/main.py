import asyncio
import contextlib
import os
import tempfile
from typing import List, Tuple
from zipfile import BadZipFile, ZipFile

import boto3 # boto3是aws的sdk，用于操作aws的资源，cloudfare R2和aws S3是兼容的
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

app = FastAPI(title="Word Image Extractor")


MAX_DOCX_BYTES = int(os.getenv("MAX_DOCX_BYTES", 200 * 1024 * 1024))  # 200 MB
STREAM_CHUNK_SIZE = 1024 * 1024  # 1 MB
R2_ENDPOINT = os.getenv("R2_ENDPOINT")
R2_REGION = os.getenv("R2_REGION", "auto")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PREFIX = os.getenv("R2_PREFIX", "extracted")


def get_s3_client():
    if not all([R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_REGION]):
        raise HTTPException(
            status_code=500, detail="R2 configuration is incomplete in the Dockerfile"
        )
    session = boto3.client(
        service_name="s3",
        endpoint_url=R2_ENDPOINT,
        region_name=R2_REGION,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    )
    return session

# 将上传的文件分快复制到临时文件中，并检查文件大小
async def copy_upload_to_temp(upload: UploadFile) -> str:
    total = 0
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        while True:
            chunk = await upload.read(STREAM_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_DOCX_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File {upload.filename or ''} exceeds max size of {MAX_DOCX_BYTES // (1024 * 1024)} MB",
                )
            tmp.write(chunk)
        return tmp.name

# 将docx文件中的图片上传到R2
def stream_docx_images_to_r2(
    doc_path: str, doc_name: str, s3_client, bucket: str, prefix: str
) -> List[Tuple["zip_path": str, "r2_key": str]]:
    stored: List[Tuple[str, str]] = []
    try:
        with ZipFile(doc_path) as docx_zip:
            for entry in docx_zip.namelist():
                if entry.startswith("word/media/") and not entry.endswith("/"):
                    image_name = entry.split("/")[-1]
                    r2_key = f"{prefix}/{doc_name}/{image_name}"
                    zip_path = f"{doc_name}/{image_name}"
                    with docx_zip.open(entry) as image_stream:
                        s3_client.put_object(
                            Bucket=bucket,
                            Key=r2_key,
                            Body=image_stream.read(),
                        )
                    stored.append((zip_path, r2_key))
    except BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid docx file") from exc
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail="R2 upload failed") from exc
    return stored

# 将R2中的图片下载到本地，并打包成zip文件
def write_bundle_from_r2(
    images: List[Tuple[str, str]], s3_client, bucket: str, bundle_path: str
) -> None:
    try:
        with ZipFile(bundle_path, mode="w") as bundle:
            for zip_path, r2_key in images:
                response = s3_client.get_object(Bucket=bucket, Key=r2_key)
                body = response["Body"]
                with bundle.open(zip_path, "w") as dest:
                    for chunk in body.iter_chunks(chunk_size=STREAM_CHUNK_SIZE):
                        if chunk:
                            dest.write(chunk)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail="R2 download failed") from exc


@app.post("/extract")
async def extract(
    background: BackgroundTasks, files: List[UploadFile] = File(...)
):
    if not files:
        raise HTTPException(status_code=400, detail="no files provided")

    s3_client = get_s3_client()
    image_refs: List[Tuple[str, str]] = []
    temp_docs: List[str] = []

    try:
        for upload in files:
            doc_path = await copy_upload_to_temp(upload)
            temp_docs.append(doc_path)
            doc_name = (upload.filename or "document").rsplit(".", 1)[0]
            # asyncio.to_thread 会讲stream_docx_images_to_r2 放在一个单独的线程中执行，避免阻塞主线程
            refs = await asyncio.to_thread(
                stream_docx_images_to_r2,
                doc_path,
                doc_name,
                s3_client,
                R2_BUCKET,
                R2_PREFIX,
            )
            image_refs.extend(refs)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as bundle_file:
            bundle_path = bundle_file.name

        await asyncio.to_thread(
            write_bundle_from_r2, image_refs, s3_client, R2_BUCKET, bundle_path
        )

        async def file_iterator():
            with open(bundle_path, "rb") as f:
                while True:
                    data = f.read(STREAM_CHUNK_SIZE)
                    if not data:
                        break
                    yield data
        # 添加后台任务来清理临时文件
        background.add_task(os.remove, bundle_path)

        return StreamingResponse(
            file_iterator(),
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="images.zip"'},
        )
    finally:
        for path in temp_docs:
            with contextlib.suppress(OSError):
                os.remove(path)