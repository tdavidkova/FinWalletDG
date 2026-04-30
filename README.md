# FinWalletDG — Kindergarten Class Fund Tracker

Web application for tracking class fund finances for kindergarten group 2А (ДГ Мечо Пух).

## Prerequisites

- Python 3.12+

## Setup

```powershell
pip install -r requirements.txt
```

## Start the app

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

The app will be available at **http://127.0.0.1:8000**.

## Stop the app

Press **Ctrl+C** in the terminal where the server is running.

If running in the background or the terminal is unresponsive, find and kill the process:

```powershell
# Find the process
Get-Process -Name python | Where-Object { $_.CommandLine -like '*uvicorn*' }

# Kill it
Get-Process -Name python | Where-Object { $_.CommandLine -like '*uvicorn*' } | Stop-Process -Force
```

Or by port:

```powershell
# Find what's using port 8000
netstat -ano | findstr :8000

# Kill by PID (replace <PID> with the actual number)
Stop-Process -Id <PID> -Force
```

## Automatic backups

Every mutating operation (create, update, delete) automatically saves a full Excel snapshot to the `backups/` folder. Each file is named `backup_YYYY-MM-DD_HH-MM-SS.xlsx` and contains sheets for all groups, students, transactions, categories, and invoices.

## Database

By default the app uses a local SQLite file (`finwallet.db`). For production, set the `DATABASE_URL` environment variable to a PostgreSQL connection string — the app switches automatically:

```powershell
$env:DATABASE_URL = "postgresql://user:pass@host/dbname?sslmode=require"
python -m uvicorn app.main:app --reload --port 8000
```

A free PostgreSQL database can be created at [neon.tech](https://neon.tech) (512 MB, no credit card).

## Deployment

See `FinWalletDG_Render_Deployment.docx` for step-by-step instructions to deploy on Render (free) with Neon PostgreSQL (free).
