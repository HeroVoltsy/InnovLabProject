import json
import os
import tempfile
from enum import Enum
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel, Field
from google import genai

# Load configuration
load_dotenv(".env")

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is missing from your .env file")

client = genai.Client(api_key=api_key)

# Use a model name supported by your Gemini API key.

app = FastAPI(title="Receipt OCR API")


class ExpenseCategory(str, Enum):
    PROGRAM_SUPPLIES = "Program Supplies"
    TRANSPORTATION = "Transportation"
    ADMINISTRATIVE = "Administrative"
    EQUIPMENT = "Equipment"


class ReceiptData(BaseModel):
    transaction_date: Optional[str] = Field(
        default=None,
        description="Transaction date in YYYY-MM-DD format, or null if unreadable."
    )
    vendor_name: Optional[str] = Field(
        default=None,
        description="Name of the vendor, or null if unreadable."
    )
    total_amount: Optional[float] = Field(
        default=None,
        description="Final receipt total as a number, or null if unreadable."
    )
    expense_category: Optional[ExpenseCategory] = Field(
        default=None,
        description="Best matching expense category, or null if uncertain."
    )
    specific_purpose: Optional[str] = Field(
        default=None,
        description="Brief description of the purchase, or null if unclear."
    )


@app.get("/")
async def root():
    return {"status": "running", "service": "Receipt OCR API"}


@app.post("/api/receipts/process")
async def process_receipt(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="File must be an image."
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    suffix = os.path.splitext(file.filename or "")[1] or ".jpg"
    temp_path = None
    uploaded_receipt = None

    try:
        # Save image temporarily for the Gemini SDK
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix
        ) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        # Upload image to Gemini
        uploaded_receipt = await client.aio.files.upload(file=temp_path)

        prompt = """
        Analyze this receipt and extract its information.

        Return:
        - transaction_date in YYYY-MM-DD format
        - vendor_name
        - total_amount as a number
        - expense_category using one of the allowed categories
        - specific_purpose as a brief purchase description

        Allowed categories:
        Program Supplies, Transportation, Administrative, Equipment.

        Do not invent missing information. Return null for fields
        that cannot be determined reliably.
        """

        response = await client.aio.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=[prompt, uploaded_receipt],
            config={
                "response_mime_type": "application/json",
                "response_json_schema": ReceiptData.model_json_schema(),
                "temperature": 0.1,
            },
        )

        if not response.text:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty response."
            )

        # Validate the returned JSON against our schema
        extracted_data = ReceiptData.model_validate_json(response.text)

        return {
            "status": "success",
            "filename": file.filename,
            "extracted_data": extracted_data.model_dump(mode="json"),
        }

    except HTTPException:
        raise
    except Exception as exc:
        # Keep detailed errors in the server logs
        print(f"Receipt OCR error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Receipt processing failed. Check the server logs."
        )
    finally:
        # Clean up the Gemini upload
        if uploaded_receipt is not None:
            try:
                await client.aio.files.delete(name=uploaded_receipt.name)
            except Exception as exc:
                print(f"Gemini file cleanup failed: {exc}")

        # Clean up the local temporary image
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
