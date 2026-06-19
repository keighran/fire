# Financial Tracker — CLAUDE.md

## Project Overview
A full-stack Personal Wealth Management Web Application replicating and extending the
"CompiledSanity Personal Wealth Template v2.12.1 🇦🇺 Aus Version" spreadsheet.
Target users: Australian FI/RE community.

## Source Spreadsheet Analysis (Ingested 2026-06-17)
File: `Copy of CompiledSanity Personal Wealth Template v2.12.1 - 🇦🇺 Aus Version.xlsx`

### Tabs → Module Mapping
| Spreadsheet Tab | App Module |
|---|---|
| Net Worth, History | Module 1 — Core DB + Net Worth Aggregator |
| Cash, Budget, Side Income, LiabilitiesDebts | Module 2 — Cash & Budget Engine |
| ETFs, Stocks, Managed Funds, Dividends | Module 3 — Equities & Market Integration |
| Crypto | Module 4 — Crypto Asset Tracker |
| Property, Other Assets | Module 5 — Property & Fixed Assets |
| Super, Capital Gains | Module 6 — Australian Tax & Compliance |
| FIRE 🔥, History | Module 7 — FIRE Forecasting Engine |
| SheetOptions, First Time Setup | Settings / Onboarding UI |
| WorkingSheet | Internal — no direct UI equivalent |

### Key Business Logic Extracted

#### Net Worth Tab
- Pulls current value from every asset tab (ETFs!F15, Stocks!E16, Crypto!E9, Cash!C13, etc.)
- History is monthly snapshots stored in the `History` tab (col A = EOMONTH date)
- Tracks investment cost base separately from market value to compute P&L
- Cash savings rate = net savings / gross income (includes dividends, side income)

#### Cash Tab
- Multi-account balances; currency conversion via GOOGLEFINANCE (replaced by yfinance FX)
- Monthly net worth snapshot trigger: end-of-month date in col G
- Savings rate denominator = salary + side income + non-reinvested dividends
- Emergency fund target = `SheetOptions.L32` months × monthly expenses

#### ETFs / Stocks / Managed Funds Tabs
- Per-ticker: live price, total units (SUMIF over transaction ledger rows 23+)
- Cost base = SUMPRODUCT of (units × price) across all BUY transactions
- Weighted avg cost = cost_base / total_units
- Annualised return = (total_return / holding_period_days) × 365
- Dividend yield on cost = annual_dividends / cost_base
- Allocation target vs actual tracked per ticker (% of non-retirement portfolio)
- "Retirement" flag on tickers → excluded from growth portfolio; goes to Super tab

#### Dividends Tab
- Ledger: date, ticker, asset_type, ex_div_price, units_held_at_ex_date, net_amount, franking_%
- Yield on cost = net_amount / (ex_div_price × units_at_ex_date)
- FY summary (Jul–Jun) broken down by ETF / Stocks / Managed Fund / Crypto
- Franking credit = net_dividend × (franking_pct/100) × (30/70)  [30% corporate rate]
- Gross dividend = net_dividend + franking_credit

#### Capital Gains Tab
- Supports FIFO and manual CGT methods (toggled via SheetOptions.L36)
- FIFO cost base formula tracked cumulatively per asset across the transaction ledger
- CGT discount: strictly > 365 days holding → 50% discount (s115-100 ITAA97)
- Cost base on BUY = (units × price) + brokerage
- Proceeds on SELL = sale_amount − brokerage
- Taxable gain = proceeds − cost_base; if > 365 days: taxable_gain × 0.5

#### FIRE Tab — Key Formulas
- `target_fire_number = annual_spend / SWR`
- `years_to_fire = NPER(return_rate - inflation, annual_savings, current_nw, -fire_number)`
- `fire_date = DATE(YEAR(TODAY()) + years_to_fire, 1, 1)`
- Accumulation phase uses PMT/NPER (compound + annual savings)
- Drawdown phase uses PMT on portfolio balance over life expectancy horizon
- Two phases: **accumulation** (today → FIRE date) and **drawdown** (FIRE date → death)
- Key inputs: current age, target retire age, current NW, annual savings, annual spend,
  investment return rate, inflation rate, SWR (default 4%), life expectancy

#### Property Tab
- equity = current_valuation − mortgage_balance
- LVR = mortgage_balance / current_valuation × 100
- growth = current_valuation − purchase_price
- Mortgage breakdown: interest+fees (P&L expense), principal paid (equity gain)

#### LiabilitiesDebts Tab
- Up to 5 debt slots: HELP/HECS, Credit Card, Car Loan, Personal Loan, CGT future liability
- CGT future liability = estimated capital gain × marginal tax rate (shown as liability)
- Payment progress = total_paid / (total_paid + remaining_balance)

#### Budget Tab
- Pay frequency normalization:
  - Fortnightly → monthly = amount × 2.174 (÷ 2-week = × 4.345/2)
  - Weekly → monthly = amount × 4.345
  - Twice monthly = amount × 2
  - Monthly = as-is
- Emergency fund = ROUNDUP(months_target × monthly_expenses / 1000, 0) × 1000
- Savings rate = (income − expenses) / income

#### Side Income Tab
- Two streams: Side Income 1 + Rental Income 1 (extensible)
- Rolling 365-day average, FY YTD total, predicted yearly total

#### History Tab (Time-Series Backbone)
- Monthly snapshots stored as rows, date = EOMONTH
- Columns: Shares value/gain, ETF value/gain, Crypto value/gain, Cash value/increase,
  Super value/voluntary_contrib/gain, Liabilities balance/paid, Salary income,
  Property current/purchase/equity/mortgage/interest/principal,
  Managed Funds value/gain, Other Assets value/gain
- This feeds the History/trend charts on every tab

#### SheetOptions (Global Config)
- Base currency: AUD (configurable)
- Pay day of month
- Employment salary
- Emergency fund months target
- Use Budget tab: Yes/No
- CGT method: FIFO or Manual
- Investment growth rate (auto-calculated from portfolio weighted avg)
- Bank interest rate
- Brokerage fee per trade

## Tech Stack
- **Backend**: Python 3.11+, FastAPI, SQLModel (SQLAlchemy + Pydantic), Alembic
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Recharts
- **Database**: PostgreSQL 15 (Docker)
- **Market Data**: yfinance (ASX .AX suffix, US equities, FX rates)
- **Crypto Data**: CoinGecko API (free tier)

## Directory Structure
```
financial-tracker/
├── backend/
│   ├── app/
│   │   ├── models/         # SQLModel table definitions
│   │   ├── services/       # Business logic engines
│   │   ├── api/            # FastAPI routers
│   │   ├── db.py
│   │   └── main.py
│   ├── tests/              # pytest suites
│   ├── alembic/
│   └── requirements.txt
├── frontend/
│   ├── app/                # Next.js App Router pages
│   ├── components/         # React components
│   └── lib/                # API client + helpers
├── docker-compose.yml
├── .env.example
├── README.md
└── CLAUDE.md               # This file
```

## Module Build Order
1. Phase 0  — Scaffolding, Docker, env setup
2. Phase 7  — SQLModel schema (Module 1: DB Architecture)
3. Phase 2  — Backend services (all engines)
4. Phase 3  — FastAPI endpoints
5. Phase 4  — pytest CGT suite
6. Phase 5  — Frontend components
7. Phase 6  — README & docs

## Critical Rules
- `Transaction.amount` = GROSS (units × price). Net = amount − fees.
- CGT cost base = amount + fees (ATO: brokerage capitalised into cost base).
- CGT discount applies only when `(sell_date − buy_date).days > 365` (strictly greater).
- Franking credit formula: `net_div × (franking_pct/100) × (30/70)`.
- Australian FY = 1 Jul to 30 Jun.
- Superannuation assets are NOT subject to CGT (separate tax treatment).
- `Asset.category` reuses `AccountType` enum (intentional per user preference).
- `Transaction.amount` is gross; `Transaction.fees` is separate.

## Memory Retention Instructions
After each feature development session, update this file with:
- What was built (files created/modified)
- Any schema changes
- Any business logic corrections discovered during implementation
- Any deviations from the original plan

---

## Build Log

### Session 1 — 2026-06-17 (Phases 0, 7, 2, 3, 4, 5, 6)

#### Files Created
```
backend/
  app/__init__.py
  app/main.py                          — FastAPI app with CORS + lifespan
  app/db.py                            — SQLModel engine, session factory
  app/models/__init__.py
  app/models/models.py                 — Full SQLModel schema (all 6 tables)
  app/services/__init__.py
  app/services/pricing_service.py      — LivePricingEngine + CryptoEngine
  app/services/tax_service.py          — AustralianTaxEngine (CGT + franking)
  app/services/equity_service.py       — EquityEngine + DividendEngine
  app/services/cash_service.py         — CashEngine + BudgetEngine + LiabilityEngine
  app/services/property_service.py     — PropertyEngine
  app/services/fire_service.py         — FIREEngine (two-phase projection)
  app/services/networth_service.py     — NetWorthAggregator + HistoryEngine
  app/api/__init__.py
  app/api/routes.py                    — All FastAPI endpoints (25 routes)
  alembic/env.py
  alembic.ini
  tests/__init__.py
  tests/test_cgt.py                    — 30 pytest tests across 7 test classes
  requirements.txt
  seed_data.py

frontend/
  app/layout.tsx
  app/globals.css
  app/page.tsx                         — Dashboard page (server component)
  app/cgt/page.tsx                     — CGT Report page
  app/fire/page.tsx                    — FIRE Projection page
  components/Sidebar.tsx
  components/NetWorthCard.tsx
  components/AllocationChart.tsx       — Recharts PieChart
  components/NetWorthHistoryChart.tsx  — Recharts AreaChart
  components/HoldingsTable.tsx
  components/FIREChart.tsx             — Recharts LineChart with FIRE reference line
  lib/api.ts                           — Typed API client
  lib/format.ts                        — AUD formatter, % formatter, colour helpers
  package.json
  tailwind.config.ts
  next.config.mjs
  tsconfig.json
  postcss.config.mjs

root/
  docker-compose.yml
  .env.example
  README.md
  CLAUDE.md (this file)
```

#### Schema Tables Built
- `users` — User model with auth fields
- `user_settings` — Replaces SheetOptions tab (FIRE assumptions, CGT method, pay frequency, etc.)
- `accounts` — Multi-account support with `is_retirement` flag for Super exclusion
- `assets` — Asset registry with `category` (AccountType) + `asset_class` (AssetClass) + price cache
- `transactions` — Unified ledger; `amount` = GROSS; `fees` separate; `franking_percentage` for dividends
- `monthly_snapshots` — Replaces History tab; all 8 asset classes + liabilities + NW per EOMONTH

#### Key Deviations / Decisions
- `Transaction.amount` confirmed GROSS (units × price). Net = amount − fees.
- CGT cost_base = amount + fees (ATO capitalisation rule — brokerage is part of cost base on BUY)
- CGT discount: `holding_days > 365` strictly (not ≥). Boundary test at exactly 365 = no discount.
- `Asset.category` reuses `AccountType` enum (intentional per user specification).
- `User` model included in Phase 7 (per user instruction).
- Added `AssetClass` enum separately from `AccountType` for granular portfolio analytics.
- Added `UserSettings` model (not in original spec) to store FIRE inputs + SheetOptions config.
- Added `MonthlySnapshot` model (replaces History tab time-series backbone).
- Auth stubs to `user_id=1` for Phase 1 — JWT auth to be added in a future phase.
- FIRE engine uses `effective_rate = return_rate − inflation_rate` (spreadsheet's simplification).

---

### Session 2 — 2026-06-17 (SaaS Refactor)

#### Objective
Transform the personal finance tracker into a multi-tenant SaaS product with auth, RBAC, billing, and production-grade error handling.

#### New Files Created
```
backend/
  app/auth/__init__.py
  app/auth/clerk.py               — JWKS-based Clerk JWT verification + get_current_user dependency
  app/auth/rbac.py                — require_tier() factory + check_transaction_limit()
  app/api/billing.py              — Stripe checkout, customer portal, webhook handler
  app/api/webhooks/__init__.py
  app/api/webhooks/clerk_webhooks.py  — user.created/updated/deleted sync via Svix
  app/middleware/__init__.py
  app/middleware/rate_limit.py    — slowapi limiter, named limit constants
  app/middleware/error_handler.py — global exception handler + Sentry integration
  alembic/versions/002_saas_additions.py

frontend/
  middleware.ts                   — Clerk clerkMiddleware() route protection
  app/(auth)/sign-in/[[...sign-in]]/page.tsx
  app/(auth)/sign-up/[[...sign-up]]/page.tsx
  app/pricing/page.tsx            — 3-tier pricing page
  app/billing/page.tsx            — subscription management page
  components/ErrorBoundary.tsx    — React error boundary with Sentry reporting
  components/UpgradePrompt.tsx    — locked feature overlay with upgrade CTA
  components/LoadingSkeleton.tsx  — CardSkeleton, TableSkeleton, ChartSkeleton
  components/PricingCards.tsx     — client component with Stripe checkout redirect
  components/ManageSubscriptionButton.tsx — Stripe customer portal opener
  lib/auth.ts                     — getAuthToken() + authHeaders() for server components
```

#### Modified Files
```
backend/
  app/models/models.py  — SubscriptionTier/Status enums, Subscription table, clerk_user_id on User,
                          cascade deletes, composite indexes (ix_transactions_account_date etc.)
  app/api/routes.py     — All user_id=1 stubs replaced with Depends(get_current_user).
                          Tier gates on PRO features (prices, dividends, FIRE, full CGT history).
                          Rate limits on expensive/write endpoints.
  app/main.py           — Registered billing + webhook routers; slowapi + error handler middleware.
  requirements.txt      — Added: stripe==10.5.0, svix==1.24.0, slowapi==0.1.9, sentry-sdk[fastapi]==2.7.0

frontend/
  app/layout.tsx        — Wrapped with <ClerkProvider>
  lib/api.ts            — Added ApiError class, Bearer token param on all calls, billing endpoints
  components/Sidebar.tsx — Added UserButton, billing/pricing nav, PRO badges
  package.json          — Added @clerk/nextjs, @stripe/stripe-js, @sentry/nextjs
```

#### Subscription Tier Model
| Tier       | Price       | Gates                                                              |
|------------|-------------|-------------------------------------------------------------------|
| FREE       | $0          | Net worth, holdings, cash, budget, property, CGT (current FY), ≤50 txns |
| PRO        | $29/mo AUD  | + unlimited txns, full CGT history, FIRE, dividends, live prices  |
| ENTERPRISE | $79/mo AUD  | + multi-portfolio, API access (future)                            |

#### Key Architecture Decisions
- Auth: **Clerk** — JWKS-verified JWTs on backend; no custom password management in production.
- User sync: Clerk webhook (`user.created`) → creates `User` + `Subscription(FREE)` row. Lazy creation also fires on first JWT call in case webhook races.
- Billing: **Stripe** — checkout sessions + customer portal; webhooks update `Subscription` table.
- Rate limiting: **slowapi** in-memory (no Redis) — key is Clerk `sub` claim, fallback to IP.
- Error monitoring: **Sentry** — opt-in via `SENTRY_DSN` env var; skipped if not configured.
- RLS enforcement: all queries WHERE `Account.user_id = current_user.id`; transaction create verifies account ownership; cascade deletes at both ORM and DB FK level.

#### Remaining Next Steps
- Transaction CSV import (CommSec export format)
- Budget page frontend component
- Dividends page with calendar view
- Property page frontend component
- Settings page (edit UserSettings via UI)
- Monthly snapshot scheduler (EOMONTH cron)
- Super balance manual entry UI
- Sentry `sentry.client.config.ts` + `sentry.server.config.ts` for Next.js
- Admin panel (super-user tier management)
