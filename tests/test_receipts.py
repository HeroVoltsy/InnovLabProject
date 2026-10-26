import pytest
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional
from unittest.mock import patch, AsyncMock, MagicMock
import tempfile
import os
import json

# ==============================================================================
# 1. APP DEFINITION (Your original code, slightly adjusted for stubbing)
# ==============================================================================

app = FastAPI()

# Stubs for the dependencies that were missing in the original snippet
async def get_async_db():
    raise NotImplementedError("This should be overridden in tests")

async def upload_file_to_object_storage(file: UploadFile):
    raise NotImplementedError("This should be mocked in tests")

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

# Fake Gemini client structure to mimic your app's usage without real API keys
class FakeGeminiClient:
    class Aio:
        class Files:
            async def upload(self, file): pass
        class Models:
            async def generate_content(self, model, contents, config): pass
    
    def __init__(self):
        self.aio = self.Aio()
        self.aio.files = self.Aio.Files()
        self.aio.models = self.Aio.Models()

client = FakeGeminiClient()

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
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_img:
            await file.seek(0)
            content = await file.read()
            temp_img.write(content)
            temp_path = temp_img.name

        try:
            uploaded_receipt = await client.aio.files.upload(file=temp_path)
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


# ==============================================================================
# 2. PYTEST SUITE
# ==============================================================================

# Create a FastAPI TestClient instance
test_client = TestClient(app)

@pytest.fixture
def mock_db():
    """Creates a mock async database session."""
    db_mock = AsyncMock()
    
    # FIX: db.transaction() is a synchronous call that returns an async context manager.
    # Therefore, db_mock.transaction must be a MagicMock, not an AsyncMock.
    tx_mock = AsyncMock()
    tx_mock.__aenter__.return_value = None
    tx_mock.__aexit__.return_value = None
    db_mock.transaction = MagicMock(return_value=tx_mock)
    
    # Mock the return values for database insertions
    db_mock.fetchval.side_effect = [101, 505] 
    db_mock.execute = AsyncMock()
    
    return db_mock

def test_process_receipt_success(mock_db):
    """Test the happy path where a receipt image is successfully processed."""
    
    # Override the FastAPI db dependency
    app.dependency_overrides[get_async_db] = lambda: mock_db

    # Setup the mock AI response
    fake_ai_data = {
        "transaction_date": "2026-10-26",
        "vendor_name": "Office Depot",
        "total_amount": 45.99,
        "expense_category": "Program Supplies",
        "specific_purpose": "Binders and pens"
    }
    
    mock_ai_response = MagicMock()
    mock_ai_response.text = json.dumps(fake_ai_data)

    # We patch the specific methods our endpoint calls so they don't do real work
    with patch("test_receipts.upload_file_to_object_storage", new_callable=AsyncMock) as mock_storage, \
         patch.object(client.aio.files, "upload", new_callable=AsyncMock) as mock_gemini_upload, \
         patch.object(client.aio.models, "generate_content", new_callable=AsyncMock) as mock_gemini_generate:
        
        mock_storage.return_value = "s3://bucket/receipt.jpg"
        mock_gemini_generate.return_value = mock_ai_response

        # Act: Send a request to the endpoint
        response = test_client.post(
            "/api/receipts/process",
            data={
                "organization_id": "org_123",
                "project_id": "proj_abc",
                "user_id": "user_999"
            },
            files={"file": ("receipt.jpg", b"fake_image_bytes", "image/jpeg")}
        )

    # Assert: Verify the results
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["expense_id"] == 505
    assert data["extracted_data"]["vendor_name"] == "Office Depot"
    
    # Verify our mocks were called
    mock_storage.assert_called_once()
    mock_gemini_generate.assert_called_once()
    assert mock_db.fetchval.call_count == 2
    assert mock_db.execute.call_count == 2

def test_process_receipt_invalid_file_type(mock_db):
    """Test that uploading a PDF or text file is rejected immediately."""
    
    app.dependency_overrides[get_async_db] = lambda: mock_db
    
    response = test_client.post(
        "/api/receipts/process",
        data={
            "organization_id": "org_123",
            "project_id": "proj_abc",
            "user_id": "user_999"
        },
        # Intentionally sending a text file mime type
        files={"file": ("receipt.pdf", b"fake_pdf_data", "application/pdf")} 
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "File must be an image."