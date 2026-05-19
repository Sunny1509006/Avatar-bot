# Startup Script for Aria Talking Avatar

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "      Starting Aria Live AI 3D Talking Avatar...       " -ForegroundColor Cyan
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Write-Host "Installing dependencies if not already installed..." -ForegroundColor Yellow
pip install -r requirements.txt

Write-Host ""
Write-Host "Starting Uvicorn Server on http://localhost:8000..." -ForegroundColor Green
Write-Host "Open this address in your browser to interact with Aria." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Red
Write-Host ""

# Run uvicorn server serving backend.server:app
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000 --reload
