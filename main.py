from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional
from google import genai
import tempfile
import os
import json
import anyio # Added for safe async file operations
from database import get_async_db, lifespan
from storage import upload_file_to_object_storage
from dotenv import load_dotenv

load_dotenv(".env")

api_key = os.getenv("GEMINI_API_KEY")

app = FastAPI()

client = genai.Client(
    api_key=api_key
)

class ExpenseCategory(str, Enum):
    PROGRAM_SUPPLIES = "Program Supplies"
    TRANSPORTATION = "Transportation"
    ADMINISTRATIVE = "Administrative"
    EQUIPMENT = "Equipment"

class ReceiptData(BaseModel):
    transaction_date: Optional[str] = Field(description="Formatted as YYYY-MM-DD.")
    vendor_name: Optional[str] = Field(description="Entity paid.")
    total_amount: Optional[float] = Field(description="Final numerical value.")
    expense_category: Optional[ExpenseCategory] = Field(description="Categorize the expense.")
    specific_purpose: Optional[str] = Field(description="Brief text explanation.")

@app.post("/api/receipts/process")
async def process_receipt(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    project_id: str = Form(...),
    user_id: str = Form(...),
    db=Depends(get_async_db)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    storage_key = await upload_file_to_object_storage(file)
    
    async with db.transaction():
        doc_query = """
            INSERT INTO documents (organization_id, uploaded_by, original_filename, storage_key, mime_type)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        """
        document_id = await db.fetchval(
            doc_query, 
            organization_id, user_id, file.filename, storage_key, file.content_type
        )

        prompt = "Analyze this receipt. Extract the transaction details and determine the best expense category."
        
        # We still need a temporary file for the Gemini SDK
        temp_img = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        temp_path = temp_img.name
        temp_img.close() # Close immediately so we can write to it cleanly below

        try:
            await file.seek(0)
            content = await file.read()
            
            # UPDATE 2: Use anyio for non-blocking disk writes
            async with await anyio.open_file(temp_path, 'wb') as async_file:
                await async_file.write(content)

            # Upload to Google
            uploaded_receipt = await client.aio.files.upload(file=temp_path)
            
            try:
                # Generate content
                response = await client.aio.models.generate_content(
                    model="gemini-1.5-flash",
                    contents=[prompt, uploaded_receipt],
                    config={
                        "response_mime_type": "application/json",
                        "response_json_schema": ReceiptData.model_json_schema(),
                        "temperature": 0.1
                    }
                )
                extracted_json = json.loads(response.text)
                
            finally:
                # UPDATE 3: Always delete the remote file from Google's servers
                await client.aio.files.delete(name=uploaded_receipt.name)
                
        finally:
            # Always delete the local temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)

        ocr_query = """
            INSERT INTO ocr_extractions (organization_id, document_id, engine_name, extracted_data, status)
            VALUES ($1, $2, $3, $4, $5);
        """
        await db.execute(
            ocr_query, 
            organization_id, document_id, "gemini-1.5-flash", json.dumps(extracted_json), "completed"
        )

        expense_query = """
            INSERT INTO expenses (organization_id, project_id, submitted_by, vendor_name, description, expense_date, total_amount, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
            RETURNING id;
        """
        expense_id = await db.fetchval(
            expense_query,
            organization_id, project_id, user_id,
            extracted_json.get("vendor_name"),
            extracted_json.get("specific_purpose", "Receipt extraction"),
            extracted_json.get("transaction_date"),
            extracted_json.get("total_amount", 0.0)
        )

        link_query = """
            INSERT INTO expense_documents (organization_id, expense_id, document_id, evidence_role)
            VALUES ($1, $2, $3, 'receipt');
        """
        await db.execute(link_query, organization_id, expense_id, document_id)

    return {
        "status": "success",
        "expense_id": expense_id,
        "extracted_data": extracted_json
    }
