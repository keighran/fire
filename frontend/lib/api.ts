const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Typed API error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public upgradeUrl?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers (server-side — pass token from getAuthToken())
// ---------------------------------------------------------------------------

async function request<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail: { code?: string; message?: string; upgrade_url?: string } = {};
    try { detail = await res.json(); } catch {}
    throw new ApiError(
      res.status,
      detail.code ?? "API_ERROR",
      detail.message ?? `${method} ${path} → ${res.status}`,
      detail.upgrade_url,
    );
  }

  return res.json();
}

const get  = <T>(path: string, token: string) => request<T>("GET", path, token);
const post = <T>(path: string, token: string, body: unknown) => request<T>("POST", path, token, body);
const put  = <T>(path: string, token: string, body: unknown) => request<T>("PUT", path, token, body);
const del  = <T>(path: string, token: string) => request<T>("DELETE", path, token);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetWorthSnapshot {
  calculated_at: string;
  shares_value: number;
  etf_value: number;
  managed_fund_value: number;
  crypto_value: number;
  cash_value: number;
  super_value: number;
  property_value: number;
  other_assets_value: number;
  total_liabilities: number;
  total_assets: number;
  net_worth: number;
}

export interface Holding {
  ticker: string;
  name: string;
  asset_class: string;
  total_units: number;
  cost_base: number;
  weighted_avg_cost: number;
  current_price: number;
  market_value: number;
  unrealised_gain: number;
  unrealised_gain_pct: number;
  annualised_return_pct: number;
  total_dividends_received: number;
  dividend_yield_on_cost: number;
  is_retirement: boolean;
}

export interface CGTEvent {
  asset_ticker: string;
  sell_date: string;
  buy_date: string;
  units_disposed: number;
  cost_base: number;
  gross_proceeds: number;
  gross_gain: number;
  holding_days: number;
  discount_applied: boolean;
  taxable_gain: number;
  tax_year: string;
}

export interface CGTReport {
  total_gross_gain: number;
  total_taxable_gain: number;
  total_losses: number;
  events: CGTEvent[];
}

export interface MonthlySnapshot {
  snapshot_date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  cash_value: number;
  etf_value: number;
  shares_value: number;
  super_value: number;
  crypto_value: number;
  property_current_value: number;
}

export interface FIRETrajectoryRow {
  year: number;
  calendar_year: number;
  age: number;
  phase: string;
  projected_net_worth: number;
  target_fire_number: number;
  fire_achieved: boolean;
  annual_contribution: number;
  interest_earned: number;
  annual_drawdown?: number;
}

export interface FIREResult {
  fire_number: number;
  years_to_fire: number | null;
  fire_date_year: number | null;
  current_shortfall: number;
  already_fire: boolean;
  trajectory: FIRETrajectoryRow[];
}

export interface UserProfile {
  id: number;
  email: string;
  display_name: string;
  tier: "free" | "pro" | "enterprise";
}

export interface SubscriptionInfo {
  tier: string;
  status: string;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface BudgetSummary {
  year: number;
  month: number;
  total_income: number;
  total_expenses: number;
  net_savings: number;
  savings_rate_pct: number;
}

export interface PropertyMetrics {
  account_name: string;
  purchase_price: number;
  current_valuation: number;
  mortgage_balance: number;
  total_interest_fees_paid: number;
  total_principal_paid: number;
  net_equity: number;
  total_growth: number;
  total_growth_pct: number;
  lvr: number;
}

export interface LiabilityBalance {
  account_name: string;
  remaining_balance: number;
  total_paid: number;
  progress_pct: number;
}

export interface DividendSummary {
  ticker: string;
  asset_class: string;
  date: string;
  net_amount: number;
  franking_percentage: number;
  franking_credit: number;
  gross_amount: number;
  units_at_ex_date: number;
  yield_on_cost: number;
  tax_year: string;
}

export interface UserSettings {
  base_currency: string;
  pay_frequency: string;
  pay_day_of_month: number;
  employment_salary: number;
  default_brokerage_fee: number;
  cgt_method: string;
  marginal_tax_rate: number;
  use_budget: boolean;
  emergency_fund_months: number;
  fire_safe_withdrawal_rate: number;
  fire_investment_return_rate: number;
  fire_inflation_rate: number;
  fire_target_annual_spend: number;
  fire_current_age: number | null;
  fire_target_retire_age: number | null;
  fire_life_expectancy: number;
  bank_interest_rate: number;
}

export interface SuperSummary {
  total_balance: number;
  total_employer_sg: number;
  total_voluntary_contributions: number;
  total_gain: number;
  accounts: Array<{
    name: string;
    balance: number;
    employer_sg: number;
    voluntary: number;
  }>;
}

export interface SideIncomeMonth {
  month: string;
  amount: number;
}

export interface CashBalances {
  [accountName: string]: number;
}

// ---------------------------------------------------------------------------
// API client (all methods require a bearer token from server components)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Onboarding helper types
// ---------------------------------------------------------------------------

export interface Account {
  id: number;
  name: string;
  type: string;
  institution: string;
  currency: string;
  is_retirement: boolean;
  notes: string | null;
  created_at: string;
}

export interface AccountCreatePayload {
  name: string;
  type: string;
  institution?: string;
  currency?: string;
  is_retirement?: boolean;
  notes?: string;
}

export interface AccountUpdatePayload {
  name?: string;
  institution?: string;
  currency?: string;
  is_retirement?: boolean;
  notes?: string;
}

export interface Asset {
  id: number;
  ticker: string;
  name: string;
  category: string;
  asset_class: string;
  current_price: number;
  last_updated: string;
}

export interface AssetCreatePayload {
  ticker: string;
  name: string;
  category: string;
  asset_class?: string;
}

export interface TransactionRow {
  id: number;
  account_id: number;
  asset_id: number | null;
  type: string;
  date: string;
  units: number | null;
  price_per_unit: number | null;
  amount: number;
  fees: number;
  franking_percentage: number | null;
  is_drp: boolean;
  notes: string | null;
  created_at: string;
}

export interface TransactionCreatePayload {
  account_id: number;
  asset_id?: number;
  type: string;
  date: string;
  units?: number;
  price_per_unit?: number;
  amount: number;
  fees?: number;
  notes?: string;
  franking_percentage?: number;
  is_drp?: boolean;
}

export const api = {
  // Auth / user
  getMe: (token: string) => get<UserProfile>("/api/me", token),

  // Settings
  getSettings: (token: string) => get<UserSettings>("/api/settings", token),
  updateSettings: (token: string, data: Partial<UserSettings>) =>
    put<UserSettings>("/api/settings", token, data),

  // Net worth + history
  getNetWorth: (token: string) => get<NetWorthSnapshot>("/api/net-worth", token),
  getHoldings: (token: string) => get<Holding[]>("/api/holdings", token),
  getHistory: (token: string, limit = 24) =>
    get<MonthlySnapshot[]>(`/api/history?limit=${limit}`, token),

  // CGT
  getCGTReport: (token: string, taxYear?: string) =>
    get<CGTReport>(`/api/cgt-report${taxYear ? `?tax_year=${taxYear}` : ""}`, token),

  // Cash & budget
  getCashBalances: (token: string) => get<CashBalances>("/api/cash/balances", token),
  getBudgetSummary: (token: string, year: number, month: number) =>
    get<BudgetSummary>(`/api/budget/summary?year=${year}&month=${month}`, token),
  getBudgetHistory: (token: string, months = 12) =>
    get<BudgetSummary[]>(`/api/budget/history?months=${months}`, token),
  getLiabilities: (token: string) => get<LiabilityBalance[]>("/api/liabilities", token),

  // Dividends (PRO)
  getDividends: (token: string) => get<DividendSummary[]>("/api/dividends", token),
  getDividendFYSummary: (token: string) =>
    get<Record<string, Record<string, number>>>("/api/dividends/fy-summary", token),

  // Property
  getProperty: (token: string) => get<PropertyMetrics[]>("/api/property", token),

  // Side income
  getSideIncomeMonthly: (token: string) =>
    get<SideIncomeMonth[]>("/api/side-income/monthly", token),
  getSideIncomeRollingAvg: (token: string) =>
    get<{ rolling_365_avg: number }>("/api/side-income/rolling-average", token),

  // Super
  getSuperSummary: (token: string) => get<SuperSummary>("/api/super/summary", token),

  // Prices (PRO)
  refreshPrices: (token: string) => post<unknown>("/api/prices/refresh", token, {}),

  // FIRE (PRO)
  fireProjection: (token: string, inputs: object) =>
    post<FIREResult>("/api/fire/projection", token, inputs),
  getFIREInputs: (token: string) => get<Record<string, number | null>>("/api/fire/inputs", token),

  // Onboarding — account / asset / transaction creation
  listAccounts: (token: string) => get<Account[]>("/api/accounts", token),
  createAccount: (token: string, body: AccountCreatePayload) =>
    post<Account>("/api/accounts", token, body),
  updateAccount: (token: string, id: number, body: AccountUpdatePayload) =>
    request<Account>("PUT", `/api/accounts/${id}`, token, body),
  deleteAccount: (token: string, id: number) =>
    del<{ deleted: number }>(`/api/accounts/${id}`, token),
  listAssets: (token: string) => get<Asset[]>("/api/assets", token),
  createAsset: (token: string, body: AssetCreatePayload) =>
    post<{ id: number; ticker: string }>("/api/assets", token, body),
  listTransactions: (token: string, accountId?: number) =>
    get<TransactionRow[]>(`/api/transactions${accountId ? `?account_id=${accountId}` : ""}`, token),
  createTransaction: (token: string, body: TransactionCreatePayload) =>
    post<{ id: number }>("/api/transactions", token, body),
  updateTransaction: (token: string, id: number, body: Partial<TransactionCreatePayload>) =>
    request<TransactionRow>("PUT", `/api/transactions/${id}`, token, body),
  deleteTransaction: (token: string, id: number) =>
    del<{ deleted: number }>(`/api/transactions/${id}`, token),

  // Billing
  getSubscription: (token: string) => get<SubscriptionInfo>("/api/billing/subscription", token),
  createCheckout: (token: string, priceId: string) =>
    post<{ url: string }>("/api/billing/create-checkout-session", token, { price_id: priceId }),
  createPortal: (token: string) =>
    post<{ url: string }>("/api/billing/create-portal-session", token, {}),
};
