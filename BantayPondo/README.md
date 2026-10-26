# BantayPondo receipt expense form

Run the frontend from this folder with `corepack pnpm dev`. The receipt and expense services use mock responses by default, so the flow works before the FastAPI backend is available.

To connect the real API, set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL=http://localhost:8000` in a local `.env` file, then restart Vite. The service calls use `POST /api/receipts/extract` with a multipart `receipt` field and `POST /api/expenses` with multipart expense fields plus the optional receipt. FastAPI should return the extraction fields documented in the product brief.

## Mock scenarios

In development, add one of these query parameters to the URL:

- `?mock=partial` — successful extraction with vendor and amount left blank.
- `?mock=notimage` — simulated 400 / unreadable file response.
- `?mock=toolarge` — simulated 413 response.
- `?mock=error` — simulated 500 response.
- `?mock=slow` — waits beyond 30 seconds to exercise timeout handling.

Remove the query parameter to restore the normal 2–3 second sample extraction. Saving a mock expense takes about 1.5 seconds.
