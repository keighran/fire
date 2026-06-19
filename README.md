# 🇦🇺 Australian Wealth Tracker

A full-stack Personal Wealth Management application for the Australian FI/RE community.
Replaces the CompiledSanity Personal Wealth Template v2.12.1 spreadsheet with a
live-data, database-backed web application.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLModel, Alembic |
| Database | PostgreSQL 15 |
| Market Data | yfinance (ASX/NYSE/LSE), CoinGecko (Crypto) |
| Frontend | Next.js 14 (App Router), Tailwind CSS, Recharts |
| Container | Docker + Docker Compose |

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Python 3.11+
- Node.js 18+

---

### Step 1 — Environment setup

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your values (defaults work for local dev)
```

---

### Step 2 — Start PostgreSQL

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **pgAdmin** on `http://localhost:5050`
  - Login: `admin@wealth.local` / `admin`
  - Add server: Host=`db`, Port=`5432`, User=`wealth_user`, Pass=`wealth_pass`

Verify the DB is healthy:
```bash
docker compose ps
```

---

### Step 3 — Backend setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt
```

---

### Step 4 — Run database migrations

```bash
# From the backend/ directory (with venv active)
alembic upgrade head
```

---

### Step 5 — Seed demo data (optional)

```bash
python seed_data.py
```

Creates a demo user (`demo@wealth.local` / `demo1234`) with sample accounts,
assets, and transactions including VAS.AX, VGS.AX, ANZ.AX, Bitcoin, and cash accounts.

---

### Step 6 — Start the backend API

```bash
uvicorn app.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

---

### Step 7 — Start the frontend

```bash
cd ../frontend

npm install
npm run dev
```

App available at: `http://localhost:3000`

---

## Running the test suite

```bash
cd backend
pytest tests/ -v
```

The test suite covers:
- CGT discount: short-term (<365 days) vs long-term (>365 days, exactly 50%)
- Boundary condition: exactly 365 days = **no** discount (strictly > required)
- FIFO lot ordering and partial sells across multiple lots
- Capital losses (never discounted)
- Franking credit gross-up formula (30/70 corporate rate)
- Australian tax year (Jul–Jun) calculation
- Budget pay frequency normalisation (weekly/fortnightly/monthly)
- Emergency fund ROUNDUP formula
- FIRE number (4% rule), projection trajectory
- Property equity, LVR, zero-division guard

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://wealth_user:wealth_pass@localhost:5432/wealth_tracker` | Full DB connection string |
| `POSTGRES_USER` | `wealth_user` | DB username |
| `POSTGRES_PASSWORD` | `wealth_pass` | DB password |
| `POSTGRES_DB` | `wealth_tracker` | DB name |
| `SECRET_KEY` | — | JWT signing key (change in production) |
| `COINGECKO_API_KEY` | *(blank)* | CoinGecko API key — leave blank for free tier |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL for frontend |

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/net-worth` | Current net worth snapshot |
| `POST` | `/api/net-worth/snapshot` | Record monthly history snapshot |
| `GET` | `/api/history` | Net worth time-series (last N months) |
| `GET` | `/api/holdings` | Portfolio holdings with live prices |
| `GET` | `/api/prices?tickers=VAS.AX,VGS.AX` | Fetch live prices |
| `POST` | `/api/prices/refresh` | Refresh all asset prices from yfinance/CoinGecko |
| `GET` | `/api/dividends` | Full dividend ledger with franking gross-up |
| `GET` | `/api/dividends/fy-summary` | FY Jul–Jun dividend totals by asset class |
| `GET` | `/api/cgt-report` | FIFO CGT report (optional `?tax_year=2024-25`) |
| `GET` | `/api/tax/dividend-gross-up` | Calculate franking credit for a dividend |
| `GET` | `/api/cash/balances` | Cash balances per account |
| `GET` | `/api/budget/summary?year=2025&month=6` | Monthly budget summary |
| `GET` | `/api/liabilities` | Liability balances and payment progress |
| `GET` | `/api/property` | Property equity, LVR, mortgage metrics |
| `POST` | `/api/fire/projection` | Run FIRE projection with custom inputs |
| `GET` | `/api/fire/inputs` | Saved FIRE assumptions from user settings |
| `GET` | `/api/accounts` | List accounts |
| `POST` | `/api/accounts` | Create account |
| `GET` | `/api/assets` | List assets |
| `POST` | `/api/assets` | Create asset |
| `GET` | `/api/transactions` | List transactions |
| `POST` | `/api/transactions` | Add transaction |

---

## Module Map

| Module | Maps to Spreadsheet Tabs |
|---|---|
| 1 — DB Architecture | All tabs (unified ledger) |
| 2 — Cash & Budget Engine | Cash, Budget, Side Income, LiabilitiesDebts |
| 3 — Equities & Market Integration | ETFs, Stocks, Managed Funds, Dividends |
| 4 — Crypto Asset Tracker | Crypto |
| 5 — Property & Fixed Assets | Property, Other Assets |
| 6 — Australian Tax & Compliance | Super, Capital Gains |
| 7 — FIRE Forecasting Engine | FIRE 🔥, History |

---

## Australian Tax Rules Implemented

- **CGT 50% Discount** — s115-100 ITAA97: applies when `(sell_date − buy_date).days > 365` (strictly greater than)
- **FIFO Cost Base** — ATO: brokerage capitalised into cost base on BUY; deducted from proceeds on SELL
- **Franking Credits** — `credit = net_dividend × (franking_pct/100) × (30/70)` (30% corporate rate)
- **Australian FY** — 1 July to 30 June
- **Super Exclusion** — Superannuation accounts flagged `is_retirement=True` are excluded from CGT calculations
