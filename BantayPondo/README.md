# BantayPondo frontend

The frontend project root is the repository root (`..` from this folder).
This directory does not contain a separate `package.json`, so running `npm`
commands from here will result in an `ENOENT` error.

From the repository root, install dependencies and start the frontend:

```powershell
cd ..
npm install
npm run dev
```

To run a root npm script while staying in this folder, use the `--prefix`
option. For example:

```powershell
npm --prefix .. run dev
npm --prefix .. run build
npm --prefix .. run validate-data
npm --prefix .. test
```

The receipt and expense services use mock responses by default, so the flow
works before the FastAPI backend is available. To connect the API, set
`VITE_USE_MOCK=false` and `VITE_API_BASE_URL=http://localhost:8000` in the
repository-root `.env` file, then restart Vite.
