    
import os
import uuid
import anyio
from pathlib import Path
from fastapi import UploadFile, HTTPException

UPLOAD_DIR = Path("uploads/receipts")


async def upload_file_to_object_storage(file: UploadFile) -> str:
    # Validate the declared MIME type.
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="File must be an image."
        )

    # Create the directory if it doesn't exist.
    await anyio.to_thread.run_sync(
        lambda: UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    )

    # Generate a unique filename.
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        extension = ".jpg"

    filename = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename

    # Read and save the file asynchronously.
    await file.seek(0)
    content = await file.read()

    try:
        async with await anyio.open_file(destination, "wb") as f:
            await f.write(content)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to save receipt."
        ) from exc

    # Store a relative storage key in PostgreSQL.
    return str(destination)
