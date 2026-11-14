# Stand-in backend (for testing the frontend without the real server)

Synthetic fires for the team's countries, served with **the backend's own SQL and JSON shapes**.
It is test data only: never ship it, screenshot it as results, or point the deployed app at it.

```bash
pip install duckdb
python3 makedata.py                 # writes data/*.parquet (synthetic, git-ignored)
python3 server.py                   # http://127.0.0.1:5098  (/health, /api/...)
WAKE=75 python3 server.py           # simulate a sleeping container that holds requests 75 s
MODE=503 WAKE=50 python3 server.py  # simulate a wake page answering 503 for 50 s
cd ../.. && VITE_API_URL=http://localhost:5098 npm run build && npx vite preview --port 4199
```
