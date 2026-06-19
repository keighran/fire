"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to WealthTrack AU",
    subtitle: "Your personal FI/RE wealth dashboard",
    required: true,
    tooltip: "WealthTrack AU helps you track your net worth, investments, super, property, and plan your path to Financial Independence. This setup takes about 5 minutes.",
  },
  {
    id: "income",
    title: "Income & Tax",
    subtitle: "Tell us about your employment income",
    required: true,
    tooltip: "Your salary and tax rate are used to calculate savings rates, budget summaries, and CGT liability estimates. Your pay frequency determines how the budget engine normalises costs to monthly figures.",
  },
  {
    id: "preferences",
    title: "Financial Preferences",
    subtitle: "Configure how WealthTrack works for you",
    required: true,
    tooltip: "These settings control global behaviours: how capital gains are calculated (FIFO is the ATO default), how many months of expenses to hold as emergency fund, and default brokerage fees capitalised into cost base.",
  },
  {
    id: "cash",
    title: "Cash Accounts",
    subtitle: "Add your bank accounts and current balances",
    required: false,
    tooltip: "Cash accounts feed into your net worth calculation and savings rate. Add each bank account you hold — everyday, savings, and offset accounts. You can add more later from the Settings page.",
  },
  {
    id: "investments",
    title: "Investments",
    subtitle: "Add ASX ETFs, stocks, or managed funds",
    required: false,
    tooltip: "Investments are tracked as assets with a transaction ledger. Enter each holding you own — WealthTrack will fetch live prices from Yahoo Finance (ASX tickers need the .AX suffix, e.g. VAS.AX). You can bulk-import transactions later.",
  },
  {
    id: "super",
    title: "Superannuation",
    subtitle: "Add your super fund balance",
    required: false,
    tooltip: "Super is tracked separately from your investment portfolio. It is excluded from CGT calculations and treated as a retirement asset class. The balance is manually updated — WealthTrack does not connect to ATO or your fund directly.",
  },
  {
    id: "property",
    title: "Property",
    subtitle: "Add investment or residential property",
    required: false,
    tooltip: "Property tracks current valuation, mortgage balance, and equity build-up. LVR (Loan-to-Value Ratio) and equity are calculated automatically. Add your home and any investment properties.",
  },
  {
    id: "liabilities",
    title: "Debts & Liabilities",
    subtitle: "Track HECS, loans, and credit cards",
    required: false,
    tooltip: "Liabilities are subtracted from total assets to give your true net worth. HECS/HELP debt, car loans, personal loans, and credit cards can all be tracked here with repayment progress.",
  },
  {
    id: "fire",
    title: "FIRE Goals",
    subtitle: "Model your path to Financial Independence",
    required: false,
    tooltip: "The FIRE engine uses the NPER formula (same as the spreadsheet) with your current net worth, annual savings, and target spend. The 4% Safe Withdrawal Rate is the standard FI/RE community default. All values can be adjusted later.",
  },
  {
    id: "complete",
    title: "You're all set!",
    subtitle: "Your WealthTrack dashboard is ready",
    required: true,
    tooltip: "",
  },
] as const;

type StepId = typeof STEPS[number]["id"];

// ---------------------------------------------------------------------------
// Types for local form state
// ---------------------------------------------------------------------------

interface CashAccount { name: string; institution: string; balance: string }
interface Investment  { ticker: string; name: string; units: string; buyPrice: string; fees: string }
interface SuperFund   { name: string; fund: string; balance: string; employerSg: string; voluntary: string }
interface Property    { name: string; institution: string; valuation: string; mortgage: string; purchasePrice: string }
interface Liability   { name: string; type: string; balance: string; totalOriginal: string }

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 text-sm
        placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
        ${props.className ?? ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 text-sm
        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${props.className ?? ""}`}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Tooltip({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
        <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed">{text}</p>
        <button
          onClick={onClose}
          className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-sm text-emerald-500 hover:text-emerald-400 transition-colors mt-2"
    >
      <span className="text-lg leading-none">+</span> {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-slate-500 hover:text-red-400 transition-colors mt-1"
    >
      Remove
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [stepIdx, setStepIdx] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // --- Step 2: Income ---
  const [salary, setSalary] = useState("");
  const [payFreq, setPayFreq] = useState("Fortnightly");
  const [taxRate, setTaxRate] = useState("32.5");
  const [currency, setCurrency] = useState("AUD");

  const autoTaxRate = (raw: string) => {
    const n = parseFloat(raw.replace(/,/g, "")) || 0;
    if (n <= 18200) return "0";
    if (n <= 45000) return "19";
    if (n <= 120000) return "32.5";
    if (n <= 180000) return "37";
    return "45";
  };

  // --- Step 3: Preferences ---
  const [cgtMethod, setCgtMethod] = useState("fifo");
  const [emergencyMonths, setEmergencyMonths] = useState("3");
  const [brokerage, setBrokerage] = useState("9.95");
  const [bankRate, setBankRate] = useState("4.5");

  // --- Step 4: Cash ---
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([
    { name: "", institution: "", balance: "" },
  ]);

  // --- Step 5: Investments ---
  const [investments, setInvestments] = useState<Investment[]>([
    { ticker: "", name: "", units: "", buyPrice: "", fees: "" },
  ]);

  // --- Step 6: Super ---
  const [superFunds, setSuperFunds] = useState<SuperFund[]>([
    { name: "My Super", fund: "", balance: "", employerSg: "", voluntary: "" },
  ]);

  // --- Step 7: Property ---
  const [properties, setProperties] = useState<Property[]>([
    { name: "", institution: "", valuation: "", mortgage: "", purchasePrice: "" },
  ]);

  // --- Step 8: Liabilities ---
  const [liabilities, setLiabilities] = useState<Liability[]>([
    { name: "", type: "personal_loan", balance: "", totalOriginal: "" },
  ]);

  // --- Step 9: FIRE ---
  const [currentAge, setCurrentAge] = useState("");
  const [targetAge, setTargetAge] = useState("55");
  const [annualSpend, setAnnualSpend] = useState("");
  const [swr, setSwr] = useState("4");
  const [returnRate, setReturnRate] = useState("7");
  const [inflationRate, setInflationRate] = useState("3");

  const step = STEPS[stepIdx];
  const progress = Math.round((stepIdx / (STEPS.length - 1)) * 100);

  // ---------------------------------------------------------------------------
  // Save helpers — each step saves to the API
  // ---------------------------------------------------------------------------

  const saveSettings = useCallback(async (token: string) => {
    await api.updateSettings(token, {
      base_currency: currency,
      pay_frequency: payFreq as any,
      employment_salary: parseFloat(salary.replace(/,/g, "")) || 0,
      marginal_tax_rate: parseFloat(taxRate) / 100,
      default_brokerage_fee: parseFloat(brokerage) || 9.95,
      cgt_method: cgtMethod as any,
      emergency_fund_months: parseInt(emergencyMonths) || 3,
      bank_interest_rate: parseFloat(bankRate) / 100,
    });
  }, [currency, payFreq, salary, taxRate, brokerage, cgtMethod, emergencyMonths, bankRate]);

  const saveCashAccounts = useCallback(async (token: string) => {
    const today = new Date().toISOString();
    for (const acc of cashAccounts) {
      if (!acc.name.trim()) continue;
      const created = await api.createAccount(token, {
        name: acc.name,
        type: "Cash",
        institution: acc.institution,
        currency,
      });
      if (acc.balance && parseFloat(acc.balance) > 0) {
        await api.createTransaction(token, {
          account_id: created.id,
          type: "Deposit",
          date: today,
          amount: parseFloat(acc.balance),
          notes: "Opening balance",
        });
      }
    }
  }, [cashAccounts, currency]);

  const saveInvestments = useCallback(async (token: string) => {
    const today = new Date().toISOString();
    // Use a single brokerage account for all holdings entered during onboarding.
    let brokerageAccount: { id: number } | null = null;

    for (const inv of investments) {
      if (!inv.ticker.trim()) continue;

      if (!brokerageAccount) {
        brokerageAccount = await api.createAccount(token, {
          name: "Investment Account",
          type: "Brokerage",
          currency,
        });
      }

      // Asset creation — if ticker already exists, fetch it.
      let asset: { id: number };
      try {
        asset = await api.createAsset(token, {
          ticker: inv.ticker.toUpperCase(),
          name: inv.name || inv.ticker.toUpperCase(),
          category: "Brokerage",
          asset_class: "ETF",
        });
      } catch (e: any) {
        if (e?.status === 400) {
          const all = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/assets`,
            { headers: { Authorization: `Bearer ${token}` } }
          ).then((r) => r.json()) as Array<{ id: number; ticker: string }>;
          const existing = all.find((a) => a.ticker === inv.ticker.toUpperCase());
          if (!existing) throw e;
          asset = existing;
        } else {
          throw e;
        }
      }

      const units = parseFloat(inv.units) || 0;
      const price = parseFloat(inv.buyPrice) || 0;
      if (units > 0 && price > 0) {
        await api.createTransaction(token, {
          account_id: brokerageAccount.id,
          asset_id: asset.id,
          type: "Buy",
          date: today,
          units,
          price_per_unit: price,
          amount: units * price,
          fees: parseFloat(inv.fees) || 0,
          notes: "Opening position",
        });
      }
    }
  }, [investments, currency]);

  const saveSuperFunds = useCallback(async (token: string) => {
    const today = new Date().toISOString();
    for (const sf of superFunds) {
      if (!sf.balance && !sf.name.trim()) continue;
      const account = await api.createAccount(token, {
        name: sf.name || "Super Fund",
        type: "Super",
        institution: sf.fund,
        currency,
        is_retirement: true,
      });
      const balance = parseFloat(sf.balance) || 0;
      if (balance > 0) {
        await api.createTransaction(token, {
          account_id: account.id,
          type: "Deposit",
          date: today,
          amount: balance,
          notes: "Opening super balance",
        });
      }
    }
  }, [superFunds, currency]);

  const saveProperties = useCallback(async (token: string) => {
    const today = new Date().toISOString();
    for (const prop of properties) {
      if (!prop.name.trim() && !prop.valuation) continue;
      const account = await api.createAccount(token, {
        name: prop.name || "Property",
        type: "Property",
        institution: prop.institution,
        currency,
      });
      const purchasePrice = parseFloat(prop.purchasePrice) || parseFloat(prop.valuation) || 0;
      if (purchasePrice > 0) {
        await api.createTransaction(token, {
          account_id: account.id,
          type: "Deposit",
          date: today,
          amount: purchasePrice,
          notes: "Purchase price",
        });
      }
      if (prop.mortgage && parseFloat(prop.mortgage) > 0) {
        const mortgageAccount = await api.createAccount(token, {
          name: `${prop.name || "Property"} Mortgage`,
          type: "Liability",
          institution: prop.institution,
          currency,
        });
        await api.createTransaction(token, {
          account_id: mortgageAccount.id,
          type: "Withdrawal",
          date: today,
          amount: parseFloat(prop.mortgage),
          notes: "Outstanding mortgage balance",
        });
      }
    }
  }, [properties, currency]);

  const saveLiabilities = useCallback(async (token: string) => {
    const today = new Date().toISOString();
    for (const lib of liabilities) {
      if (!lib.name.trim() && !lib.balance) continue;
      const account = await api.createAccount(token, {
        name: lib.name || "Liability",
        type: "Liability",
        currency,
      });
      const balance = parseFloat(lib.balance) || 0;
      if (balance > 0) {
        await api.createTransaction(token, {
          account_id: account.id,
          type: "Withdrawal",
          date: today,
          amount: balance,
          notes: "Current balance",
        });
      }
    }
  }, [liabilities, currency]);

  const saveFIRE = useCallback(async (token: string) => {
    const patch: Record<string, number | undefined> = {
      fire_safe_withdrawal_rate: parseFloat(swr) / 100,
      fire_investment_return_rate: parseFloat(returnRate) / 100,
      fire_inflation_rate: parseFloat(inflationRate) / 100,
    };
    if (currentAge) patch.fire_current_age = parseInt(currentAge);
    if (targetAge)  patch.fire_target_retire_age = parseInt(targetAge);
    if (annualSpend) patch.fire_target_annual_spend = parseFloat(annualSpend);
    await api.updateSettings(token, patch as any);
  }, [currentAge, targetAge, annualSpend, swr, returnRate, inflationRate]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const handleNext = useCallback(async () => {
    setError("");
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      if (step.id === "income" || step.id === "preferences") {
        await saveSettings(token);
      } else if (step.id === "cash") {
        await saveCashAccounts(token);
      } else if (step.id === "investments") {
        await saveInvestments(token);
      } else if (step.id === "super") {
        await saveSuperFunds(token);
      } else if (step.id === "property") {
        await saveProperties(token);
      } else if (step.id === "liabilities") {
        await saveLiabilities(token);
      } else if (step.id === "fire") {
        await saveFIRE(token);
      }

      if (stepIdx === STEPS.length - 1) {
        router.push("/");
      } else {
        setStepIdx((i) => i + 1);
      }
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [step.id, stepIdx, getToken, saveSettings, saveCashAccounts, saveInvestments,
      saveSuperFunds, saveProperties, saveLiabilities, saveFIRE, router]);

  const handleSkip = useCallback(() => {
    setError("");
    if (stepIdx === STEPS.length - 1) {
      router.push("/");
    } else {
      setStepIdx((i) => i + 1);
    }
  }, [stepIdx, router]);

  const handleBack = useCallback(() => {
    setError("");
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  // ---------------------------------------------------------------------------
  // Step content
  // ---------------------------------------------------------------------------

  function StepContent() {
    if (step.id === "welcome") {
      return (
        <div className="space-y-6 text-center">
          <div className="text-6xl">🇦🇺</div>
          <div className="space-y-3">
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              WealthTrack is built for the Australian FI/RE community — modelled on the
              CompiledSanity Personal Wealth Template but with live market data and full portfolio analytics.
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
              We&apos;ll walk you through setting up your accounts, income, and goals.
              Most steps are optional — you can always fill in details later.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: "📈", label: "Net Worth Tracking" },
              { icon: "🔥", label: "FIRE Projections" },
              { icon: "🧾", label: "CGT Calculations" },
            ].map((f) => (
              <div key={f.label} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center border border-slate-200 dark:border-transparent">
                <div className="text-2xl mb-1">{f.icon}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (step.id === "income") {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Annual Gross Salary ($)">
              <Input
                type="text"
                placeholder="95,000"
                value={salary}
                onChange={(e) => {
                  setSalary(e.target.value);
                  setTaxRate(autoTaxRate(e.target.value));
                }}
              />
            </Field>
            <Field label="Base Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="USD">USD — US Dollar</option>
                <option value="NZD">NZD — New Zealand Dollar</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Pay Frequency">
              <Select value={payFreq} onChange={(e) => setPayFreq(e.target.value)}>
                <option value="Weekly">Weekly</option>
                <option value="Fortnightly">Fortnightly</option>
                <option value="Twice Monthly">Twice Monthly</option>
                <option value="Monthly">Monthly</option>
              </Select>
            </Field>
            <Field label="Marginal Tax Rate (%)">
              <div className="relative">
                <Select value={taxRate} onChange={(e) => setTaxRate(e.target.value)}>
                  <option value="0">0% — ≤$18,200</option>
                  <option value="19">19% — $18,201–$45,000</option>
                  <option value="32.5">32.5% — $45,001–$120,000</option>
                  <option value="37">37% — $120,001–$180,000</option>
                  <option value="45">45% — $180,001+</option>
                </Select>
                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-emerald-500 pointer-events-none">auto</span>
              </div>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Tax rate is auto-selected from ATO 2024–25 brackets based on your salary. You can override it.
          </p>
        </div>
      );
    }

    if (step.id === "preferences") {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="CGT Method">
              <Select value={cgtMethod} onChange={(e) => setCgtMethod(e.target.value)}>
                <option value="fifo">FIFO (ATO Default)</option>
                <option value="manual">Manual / Specific Parcel</option>
              </Select>
            </Field>
            <Field label="Emergency Fund (months)">
              <Select value={emergencyMonths} onChange={(e) => setEmergencyMonths(e.target.value)}>
                {[1,2,3,4,5,6,9,12].map((m) => (
                  <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Default Brokerage Fee ($)">
              <Input
                type="number"
                placeholder="9.95"
                value={brokerage}
                onChange={(e) => setBrokerage(e.target.value)}
                step="0.01"
                min="0"
              />
            </Field>
            <Field label="Bank / Savings Rate (% p.a.)">
              <Input
                type="number"
                placeholder="4.50"
                value={bankRate}
                onChange={(e) => setBankRate(e.target.value)}
                step="0.1"
                min="0"
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Brokerage fees are capitalised into your CGT cost base per ATO rules.
          </p>
        </div>
      );
    }

    if (step.id === "cash") {
      return (
        <div className="space-y-4">
          {cashAccounts.map((acc, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-transparent">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Account {i + 1}</span>
                {cashAccounts.length > 1 && (
                  <RemoveButton onClick={() => setCashAccounts((a) => a.filter((_, j) => j !== i))} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Account Name">
                  <Input placeholder="Everyday Account" value={acc.name}
                    onChange={(e) => setCashAccounts((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                </Field>
                <Field label="Bank / Institution">
                  <Input placeholder="CommBank" value={acc.institution}
                    onChange={(e) => setCashAccounts((a) => a.map((x, j) => j === i ? { ...x, institution: e.target.value } : x))} />
                </Field>
              </div>
              <Field label="Current Balance ($)">
                <Input type="number" placeholder="5000" value={acc.balance}
                  onChange={(e) => setCashAccounts((a) => a.map((x, j) => j === i ? { ...x, balance: e.target.value } : x))} />
              </Field>
            </div>
          ))}
          <AddButton onClick={() => setCashAccounts((a) => [...a, { name: "", institution: "", balance: "" }])}
            label="Add another account" />
        </div>
      );
    }

    if (step.id === "investments") {
      return (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Use <span className="font-semibold text-slate-700 dark:text-slate-300">.AX</span> suffix for ASX stocks (e.g. <span className="font-semibold text-slate-700 dark:text-slate-300">VAS.AX</span>, <span className="font-semibold text-slate-700 dark:text-slate-300">A200.AX</span>). US stocks use the ticker directly (e.g. <span className="font-semibold text-slate-700 dark:text-slate-300">AAPL</span>).
          </p>
          {investments.map((inv, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-transparent">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Holding {i + 1}</span>
                {investments.length > 1 && (
                  <RemoveButton onClick={() => setInvestments((a) => a.filter((_, j) => j !== i))} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ticker">
                  <Input placeholder="VAS.AX" value={inv.ticker}
                    onChange={(e) => setInvestments((a) => a.map((x, j) => j === i ? { ...x, ticker: e.target.value } : x))} />
                </Field>
                <Field label="Name (optional)">
                  <Input placeholder="Vanguard Australian Shares" value={inv.name}
                    onChange={(e) => setInvestments((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Units Held">
                  <Input type="number" placeholder="100" value={inv.units}
                    onChange={(e) => setInvestments((a) => a.map((x, j) => j === i ? { ...x, units: e.target.value } : x))} />
                </Field>
                <Field label="Avg Buy Price ($)">
                  <Input type="number" placeholder="95.40" value={inv.buyPrice} step="0.01"
                    onChange={(e) => setInvestments((a) => a.map((x, j) => j === i ? { ...x, buyPrice: e.target.value } : x))} />
                </Field>
                <Field label="Brokerage ($)">
                  <Input type="number" placeholder={brokerage || "9.95"} value={inv.fees} step="0.01"
                    onChange={(e) => setInvestments((a) => a.map((x, j) => j === i ? { ...x, fees: e.target.value } : x))} />
                </Field>
              </div>
            </div>
          ))}
          <AddButton onClick={() => setInvestments((a) => [...a, { ticker: "", name: "", units: "", buyPrice: "", fees: "" }])}
            label="Add another holding" />
        </div>
      );
    }

    if (step.id === "super") {
      return (
        <div className="space-y-4">
          {superFunds.map((sf, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-transparent">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Super Fund {i + 1}</span>
                {superFunds.length > 1 && (
                  <RemoveButton onClick={() => setSuperFunds((a) => a.filter((_, j) => j !== i))} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Account Label">
                  <Input placeholder="My Super" value={sf.name}
                    onChange={(e) => setSuperFunds((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                </Field>
                <Field label="Fund Provider">
                  <Input placeholder="Australian Retirement Trust" value={sf.fund}
                    onChange={(e) => setSuperFunds((a) => a.map((x, j) => j === i ? { ...x, fund: e.target.value } : x))} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Current Balance ($)">
                  <Input type="number" placeholder="85000" value={sf.balance}
                    onChange={(e) => setSuperFunds((a) => a.map((x, j) => j === i ? { ...x, balance: e.target.value } : x))} />
                </Field>
                <Field label="Employer SG ($)">
                  <Input type="number" placeholder="12000" value={sf.employerSg}
                    onChange={(e) => setSuperFunds((a) => a.map((x, j) => j === i ? { ...x, employerSg: e.target.value } : x))} />
                </Field>
                <Field label="Voluntary ($)">
                  <Input type="number" placeholder="0" value={sf.voluntary}
                    onChange={(e) => setSuperFunds((a) => a.map((x, j) => j === i ? { ...x, voluntary: e.target.value } : x))} />
                </Field>
              </div>
            </div>
          ))}
          <AddButton onClick={() => setSuperFunds((a) => [...a, { name: "", fund: "", balance: "", employerSg: "", voluntary: "" }])}
            label="Add another super fund" />
          <p className="text-xs text-slate-500">
            Super SG rate is currently 11.5% (FY2025). Voluntary contributions include salary sacrifice and personal deductible contributions.
          </p>
        </div>
      );
    }

    if (step.id === "property") {
      return (
        <div className="space-y-4">
          {properties.map((prop, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-transparent">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Property {i + 1}</span>
                {properties.length > 1 && (
                  <RemoveButton onClick={() => setProperties((a) => a.filter((_, j) => j !== i))} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Property Name">
                  <Input placeholder="Home — 12 Smith St" value={prop.name}
                    onChange={(e) => setProperties((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                </Field>
                <Field label="Lender / Institution">
                  <Input placeholder="CBA" value={prop.institution}
                    onChange={(e) => setProperties((a) => a.map((x, j) => j === i ? { ...x, institution: e.target.value } : x))} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Purchase Price ($)">
                  <Input type="number" placeholder="650000" value={prop.purchasePrice}
                    onChange={(e) => setProperties((a) => a.map((x, j) => j === i ? { ...x, purchasePrice: e.target.value } : x))} />
                </Field>
                <Field label="Current Value ($)">
                  <Input type="number" placeholder="750000" value={prop.valuation}
                    onChange={(e) => setProperties((a) => a.map((x, j) => j === i ? { ...x, valuation: e.target.value } : x))} />
                </Field>
                <Field label="Mortgage Balance ($)">
                  <Input type="number" placeholder="450000" value={prop.mortgage}
                    onChange={(e) => setProperties((a) => a.map((x, j) => j === i ? { ...x, mortgage: e.target.value } : x))} />
                </Field>
              </div>
            </div>
          ))}
          <AddButton onClick={() => setProperties((a) => [...a, { name: "", institution: "", valuation: "", mortgage: "", purchasePrice: "" }])}
            label="Add another property" />
        </div>
      );
    }

    if (step.id === "liabilities") {
      return (
        <div className="space-y-4">
          {liabilities.map((lib, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-transparent">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Debt {i + 1}</span>
                {liabilities.length > 1 && (
                  <RemoveButton onClick={() => setLiabilities((a) => a.filter((_, j) => j !== i))} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input placeholder="HECS-HELP Debt" value={lib.name}
                    onChange={(e) => setLiabilities((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                </Field>
                <Field label="Type">
                  <Select value={lib.type}
                    onChange={(e) => setLiabilities((a) => a.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                    <option value="student_loan">HECS / Student Loan</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="car_loan">Car Loan</option>
                    <option value="personal_loan">Personal Loan</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Current Balance ($)">
                  <Input type="number" placeholder="25000" value={lib.balance}
                    onChange={(e) => setLiabilities((a) => a.map((x, j) => j === i ? { ...x, balance: e.target.value } : x))} />
                </Field>
                <Field label="Original Amount ($)">
                  <Input type="number" placeholder="35000" value={lib.totalOriginal}
                    onChange={(e) => setLiabilities((a) => a.map((x, j) => j === i ? { ...x, totalOriginal: e.target.value } : x))} />
                </Field>
              </div>
            </div>
          ))}
          <AddButton onClick={() => setLiabilities((a) => [...a, { name: "", type: "personal_loan", balance: "", totalOriginal: "" }])}
            label="Add another debt" />
        </div>
      );
    }

    if (step.id === "fire") {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current Age">
              <Input type="number" placeholder="32" value={currentAge}
                onChange={(e) => setCurrentAge(e.target.value)} min="18" max="80" />
            </Field>
            <Field label="Target Retirement Age">
              <Input type="number" placeholder="55" value={targetAge}
                onChange={(e) => setTargetAge(e.target.value)} min="30" max="75" />
            </Field>
          </div>
          <Field label="Target Annual Spend in Retirement ($)">
            <Input type="number" placeholder="60000" value={annualSpend}
              onChange={(e) => setAnnualSpend(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Safe Withdrawal Rate (%)">
              <Input type="number" placeholder="4" value={swr} step="0.1"
                onChange={(e) => setSwr(e.target.value)} min="1" max="10" />
            </Field>
            <Field label="Investment Return (% p.a.)">
              <Input type="number" placeholder="7" value={returnRate} step="0.5"
                onChange={(e) => setReturnRate(e.target.value)} min="0" max="20" />
            </Field>
            <Field label="Inflation Rate (%)">
              <Input type="number" placeholder="3" value={inflationRate} step="0.5"
                onChange={(e) => setInflationRate(e.target.value)} min="0" max="15" />
            </Field>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-900/60 rounded-lg p-3">
            <p className="text-xs text-emerald-400">
              FIRE number = Annual Spend ÷ SWR. At {annualSpend ? `$${parseInt(annualSpend).toLocaleString()}` : "$60,000"}/year with a {swr}% SWR, your FIRE number is{" "}
              <span className="font-semibold">
                ${annualSpend ? ((parseFloat(annualSpend) / (parseFloat(swr) / 100))).toLocaleString("en-AU", { maximumFractionDigits: 0 }) : "1,500,000"}
              </span>.
            </p>
          </div>
        </div>
      );
    }

    if (step.id === "complete") {
      return (
        <div className="space-y-6 text-center">
          <div className="text-6xl">🎉</div>
          <div className="space-y-2">
            <p className="text-slate-300 text-sm leading-relaxed">
              Your WealthTrack account is set up and ready to go. Head to the dashboard to see your net worth overview.
            </p>
            <p className="text-slate-400 text-sm leading-relaxed">
              You can add more accounts, transactions, and refine your FIRE assumptions at any time from the Settings page.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-left">
            {[
              { icon: "📊", label: "Live price updates every 15 min via yfinance" },
              { icon: "🧾", label: "CGT reports generated automatically per ATO rules" },
              { icon: "📅", label: "Monthly snapshots auto-saved at end of month" },
              { icon: "🔥", label: "FIRE projections update as your net worth grows" },
            ].map((tip) => (
              <div key={tip.label} className="bg-slate-800/50 rounded-lg p-3 flex gap-2">
                <span className="text-lg flex-shrink-0">{tip.icon}</span>
                <span className="text-xs text-slate-400 leading-relaxed">{tip.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center overflow-y-auto py-8 px-4 transition-colors duration-200">
      {showTooltip && step.tooltip && (
        <Tooltip text={step.tooltip} onClose={() => setShowTooltip(false)} />
      )}

      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Step {stepIdx + 1} of {STEPS.length}</span>
            <span className="text-xs text-slate-500">{progress}% complete</span>
          </div>
          <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Step pills */}
          <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`flex-shrink-0 h-1 rounded-full transition-all duration-300 ${
                  i < stepIdx ? "w-6 bg-emerald-600" :
                  i === stepIdx ? "w-8 bg-emerald-500" :
                  "w-4 bg-slate-200 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl transition-all duration-200">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{step.title}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{step.subtitle}</p>
            </div>
            {step.tooltip && (
              <button
                onClick={() => setShowTooltip(true)}
                className="flex-shrink-0 ml-3 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700
                  text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium transition-colors flex items-center justify-center"
                title="What is this?"
              >
                ?
              </button>
            )}
          </div>

          {/* Step body */}
          <StepContent />

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-lg text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              {stepIdx > 0 && (
                <button
                  onClick={handleBack}
                  disabled={saving}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-40"
                >
                  ← Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {!step.required && (
                <button
                  onClick={handleSkip}
                  disabled={saving}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-40"
                >
                  Skip for now
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium
                  px-5 py-2 rounded-lg transition-colors min-w-[100px] flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </>
                ) : step.id === "complete" ? (
                  "Go to Dashboard →"
                ) : (
                  "Continue →"
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {STEPS.filter((s) => !s.required).length} optional steps can be skipped and completed later
          </p>
        </div>
      </div>
    </div>
  );
}
