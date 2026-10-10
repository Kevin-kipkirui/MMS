// VANTAGE — Portfolio.jsx
// Private Wealth / Family Office command center. Single self-contained file.
// Visual language matched to PropfirmAccount.jsx: near-black navy canvas,
// restrained blue accent, tabular mono numerals, hairline dividers, Inter type.
// Frontend only — all data below is local mock state structured so it can be
// swapped for real queries later without touching the UI.

import React, { useMemo, useState, useCallback, useEffect, useRef, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart as RePieChart, Pie, Cell, BarChart, Bar, LineChart as ReLineChart, Line,
} from "recharts";
import {
  Wallet, ArrowLeftRight, TrendingUp, TrendingDown, Building2, Lightbulb,
  LineChart as LineChartIcon, Home, Car, AlertTriangle, Activity, FileText,
  BarChart3, Folder, CalendarClock, Search, Plus, X, ChevronRight, ChevronDown,
  Filter, Download, Upload, ArrowUpRight, ArrowDownRight, DollarSign, PiggyBank,
  CreditCard, Landmark, Briefcase, MapPin, Gauge, Calendar, Clock, Shield,
  Menu, LayoutGrid, PieChart as PieChartIcon, Layers, Coins, Ship,
  CheckCircle2, XCircle, Info, Eye, Tag, Repeat, Sparkles, Percent,
  ArrowRight, Building, Banknote, Users, TrendingUpDown, ChevronLeft,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   DESIGN TOKENS — matched to Vantage / PropfirmAccount system
═══════════════════════════════════════════════════════════════ */
const BLUE      = "#5C8DFF";
const BLUE_LT   = "#7CA6FF";
const BLUE_FOG  = "rgba(92,141,255,0.10)";
const GREEN     = "#34D399";
const RED       = "#F87171";
const AMBER     = "#E8A855";
const PURPLE    = "#A78BFA";
const WHITE     = "#EDEFF5";

const PIE_COLORS = [BLUE_LT, GREEN, PURPLE, AMBER, "#F472B6", "#60D9C6"];

const CARD = "bg-gradient-to-b from-[#10141F] to-[#0C0F18] border border-white/[0.07] rounded-[20px] relative overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.45)]";
const GLASS = "bg-[#0C0F18]/95 border border-[#5C8DFF]/[0.12] rounded-2xl relative overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.35)]";
const INPUT = "w-full px-3.5 py-2.5 bg-white/[0.025] border border-white/[0.08] rounded-[10px] text-[13.5px] text-[#EDEFF5] placeholder:text-white/30 outline-none focus:bg-[#5C8DFF]/10 focus:border-[#5C8DFF]/30 transition-colors";
const LABEL = "block text-[10px] font-bold tracking-[0.1em] uppercase text-white/40 mb-1.5";
const MINI_BTN = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border border-[#5C8DFF]/30 bg-[#5C8DFF]/10 text-[#7CA6FF] text-[10.5px] font-bold cursor-pointer transition-colors hover:bg-[#5C8DFF]/20";
const GHOST_BTN = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border border-white/[0.08] bg-white/[0.02] text-white/55 text-[10.5px] font-bold cursor-pointer transition-colors hover:bg-white/[0.05] hover:text-white/80";

const CornerAccents = ({ color = "rgba(100,160,255,0.22)" }) => (
  <>
    <div className="absolute w-2 h-2 pointer-events-none top-2 left-2 border-t border-l" style={{ borderColor: color }} />
    <div className="absolute w-2 h-2 pointer-events-none top-2 right-2 border-t border-r" style={{ borderColor: color }} />
    <div className="absolute w-2 h-2 pointer-events-none bottom-2 left-2 border-b border-l" style={{ borderColor: color }} />
    <div className="absolute w-2 h-2 pointer-events-none bottom-2 right-2 border-b border-r" style={{ borderColor: color }} />
  </>
);

const TopHairline = ({ color = "rgba(120,160,255,0.28)" }) => (
  <div className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
    style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
);

/* ═══════════════════════════════════════════════════════════════
   LOOKUP OPTIONS — editable dropdown lists, single source of truth
═══════════════════════════════════════════════════════════════ */
const DEFAULT_LOOKUPS = {
  accountTypes: ["Checking", "Savings", "Foreign Currency", "Brokerage Cash", "Money Market Fund", "Mobile Wallet"],
  currencies: ["KES", "USD", "EUR", "GBP"],
  investmentCategories: ["Stocks", "ETFs", "Bonds", "Funds", "Crypto", "Private Equity", "Venture Capital", "Other"],
  liabilityCategories: ["Mortgages", "Business Loans", "Auto Financing", "Credit Facilities", "Other Liabilities"],
  businessStatuses: ["Operating", "Under Review", "Dormant"],
  ventureRisks: ["Low", "Low-Medium", "Medium", "Medium-High", "High"],
  ventureStatuses: ["Idea", "Research", "Testing", "Funded", "Operating", "Exited"],
  assetCategories: ["Personal Vehicle", "Jewelry & Watches", "Art & Collectibles", "Equipment & Machinery", "Boat / Marine", "Aircraft", "Livestock", "Land (Undeveloped)", "Other"],
  assetNatures: ["Revenue-Generating", "Dormant"],
  expenseLedgerCategories: ["Salaries & Wages", "Rent — Personal", "Rent — Business", "Utilities & Wifi", "Food & Groceries", "Insurance", "Transport & Fuel", "Asset Purchase", "Subscriptions & SaaS", "Marketing", "Staff & Security", "Maintenance", "Other"],
  expenseLedgerScopes: ["Personal", "Business"],
  expenseLedgerFrequencies: ["Monthly", "Weekly", "Annual", "One-time"],
};

const LookupOptionsContext = createContext(null);

const LookupOptionsProvider = ({ children }) => {
  const [lookups, setLookups] = useState(DEFAULT_LOOKUPS);

  const addOption = (category, label) => {
    const clean = label.trim();
    if (!clean) return;
    setLookups((prev) =>
      prev[category]?.includes(clean) ? prev : { ...prev, [category]: [...(prev[category] || []), clean] }
    );
  };

  const updateOption = (category, oldLabel, newLabel) => {
    const clean = newLabel.trim();
    if (!clean) return;
    setLookups((prev) => ({ ...prev, [category]: prev[category].map((o) => (o === oldLabel ? clean : o)) }));
  };

  const removeOption = (category, label) => {
    setLookups((prev) => ({ ...prev, [category]: prev[category].filter((o) => o !== label) }));
  };

  return (
    <LookupOptionsContext.Provider value={{ lookups, addOption, updateOption, removeOption }}>
      {children}
    </LookupOptionsContext.Provider>
  );
};

const useLookupOptions = () => useContext(LookupOptionsContext);

/* ═══════════════════════════════════════════════════════════════
   FORMATTERS
═══════════════════════════════════════════════════════════════ */
const USD_TO_KES = 129;

const fmtMoney = (n, currency = "KES", opts = {}) => {
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency", currency,
      minimumFractionDigits: opts.decimals ?? 0,
      maximumFractionDigits: opts.decimals ?? 0,
    }).format(v).replace("KES", "KSh");
  } catch {
    return `${currency} ${v.toLocaleString()}`;
  }
};

/* ═══════════════════════════════════════════════════════════════
SECTION: EXPENSE LEDGER — personal + business, salaries, rent,
utilities, asset purchases, everything a household/business pays out
═══════════════════════════════════════════════════════════════ */
const EXPENSE_SCOPE_COLOR = { Personal: PURPLE, Business: BLUE_LT };

const ExpenseLedgerSection = ({ expenses, onAdd, onSelect }) => {
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const categories = useMemo(() => [...new Set(expenses.map((e) => e.category))], [expenses]);

  const filtered = expenses.filter((e) =>
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.vendor || "").toLowerCase().includes(search.toLowerCase())) &&
    (!scopeFilter || e.scope === scopeFilter) &&
    (!categoryFilter || e.category === categoryFilter)
  );

  const monthlyOnly = (e) => (e.frequency === "Monthly" ? e.amount : e.frequency === "Weekly" ? e.amount * 4.33 : e.frequency === "Annual" ? e.amount / 12 : 0);

  const totalMonthly = expenses.reduce((s, e) => s + monthlyOnly(e), 0);
  const personalMonthly = expenses.filter((e) => e.scope === "Personal").reduce((s, e) => s + monthlyOnly(e), 0);
  const businessMonthly = expenses.filter((e) => e.scope === "Business").reduce((s, e) => s + monthlyOnly(e), 0);
  const oneTimeUpcoming = expenses.filter((e) => e.frequency === "One-time").reduce((s, e) => s + e.amount, 0);

  const byCategory = categories.map((c, i) => ({
    id: c, label: c, value: expenses.filter((e) => e.category === c).reduce((s, e) => s + monthlyOnly(e), 0),
    color: PIE_COLORS[i % PIE_COLORS.length],
  })).filter((c) => c.value > 0);

  const columns = [
    { key: "name", label: "Expense", primary: true, render: (r) => (
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-[#EAEDF7] truncate">{r.name}</div>
        <div className="text-[10px] text-white/40 truncate">{r.vendor}</div>
      </div>
    ) },
    { key: "category", label: "Category", render: (r) => <span className="text-[12px] text-white/70">{r.category}</span> },
    { key: "scope", label: "Scope", render: (r) => (
      <span className="text-[9px] font-bold px-2 py-[3px] rounded-md border"
        style={{ color: EXPENSE_SCOPE_COLOR[r.scope], background: `${EXPENSE_SCOPE_COLOR[r.scope]}1A`, borderColor: `${EXPENSE_SCOPE_COLOR[r.scope]}44` }}>
        {r.scope}
      </span>
    ) },
    { key: "frequency", label: "Frequency", render: (r) => <span className="text-[12px] text-white/70">{r.frequency}</span> },
    { key: "nextDue", label: "Next Due", render: (r) => <span className="text-[12px] text-white/70">{r.nextDue}</span> },
    { key: "amount", label: "Amount", align: "right", render: (r) => <span className="font-mono">{fmtCompact(r.amount)}</span> },
  ];

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Banknote} title="Expense Ledger" subtitle={`${expenses.length} tracked expenses · ${fmtCompact(totalMonthly)} / month`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Expense</button>} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 relative z-10">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Total Monthly</div>
          <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(totalMonthly)}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#A78BFA]/[0.06] border border-[#A78BFA]/20">
          <div className="text-[8px] tracking-[0.1em] uppercase text-[#A78BFA]/70 mb-1">Personal</div>
          <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(personalMonthly)}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#5C8DFF]/[0.08] border border-[#5C8DFF]/25">
          <div className="text-[8px] tracking-[0.1em] uppercase text-[#7CA6FF]/70 mb-1">Business</div>
          <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(businessMonthly)}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#E8A855]/[0.06] border border-[#E8A855]/20">
          <div className="text-[8px] tracking-[0.1em] uppercase text-[#E8A855]/70 mb-1">Upcoming One-Time</div>
          <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(oneTimeUpcoming)}</div>
        </div>
      </div>

      {byCategory.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07] relative z-10">
          <div className="text-[9px] tracking-[0.14em] uppercase text-white/40 mb-3">Monthly Spend by Category</div>
          <DonutBreakdown data={byCategory} />
        </div>
      )}

      <FilterBar search={search} onSearch={setSearch} placeholder="Search expenses or vendors…" filters={[
        { key: "scope", label: "Personal or Business", value: scopeFilter, onChange: setScopeFilter, options: ["Personal", "Business"] },
        { key: "category", label: "All Categories", value: categoryFilter, onChange: setCategoryFilter, options: categories },
      ]} />

      <ResponsiveTable columns={columns} rows={filtered} onRowClick={onSelect} />
    </div>
  );
};

const Session = () => {
  const [period, setPeriod] = useState("1Y");
  const [modalType, setModalType] = useState(null);
  const [assets, setAssets] = useState(WEALTH_ASSETS);
  const [liabilities, setLiabilities] = useState(LIABILITIES);
  const [ventures, setVentures] = useState(VENTURES);
  const [expenses, setExpenses] = useState(EXPENSE_LEDGER);
  const [accounts, setAccounts] = useState(ACCOUNTS);
  const [transactions, setTransactions] = useState(TRANSACTIONS);
  const [activeSection, setActiveSection] = useState("overview");
  const [scrolled, setScrolled] = useState(false);
  const [actionTarget, setActionTarget] = useState(null); // { type: 'expense'|'asset'|'liability', item }

  const totals = useMemo(() => {
    const accountsKES = accounts.reduce((s, a) => s + toKES(a.balance, a.currency), 0);
    const investmentsKES = INVESTMENTS.reduce((s, i) => s + toKES(i.quantity * i.price, i.currency), 0);
    const propertiesValue = PROPERTIES.reduce((s, p) => s + (p.currentValue || 0), 0);
    const businessesVal = BUSINESSES.reduce((s, b) => s + (b.valuation || 0), 0);
    const wealthAssetsVal = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
    const assetsVal = accountsKES + investmentsKES + propertiesValue + businessesVal + wealthAssetsVal;
    const liabilitiesVal = liabilities.reduce((s, l) => s + (l.outstanding || 0), 0);
    const totalMortgage = PROPERTIES.reduce((s, p) => s + (p.mortgage || 0), 0);
    const passiveAssetIncome = assets
      .filter((a) => a.nature === "Revenue-Generating")
      .reduce((s, a) => s + (a.monthlyIncome || 0), 0);
    const monthlyIncome = INCOME_SOURCES.reduce((s, i) => s + (i.monthly || 0), 0) + passiveAssetIncome;
    const monthlyExpenses = expenses.reduce((s, e) => s + toMonthlyAmount(e), 0);
    return {
      assets: assetsVal,
      liabilities: liabilitiesVal,
      netWorth: assetsVal - liabilitiesVal,
      cash: accountsKES,
      investmentsKES,
      wealthAssetsVal,
      netCashFlow: monthlyIncome - monthlyExpenses,
      monthlyIncome,
      monthlyExpenses,
      businessValue: businessesVal,
      realEstateEquity: propertiesValue - totalMortgage,
      debtToAsset: (liabilitiesVal / (assetsVal || 1)) * 100,
    };
  }, [liabilities, assets, expenses, accounts]);

  const assetBreakdown = useMemo(() => [
    { id: "investments", label: "Investments", value: totals.investmentsKES || 0, color: PIE_COLORS[0] },
    { id: "realestate", label: "Real Estate", value: totals.realEstateEquity || 0, color: PIE_COLORS[1] },
    { id: "cash", label: "Cash & Equivalents", value: totals.cash || 0, color: PIE_COLORS[2] },
    { id: "businesses", label: "Businesses", value: totals.businessValue || 0, color: PIE_COLORS[3] },
    { id: "wealthassets", label: "Other Assets", value: totals.wealthAssetsVal || 0, color: PIE_COLORS[4] },
  ].filter((d) => d.value > 0), [totals]);

  const liabilityBreakdown = useMemo(() => {
    const byCat = {};
    liabilities.forEach((l) => { byCat[l.category] = (byCat[l.category] || 0) + (l.outstanding || 0); });
    return Object.keys(byCat).map((k, i) => ({ id: k, label: k, value: byCat[k], color: PIE_COLORS[i % PIE_COLORS.length] }));
  }, [liabilities]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled((prev) => {
          const y = window.scrollY;
          // Hysteresis: different thresholds for on vs off so hovering
          // right at the boundary during momentum scroll can't flicker.
          if (prev) return y > 4;
          return y > 20;
        });
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Locks the real <html>/<body> background to match the app so fast
  // scrolling or rubber-band overscroll never flashes the browser's
  // default white canvas at the edges.
  useEffect(() => {
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevOverscroll = document.body.style.overscrollBehaviorY;
    document.documentElement.style.backgroundColor = "#05060A";
    document.body.style.backgroundColor = "#05060A";
    document.body.style.overscrollBehaviorY = "none";
    return () => {
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
      document.body.style.overscrollBehaviorY = prevOverscroll;
    };
  }, []);

  const handleSubmit = (type, values) => {
    if (type === "asset") {
      const newAsset = {
        id: `wa-${Date.now()}`,
        name: values.name || "Untitled Asset",
        category: values.category || "Other",
        nature: values.nature || "Dormant",
        purchasePrice: Number(values.purchasePrice) || 0,
        currentValue: Number(values.currentValue) || 0,
        monthlyIncome: Number(values.monthlyIncome) || 0,
        dateAcquired: new Date().toISOString().slice(0, 10),
        notes: values.notes || "",
      };
      setAssets((prev) => [newAsset, ...prev]);
      return;
    }
    if (type === "liability") {
      const newLiability = {
        id: `lia-${Date.now()}`,
        name: values.name || "Untitled Liability",
        category: values.category || "Other Liabilities",
        original: Number(values.original) || 0,
        outstanding: Number(values.outstanding) || 0,
        rate: Number(values.rate) || 0,
        monthlyPayment: Number(values.monthlyPayment) || 0,
        dueDate: values.dueDate || "",
        remainingTerm: values.remainingTerm || "",
        paid: false,
        lastPaidDate: null,
      };
      setLiabilities((prev) => [newLiability, ...prev]);
      return;
    }
    if (type === "venture") {
      const newVenture = {
        id: `ven-${Date.now()}`,
        name: values.name || "Untitled Venture",
        industry: values.industry || "Uncategorized",
        description: values.description || "",
        rationale: values.rationale || "",
        capital: Number(values.capital) || 0,
        projectedRevenue: Number(values.projectedRevenue) || 0,
        projectedTimeline: values.projectedTimeline || "",
        expectedReturn: values.expectedReturn || "",
        risk: values.risk || "Medium",
        status: values.status || "Idea",
        dateAdded: new Date().toISOString().slice(0, 10),
        notes: "",
      };
      setVentures((prev) => [newVenture, ...prev]);
      return;
    }
    if (type === "expense") {
      const newExpense = {
        id: `el-${Date.now()}`,
        name: values.name || "Untitled Expense",
        category: values.category || "Other",
        scope: values.scope || "Business",
        amount: Number(values.amount) || 0,
        frequency: values.frequency || "Monthly",
        nextDue: values.nextDue || "—",
        vendor: values.vendor || "—",
        notes: values.notes || "",
      };
      setExpenses((prev) => [newExpense, ...prev]);
      return;
    }
    console.log("submit", type, values);
  };

  const findAccountName = (id) => accounts.find((a) => a.id === id)?.name || "Unknown Account";

  const creditAccount = (accountId, amount) => {
    setAccounts((prev) => prev.map((a) => a.id === accountId ? { ...a, balance: a.balance + amount, lastActivity: "Today" } : a));
  };

  const debitAccount = (accountId, amount) => {
    setAccounts((prev) => prev.map((a) => a.id === accountId ? { ...a, balance: a.balance - amount, lastActivity: "Today" } : a));
  };

  const logTransaction = (description, amount, accountId, category, type) => {
    setTransactions((prev) => [{
      id: `tx-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      description,
      category,
      account: findAccountName(accountId),
      type,
      amount,
      status: "Completed",
    }, ...prev]);
  };

  // ---- Expense actions ----
  const handlePayExpenseFull = (expense, accountId) => {
    debitAccount(accountId, expense.amount);
    logTransaction(`Paid: ${expense.name}`, -expense.amount, accountId, expense.category, "expense");
    setExpenses((prev) => prev.map((e) => e.id === expense.id ? { ...e, paid: true, lastPaidDate: new Date().toISOString().slice(0, 10) } : e));
    setActionTarget(null);
  };

  const handlePayExpenseHalf = (expense, accountId) => {
    const half = expense.amount / 2;
    debitAccount(accountId, half);
    logTransaction(`Partial payment: ${expense.name}`, -half, accountId, expense.category, "expense");
    setExpenses((prev) => prev.map((e) => e.id === expense.id ? { ...e, amount: half, paid: false } : e));
    setActionTarget(null);
  };

  const handleSnoozeExpense = (expense, newDueDate) => {
    if (!newDueDate) return;
    setExpenses((prev) => prev.map((e) => e.id === expense.id ? { ...e, nextDue: newDueDate } : e));
    setActionTarget(null);
  };

  // ---- Asset actions ----
  const handleSellAsset = (asset, salePrice, accountId) => {
    if (!salePrice) return;
    creditAccount(accountId, salePrice);
    logTransaction(`Sale: ${asset.name}`, salePrice, accountId, "Asset Sale", "income");
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setActionTarget(null);
  };

  const handleLeaseAsset = (asset, monthlyIncome) => {
    setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, nature: "Revenue-Generating", monthlyIncome } : a));
    setActionTarget(null);
  };

  const handleMarkAssetDormant = (asset) => {
    setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, nature: "Dormant", monthlyIncome: 0 } : a));
    setActionTarget(null);
  };

  // ---- Liability actions ----
  const advanceOneMonth = (dateStr) => {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  };

  const handlePayLiabilityFull = (liability, accountId) => {
    debitAccount(accountId, liability.monthlyPayment);
    logTransaction(`Loan Payment: ${liability.name}`, -liability.monthlyPayment, accountId, liability.category, "expense");
    setLiabilities((prev) => prev.map((l) => l.id === liability.id ? {
      ...l,
      outstanding: Math.max(0, l.outstanding - l.monthlyPayment),
      paid: true,
      lastPaidDate: new Date().toISOString().slice(0, 10),
      dueDate: l.dueDate ? advanceOneMonth(l.dueDate) : l.dueDate,
    } : l));
    setActionTarget(null);
  };

  const handlePayLiabilityHalf = (liability, accountId) => {
    const half = liability.monthlyPayment / 2;
    debitAccount(accountId, half);
    logTransaction(`Partial Loan Payment: ${liability.name}`, -half, accountId, liability.category, "expense");
    setLiabilities((prev) => prev.map((l) => l.id === liability.id ? {
      ...l,
      outstanding: Math.max(0, l.outstanding - half),
      paid: false,
    } : l));
    setActionTarget(null);
  };

  const searchIndex = useMemo(() => buildSearchIndex({
    transactions,
    businesses: BUSINESSES,
    properties: PROPERTIES,
    vehicles: VEHICLES,
    investments: INVESTMENTS,
    accounts,
    documents: DOCUMENTS,
    ventures,
  }), [ventures, accounts, transactions]);

  const dueSoonFeed = useMemo(
    () => buildDueSoonFeed(liabilities, expenses),
    [liabilities, expenses]
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "overview":
        return (
          <>
            <div className="mt-6">
              <div className={`${CARD} p-5`}>
                <CornerAccents />
                <SectionHeader
                  icon={PieChartIcon}
                  title="Asset Composition"
                  subtitle="Where your net worth is held — live from the sections below"
                />
                <DonutBreakdown data={assetBreakdown} />
              </div>
            </div>

            <div className="mt-6">
              <AccountsSection accounts={accounts} onAdd={() => setModalType("account")} />
            </div>

            <div className="mt-6">
              <WealthManagementSection assets={assets} onAdd={() => setModalType("asset")} onSelect={(item) => setActionTarget({ type: "asset", item })} />
            </div>

            <div className="mt-6">
              <ExpenseLedgerSection expenses={expenses} onAdd={() => setModalType("expense")} onSelect={(item) => setActionTarget({ type: "expense", item })} />
            </div>

            <div className="mt-6">
              <LiabilitiesSection liabilities={liabilities} totals={totals} onAdd={() => setModalType("liability")} onSelect={(item) => setActionTarget({ type: "liability", item })} />
            </div>

            <div className="mt-8 mb-1 flex items-center gap-2 px-1">
              <LineChartIcon size={16} color={BLUE_LT} />
              <h3 className="text-[13px] font-extrabold tracking-[-0.01em] text-[#EAEDF7] m-0">Investments & Assets</h3>
            </div>

            <div className="mt-3">
              <InvestmentsSection investments={INVESTMENTS} onAdd={() => setModalType("investment")} />
            </div>

            <div className="mt-6">
              <RealEstateSection properties={PROPERTIES} onAdd={() => setModalType("property")} />
            </div>

            <div className="mt-6">
              <VehiclesSection vehicles={VEHICLES} onAdd={() => setModalType("vehicle")} />
            </div>

            <div className="mt-6">
              <VenturesSection ventures={ventures} onAdd={() => setModalType("venture")} />
            </div>
          </>
        );
      case "networth":
        return (
          <div
            className={`${CARD} p-6 sm:p-8`}
            style={{ background: "linear-gradient(150deg, rgba(92,141,255,0.09) 0%, #0C0F18 60%)", border: "1px solid rgba(92,141,255,0.18)" }}
          >
            <SectionHeader title="Total Net Worth" subtitle="Full-figure view" />

            <div className="mt-4 text-3xl sm:text-4xl font-extrabold">{fmtMoney(totals.netWorth)}</div>

            <div className="mt-3 flex items-center gap-3">
              <span className={`px-3 py-1 rounded-md text-sm font-semibold ${totals.assetsVal && totals.assetsVal > (totals.liabilitiesVal || 0) ? 'text-emerald-300 bg-emerald-900/10' : 'text-rose-300 bg-rose-900/10'}`}>
                {totals.debtToAsset.toFixed(1)}% debt-to-asset
              </span>
              <span className="text-xs text-white/60">Exact figure, no rounding</span>
            </div>
          </div>
        );
      case "accounts":
        return <AccountsSection accounts={accounts} onAdd={() => setModalType("account")} />;
      case "wealth":
        return <WealthManagementSection assets={assets} onAdd={() => setModalType("asset")} onSelect={(item) => setActionTarget({ type: "asset", item })} />;
      case "expenseledger":
        return <ExpenseLedgerSection expenses={expenses} onAdd={() => setModalType("expense")} onSelect={(item) => setActionTarget({ type: "expense", item })} />;
      case "transactions":
        return <TransactionsSection transactions={transactions} onAdd={() => setModalType("transaction")} />;
      case "income":
        return null;
      case "expenses":
        return null;
      case "businesses":
        return <BusinessesSection businesses={BUSINESSES} onAdd={() => setModalType("business")} />;
      case "ventures":
        return <VenturesSection ventures={ventures} onAdd={() => setModalType("venture")} />;
      case "investments":
        return <InvestmentsSection investments={INVESTMENTS} onAdd={() => setModalType("investment")} />;
      case "realestate":
        return <RealEstateSection properties={PROPERTIES} onAdd={() => setModalType("property")} />;
      case "vehicles":
        return <VehiclesSection vehicles={VEHICLES} onAdd={() => setModalType("vehicle")} />;
      case "liabilities":
        return <LiabilitiesSection liabilities={liabilities} totals={totals} onAdd={() => setModalType("liability")} onSelect={(item) => setActionTarget({ type: "liability", item })} />;
      case "cashflow":
        return null;
      case "statements":
        return null;
      case "analytics":
        return null;
      case "documents":
        return null;
      case "obligations":
        return <ObligationsSection obligations={dueSoonFeed} cash={totals.cash} />;
      default:
        return null;
    }
  };

  return (
    <>
      <TopNav activeSection={activeSection} onSelect={setActiveSection} scrolled={scrolled} searchIndex={searchIndex} />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-24 pb-16 min-h-screen bg-[#05060A]">
        <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
          <div className="min-w-0">{renderActiveSection()}</div>
          <div className="lg:sticky lg:top-20">
            <RightSidebar
              totals={totals}
              onQuickAdd={(type) => setModalType(type)}
              onSeeAllObligations={() => setActiveSection("obligations")}
              onNavigate={(s) => setActiveSection(s)}
              dueSoonFeed={dueSoonFeed}
            />
          </div>
        </div>
      </div>

      <AddItemModal modalType={modalType} onClose={() => setModalType(null)} onSubmit={handleSubmit} />
      <ItemActionModal
        target={actionTarget}
        onClose={() => setActionTarget(null)}
        accounts={accounts}
        actions={{
          payExpenseFull: handlePayExpenseFull,
          payExpenseHalf: handlePayExpenseHalf,
          snoozeExpense: handleSnoozeExpense,
          sellAsset: handleSellAsset,
          leaseAsset: handleLeaseAsset,
          markDormant: handleMarkAssetDormant,
          payLiabilityFull: handlePayLiabilityFull,
          payLiabilityHalf: handlePayLiabilityHalf,
        }}
      />
    </>
  );
};

const VantagePortfolio = () => (
  <LookupOptionsProvider>
    <Session />
  </LookupOptionsProvider>
);

export default VantagePortfolio;

const fmtCompact = (n, currency = "KSh") => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${currency} ${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${currency} ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${currency} ${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${currency} ${abs.toFixed(0)}`;
};

const fmtPct = (n, decimals = 1) => `${n >= 0 ? "+" : ""}${Number(n).toFixed(decimals)}%`;
const toKES = (amount, currency) => (currency === "USD" ? amount * USD_TO_KES : amount);
const clampPct = (n) => Math.max(0, Math.min(100, n));

const toMonthlyAmount = (item) => {
  if (item.frequency === "Monthly") return item.amount;
  if (item.frequency === "Weekly") return item.amount * 4.33;
  if (item.frequency === "Annual") return item.amount / 12;
  return 0; // One-time items aren't part of the recurring monthly run-rate
};

/* ═══════════════════════════════════════════════════════════════
   MOCK DATA — structured for a future 1:1 swap to real queries.
   Every array below models a Supabase table; every object models a row.
═══════════════════════════════════════════════════════════════ */

// ---- Net worth history (5y monthly, pinned to current net worth) ----
const NET_WORTH_HISTORY = (() => {
  const months = 60;
  const end = 16_680_000_000;
  const start = end * 0.42;
  const arr = [];
  for (let i = 0; i <= months; i++) {
    const t = i / months;
    const base = start + (end - start) * Math.pow(t, 1.18);
    const noise = Math.sin(i * 1.7) * base * 0.012 + Math.cos(i * 0.6) * base * 0.006;
    const value = Math.round(base + noise);
    const d = new Date(2021, 8, 1);
    d.setMonth(d.getMonth() + i);
    arr.push({
      date: d.toISOString().slice(0, 7),
      month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      value,
    });
  }
  arr[arr.length - 1].value = end;
  return arr;
})();

const historyForPeriod = (period) => {
  const map = { "1M": 2, "3M": 3, "6M": 6, "1Y": 12, "5Y": 61, All: 61 };
  const n = map[period] || 12;
  return NET_WORTH_HISTORY.slice(-n);
};

// ---- Financial Accounts ----
const ACCOUNTS = [
  { id: "acc-1", name: "Equity Bank — Business Main", institution: "Equity Bank Kenya", type: "Checking", currency: "KES", balance: 145_000_000, lastActivity: "Today" },
  { id: "acc-2", name: "Equity Bank — Savings", institution: "Equity Bank Kenya", type: "Savings", currency: "KES", balance: 62_000_000, lastActivity: "2 days ago" },
  { id: "acc-3", name: "Chase Private Client USD", institution: "JPMorgan Chase", type: "Foreign Currency", currency: "USD", balance: 850_000, lastActivity: "5 days ago" },
  { id: "acc-4", name: "Standard Chartered — Investment Cash", institution: "Standard Chartered", type: "Brokerage Cash", currency: "KES", balance: 38_000_000, lastActivity: "1 day ago" },
  { id: "acc-5", name: "CIC Money Market — Emergency Reserve", institution: "CIC Asset Management", type: "Money Market Fund", currency: "KES", balance: 60_000_000, lastActivity: "1 week ago" },
  { id: "acc-6", name: "M-Pesa Business Wallet", institution: "Safaricom", type: "Mobile Wallet", currency: "KES", balance: 5_350_000, lastActivity: "Today" },
];

// ---- Transactions ----
const TRANSACTIONS = [
  { id: "tx-1", date: "2026-09-11", description: "Zenith Logistics — Monthly Distribution", category: "Business Income", account: "Equity Bank — Business Main", type: "income", amount: 38_000_000, status: "Completed" },
  { id: "tx-2", date: "2026-09-10", description: "Two Rivers Towers — Rent Collection (12 units)", category: "Rental Income", account: "Equity Bank — Savings", type: "income", amount: 9_600_000, status: "Completed" },
  { id: "tx-3", date: "2026-09-10", description: "Vanguard S&P 500 ETF — Additional Purchase", category: "Investments", account: "Standard Chartered — Investment Cash", type: "investment", amount: -12_000_000, status: "Completed" },
  { id: "tx-4", date: "2026-09-09", description: "Coastline Hospitality — Payroll Support", category: "Business", account: "Equity Bank — Business Main", type: "expense", amount: -4_800_000, status: "Completed" },
  { id: "tx-5", date: "2026-09-08", description: "Transfer to CIC Money Market Reserve", category: "Transfer", account: "Equity Bank — Savings", type: "transfer", amount: -15_000_000, status: "Completed" },
  { id: "tx-6", date: "2026-09-08", description: "Transfer to CIC Money Market Reserve", category: "Transfer", account: "CIC Money Market — Emergency Reserve", type: "transfer", amount: 15_000_000, status: "Completed" },
  { id: "tx-7", date: "2026-09-07", description: "G-Wagon Comprehensive Insurance Renewal", category: "Insurance", account: "Equity Bank — Business Main", type: "expense", amount: -950_000, status: "Completed" },
  { id: "tx-8", date: "2026-09-06", description: "Safaricom PLC — Dividend Payment", category: "Dividends", account: "Standard Chartered — Investment Cash", type: "income", amount: 2_040_000, status: "Completed" },
  { id: "tx-9", date: "2026-09-05", description: "Diani Beach Villas — Seasonal Rent", category: "Rental Income", account: "Equity Bank — Savings", type: "income", amount: 6_800_000, status: "Completed" },
  { id: "tx-10", date: "2026-09-04", description: "Karen Manor — Staff & Maintenance", category: "Housing", account: "Equity Bank — Business Main", type: "expense", amount: -1_200_000, status: "Completed" },
  { id: "tx-11", date: "2026-09-03", description: "Private Jet Charter — Mombasa/Dubai", category: "Travel", account: "Chase Private Client USD", type: "expense", amount: -22_000, status: "Completed" },
  { id: "tx-12", date: "2026-09-02", description: "Bitcoin — DCA Purchase", category: "Investments", account: "Chase Private Client USD", type: "investment", amount: -18_500, status: "Completed" },
  { id: "tx-13", date: "2026-09-01", description: "Nairobi Prime Ventures Fund II — Capital Call", category: "Investments", account: "Standard Chartered — Investment Cash", type: "investment", amount: -25_000_000, status: "Completed" },
  { id: "tx-14", date: "2026-08-31", description: "Paylink (Nairobi Fintech) — Profit Distribution", category: "Business Income", account: "Equity Bank — Business Main", type: "income", amount: 3_600_000, status: "Completed" },
  { id: "tx-15", date: "2026-08-30", description: "Mombasa Warehouse — Tenant Rent", category: "Rental Income", account: "Equity Bank — Savings", type: "income", amount: 11_200_000, status: "Completed" },
  { id: "tx-16", date: "2026-08-29", description: "Family Office — Legal & Advisory Retainer", category: "Other", account: "Equity Bank — Business Main", type: "expense", amount: -1_100_000, status: "Completed" },
  { id: "tx-17", date: "2026-08-28", description: "M-Pesa — Household Fuel & Groceries", category: "Food", account: "M-Pesa Business Wallet", type: "expense", amount: -184_000, status: "Completed" },
  { id: "tx-18", date: "2026-08-27", description: "KPLC & Utilities — All Properties", category: "Utilities", account: "Equity Bank — Business Main", type: "expense", amount: -950_000, status: "Pending" },
  { id: "tx-19", date: "2026-08-26", description: "East Africa Growth VC Fund — Distribution", category: "Investment Income", account: "Standard Chartered — Investment Cash", type: "income", amount: 4_800_000, status: "Completed" },
  { id: "tx-20", date: "2026-08-25", description: "Savanna Grid Energy — Equipment Financing", category: "Business", account: "Equity Bank — Business Main", type: "expense", amount: -6_200_000, status: "Completed" },
];

// ---- Income sources ----
const INCOME_SOURCES = [
  { id: "inc-1", label: "Business Income", monthly: 68_000_000, color: BLUE_LT, icon: Briefcase },
  { id: "inc-2", label: "Rental Income", monthly: 8_400_000, color: GREEN, icon: Home },
  { id: "inc-3", label: "Dividends", monthly: 5_200_000, color: PURPLE, icon: Coins },
  { id: "inc-4", label: "Interest Income", monthly: 3_100_000, color: AMBER, icon: Landmark },
  { id: "inc-5", label: "Investment Income", monthly: 4_800_000, color: "#F472B6", icon: LineChartIcon },
  { id: "inc-6", label: "Other Income", monthly: 1_200_000, color: "#60D9C6", icon: DollarSign },
];

// ---- Expense categories ----
const EXPENSE_CATEGORIES = [
  { id: "exp-1", label: "Business Operating", monthly: 12_500_000, color: BLUE_LT },
  { id: "exp-2", label: "Investment Contributions", monthly: 6_000_000, color: PURPLE },
  { id: "exp-3", label: "Housing", monthly: 4_200_000, color: GREEN },
  { id: "exp-4", label: "Travel", monthly: 3_800_000, color: AMBER },
  { id: "exp-5", label: "Insurance", monthly: 2_100_000, color: "#F472B6" },
  { id: "exp-6", label: "Entertainment", monthly: 1_200_000, color: "#60D9C6" },
  { id: "exp-7", label: "Food & Lifestyle", monthly: 1_650_000, color: "#F87171" },
  { id: "exp-8", label: "Utilities", monthly: 950_000, color: "#94A3B8" },
  { id: "exp-9", label: "Other", monthly: 1_100_000, color: "#64748B" },
];

const LARGEST_EXPENSES = [
  { id: "le-1", label: "Nairobi Prime Ventures Fund II — Capital Call", amount: 25_000_000, date: "2026-09-01", category: "Investments" },
  { id: "le-2", label: "Savanna Grid Energy — Equipment Financing", amount: 6_200_000, date: "2026-08-25", category: "Business" },
  { id: "le-3", label: "Coastline Hospitality — Payroll Support", amount: 4_800_000, date: "2026-09-09", category: "Business" },
  { id: "le-4", label: "Vanguard S&P 500 ETF — Purchase", amount: 12_000_000, date: "2026-09-10", category: "Investments" },
  { id: "le-5", label: "Two Rivers Towers — Renovation Reserve", amount: 3_400_000, date: "2026-08-14", category: "Real Estate" },
];

const RECURRING_EXPENSES = [
  { id: "rec-1", label: "Family Office — Legal & Advisory Retainer", amount: 1_100_000, frequency: "Monthly" },
  { id: "rec-2", label: "KPLC & Utilities — All Properties", amount: 950_000, frequency: "Monthly" },
  { id: "rec-3", label: "Household Staff & Security", amount: 1_650_000, frequency: "Monthly" },
  { id: "rec-4", label: "Fleet Insurance — All Vehicles", amount: 452_500, frequency: "Monthly" },
  { id: "rec-5", label: "Cloud & SaaS Subscriptions (Group)", amount: 340_000, frequency: "Monthly" },
];

// ---- Businesses ----
const BUSINESSES = [
  {
    id: "biz-1", name: "Zenith Logistics Africa", industry: "Logistics & Freight", ownership: 100,
    valuation: 3_200_000_000, monthlyRevenue: 210_000_000, annualRevenue: 2_520_000_000,
    monthlyProfit: 38_000_000, annualProfit: 456_000_000, status: "Operating", performance: "Strong Growth",
    growthYoY: 22.4, founded: 2016,
    notes: "Regional freight network spanning Kenya, Uganda and Tanzania. Fleet expansion underway in Mombasa corridor.",
    recentActivity: ["Added 8 delivery vans to Mombasa fleet", "Signed 3-year contract with regional FMCG distributor", "Opened Kampala cross-border depot"],
  },
  {
    id: "biz-2", name: "Highland Coffee Exports Ltd", industry: "Agriculture & Export", ownership: 65,
    valuation: 1_100_000_000, monthlyRevenue: 42_000_000, annualRevenue: 504_000_000,
    monthlyProfit: 6_500_000, annualProfit: 78_000_000, status: "Operating", performance: "Stable",
    growthYoY: 4.1, founded: 2012,
    notes: "Specialty AA-grade coffee exporter to EU and Gulf markets. Yield stable, pricing sensitive to global commodity swings.",
    recentActivity: ["Locked in Q4 export contracts with EU buyers", "New wet-mill upgrade completed in Nyeri"],
  },
  {
    id: "biz-3", name: "Nairobi Fintech Solutions (Paylink)", industry: "Fintech", ownership: 40,
    valuation: 2_400_000_000, monthlyRevenue: 28_000_000, annualRevenue: 336_000_000,
    monthlyProfit: 9_000_000, annualProfit: 108_000_000, status: "Operating", performance: "Strong Growth",
    growthYoY: 34.8, founded: 2020,
    notes: "SME payments and lending platform. Piloting AI credit-scoring engine originally incubated as a venture.",
    recentActivity: ["Crossed 400,000 active merchant accounts", "Raised bridge round at 2.4B valuation", "Launched AI credit-scoring pilot"],
  },
  {
    id: "biz-4", name: "Savanna Grid Energy", industry: "Renewable Energy", ownership: 55,
    valuation: 2_000_000_000, monthlyRevenue: 33_000_000, annualRevenue: 396_000_000,
    monthlyProfit: 5_800_000, annualProfit: 69_600_000, status: "Operating", performance: "Moderate Growth",
    growthYoY: 11.2, founded: 2019,
    notes: "Solar mini-grid operator serving off-grid rural communities and commercial clients in Rift Valley.",
    recentActivity: ["Commissioned 2 new mini-grid sites", "Signed commercial PPA with agro-processor"],
  },
  {
    id: "biz-5", name: "Coastline Hospitality Group", industry: "Hospitality", ownership: 80,
    valuation: 500_000_000, monthlyRevenue: 9_500_000, annualRevenue: 114_000_000,
    monthlyProfit: -1_200_000, annualProfit: -14_400_000, status: "Under Review", performance: "Declining",
    growthYoY: -8.6, founded: 2015,
    notes: "Boutique coastal hotel portfolio. Occupancy softened post-season; restructuring plan under evaluation.",
    recentActivity: ["Engaged turnaround consultant", "Reduced off-season staffing", "Evaluating partial stake sale"],
  },
];

// ---- Ventures / ideas ----
const VENTURES = [
  { id: "ven-1", name: "Vantage Capital Data Product", industry: "Fintech", description: "Spin out anonymized SME cash-flow data from Paylink into a credit-risk data product for regional banks.", capital: 150_000_000, expectedReturn: "3–5x", risk: "Medium", status: "Idea", dateAdded: "2026-06-02", notes: "Needs regulatory review before data licensing is viable.", rationale: "Paylink already sits on 400,000+ merchant transaction histories that no regional bank has visibility into. Banks currently underwrite SMEs blind, which means either rejecting good borrowers or overpricing risk — a licensed, anonymized data feed sells into that gap immediately.", projectedRevenue: 60_000_000, projectedTimeline: "Breakeven in 14 months" },
  { id: "ven-2", name: "Solar Mini-Grid Rural Expansion", industry: "Energy", description: "Expand Savanna Grid's mini-grid footprint into two additional counties with development-finance co-investment.", capital: 400_000_000, expectedReturn: "2–3x", risk: "Medium-High", status: "Research", dateAdded: "2026-04-18", notes: "In talks with DFI for concessional debt.", rationale: "Savanna Grid's existing sites are already at 90%+ commercial uptime, proving the demand model. Concessional DFI debt lowers the cost of capital enough that even conservative rural adoption curves clear the hurdle rate.", projectedRevenue: 95_000_000, projectedTimeline: "Breakeven in 30 months" },
  { id: "ven-3", name: "Cold Chain Logistics Network", industry: "Agritech / Logistics", description: "Refrigerated trucking and storage network linking Rift Valley producers to Nairobi and export hubs.", capital: 220_000_000, expectedReturn: "4x", risk: "Medium", status: "Testing", dateAdded: "2026-02-27", notes: "Pilot route (Naivasha–Nairobi) running since March.", rationale: "Post-harvest spoilage on the Naivasha corridor runs above 30% industry-wide — the pilot route is already carrying paid volume at a fraction of that loss rate, and Zenith Logistics gives us fleet and route expertise in-house.", projectedRevenue: 140_000_000, projectedTimeline: "Breakeven in 20 months" },
  { id: "ven-4", name: "Boutique Safari Lodges — Maasai Mara", industry: "Hospitality", description: "Two 12-room eco-lodges targeting high-end international tourism, separate from Coastline's coastal portfolio.", capital: 680_000_000, expectedReturn: "2.5x", risk: "Low-Medium", status: "Funded", dateAdded: "2025-11-09", notes: "Construction financing closed; groundbreaking scheduled.", rationale: "High-end Mara occupancy has stayed above 80% through the last three peak seasons despite new supply, and construction financing is already closed at favorable terms — the main execution risk is timeline, not demand.", projectedRevenue: 210_000_000, projectedTimeline: "Breakeven in 36 months" },
  { id: "ven-5", name: "AI-Driven Credit Scoring for SMEs", industry: "Fintech / AI", description: "Machine-learning underwriting engine, now piloting live inside Paylink's lending book.", capital: 90_000_000, expectedReturn: "6x", risk: "High", status: "Operating", dateAdded: "2025-05-14", notes: "Graduated from idea to an operating line within Paylink.", rationale: "Already validated: default rates on AI-scored loans are running below the manually-underwritten book, which is the single hardest thing to prove in lending. The graduation from pilot to production line is the proof.", projectedRevenue: 54_000_000, projectedTimeline: "Already cash-flow positive" },
  { id: "ven-6", name: "Regional E-Mobility (EV Motorbikes)", industry: "Mobility", description: "Electric boda-boda leasing pilot across Nairobi; stake sold to a strategic mobility operator.", capital: 60_000_000, expectedReturn: "3.2x realized", risk: "Medium", status: "Exited", dateAdded: "2023-09-30", notes: "Exited at 3.2x after 22 months; proceeds redeployed into Paylink.", rationale: "Fuel savings alone covered lease payments within the first 4 months for riders, which drove organic waitlist growth without subsidized acquisition — the strategic buyer paid for that proven unit economics.", projectedRevenue: 0, projectedTimeline: "Exited — realized 3.2x" },
];

const VENTURE_STATUS_COLOR = {
  Idea: "#94A3B8", Research: BLUE_LT, Testing: AMBER, Funded: PURPLE, Operating: GREEN, Exited: "#60D9C6",
};

// ---- Investments / holdings ----
const INVESTMENTS = [
  { id: "hold-1", asset: "Safaricom PLC", category: "Stocks", currency: "KES", quantity: 1_200_000, avgCost: 14.2, price: 17.85 },
  { id: "hold-2", asset: "Equity Group Holdings", category: "Stocks", currency: "KES", quantity: 800_000, avgCost: 42, price: 51.5 },
  { id: "hold-3", asset: "Vanguard S&P 500 ETF (VOO)", category: "ETFs", currency: "USD", quantity: 3500, avgCost: 380, price: 512 },
  { id: "hold-4", asset: "Kenya Government Treasury Bonds", category: "Bonds", currency: "KES", quantity: 1, avgCost: 650_000_000, price: 682_000_000 },
  { id: "hold-5", asset: "CIC Balanced Fund", category: "Funds", currency: "KES", quantity: 2_000_000, avgCost: 118, price: 130 },
  { id: "hold-6", asset: "Bitcoin (BTC)", category: "Crypto", currency: "USD", quantity: 42.5, avgCost: 28_400, price: 96_500 },
  { id: "hold-7", asset: "Ethereum (ETH)", category: "Crypto", currency: "USD", quantity: 620, avgCost: 1850, price: 3400 },
  { id: "hold-8", asset: "Nairobi Prime Ventures Fund II", category: "Private Equity", currency: "KES", quantity: 1, avgCost: 800_000_000, price: 1_050_000_000 },
  { id: "hold-9", asset: "East Africa Growth VC Fund", category: "Venture Capital", currency: "KES", quantity: 1, avgCost: 300_000_000, price: 410_000_000 },
  { id: "hold-10", asset: "Money Market & Short-Term Notes", category: "Other", currency: "KES", quantity: 1, avgCost: 353_219_000, price: 353_219_000 },
];

// ---- Real estate ----
const PROPERTIES = [
  { id: "prop-1", name: "Karen Manor Estate", location: "Karen, Nairobi", type: "Residential — Primary Residence", purchasePrice: 380_000_000, currentValue: 620_000_000, mortgage: 0, monthlyRent: 0, monthlyExpenses: 1_200_000, occupancy: "Owner-Occupied" },
  { id: "prop-2", name: "Westlands Business Park", location: "Westlands, Nairobi", type: "Commercial Office", purchasePrice: 900_000_000, currentValue: 1_350_000_000, mortgage: 480_000_000, monthlyRent: 14_500_000, monthlyExpenses: 3_200_000, occupancy: "92%" },
  { id: "prop-3", name: "Diani Beach Villas (4 units)", location: "Diani, Kwale", type: "Vacation Rental", purchasePrice: 260_000_000, currentValue: 410_000_000, mortgage: 90_000_000, monthlyRent: 6_800_000, monthlyExpenses: 2_100_000, occupancy: "68%" },
  { id: "prop-4", name: "Two Rivers Residential Towers", location: "Ruaka, Nairobi", type: "Residential Rental (12 units)", purchasePrice: 540_000_000, currentValue: 780_000_000, mortgage: 310_000_000, monthlyRent: 9_600_000, monthlyExpenses: 1_900_000, occupancy: "100%" },
  { id: "prop-5", name: "Naivasha Agri-Estate & Ranch", location: "Naivasha", type: "Agricultural Land", purchasePrice: 210_000_000, currentValue: 340_000_000, mortgage: 0, monthlyRent: 1_400_000, monthlyExpenses: 400_000, occupancy: "Leased" },
  { id: "prop-6", name: "Mombasa Warehouse & Logistics Hub", location: "Changamwe, Mombasa", type: "Industrial", purchasePrice: 620_000_000, currentValue: 900_000_000, mortgage: 380_000_000, monthlyRent: 11_200_000, monthlyExpenses: 2_600_000, occupancy: "100%" },
  { id: "prop-7", name: "The Meridian — Kilimani Apartments", location: "Kilimani, Nairobi", type: "Residential Rental", purchasePrice: 180_000_000, currentValue: 250_000_000, mortgage: 70_000_000, monthlyRent: 3_400_000, monthlyExpenses: 900_000, occupancy: "85%" },
];

// ---- Vehicles ----
const VEHICLES = [
  { id: "veh-1", name: "Range Rover Autobiography", year: 2023, purchasePrice: 32_000_000, currentValue: 26_500_000, financing: 8_000_000, insuranceAnnual: 850_000, maintenanceAnnual: 620_000, ownership: "Personal" },
  { id: "veh-2", name: "Mercedes-Benz G63 AMG", year: 2022, purchasePrice: 38_500_000, currentValue: 31_000_000, financing: 0, insuranceAnnual: 950_000, maintenanceAnnual: 780_000, ownership: "Personal" },
  { id: "veh-3", name: "Toyota Land Cruiser V8 Fleet (×3)", year: 2021, purchasePrice: 27_000_000, currentValue: 19_500_000, financing: 44_500_000 > 0 ? 44_500_000 : 0, insuranceAnnual: 620_000, maintenanceAnnual: 900_000, ownership: "Business" },
  { id: "veh-4", name: "Porsche 911 Turbo S", year: 2023, purchasePrice: 24_000_000, currentValue: 21_800_000, financing: 0, insuranceAnnual: 720_000, maintenanceAnnual: 480_000, ownership: "Personal" },
  { id: "veh-5", name: "Zenith Logistics Delivery Fleet (×8)", year: 2022, purchasePrice: 64_000_000, currentValue: 48_200_000, financing: 12_500_000, insuranceAnnual: 1_400_000, maintenanceAnnual: 2_100_000, ownership: "Business" },
  { id: "veh-6", name: "Bell 407 Helicopter", year: 2020, purchasePrice: 42_000_000, currentValue: 33_000_000, financing: 0, insuranceAnnual: 1_800_000, maintenanceAnnual: 2_400_000, ownership: "Personal" },
];

// ---- Liabilities ----
const LIABILITIES = [
  { id: "lia-1", name: "Westlands Business Park Mortgage", category: "Mortgages", original: 550_000_000, outstanding: 480_000_000, rate: 12.5, monthlyPayment: 6_200_000, dueDate: "2026-09-28", remainingTerm: "11 yrs", paid: false, lastPaidDate: null },
  { id: "lia-2", name: "Mombasa Warehouse Mortgage", category: "Mortgages", original: 420_000_000, outstanding: 380_000_000, rate: 12.8, monthlyPayment: 4_950_000, dueDate: "2026-09-25", remainingTerm: "13 yrs", paid: false, lastPaidDate: null },
  { id: "lia-3", name: "Two Rivers Towers Mortgage", category: "Mortgages", original: 340_000_000, outstanding: 310_000_000, rate: 12.2, monthlyPayment: 3_800_000, dueDate: "2026-09-20", remainingTerm: "14 yrs", paid: false, lastPaidDate: null },
  { id: "lia-4", name: "Diani Beach Villas Mortgage", category: "Mortgages", original: 105_000_000, outstanding: 90_000_000, rate: 13.0, monthlyPayment: 1_450_000, dueDate: "2026-09-22", remainingTerm: "9 yrs", paid: false, lastPaidDate: null },
  { id: "lia-5", name: "Kilimani Meridian Mortgage", category: "Mortgages", original: 85_000_000, outstanding: 70_000_000, rate: 12.9, monthlyPayment: 1_050_000, dueDate: "2026-09-18", remainingTerm: "8 yrs", paid: false, lastPaidDate: null },
  { id: "lia-6", name: "Zenith Logistics — Fleet Expansion Loan", category: "Business Loans", original: 300_000_000, outstanding: 260_000_000, rate: 15.5, monthlyPayment: 8_400_000, dueDate: "2026-09-30", remainingTerm: "3 yrs", paid: false, lastPaidDate: null },
  { id: "lia-7", name: "Savanna Grid Energy — Equipment Loan", category: "Business Loans", original: 320_000_000, outstanding: 260_000_000, rate: 14.8, monthlyPayment: 7_100_000, dueDate: "2026-10-05", remainingTerm: "4 yrs", paid: false, lastPaidDate: null },
  { id: "lia-8", name: "Land Cruiser Fleet Financing", category: "Auto Financing", original: 60_000_000, outstanding: 44_500_000, rate: 11.5, monthlyPayment: 1_450_000, dueDate: "2026-09-15", remainingTerm: "2.5 yrs", paid: false, lastPaidDate: null },
  { id: "lia-9", name: "Range Rover Financing", category: "Auto Financing", original: 16_000_000, outstanding: 8_000_000, rate: 10.9, monthlyPayment: 620_000, dueDate: "2026-09-14", remainingTerm: "1 yr", paid: false, lastPaidDate: null },
  { id: "lia-10", name: "Delivery Fleet Financing", category: "Auto Financing", original: 20_000_000, outstanding: 12_500_000, rate: 11.2, monthlyPayment: 850_000, dueDate: "2026-09-16", remainingTerm: "1.5 yrs", paid: false, lastPaidDate: null },
  { id: "lia-11", name: "Corporate Credit Facility — Equity Bank", category: "Credit Facilities", original: 150_000_000, outstanding: 95_000_000, rate: 16.0, monthlyPayment: 3_200_000, dueDate: "2026-09-27", remainingTerm: "Revolving", paid: false, lastPaidDate: null },
  { id: "lia-12", name: "Family Office — Advisory Payable", category: "Other Liabilities", original: 50_000_000, outstanding: 50_000_000, rate: 0, monthlyPayment: 0, dueDate: "2026-12-01", remainingTerm: "Term note", paid: false, lastPaidDate: null },
];
// ---- Wealth Management: general owned assets (revenue-generating or dormant) ----
const WEALTH_ASSETS = [
  { id: "wa-1", name: "Mercedes-Benz S-Class (Personal)", category: "Personal Vehicle", nature: "Dormant", purchasePrice: 22_000_000, currentValue: 17_500_000, monthlyIncome: 0, dateAcquired: "2023-04-10", notes: "Personal use only, not leased or hired out." },
  { id: "wa-2", name: "Patek Philippe Nautilus Collection (3 pieces)", category: "Jewelry & Watches", nature: "Dormant", purchasePrice: 18_500_000, currentValue: 24_000_000, monthlyIncome: 0, dateAcquired: "2021-11-02", notes: "Held as a store of value; appreciating steadily." },
  { id: "wa-3", name: "Contemporary East African Art Collection", category: "Art & Collectibles", nature: "Dormant", purchasePrice: 9_800_000, currentValue: 13_200_000, monthlyIncome: 0, dateAcquired: "2020-06-15", notes: "12 pieces from regional artists, displayed at Karen Manor." },
  { id: "wa-4", name: "CAT Earthmoving Equipment (Leased to Contractors)", category: "Equipment & Machinery", nature: "Revenue-Generating", purchasePrice: 34_000_000, currentValue: 26_000_000, monthlyIncome: 2_100_000, dateAcquired: "2022-02-20", notes: "Leased out to two construction contractors on rotation." },
  { id: "wa-5", name: "Sunseeker 68 Yacht", category: "Boat / Marine", nature: "Revenue-Generating", purchasePrice: 145_000_000, currentValue: 118_000_000, monthlyIncome: 3_400_000, dateAcquired: "2022-09-05", notes: "Chartered out via a Mombasa marina operator on weekends." },
  { id: "wa-6", name: "Undeveloped Land Parcel — Kajiado", category: "Land (Undeveloped)", nature: "Dormant", purchasePrice: 60_000_000, currentValue: 92_000_000, monthlyIncome: 0, dateAcquired: "2019-03-12", notes: "Held speculatively; no current development plans." },
  { id: "wa-7", name: "Dairy Herd (40 head) — Naivasha", category: "Livestock", nature: "Revenue-Generating", purchasePrice: 8_000_000, currentValue: 9_600_000, monthlyIncome: 620_000, dateAcquired: "2023-01-18", notes: "Milk sales through a regional cooperative." },
];

// ---- Expense Ledger: personal + business recurring and one-time expenses ----
const EXPENSE_LEDGER = [
  { id: "el-1", name: "Zenith Logistics — Staff Payroll", category: "Salaries & Wages", scope: "Business", amount: 24_000_000, frequency: "Monthly", nextDue: "2026-09-28", vendor: "Internal Payroll", notes: "Covers 140 staff across depots." },
  { id: "el-2", name: "Household Staff Wages", category: "Salaries & Wages", scope: "Personal", amount: 850_000, frequency: "Monthly", nextDue: "2026-09-30", vendor: "Direct", notes: "Housekeeping, chef, gardener, driver." },
  { id: "el-3", name: "Karen Manor — Household Rent Equivalent", category: "Rent — Personal", scope: "Personal", amount: 0, frequency: "Monthly", nextDue: "—", vendor: "—", notes: "Owner-occupied, no rent payable." },
  { id: "el-4", name: "Westlands Business Park — Office Space", category: "Rent — Business", scope: "Business", amount: 0, frequency: "Monthly", nextDue: "—", vendor: "—", notes: "Owned property, tracked under Real Estate." },
  { id: "el-5", name: "Safaricom Home Fibre + Business Lines", category: "Utilities & Wifi", scope: "Personal", amount: 45_000, frequency: "Monthly", nextDue: "2026-09-20", vendor: "Safaricom", notes: "Karen Manor fibre plus 6 business SIMs." },
  { id: "el-6", name: "Office Internet & Cloud Connectivity", category: "Utilities & Wifi", scope: "Business", amount: 280_000, frequency: "Monthly", nextDue: "2026-09-22", vendor: "Safaricom / Zuku", notes: "Westlands HQ + Mombasa depot links." },
  { id: "el-7", name: "Household Groceries & Food", category: "Food & Groceries", scope: "Personal", amount: 380_000, frequency: "Monthly", nextDue: "2026-09-25", vendor: "Zucchini / Carrefour", notes: "Family + staff meals." },
  { id: "el-8", name: "Office Pantry & Catering", category: "Food & Groceries", scope: "Business", amount: 120_000, frequency: "Monthly", nextDue: "2026-09-25", vendor: "Various", notes: "HQ pantry and client meetings." },
  { id: "el-9", name: "New CAT Excavator — Fleet Expansion", category: "Asset Purchase", scope: "Business", amount: 18_500_000, frequency: "One-time", nextDue: "2026-10-15", vendor: "CMC Motors", notes: "Adds capacity to leased equipment line." },
  { id: "el-10", name: "Home Office Furniture & Equipment", category: "Asset Purchase", scope: "Personal", amount: 950_000, frequency: "One-time", nextDue: "2026-09-18", vendor: "Furniture Palace", notes: "Study refurbishment." },
  { id: "el-11", name: "Family Health Insurance", category: "Insurance", scope: "Personal", amount: 320_000, frequency: "Monthly", nextDue: "2026-09-15", vendor: "Jubilee Insurance", notes: "Comprehensive cover, family of 5." },
  { id: "el-12", name: "Group Business Liability Insurance", category: "Insurance", scope: "Business", amount: 1_100_000, frequency: "Monthly", nextDue: "2026-09-15", vendor: "APA Insurance", notes: "Covers all subsidiaries." },
  { id: "el-13", name: "Personal Fuel & Transport", category: "Transport & Fuel", scope: "Personal", amount: 210_000, frequency: "Monthly", nextDue: "2026-09-20", vendor: "Shell / Total", notes: "Personal vehicle fleet." },
  { id: "el-14", name: "Fleet Fuel — Delivery & Logistics", category: "Transport & Fuel", scope: "Business", amount: 8_200_000, frequency: "Monthly", nextDue: "2026-09-20", vendor: "Shell Fleet Card", notes: "Zenith Logistics delivery fleet." },
  { id: "el-15", name: "Cloud & SaaS Subscriptions (Group)", category: "Subscriptions & SaaS", scope: "Business", amount: 340_000, frequency: "Monthly", nextDue: "2026-09-10", vendor: "AWS / Google Workspace / Various", notes: "Covers Paylink, Vantage, and internal tools.", paid: true, lastPaidDate: "2026-09-09" },
  { id: "el-16", name: "Streaming & Personal Subscriptions", category: "Subscriptions & SaaS", scope: "Personal", amount: 28_000, frequency: "Monthly", nextDue: "2026-09-12", vendor: "Netflix / DSTV / Spotify", notes: "Household entertainment." },
  { id: "el-17", name: "Paylink Growth Marketing Spend", category: "Marketing", scope: "Business", amount: 4_500_000, frequency: "Monthly", nextDue: "2026-09-28", vendor: "Various Agencies", notes: "Merchant acquisition campaigns." },
  { id: "el-18", name: "Karen Manor Security Detail", category: "Staff & Security", scope: "Personal", amount: 480_000, frequency: "Monthly", nextDue: "2026-09-30", vendor: "KK Security", notes: "Residential security team." },
  { id: "el-19", name: "Warehouse & Depot Maintenance", category: "Maintenance", scope: "Business", amount: 1_650_000, frequency: "Monthly", nextDue: "2026-10-01", vendor: "Various Contractors", notes: "Routine upkeep across depots." },
];

// ---- Documents ----
const DOCUMENTS = [
  { id: "doc-1", name: "FY2025 Consolidated Financial Statements.pdf", category: "Financial Statements", type: "PDF", date: "2026-03-14", size: "4.2 MB" },
  { id: "doc-2", name: "Karen Manor — Title Deed.pdf", category: "Property", type: "PDF", date: "2019-06-02", size: "1.1 MB" },
  { id: "doc-3", name: "Westlands Business Park — Lease Agreements.zip", category: "Property", type: "ZIP", date: "2026-01-20", size: "18.4 MB" },
  { id: "doc-4", name: "Range Rover — Logbook & Insurance.pdf", category: "Vehicles", type: "PDF", date: "2026-02-11", size: "820 KB" },
  { id: "doc-5", name: "Zenith Logistics — Shareholder Agreement.pdf", category: "Businesses", type: "PDF", date: "2016-11-08", size: "3.6 MB" },
  { id: "doc-6", name: "Paylink — Series Bridge Term Sheet.pdf", category: "Businesses", type: "PDF", date: "2026-07-02", size: "980 KB" },
  { id: "doc-7", name: "Nairobi Prime Ventures Fund II — LPA.pdf", category: "Investments", type: "PDF", date: "2023-09-19", size: "5.4 MB" },
  { id: "doc-8", name: "KRA — 2025 Tax Compliance Certificate.pdf", category: "Tax", type: "PDF", date: "2026-01-05", size: "310 KB" },
  { id: "doc-9", name: "Mombasa Warehouse — Insurance Policy.pdf", category: "Contracts", type: "PDF", date: "2026-04-30", size: "1.4 MB" },
  { id: "doc-10", name: "Q2 2026 Household Expense Receipts.zip", category: "Receipts", type: "ZIP", date: "2026-07-10", size: "22.1 MB" },
  { id: "doc-11", name: "Diani Beach Villas — Construction Contract.pdf", category: "Property", type: "PDF", date: "2018-03-22", size: "2.8 MB" },
  { id: "doc-12", name: "Family Trust — Estate Plan Summary.pdf", category: "Other", type: "PDF", date: "2025-11-30", size: "1.9 MB" },
];

// OBLIGATIONS array removed — obligations are now derived from `LIABILITIES` and `EXPENSE_LEDGER`.

/* ═══════════════════════════════════════════════════════════════
   REUSABLE ATOMS
═══════════════════════════════════════════════════════════════ */
const Badge = ({ children, tone = "muted" }) => {
  const tones = {
    green: "text-[#34D399] bg-[#34D399]/10 border-[#34D399]/25",
    red: "text-[#F87171] bg-[#F87171]/10 border-[#F87171]/20",
    amber: "text-[#E8A855] bg-[#E8A855]/10 border-[#E8A855]/25",
    blue: "text-[#7CA6FF] bg-[#5C8DFF]/10 border-[#5C8DFF]/30",
    purple: "text-[#A78BFA] bg-[#A78BFA]/10 border-[#A78BFA]/25",
    muted: "text-white/45 bg-white/[0.03] border-white/[0.08]",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[9.5px] font-bold tracking-[0.04em] px-2 py-[3px] rounded-md border whitespace-nowrap ${tones[tone] || tones.muted}`}>
      {children}
    </span>
  );
};

const IconBox = ({ icon: Icon, size = 28, color = BLUE_LT, bg = "bg-[#5C8DFF]/10", border = "border-[#5C8DFF]/30" }) => (
  <div className={`flex items-center justify-center rounded-[9px] border ${bg} ${border} flex-shrink-0`} style={{ width: size, height: size }}>
    <Icon size={Math.round(size * 0.46)} color={color} />
  </div>
);

const SectionHeader = ({ icon, title, subtitle, right }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5 relative z-10">
    <div className="flex items-center gap-2.5">
      {icon && <IconBox icon={icon} size={28} />}
      <div>
        <h2 className="m-0 text-[14px] font-extrabold tracking-[-0.01em] text-[#EAEDF7]">{title}</h2>
        {subtitle && <div className="text-[9px] tracking-[0.14em] uppercase text-[#7CA6FF]/70 mt-0.5">{subtitle}</div>}
      </div>
    </div>
    {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
  </div>
);

const Divider = () => <div className="h-px my-3.5 bg-gradient-to-r from-transparent via-white/[0.13] to-transparent" />;

const EmptyState = ({ icon: Icon = Info, text }) => (
  <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-center">
    <div className="w-10 h-10 rounded-xl bg-[#5C8DFF]/10 border border-[#5C8DFF]/25 flex items-center justify-center">
      <Icon size={17} color={BLUE_LT} />
    </div>
    <p className="text-[12px] text-white/40 max-w-[260px] leading-relaxed">{text}</p>
  </div>
);

/* Metric card used across the executive overview + section summaries */
const MetricCard = ({ icon: Icon, label, value, sub, positive, accent = BLUE_LT }) => (
  <div className={`${GLASS} p-4 flex flex-col gap-2.5`}>
    <TopHairline />
    <div className="flex items-center justify-between relative z-10">
      <span className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-white/35">{label}</span>
      <IconBox icon={Icon} size={26} color={accent} />
    </div>
    <div className="font-mono text-[21px] font-extrabold text-[#F7F9FF] leading-none tracking-[-0.02em] relative z-10">{value}</div>
    {sub !== undefined && (
      <div className="flex items-center gap-1 relative z-10">
        {positive === true && <ArrowUpRight size={11} color={GREEN} />}
        {positive === false && <ArrowDownRight size={11} color={RED} />}
        <span className="text-[10px] text-white/40">{sub}</span>
      </div>
    )}
  </div>
);

/* Generic modal shell */
const Modal = ({ open, onClose, title, icon: Icon, children, wide = false, nested = false }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        className={`fixed inset-0 bg-[#020308]/90 flex items-end sm:items-center justify-center p-0 sm:p-6 ${nested ? "z-[420]" : "z-[400]"}`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={`bg-[#0A0D16]/98 border border-white/[0.13] rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto relative shadow-[0_-12px_60px_rgba(0,0,0,0.6)]`}
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-3.5 right-3.5 w-8 h-8 rounded-[9px] border border-white/[0.13] bg-[#05060A]/90 text-white flex items-center justify-center hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
          {title && (
            <div className="flex items-center gap-2.5 mb-4 pr-9">
              {Icon && <IconBox icon={Icon} size={30} />}
              <h2 className="m-0 text-[15px] font-extrabold text-[#EAEDF7] tracking-[-0.01em]">{title}</h2>
            </div>
          )}
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

/* Chart wrapper card */
const ChartCard = ({ title, subtitle, icon, right, children, height = 240 }) => (
  <div className={`${CARD} p-5`}>
    <CornerAccents />
    <SectionHeader icon={icon} title={title} subtitle={subtitle} right={right} />
    <div className="relative z-10" style={{ height }}>{children}</div>
  </div>
);

/* Donut allocation chart + legend list, reused for asset / investment / expense breakdowns */
const DonutBreakdown = ({ data, currency = "KSh", valueKey = "value", labelKey = "label" }) => {
  const total = data.reduce((s, d) => s + d[valueKey], 0);
  const [active, setActive] = useState(null);
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="w-[190px] h-[190px] flex-shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RePieChart>
            <Pie
              data={data} dataKey={valueKey} nameKey={labelKey}
              innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none"
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}
            >
              {data.map((d, i) => (
                <Cell key={d.id || i} fill={d.color || PIE_COLORS[i % PIE_COLORS.length]}
                  opacity={active === null || active === i ? 1 : 0.35} />
              ))}
            </Pie>
          </RePieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[8.5px] tracking-[0.14em] uppercase text-white/35">Total</span>
          <span className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(total, currency)}</span>
        </div>
      </div>
      <div className="flex-1 w-full flex flex-col gap-2 min-w-0">
        {data.map((d, i) => {
          const pct = total ? (d[valueKey] / total) * 100 : 0;
          const color = d.color || PIE_COLORS[i % PIE_COLORS.length];
          return (
            <div key={d.id || i} className="flex items-center gap-2.5 min-w-0"
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: color }} />
              <span className="text-[11.5px] text-white/70 truncate flex-1">{d[labelKey]}</span>
              <span className="font-mono text-[11px] text-white/45 flex-shrink-0">{pct.toFixed(1)}%</span>
              <span className="font-mono text-[11.5px] font-bold text-[#EAEDF7] flex-shrink-0 w-[86px] text-right">{fmtCompact(d[valueKey], currency)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

  const VentureDetailModal = ({ venture, onClose }) => (
    <Modal nested onClose={onClose}>
      {venture && (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[13px] font-extrabold text-[#EAEDF7]">{venture.name}</div>
              <div className="text-[10px] text-white/40">{venture.industry}</div>
            </div>
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md border"
              style={{ color: VENTURE_STATUS_COLOR[venture.status], background: `${VENTURE_STATUS_COLOR[venture.status]}1A`, borderColor: `${VENTURE_STATUS_COLOR[venture.status]}44` }}>
              {venture.status}
            </span>
          </div>

          <div className="text-[10px] text-white/40">Added {venture.dateAdded}</div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              ["Capital Required", fmtCompact(venture.capital)],
              ["Expected Return", venture.expectedReturn],
              ["Risk Level", venture.risk],
              ["Projected Revenue", venture.projectedRevenue ? fmtCompact(venture.projectedRevenue) : "—"],
            ].map(([l, v]) => (
              <div key={l} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
                <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">{l}</div>
                <div className="font-mono text-[13px] font-bold text-[#EAEDF7]">{v}</div>
              </div>
            ))}
          </div>

          {venture.projectedTimeline && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#5C8DFF]/[0.08] border border-[#5C8DFF]/25">
              <span className="flex items-center gap-2 text-[11px] text-white/60"><CalendarClock size={13} color={BLUE_LT} /> Projected Timeline</span>
              <span className="text-[12px] font-bold text-[#EAEDF7]">{venture.projectedTimeline}</span>
            </div>
          )}

          <div>
            <div className={LABEL}>Description</div>
            <p className="text-[12px] text-white/60 leading-relaxed">{venture.description}</p>
          </div>

          {venture.rationale && (
            <div>
              <div className={LABEL}>Why This Could Work</div>
              <div className="p-3.5 rounded-xl bg-[#34D399]/[0.06] border border-[#34D399]/20">
                <p className="text-[12px] text-white/70 leading-relaxed">{venture.rationale}</p>
              </div>
            </div>
          )}

          {venture.notes && (
            <div>
              <div className={LABEL}>Notes</div>
              <p className="text-[12px] text-white/60 leading-relaxed">{venture.notes}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );

  /* ═══════════════════════════════════════════════════════════════
  SECTION: WEALTH MANAGEMENT — general owned assets
  ═══════════════════════════════════════════════════════════════ */
  const AssetCard = ({ asset, onSelect }) => {
    const isRevenue = asset.nature === "Revenue-Generating";
    const gain = (asset.currentValue || 0) - (asset.purchasePrice || 0);
    const gainPct = asset.purchasePrice ? (gain / asset.purchasePrice) * 100 : 0;
    return (
      <div onClick={() => onSelect?.(asset)} className="p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07] cursor-pointer hover:border-[#5C8DFF]/30 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold text-[#EAEDF7] truncate">{asset.name}</div>
            <div className="text-[10px] text-white/40 truncate">{asset.category}</div>
          </div>
          <Badge tone={isRevenue ? "green" : "muted"}>{asset.nature}</Badge>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] text-white/35">Current Value</div>
            <div className="font-mono text-[16px] font-extrabold text-[#EAEDF7]">{fmtCompact(asset.currentValue)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-white/35">Gain</div>
            <div className="text-[13px] font-bold" style={{ color: gain >= 0 ? GREEN : RED }}>{gain >= 0 ? `+${fmtCompact(gain)}` : fmtCompact(gain)}</div>
            <div className="text-[11px] text-white/40">{fmtPct(gainPct)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06] gap-3">
          <div>
            <div className="text-[9px] text-white/35">Monthly Income</div>
            <div className="font-mono text-[11px] font-bold" style={{ color: isRevenue ? GREEN : "rgba(255,255,255,0.35)" }}>{isRevenue && asset.monthlyIncome ? fmtCompact(asset.monthlyIncome) : "—"}</div>
          </div>
          <div className="text-right text-[10px] text-white/35">
            <div>Acquired</div>
            <div className="font-mono">{asset.dateAcquired}</div>
          </div>
        </div>

        {asset.notes && <div className="mt-3 text-[12px] text-white/40">{asset.notes}</div>}
      </div>
    );
  };

  const WealthManagementSection = ({ assets, onAdd, onSelect }) => {
    
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [natureFilter, setNatureFilter] = useState("");

    const categories = useMemo(() => [...new Set(assets.map((a) => a.category))], [assets]);

    const filtered = assets.filter((a) =>
      (!search || a.name.toLowerCase().includes(search.toLowerCase())) &&
      (!categoryFilter || a.category === categoryFilter) &&
      (!natureFilter || a.nature === natureFilter)
    );

    const totalValue = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
    const revenueValue = assets.filter((a) => a.nature === "Revenue-Generating").reduce((s, a) => s + (a.currentValue || 0), 0);
    const dormantValue = totalValue - revenueValue;
    const monthlyPassiveIncome = assets.filter((a) => a.nature === "Revenue-Generating").reduce((s, a) => s + (a.monthlyIncome || 0), 0);

    return (
      <div className={`${CARD} p-5`}>
        <CornerAccents />
        <SectionHeader icon={PiggyBank} title="Wealth Management" subtitle={`${assets.length} owned assets · ${fmtCompact(totalValue)} combined`}
          right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Asset</button>} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 relative z-10">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
            <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Total Asset Value</div>
            <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(totalValue)}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#34D399]/[0.06] border border-[#34D399]/20">
            <div className="text-[8px] tracking-[0.1em] uppercase text-[#34D399]/70 mb-1">Revenue-Generating</div>
            <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(revenueValue)}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
            <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Dormant</div>
            <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(dormantValue)}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#5C8DFF]/[0.08] border border-[#5C8DFF]/25">
            <div className="text-[8px] tracking-[0.1em] uppercase text-[#7CA6FF]/70 mb-1">Monthly Passive Income</div>
            <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(monthlyPassiveIncome)}</div>
          </div>
        </div>

        <FilterBar search={search} onSearch={setSearch} placeholder="Search assets…" filters={[
          { key: "category", label: "All Categories", value: categoryFilter, onChange: setCategoryFilter, options: categories },
          { key: "nature", label: "All Types", value: natureFilter, onChange: setNatureFilter, options: ["Revenue-Generating", "Dormant"] },
        ]} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 relative z-10 mt-4">
          {filtered.length === 0 && <div className="sm:col-span-2 lg:col-span-3"><EmptyState text="No assets match your search." /></div>}
          {filtered.map((a) => <AssetCard key={a.id} asset={a} onSelect={onSelect} />)}
        </div>
      </div>
    );
  };

/* Filter bar: search + arbitrary select filters, used across list sections */
const FilterBar = ({ search, onSearch, placeholder = "Search…", filters = [], right }) => (
  <div className="flex flex-wrap items-center gap-2 mb-3.5 relative z-10">
    <div className="relative flex-1 min-w-[160px]">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
      <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder}
        className={`${INPUT} pl-8`} />
    </div>
    {filters.map((f) => (
      <select key={f.key} value={f.value} onChange={(e) => f.onChange(e.target.value)}
        className="px-3 py-2.5 bg-white/[0.025] border border-white/[0.08] rounded-[10px] text-[11.5px] text-white/70 outline-none cursor-pointer focus:border-[#5C8DFF]/30 [&>option]:bg-[#0C0F18]">
        <option value="">{f.label}</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ))}
    {right}
  </div>
);

/* Generic responsive table: real table on md+, stacked cards on mobile. */
const ResponsiveTable = ({ columns, rows, onRowClick, keyField = "id" }) => {
  if (!rows.length) return <EmptyState text="No records match your filters yet." />;
  return (
    <>
      <div className="hidden md:block overflow-x-auto -mx-1">
        <table className="w-full border-separate border-spacing-0 text-[11.5px]">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-3 py-2.5 text-left text-[8.5px] font-bold tracking-[0.12em] uppercase text-white/40 border-b border-white/[0.07] whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[keyField]} onClick={() => onRowClick?.(r)}
                className={`border-b border-white/[0.04] last:border-b-0 even:bg-white/[0.012] hover:bg-[#5C8DFF]/[0.06] transition-colors ${onRowClick ? "cursor-pointer" : ""}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 align-middle text-white/75 whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden flex flex-col gap-2">
        {rows.map((r) => {
          const primary = columns.find((c) => c.primary) || columns[0];
          const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
          return (
            <div key={r[keyField]} onClick={() => onRowClick?.(r)}
              className={`p-3 rounded-xl bg-white/[0.015] border border-white/[0.07] ${onRowClick ? "cursor-pointer active:bg-white/[0.03]" : ""}`}>
              <div className="text-[12.5px] font-bold text-[#EAEDF7] mb-1.5">
                {primary.render ? primary.render(r) : r[primary.key]}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {rest.map((c) => (
                  <div key={c.key} className="flex flex-col min-w-0">
                    <span className="text-[8px] tracking-[0.08em] uppercase text-white/30">{c.label}</span>
                    <span className="text-[11px] text-white/70 truncate">{c.render ? c.render(r) : r[c.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

const PeriodTabs = ({ value, onChange, options = ["1M", "3M", "6M", "1Y", "5Y", "All"] }) => (
  <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.08] rounded-[10px] p-1">
    {options.map((o) => (
      <button key={o} onClick={() => onChange(o)}
        className={`px-2.5 py-1 rounded-[7px] text-[10.5px] font-bold transition-colors ${value === o ? "bg-[#5C8DFF]/20 text-[#7CA6FF] border border-[#5C8DFF]/30" : "text-white/40 hover:text-white/70 border border-transparent"}`}>
        {o}
      </button>
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   GENERIC "ADD ITEM" MODAL — field-config driven, one implementation
   powering every Quick Action (Add Transaction, Add Account, etc.)
═══════════════════════════════════════════════════════════════ */
const MODAL_CONFIGS = {
  transaction: {
    title: "Add Transaction", icon: ArrowLeftRight,
    fields: [
      { key: "type", label: "Type", type: "select", options: ["income", "expense", "transfer", "investment"], default: "expense" },
      { key: "description", label: "Description", type: "text", placeholder: "e.g. Office rent payment" },
      { key: "amount", label: "Amount (KSh)", type: "number", placeholder: "0.00" },
      { key: "category", label: "Category", type: "text", placeholder: "e.g. Business Income" },
      { key: "account", label: "Account", type: "select", options: ACCOUNTS.map((a) => a.name) },
      { key: "date", label: "Date", type: "date" },
      { key: "recurring", label: "Recurring transaction", type: "toggle" },
    ],
  },
  account: {
    title: "Add Account", icon: Wallet,
    fields: [
      { key: "name", label: "Account Name", type: "text", placeholder: "e.g. HSBC Offshore Account" },
      { key: "institution", label: "Institution", type: "text", placeholder: "e.g. HSBC" },
      { key: "type", label: "Account Type", type: "select", options: ["Checking", "Savings", "Foreign Currency", "Brokerage Cash", "Money Market Fund", "Mobile Wallet"] },
      { key: "currency", label: "Currency", type: "select", options: ["KES", "USD", "EUR", "GBP"] },
      { key: "balance", label: "Opening Balance", type: "number", placeholder: "0.00" },
    ],
  },
  investment: {
    title: "Add Investment", icon: LineChartIcon,
    fields: [
      { key: "asset", label: "Asset Name", type: "text", placeholder: "e.g. Apple Inc." },
      { key: "category", label: "Category", type: "select", options: ["Stocks", "ETFs", "Bonds", "Funds", "Crypto", "Private Equity", "Venture Capital", "Other"] },
      { key: "currency", label: "Currency", type: "select", options: ["KES", "USD", "EUR", "GBP"] },
      { key: "quantity", label: "Quantity", type: "number", placeholder: "0" },
      { key: "avgCost", label: "Average Cost", type: "number", placeholder: "0.00" },
      { key: "price", label: "Current Price", type: "number", placeholder: "0.00" },
    ],
  },
  property: {
    title: "Add Property", icon: Home,
    fields: [
      { key: "name", label: "Property Name", type: "text", placeholder: "e.g. Runda Residence" },
      { key: "location", label: "Location", type: "text", placeholder: "e.g. Runda, Nairobi" },
      { key: "type", label: "Property Type", type: "text", placeholder: "e.g. Residential Rental" },
      { key: "purchasePrice", label: "Purchase Price", type: "number", placeholder: "0.00" },
      { key: "currentValue", label: "Current Estimated Value", type: "number", placeholder: "0.00" },
      { key: "mortgage", label: "Outstanding Mortgage", type: "number", placeholder: "0.00" },
      { key: "monthlyRent", label: "Monthly Rent", type: "number", placeholder: "0.00" },
      { key: "monthlyExpenses", label: "Monthly Expenses", type: "number", placeholder: "0.00" },
    ],
  },
  vehicle: {
    title: "Add Vehicle", icon: Car,
    fields: [
      { key: "name", label: "Vehicle", type: "text", placeholder: "e.g. Toyota Prado" },
      { key: "year", label: "Year", type: "number", placeholder: "2024" },
      { key: "purchasePrice", label: "Purchase Price", type: "number", placeholder: "0.00" },
      { key: "currentValue", label: "Current Value", type: "number", placeholder: "0.00" },
      { key: "financing", label: "Outstanding Financing", type: "number", placeholder: "0.00" },
      { key: "ownership", label: "Ownership", type: "select", options: ["Personal", "Business"] },
    ],
  },
  business: {
    title: "Add Business", icon: Building2,
    fields: [
      { key: "name", label: "Business Name", type: "text", placeholder: "e.g. Rift Valley Agro Processors" },
      { key: "industry", label: "Industry", type: "text", placeholder: "e.g. Manufacturing" },
      { key: "ownership", label: "Ownership %", type: "number", placeholder: "100" },
      { key: "valuation", label: "Estimated Valuation", type: "number", placeholder: "0.00" },
      { key: "monthlyRevenue", label: "Monthly Revenue", type: "number", placeholder: "0.00" },
      { key: "monthlyProfit", label: "Monthly Profit", type: "number", placeholder: "0.00" },
      { key: "status", label: "Status", type: "select", optionsKey: "businessStatuses" },
    ],
  },
  venture: {
    title: "Add Venture", icon: Lightbulb,
    fields: [
      { key: "name", label: "Venture Name", type: "text", placeholder: "e.g. Regional Cloud Kitchens" },
      { key: "industry", label: "Industry", type: "text", placeholder: "e.g. Food & Beverage" },
      { key: "description", label: "Description", type: "textarea", placeholder: "What is this venture about?" },
      { key: "rationale", label: "Why This Could Work", type: "textarea", placeholder: "What evidence, edge, or market gap makes this viable?" },
      { key: "capital", label: "Estimated Capital Required", type: "number", placeholder: "0.00" },
      { key: "projectedRevenue", label: "Projected Annual Revenue", type: "number", placeholder: "0.00" },
      { key: "projectedTimeline", label: "Projected Timeline", type: "text", placeholder: "e.g. Breakeven in 18 months" },
      { key: "expectedReturn", label: "Expected Return", type: "text", placeholder: "e.g. 3–5x" },
      { key: "risk", label: "Risk", type: "select", optionsKey: "ventureRisks" },
      { key: "status", label: "Status", type: "select", optionsKey: "ventureStatuses" },
    ],
  },
  liability: {
    title: "Add Liability", icon: AlertTriangle,
    fields: [
      { key: "name", label: "Liability Name", type: "text", placeholder: "e.g. Personal Line of Credit" },
      { key: "category", label: "Category", type: "select", optionsKey: "liabilityCategories" },
      { key: "original", label: "Original Amount", type: "number", placeholder: "0.00" },
      { key: "outstanding", label: "Outstanding Balance", type: "number", placeholder: "0.00" },
      { key: "rate", label: "Interest Rate (%)", type: "number", placeholder: "0.0" },
      { key: "monthlyPayment", label: "Monthly Payment", type: "number", placeholder: "0.00" },
      { key: "dueDate", label: "Next Due Date", type: "date" },
      { key: "remainingTerm", label: "Remaining Term", type: "text", placeholder: "e.g. 5 yrs" },
    ],
  },
  asset: {
    title: "Add Asset", icon: PiggyBank,
    fields: [
      { key: "name", label: "Asset Name", type: "text", placeholder: "e.g. Land Rover Defender" },
      { key: "category", label: "Category", type: "select", optionsKey: "assetCategories" },
      { key: "nature", label: "Nature", type: "select", optionsKey: "assetNatures", default: "Dormant" },
      { key: "purchasePrice", label: "Purchase Price", type: "number", placeholder: "0.00" },
      { key: "currentValue", label: "Current Estimated Value", type: "number", placeholder: "0.00" },
      { key: "monthlyIncome", label: "Monthly Income (if revenue-generating)", type: "number", placeholder: "0.00" },
      { key: "notes", label: "Notes", type: "textarea", placeholder: "How is this asset used or generating income?" },
    ],
  },
  expense: {
    title: "Add Expense", icon: Banknote,
    fields: [
      { key: "name", label: "Expense Name", type: "text", placeholder: "e.g. Office Wifi & Internet" },
      { key: "category", label: "Category", type: "select", optionsKey: "expenseLedgerCategories" },
      { key: "scope", label: "Personal or Business", type: "select", optionsKey: "expenseLedgerScopes", default: "Business" },
      { key: "amount", label: "Amount (KSh)", type: "number", placeholder: "0.00" },
      { key: "frequency", label: "Frequency", type: "select", optionsKey: "expenseLedgerFrequencies", default: "Monthly" },
      { key: "nextDue", label: "Next Due Date", type: "date" },
      { key: "vendor", label: "Vendor / Payee", type: "text", placeholder: "e.g. Safaricom" },
      { key: "notes", label: "Notes", type: "textarea", placeholder: "What is this expense for?" },
    ],
  }
};

const ManageOptionsModal = ({ category, label, onClose }) => {
  const { lookups, addOption, updateOption, removeOption } = useLookupOptions();
  const options = lookups[category] || [];
  const [newLabel, setNewLabel] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const handleAdd = () => {
    const v = (newLabel || "").trim();
    if (!v) return;
    addOption(category, v);
    setNewLabel("");
  };
  const startEdit = (i, val) => { setEditingIndex(i); setEditingValue(val); };
  const commitEdit = (oldVal) => {
    const v = (editingValue || "").trim();
    if (v && v !== oldVal) updateOption(category, oldVal, v);
    setEditingIndex(null);
  };

  return (
    <Modal open={!!category} onClose={onClose} title={`Manage ${label}`} icon={Tag} nested>
      <div className="flex gap-2 items-center">
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} placeholder="Add new option…" className={INPUT} />
        <button onClick={handleAdd} className="px-3 py-2 rounded-md bg-[#5C8DFF] text-[#05060A] font-semibold">Add</button>
      </div>

      <div className="mt-4 space-y-2">
        {options.length === 0 && <div className="text-[13px] text-white/40">No options yet.</div>}
        {options.map((o, i) => (
          <div key={o} className="flex items-center gap-3">
            {editingIndex === i ? (
              <input autoFocus value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitEdit(o)} onBlur={() => commitEdit(o)}
                className={`${INPUT} py-1.5 flex-1`} />
            ) : (
              <span onClick={() => startEdit(i, o)} className="flex-1 text-[12px] text-white/80 cursor-text">{o}</span>
            )}
            <button onClick={() => removeOption(category, o)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white/35 hover:text-[#F87171] hover:bg-[#F87171]/10 transition-colors flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
};

const StatusDot = ({ status }) => {
  const color = status === "Overdue" ? RED : status === "Due Soon" ? AMBER : status === "Paid" ? GREEN : BLUE_LT;
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {status}
    </span>
  );
};

const NextObligationsCard = ({ obligations = [], cash = 0, onSeeAll, onNavigate }) => {
  const unpaid = obligations.filter((o) => o.status !== "Paid");
  const overdue = unpaid.filter((o) => o.status === "Overdue");
  const upcoming = sortObligationsByUrgency(unpaid).slice(0, 4);

  const dueWithin14d = unpaid
    .filter((o) => o.daysUntilDue <= 14)
    .reduce((s, o) => s + o.amount, 0);
  const shortfall = dueWithin14d > cash;

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-bold">Next Up</div>
        <button onClick={onSeeAll} className="text-[12px] text-white/50 hover:text-white/80">See all</button>
      </div>

      <div className="text-[10px] text-white/40 mb-3 relative z-10">
        {fmtCompact(dueWithin14d)} unpaid, due in next 14 days
      </div>

      {overdue.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-[#F87171]/10 border border-[#F87171]/25 relative z-10">
          <AlertTriangle size={12} color={RED} />
          <span className="text-[10.5px] font-bold text-[#F87171]">
            {overdue.length} overdue · {fmtCompact(overdue.reduce((s, o) => s + o.amount, 0))}
          </span>
        </div>
      )}

      {shortfall && (
        <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-[#E8A855]/10 border border-[#E8A855]/25 relative z-10">
          <Info size={12} color={AMBER} />
          <span className="text-[10px] text-[#E8A855] leading-tight">
            Cash on hand may not cover what's due soon
          </span>
        </div>
      )}

      <div className="space-y-2 relative z-10">
        {upcoming.map((o) => (
          <button
            key={o.id}
            onClick={() => onNavigate?.(CATEGORY_TO_SECTION[o.category] || "obligations")}
            className="w-full flex items-center justify-between gap-2 text-left hover:bg-white/[0.04] rounded-lg px-1.5 py-1 -mx-1.5 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-white/90 truncate">{o.label}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-white/40 font-mono">{o.dueDate}</span>
                <StatusDot status={o.status} />
              </div>
            </div>
            <div className="text-right font-mono text-[12.5px] font-bold text-[#EAEDF7] flex-shrink-0">
              {fmtCompact(o.amount)}
            </div>
          </button>
        ))}
        {upcoming.length === 0 && (
          <div className="text-[12px] text-white/40">Nothing unpaid right now.</div>
        )}
      </div>
    </div>
  );
};

const RightSidebar = ({ totals = {}, onQuickAdd, onSeeAllObligations, onNavigate, dueSoonFeed = [] }) => (
  <aside className="w-80 space-y-4">
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-bold">Quick Add</div>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onQuickAdd && onQuickAdd('transaction')} className={MINI_BTN}>Add Transaction</button>
        <button onClick={() => onQuickAdd && onQuickAdd('expense')} className={GHOST_BTN}>Add Expense</button>
      </div>
    </div>

    <NextObligationsCard
      obligations={dueSoonFeed}
      cash={totals.cash}
      onSeeAll={onSeeAllObligations}
      onNavigate={onNavigate}
    />

    <div className={`${CARD} p-4 text-[12px] text-white/50`}>Local session data · not yet persisted</div>
  </aside>
);

const AddItemModal = ({ modalType, onClose, onSubmit }) => {
  const config = modalType ? MODAL_CONFIGS[modalType] : null;
  const [values, setValues] = useState({});
  const [manageCategory, setManageCategory] = useState(null);
  const { lookups } = useLookupOptions();

  useEffect(() => {
    if (!config) return;
    const initial = {};
    config.fields.forEach((f) => { initial[f.key] = f.default ?? (f.type === "toggle" ? false : ""); });
    setValues(initial);
  }, [modalType]);

  if (!config) return null;
  const setV = (k, v) => setValues((p) => ({ ...p, [k]: v }));
  const handleSubmit = () => { onSubmit(modalType, values); onClose(); };

  return (
    <Modal open={!!modalType} onClose={onClose} title={config.title} icon={config.icon} wide={config.fields.length > 5}>
      <div className={`grid ${config.fields.length > 5 ? "sm:grid-cols-2" : "grid-cols-1"} gap-3.5`}>
        {config.fields.map((f) => {
          const opts = f.optionsKey ? (lookups[f.optionsKey] || []) : f.options || [];
          return (
            <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
              <label className={`${LABEL} !mb-0`}>{f.label}
                {f.optionsKey && (
                  <button type="button" onClick={() => setManageCategory(f.optionsKey)}
                    className="ml-2 text-white/30 hover:text-[#7CA6FF] transition-colors">
                    <Tag size={14} />
                  </button>
                )}
              </label>

              {f.type === "select" ? (
                <select value={values[f.key] ?? ""} onChange={(e) => setV(f.key, e.target.value)}
                  className={`${INPUT} cursor-pointer [&>option]:bg-[#0C0F18]`}>
                  <option value="">Select…</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea rows={3} value={values[f.key] ?? ""} onChange={(e) => setV(f.key, e.target.value)} placeholder={f.placeholder} className={`${INPUT} resize-none`} />
              ) : f.type === "toggle" ? (
                <button type="button" onClick={() => setV(f.key, !values[f.key])}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] border text-[12px] font-semibold transition-colors ${values[f.key] ? "border-[#5C8DFF]/40 bg-[#5C8DFF]/15 text-[#7CA6FF]" : "border-white/[0.08] bg-white/[0.02] text-white/45"}`}>
                  <Repeat size={13} /> {values[f.key] ? "Recurring" : "One-time"}
                </button>
              ) : (
                <input type={f.type} value={values[f.key] ?? ""} onChange={(e) => setV(f.key, e.target.value)} placeholder={f.placeholder} className={INPUT} />
              )}
            </div>
          );
        })}
      </div>

      <button onClick={handleSubmit}
        className="w-full mt-5 py-3 rounded-xl bg-[#5C8DFF] text-[#05060A] font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-[#75A0FF] transition-colors shadow-[0_8px_24px_-6px_rgba(92,141,255,0.5)]">
        Save {config.title.replace("Add ", "")} <ArrowUpRight size={14} />
      </button>

      <p className="text-[9.5px] text-white/25 text-center mt-3 leading-relaxed">
        This is stored locally for this session only. Connect a database to persist it permanently.
      </p>

      {manageCategory && (
        <ManageOptionsModal
          category={manageCategory}
          label={config.fields.find((f) => f.optionsKey === manageCategory)?.label || manageCategory}
          onClose={() => setManageCategory(null)}
        />
      )}
    </Modal>
  );
};

/* ═══════════════════════════════════════════════════════════════
ITEM ACTION MODAL — click an expense, asset, or liability to act
on it directly: pay, sell, lease, push a due date, etc.
═══════════════════════════════════════════════════════════════ */
const ACTION_DEFS = {
  expense: [
    { id: "pay-full", label: "Pay in Full", icon: CheckCircle2 },
    { id: "pay-half", label: "Pay Half Now", icon: Percent },
    { id: "snooze", label: "Push Due Date", icon: CalendarClock },
  ],
  asset: [
    { id: "sell", label: "Sell Asset", icon: DollarSign },
    { id: "lease", label: "Lease Asset", icon: Repeat },
    { id: "dormant", label: "Mark Dormant", icon: XCircle },
  ],
  liability: [
    { id: "pay-full", label: "Pay Installment", icon: CheckCircle2 },
    { id: "pay-half", label: "Pay Half Installment", icon: Percent },
  ],
};

const ItemActionModal = ({ target, onClose, accounts, actions }) => {
  const [step, setStep] = useState(null);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    setStep(null);
    setAmount("");
    setNewDate("");
    setAccountId(accounts[0]?.id || "");
  }, [target, accounts]);

  if (!target) return null;

  const { type, item } = target;
  const defs = ACTION_DEFS[type] || [];

  const runAction = () => {
    if (type === "expense") {
      if (step === "pay-full") actions.payExpenseFull(item, accountId);
      if (step === "pay-half") actions.payExpenseHalf(item, accountId);
      if (step === "snooze") actions.snoozeExpense(item, newDate);
    }
    if (type === "asset") {
      if (step === "sell") actions.sellAsset(item, Number(amount) || 0, accountId);
      if (step === "lease") actions.leaseAsset(item, Number(amount) || 0);
      if (step === "dormant") actions.markDormant(item);
    }
    if (type === "liability") {
      if (step === "pay-full") actions.payLiabilityFull(item, accountId);
      if (step === "pay-half") actions.payLiabilityHalf(item, accountId);
    }
  };

  return (
    <Modal open={!!target} onClose={onClose} title={item?.name || item?.label || "Item Action"} icon={type === "expense" ? Banknote : type === "asset" ? PiggyBank : AlertTriangle}>
      {!step ? (
        <div className="space-y-2">
          {defs.map((d) => {
            const Icon = d.icon;
            return (
              <button
                key={d.id}
                onClick={() => setStep(d.id)}
                className="flex w-full items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-[#5C8DFF]/30 hover:bg-[#5C8DFF]/[0.06] transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-[#5C8DFF]/10 border border-[#5C8DFF]/20 flex items-center justify-center text-[#7CA6FF]">
                  <Icon size={16} />
                </div>
                <span className="text-[13px] font-semibold text-[#EAEDF7]">{d.label}</span>
              </button>
            );
          })}

          {type === "liability" && item?.paid && (
            <div className="text-[12px] text-white/60 pt-2">
              Already paid this cycle — last paid {item.lastPaidDate || "—"}
            </div>
          )}
          {type === "expense" && item?.paid && (
            <div className="text-[12px] text-white/60 pt-2">
              Already marked paid — last paid {item.lastPaidDate || "—"}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(step === "pay-full" || step === "pay-half" || step === "sell") && (
            <div>
              <label className={LABEL}>{step === "sell" ? "Deposit Sale Proceeds To" : "Pay From Account"}</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${INPUT} cursor-pointer [&>option]:bg-[#0C0F18]`}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {fmtCompact(a.balance)}</option>
                ))}
              </select>
            </div>
          )}

          {step === "sell" && (
            <div>
              <label className={LABEL}>Sale Price (KSh)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={INPUT} />
            </div>
          )}

          {step === "lease" && (
            <div>
              <label className={LABEL}>Monthly Lease Income (KSh)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={INPUT} />
            </div>
          )}

          {step === "snooze" && (
            <div>
              <label className={LABEL}>New Due Date</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={INPUT} />
            </div>
          )}

          {(step === "pay-full" || step === "pay-half") && type === "expense" && (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07] text-[12px] text-white/60">
              Amount due: <span className="font-mono font-bold text-[#EAEDF7]">{fmtCompact(step === "pay-half" ? item.amount / 2 : item.amount)}</span>
            </div>
          )}

          {(step === "pay-full" || step === "pay-half") && type === "liability" && (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07] text-[12px] text-white/60">
              Installment: <span className="font-mono font-bold text-[#EAEDF7]">{fmtCompact(step === "pay-half" ? item.monthlyPayment / 2 : item.monthlyPayment)}</span>
            </div>
          )}

          {step === "dormant" && (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07] text-[12px] text-white/60">
              This stops counting {item.name} as passive income going forward.
            </div>
          )}

          <div className="flex gap-2 mt-1">
            <button onClick={() => setStep(null)} className={`${GHOST_BTN} flex-1 justify-center py-2.5`}>Back</button>
            <button onClick={runAction} className="flex-1 py-2.5 rounded-xl bg-[#5C8DFF] text-[#05060A] font-bold text-[13px] hover:bg-[#75A0FF] transition-colors">Confirm</button>
          </div>
        </div>
      )}
    </Modal>
  );
};

/* ═══════════════════════════════════════════════════════════════
   STICKY DASHBOARD BAR — condensed, always-visible summary strip
═══════════════════════════════════════════════════════════════ */
const StickyDashboardBar = ({ totals, onQuickAdd }) => (
  <div className="flex-shrink-0 flex items-center gap-4 px-4 sm:px-6 py-3 bg-[#0A0D16]/95 border-b border-white/[0.08] backdrop-blur-md overflow-x-auto">
    <div className="flex items-center gap-2 flex-shrink-0">
      <IconBox icon={Layers} size={26} />
      <div>
        <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 leading-none mb-0.5">Net Worth</div>
        <div className="font-mono text-[14px] font-extrabold text-[#F7F9FF] leading-none">{fmtCompact(totals.netWorth)}</div>
      </div>
    </div>
    <div className="w-px h-8 bg-white/[0.08] flex-shrink-0" />
    <div className="flex items-center gap-2 flex-shrink-0">
      <IconBox icon={Gauge} size={26} color={PURPLE} />
      <div>
        <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 leading-none mb-0.5">Cash Flow</div>
        <div className="font-mono text-[14px] font-extrabold leading-none" style={{ color: totals.netCashFlow >= 0 ? GREEN : RED }}>
          {fmtCompact(totals.netCashFlow)}
        </div>
      </div>
    </div>
    <div className="w-px h-8 bg-white/[0.08] flex-shrink-0" />
    <div className="flex items-center gap-2 flex-shrink-0">
      <IconBox icon={Wallet} size={26} color={GREEN} />
      <div>
        <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 leading-none mb-0.5">Cash</div>
        <div className="font-mono text-[14px] font-extrabold text-[#F7F9FF] leading-none">{fmtCompact(totals.cash)}</div>
      </div>
    </div>
    <div className="ml-auto flex-shrink-0">
      <QuickAddMenu onSelect={onQuickAdd} />
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   SECTION: EXECUTIVE OVERVIEW
═══════════════════════════════════════════════════════════════ */
const OverviewSection = ({ totals, period, setPeriod }) => {
  const history = historyForPeriod(period);
  const first = history[0]?.value || 1;
  const last = history[history.length - 1]?.value || 1;
  const periodChangePct = ((last - first) / first) * 100;

  return (
    <div className="flex flex-col gap-3">
      {/* Net worth hero */}
      <div className={`${CARD} p-5 sm:p-6`} style={{ background: "linear-gradient(150deg, rgba(92,141,255,0.07) 0%, #0C0F18 55%)", border: "1px solid rgba(92,141,255,0.16)" }}>
        <TopHairline />
        <CornerAccents />
        <div className="flex items-start justify-between gap-3 flex-wrap relative z-10">
          <div>
            <div className="flex items-center gap-2 text-[9.5px] font-bold tracking-[0.16em] uppercase text-[#7CA6FF] mb-2">
              <span className="inline-block w-4 h-px bg-[#5C8DFF]/50" /> Total Net Worth
            </div>
            <div className="font-mono text-[32px] sm:text-[42px] font-extrabold tracking-[-0.03em] text-[#F7F9FF] leading-none">
              {fmtMoney(totals.netWorth)}
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${periodChangePct >= 0 ? "bg-[#34D399]/10 border-[#34D399]/25" : "bg-[#F87171]/10 border-[#F87171]/20"}`}>
                {periodChangePct >= 0 ? <ArrowUpRight size={12} color={GREEN} /> : <ArrowDownRight size={12} color={RED} />}
                <span className="font-mono text-[12px] font-bold" style={{ color: periodChangePct >= 0 ? GREEN : RED }}>{fmtPct(periodChangePct)}</span>
              </div>
              <span className="text-[10px] text-white/35">over {period}</span>
            </div>
          </div>
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>
        <div className="h-[170px] mt-5 relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE_LT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BLUE_LT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(92,141,255,0.06)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={64} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                <div className="bg-[#0A0D16]/97 border border-[#5C8DFF]/30 rounded-[10px] px-3 py-2 shadow-lg">
                  <div className="text-[8.5px] uppercase tracking-[0.08em] text-white/45 mb-1">{payload[0].payload.month}</div>
                  <div className="font-mono text-[13px] font-bold text-[#EAEDF7]">{fmtMoney(payload[0].value)}</div>
                </div>
              ) : null} />
              <Area type="monotone" dataKey="value" stroke={BLUE_LT} strokeWidth={2.5} fill="url(#nwFill)" dot={false} activeDot={{ r: 3.5, fill: "#05060A", stroke: BLUE_LT, strokeWidth: 2.5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Layers} label="Total Assets" value={fmtCompact(totals.assets)} sub="Across all categories" positive={true} />
        <MetricCard icon={AlertTriangle} label="Total Liabilities" value={fmtCompact(totals.liabilities)} sub={`${totals.debtToAsset.toFixed(1)}% debt-to-asset`} positive={false} accent={AMBER} />
        <MetricCard icon={Wallet} label="Cash & Equivalents" value={fmtCompact(totals.cash)} sub="6 accounts" positive={true} accent={GREEN} />
        <MetricCard icon={Gauge} label="Net Cash Flow" value={fmtCompact(totals.netCashFlow)} sub="Per month" positive={totals.netCashFlow >= 0} accent={PURPLE} />
        <MetricCard icon={TrendingUp} label="Monthly Income" value={fmtCompact(totals.monthlyIncome)} sub={`${fmtCompact(totals.monthlyIncome * 12)} annualized`} positive={true} accent={GREEN} />
        <MetricCard icon={TrendingDown} label="Monthly Expenses" value={fmtCompact(totals.monthlyExpenses)} sub={`${fmtCompact(totals.monthlyExpenses * 12)} annualized`} positive={false} accent={RED} />
        <MetricCard icon={Building2} label="Business Value" value={fmtCompact(totals.businessValue)} sub={`${BUSINESSES.length} businesses`} positive={true} accent={BLUE_LT} />
        <MetricCard icon={Home} label="Real Estate Equity" value={fmtCompact(totals.realEstateEquity)} sub={`${PROPERTIES.length} properties`} positive={true} accent={AMBER} />
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: NET WORTH BREAKDOWN
═══════════════════════════════════════════════════════════════ */
const NetWorthSection = ({ totals, assetBreakdown, liabilityBreakdown }) => (
  <div className="flex flex-col gap-3">
    <div className="grid lg:grid-cols-2 gap-3">
      <div className={`${CARD} p-5`}>
        <CornerAccents />
        <SectionHeader icon={PieChartIcon} title="Asset Composition" subtitle="Where your wealth is held" />
        <DonutBreakdown data={assetBreakdown} />
      </div>
      <div className={`${CARD} p-5`}>
        <CornerAccents />
        <SectionHeader icon={AlertTriangle} title="Liability Composition" subtitle="What you owe, by category" />
        <DonutBreakdown data={liabilityBreakdown} />
      </div>
    </div>
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Layers} title="Balance Sheet Snapshot" subtitle="Assets minus liabilities" />
      <div className="grid sm:grid-cols-3 gap-3 relative z-10">
        <div className="p-4 rounded-2xl bg-[#34D399]/[0.06] border border-[#34D399]/20">
          <div className="text-[9px] tracking-[0.14em] uppercase text-[#34D399]/70 mb-2">Total Assets</div>
          <div className="font-mono text-[22px] font-extrabold text-[#EAEDF7]">{fmtCompact(totals.assets)}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#F87171]/[0.06] border border-[#F87171]/20">
          <div className="text-[9px] tracking-[0.14em] uppercase text-[#F87171]/70 mb-2">Total Liabilities</div>
          <div className="font-mono text-[22px] font-extrabold text-[#EAEDF7]">{fmtCompact(totals.liabilities)}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#5C8DFF]/[0.08] border border-[#5C8DFF]/25">
          <div className="text-[9px] tracking-[0.14em] uppercase text-[#7CA6FF]/70 mb-2">Net Worth</div>
          <div className="font-mono text-[22px] font-extrabold text-[#EAEDF7]">{fmtCompact(totals.netWorth)}</div>
        </div>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   SECTION: FINANCIAL ACCOUNTS
═══════════════════════════════════════════════════════════════ */
const AccountsSection = ({ accounts, onAdd }) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const types = useMemo(() => [...new Set(accounts.map((a) => a.type))], [accounts]);

  const filtered = accounts.filter((a) =>
    (!search || a.name.toLowerCase().includes(search.toLowerCase()) || a.institution.toLowerCase().includes(search.toLowerCase())) &&
    (!typeFilter || a.type === typeFilter)
  );
  const totalKES = accounts.reduce((s, a) => s + toKES(a.balance, a.currency), 0);

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Wallet} title="Financial Accounts" subtitle={`${accounts.length} accounts · ${fmtCompact(totalKES)} combined`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Account</button>} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search accounts or institutions…"
        filters={[{ key: "type", label: "All Types", value: typeFilter, onChange: setTypeFilter, options: types }]} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 relative z-10">
        {filtered.length === 0 && <div className="sm:col-span-2 lg:col-span-3"><EmptyState text="No accounts match your search." /></div>}
        {filtered.map((a) => (
          <div key={a.id} className="p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07] hover:border-[#5C8DFF]/25 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-bold text-[#EAEDF7] truncate">{a.name}</div>
                <div className="text-[10px] text-white/40 truncate">{a.institution}</div>
              </div>
              <Badge tone="blue">{a.currency}</Badge>
            </div>
            <div className="font-mono text-[19px] font-extrabold text-[#F7F9FF] tracking-[-0.01em]">{fmtMoney(a.balance, a.currency)}</div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
              <span className="text-[9.5px] text-white/35">{a.type}</span>
              <span className="text-[9.5px] text-white/35 flex items-center gap-1"><Clock size={9} />{a.lastActivity}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: TRANSACTIONS
═══════════════════════════════════════════════════════════════ */
const TX_TYPE_STYLE = {
  income: { tone: "green", icon: ArrowDownRight, label: "Income" },
  expense: { tone: "red", icon: ArrowUpRight, label: "Expense" },
  transfer: { tone: "blue", icon: ArrowLeftRight, label: "Transfer" },
  investment: { tone: "purple", icon: LineChartIcon, label: "Investment" },
};

const TransactionsSection = ({ transactions, onAdd }) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);

  const categories = useMemo(() => [...new Set(transactions.map((t) => t.category))], [transactions]);
  const accountNames = useMemo(() => [...new Set(transactions.map((t) => t.account))], [transactions]);

  const filtered = transactions.filter((t) =>
    (!search || t.description.toLowerCase().includes(search.toLowerCase())) &&
    (!typeFilter || t.type === typeFilter) &&
    (!categoryFilter || t.category === categoryFilter) &&
    (!accountFilter || t.account === accountFilter)
  );

  const columns = [
    { key: "description", label: "Description", primary: true, render: (r) => (
      <div className="flex items-center gap-2">
        <IconBox icon={TX_TYPE_STYLE[r.type].icon} size={24} color={TX_TYPE_STYLE[r.type].tone === "red" ? RED : TX_TYPE_STYLE[r.type].tone === "green" ? GREEN : TX_TYPE_STYLE[r.type].tone === "purple" ? PURPLE : BLUE_LT}
          bg={r.type === "income" ? "bg-[#34D399]/10" : r.type === "expense" ? "bg-[#F87171]/10" : r.type === "investment" ? "bg-[#A78BFA]/10" : "bg-[#5C8DFF]/10"}
          border={r.type === "income" ? "border-[#34D399]/25" : r.type === "expense" ? "border-[#F87171]/20" : r.type === "investment" ? "border-[#A78BFA]/25" : "border-[#5C8DFF]/25"} />
        <span className="whitespace-normal">{r.description}</span>
      </div>
    ) },
    { key: "date", label: "Date", render: (r) => <span className="font-mono text-[10.5px]">{r.date}</span> },
    { key: "category", label: "Category", render: (r) => <Badge>{r.category}</Badge> },
    { key: "account", label: "Account" },
    { key: "amount", label: "Amount", align: "right", render: (r) => (
      <span className="font-mono font-bold" style={{ color: r.amount >= 0 ? GREEN : RED }}>{r.amount >= 0 ? "+" : ""}{fmtMoney(r.amount)}</span>
    ) },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Completed" ? "green" : "amber"}>{r.status}</Badge> },
  ];

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={ArrowLeftRight} title="Transaction Ledger" subtitle={`${filtered.length} of ${transactions.length} transactions`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Transaction</button>} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search transactions…" filters={[
        { key: "type", label: "All Types", value: typeFilter, onChange: setTypeFilter, options: Object.keys(TX_TYPE_STYLE) },
        { key: "category", label: "All Categories", value: categoryFilter, onChange: setCategoryFilter, options: categories },
        { key: "account", label: "All Accounts", value: accountFilter, onChange: setAccountFilter, options: accountNames },
      ]} />
      <ResponsiveTable columns={columns} rows={filtered.slice(0, visibleCount)} />
      {visibleCount < filtered.length && (
        <div className="flex justify-center mt-4 relative z-10">
          <button onClick={() => setVisibleCount((v) => v + 8)} className={GHOST_BTN}>View more <ChevronDown size={12} /></button>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: INCOME
═══════════════════════════════════════════════════════════════ */
const incomeTrend = (() => {
  const arr = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(2026, 8 - i, 1);
    const base = 88_000_000 + (11 - i) * 350_000;
    const noise = Math.sin(i * 1.3) * 3_500_000;
    arr.push({ month: d.toLocaleDateString("en-US", { month: "short" }), income: Math.round(base + noise) });
  }
  return arr;
})();

const IncomeSection = ({ totals }) => {
  const monthly = totals.monthlyIncome;
  const annual = monthly * 12;
  const prevMonthly = incomeTrend[incomeTrend.length - 2]?.income || monthly;
  const growth = ((monthly - prevMonthly) / prevMonthly) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <MetricCard icon={DollarSign} label="Monthly Income" value={fmtCompact(monthly)} sub="All sources combined" positive={true} accent={GREEN} />
        <MetricCard icon={Calendar} label="Annualized Income" value={fmtCompact(annual)} sub="Run-rate basis" positive={true} accent={BLUE_LT} />
        <MetricCard icon={TrendingUp} label="Income Growth" value={fmtPct(growth)} sub="Month over month" positive={growth >= 0} accent={PURPLE} />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <ChartCard icon={LineChartIcon} title="Income Trend" subtitle="Trailing 12 months, all sources">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={incomeTrend} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(92,141,255,0.06)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={60} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                <div className="bg-[#0A0D16]/97 border border-[#34D399]/30 rounded-[10px] px-3 py-2">
                  <div className="font-mono text-[13px] font-bold text-[#34D399]">{fmtMoney(payload[0].value)}</div>
                </div>
              ) : null} />
              <Area type="monotone" dataKey="income" stroke={GREEN} strokeWidth={2.5} fill="url(#incFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className={`${CARD} p-5`}>
          <CornerAccents />
          <SectionHeader icon={PieChartIcon} title="Income Sources" subtitle="Share of monthly income" />
          <DonutBreakdown data={INCOME_SOURCES.map((s) => ({ ...s, value: s.monthly }))} />
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: EXPENSES
═══════════════════════════════════════════════════════════════ */
const ExpensesSection = ({ totals }) => {
  const monthly = totals.monthlyExpenses;
  const annual = monthly * 12;

  const columns = [
    { key: "label", label: "Expense", primary: true },
    { key: "date", label: "Date", render: (r) => <span className="font-mono text-[10.5px]">{r.date}</span> },
    { key: "category", label: "Category", render: (r) => <Badge>{r.category}</Badge> },
    { key: "amount", label: "Amount", align: "right", render: (r) => <span className="font-mono font-bold text-[#F87171]">{fmtMoney(r.amount)}</span> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <MetricCard icon={TrendingDown} label="Monthly Expenses" value={fmtCompact(monthly)} sub="All categories" positive={false} accent={RED} />
        <MetricCard icon={Calendar} label="Annual Expenses" value={fmtCompact(annual)} sub="Run-rate basis" positive={false} accent={AMBER} />
        <MetricCard icon={Repeat} label="Recurring Monthly" value={fmtCompact(RECURRING_EXPENSES.reduce((s, r) => s + r.amount, 0))} sub={`${RECURRING_EXPENSES.length} fixed obligations`} positive={false} accent={PURPLE} />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className={`${CARD} p-5`}>
          <CornerAccents />
          <SectionHeader icon={PieChartIcon} title="Spending by Category" subtitle="Share of monthly expenses" />
          <DonutBreakdown data={EXPENSE_CATEGORIES.map((c) => ({ ...c, value: c.monthly }))} />
        </div>
        <div className={`${CARD} p-5`}>
          <CornerAccents />
          <SectionHeader icon={Repeat} title="Recurring Expenses" subtitle="Fixed monthly obligations" />
          <div className="flex flex-col gap-2 relative z-10">
            {RECURRING_EXPENSES.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.06]">
                <span className="text-[11.5px] text-white/70 truncate pr-2">{r.label}</span>
                <span className="font-mono text-[11.5px] font-bold text-[#EAEDF7] flex-shrink-0">{fmtMoney(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`${CARD} p-5`}>
        <CornerAccents />
        <SectionHeader icon={ArrowUpRight} title="Largest Expenses" subtitle="Biggest single outflows this period" />
        <ResponsiveTable columns={columns} rows={LARGEST_EXPENSES} />
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: BUSINESS EMPIRE
═══════════════════════════════════════════════════════════════ */
const PERF_TONE = { "Strong Growth": "green", "Moderate Growth": "blue", Stable: "muted", Declining: "red" };

const BusinessCard = ({ biz, onOpen }) => (
  <button onClick={() => onOpen(biz)} className="text-left p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07] hover:border-[#5C8DFF]/30 transition-colors w-full">
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="min-w-0">
        <div className="text-[13.5px] font-extrabold text-[#EAEDF7] truncate">{biz.name}</div>
        <div className="text-[10px] text-white/40 truncate">{biz.industry} · {biz.ownership}% owned</div>
      </div>
      <Badge tone={PERF_TONE[biz.performance]}>{biz.performance}</Badge>
    </div>
    <div className="font-mono text-[20px] font-extrabold text-[#F7F9FF] mb-3">{fmtCompact(biz.valuation)}</div>
    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.06]">
      <div>
        <div className="text-[8.5px] tracking-[0.1em] uppercase text-white/30">Annual Revenue</div>
        <div className="font-mono text-[12px] font-bold text-white/75">{fmtCompact(biz.annualRevenue)}</div>
      </div>
      <div>
        <div className="text-[8.5px] tracking-[0.1em] uppercase text-white/30">Annual Profit</div>
        <div className="font-mono text-[12px] font-bold" style={{ color: biz.annualProfit >= 0 ? GREEN : RED }}>{biz.annualProfit >= 0 ? "+" : ""}{fmtCompact(biz.annualProfit)}</div>
      </div>
    </div>
    <div className="flex items-center justify-between mt-3">
      <Badge tone={biz.status === "Operating" ? "green" : "amber"}>{biz.status}</Badge>
      <span className="flex items-center gap-1 text-[10px] text-[#7CA6FF]">View details <ChevronRight size={11} /></span>
    </div>
  </button>
);

const BusinessDetailModal = ({ biz, onClose }) => (
  <Modal open={!!biz} onClose={onClose} title={biz?.name} icon={Building2} wide>
    {biz && (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="blue">{biz.industry}</Badge>
          <Badge tone={PERF_TONE[biz.performance]}>{biz.performance}</Badge>
          <Badge tone={biz.status === "Operating" ? "green" : "amber"}>{biz.status}</Badge>
          <Badge>Est. {biz.founded}</Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            ["Ownership", `${biz.ownership}%`],
            ["Valuation", fmtCompact(biz.valuation)],
            ["Monthly Revenue", fmtCompact(biz.monthlyRevenue)],
            ["Annual Revenue", fmtCompact(biz.annualRevenue)],
            ["Monthly Profit", fmtCompact(biz.monthlyProfit)],
            ["Annual Profit", fmtCompact(biz.annualProfit)],
            ["YoY Growth", fmtPct(biz.growthYoY)],
            ["Status", biz.status],
          ].map(([l, v]) => (
            <div key={l} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
              <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">{l}</div>
              <div className="font-mono text-[13px] font-bold text-[#EAEDF7]">{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div className={LABEL}>Notes</div>
          <p className="text-[12px] text-white/60 leading-relaxed">{biz.notes}</p>
        </div>
        <div>
          <div className={LABEL}>Recent Activity</div>
          <div className="flex flex-col gap-2">
            {biz.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.06]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5C8DFF] flex-shrink-0" />
                <span className="text-[11.5px] text-white/65">{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
  </Modal>
);

const BusinessesSection = ({ businesses, onAdd }) => {
  const [detail, setDetail] = useState(null);
  const totalValue = businesses.reduce((s, b) => s + b.valuation, 0);
  const totalRevenue = businesses.reduce((s, b) => s + b.annualRevenue, 0);
  const totalProfit = businesses.reduce((s, b) => s + b.annualProfit, 0);

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Building2} title="Business Empire" subtitle={`${businesses.length} businesses under management`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Business</button>} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 relative z-10">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Total Businesses</div>
          <div className="font-mono text-[16px] font-extrabold text-[#EAEDF7]">{businesses.length}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Combined Value</div>
          <div className="font-mono text-[16px] font-extrabold text-[#EAEDF7]">{fmtCompact(totalValue)}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Annual Revenue</div>
          <div className="font-mono text-[16px] font-extrabold text-[#EAEDF7]">{fmtCompact(totalRevenue)}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Annual Profit</div>
          <div className="font-mono text-[16px] font-extrabold" style={{ color: totalProfit >= 0 ? GREEN : RED }}>{fmtCompact(totalProfit)}</div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 relative z-10">
        {businesses.map((b) => <BusinessCard key={b.id} biz={b} onOpen={setDetail} />)}
      </div>
      <BusinessDetailModal biz={detail} onClose={() => setDetail(null)} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: VENTURES / BUSINESS IDEAS
═══════════════════════════════════════════════════════════════ */
const VenturesSection = ({ ventures, onAdd }) => {
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const statuses = ["Idea", "Research", "Testing", "Funded", "Operating", "Exited"];
  const filtered = statusFilter ? ventures.filter((v) => v.status === statusFilter) : ventures;

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Lightbulb} title="Ventures & Business Ideas" subtitle={`${ventures.length} tracked opportunities`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Venture</button>} />
      <div className="flex flex-wrap gap-1.5 mb-4 relative z-10">
        <button onClick={() => setStatusFilter("")} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${!statusFilter ? "border-[#5C8DFF]/40 bg-[#5C8DFF]/15 text-[#7CA6FF]" : "border-white/[0.08] text-white/40"}`}>All</button>
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors"
            style={statusFilter === s ? { borderColor: `${VENTURE_STATUS_COLOR[s]}66`, background: `${VENTURE_STATUS_COLOR[s]}22`, color: VENTURE_STATUS_COLOR[s] } : { borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
            {s}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 relative z-10">
        {filtered.length === 0 && <div className="sm:col-span-2 xl:col-span-3"><EmptyState text="No ventures at this status yet." /></div>}
        {filtered.map((v) => (
          <button key={v.id} type="button" onClick={() => setDetail(v)} className="text-left p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07] hover:border-[#5C8DFF]/30 transition-colors flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-extrabold text-[#EAEDF7] truncate">{v.name}</div>
                <div className="text-[10px] text-white/40">{v.industry}</div>
              </div>
              <span className="text-[9px] font-bold px-2 py-[3px] rounded-md border flex-shrink-0"
                style={{ color: VENTURE_STATUS_COLOR[v.status], background: `${VENTURE_STATUS_COLOR[v.status]}1A`, borderColor: `${VENTURE_STATUS_COLOR[v.status]}44` }}>
                {v.status}
              </span>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3">{v.description}</p>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.06]">
              <div>
                <div className="text-[7.5px] tracking-[0.08em] uppercase text-white/30">Capital</div>
                <div className="font-mono text-[11px] font-bold text-white/75">{fmtCompact(v.capital)}</div>
              </div>
              <div>
                <div className="text-[7.5px] tracking-[0.08em] uppercase text-white/30">Return</div>
                <div className="font-mono text-[11px] font-bold text-[#34D399]">{v.expectedReturn}</div>
              </div>
              <div>
                <div className="text-[7.5px] tracking-[0.08em] uppercase text-white/30">Risk</div>
                <div className="text-[11px] font-bold text-[#E8A855]">{v.risk}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[9.5px] text-white/30">
              <Calendar size={10} /> Added {v.dateAdded}
            </div>
          </button>
        ))}
      </div>

      <VentureDetailModal venture={detail} onClose={() => setDetail(null)} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: INVESTMENT PORTFOLIO
═══════════════════════════════════════════════════════════════ */
const InvestmentsSection = ({ investments, onAdd }) => {
  const [categoryFilter, setCategoryFilter] = useState("");
  const categories = useMemo(() => [...new Set(investments.map((i) => i.category))], [investments]);

  const enriched = investments.map((i) => {
    const valueNative = i.quantity * i.price;
    const costNative = i.quantity * i.avgCost;
    const valueKES = toKES(valueNative, i.currency);
    const costKES = toKES(costNative, i.currency);
    const gain = valueKES - costKES;
    const gainPct = costKES ? (gain / costKES) * 100 : 0;
    return { ...i, valueKES, costKES, gain, gainPct };
  });

  const filtered = categoryFilter ? enriched.filter((i) => i.category === categoryFilter) : enriched;
  const totalValue = enriched.reduce((s, i) => s + i.valueKES, 0);
  const totalCost = enriched.reduce((s, i) => s + i.costKES, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost ? (totalGain / totalCost) * 100 : 0;

  const byCategory = categories.map((c, i) => ({
    id: c, label: c, value: enriched.filter((h) => h.category === c).reduce((s, h) => s + h.valueKES, 0),
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const columns = [
    { key: "asset", label: "Asset", primary: true },
    { key: "category", label: "Category", render: (r) => <Badge tone="blue">{r.category}</Badge> },
    { key: "quantity", label: "Quantity", align: "right", render: (r) => <span className="font-mono text-[10.5px]">{r.quantity.toLocaleString()}</span> },
    { key: "avgCost", label: "Avg Cost", align: "right", render: (r) => <span className="font-mono text-[10.5px]">{fmtMoney(r.avgCost, r.currency, { decimals: r.avgCost < 1000 ? 2 : 0 })}</span> },
    { key: "valueKES", label: "Current Value", align: "right", render: (r) => <span className="font-mono font-bold text-white/85">{fmtCompact(r.valueKES)}</span> },
    { key: "gainPct", label: "Return %", align: "right", render: (r) => (
      <span className="font-mono font-bold" style={{ color: r.gain >= 0 ? GREEN : RED }}>{fmtPct(r.gainPct)}</span>
    ) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={LineChartIcon} label="Portfolio Value" value={fmtCompact(totalValue)} sub={`${investments.length} holdings`} positive={true} />
        <MetricCard icon={DollarSign} label="Total Invested" value={fmtCompact(totalCost)} sub="Cost basis" accent={AMBER} />
        <MetricCard icon={TrendingUp} label="Unrealized Gain" value={fmtCompact(totalGain)} sub={fmtPct(totalGainPct)} positive={totalGain >= 0} accent={GREEN} />
        <MetricCard icon={Coins} label="Dividend Income" value={fmtCompact(INCOME_SOURCES.find((s) => s.label === "Dividends")?.monthly * 12)} sub="Annualized" positive={true} accent={PURPLE} />
      </div>
      <div className={`${CARD} p-5`}>
        <CornerAccents />
        <SectionHeader icon={PieChartIcon} title="Allocation by Category" subtitle="Portfolio diversification" />
        <DonutBreakdown data={byCategory} />
      </div>
      <div className={`${CARD} p-5`}>
        <CornerAccents />
        <SectionHeader icon={Layers} title="Holdings" subtitle={`${filtered.length} of ${investments.length} positions`}
          right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Investment</button>} />
        <FilterBar search="" onSearch={() => {}} placeholder="" filters={[
          { key: "category", label: "All Categories", value: categoryFilter, onChange: setCategoryFilter, options: categories },
        ]} />
        <ResponsiveTable columns={columns} rows={filtered} />
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: REAL ESTATE
═══════════════════════════════════════════════════════════════ */
const PropertyDetailModal = ({ property, onClose }) => {
  if (!property) return null;
  const equity = property.currentValue - property.mortgage;
  const netRental = property.monthlyRent - property.monthlyExpenses;
  const yieldPct = property.currentValue ? ((netRental * 12) / property.currentValue) * 100 : 0;
  return (
    <Modal open={!!property} onClose={onClose} title={property.name} icon={Home} wide>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5 text-[11px] text-white/45"><MapPin size={12} /> {property.location} · {property.type}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            ["Purchase Price", fmtCompact(property.purchasePrice)],
            ["Current Value", fmtCompact(property.currentValue)],
            ["Mortgage", fmtCompact(property.mortgage)],
            ["Equity", fmtCompact(equity)],
            ["Monthly Rent", fmtCompact(property.monthlyRent)],
            ["Monthly Expenses", fmtCompact(property.monthlyExpenses)],
            ["Net Rental Income", fmtCompact(netRental)],
            ["Gross Yield", `${yieldPct.toFixed(1)}%`],
          ].map(([l, v]) => (
            <div key={l} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
              <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">{l}</div>
              <div className="font-mono text-[13px] font-bold text-[#EAEDF7]">{v}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#5C8DFF]/[0.06] border border-[#5C8DFF]/20">
          <span className="text-[11px] text-white/60">Occupancy</span>
          <Badge tone="blue">{property.occupancy}</Badge>
        </div>
      </div>
    </Modal>
  );
};

const RealEstateSection = ({ properties, onAdd }) => {
  const [detail, setDetail] = useState(null);
  const totalValue = properties.reduce((s, p) => s + p.currentValue, 0);
  const totalDebt = properties.reduce((s, p) => s + p.mortgage, 0);
  const totalEquity = totalValue - totalDebt;
  const monthlyRental = properties.reduce((s, p) => s + p.monthlyRent, 0);
  const avgYield = properties.reduce((s, p) => {
    const net = (p.monthlyRent - p.monthlyExpenses) * 12;
    return s + (p.currentValue ? (net / p.currentValue) * 100 : 0);
  }, 0) / properties.length;

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Home} title="Real Estate Portfolio" subtitle={`${properties.length} properties`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Property</button>} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-4 relative z-10">
        {[
          ["Total Value", fmtCompact(totalValue)],
          ["Total Debt", fmtCompact(totalDebt)],
          ["Total Equity", fmtCompact(totalEquity)],
          ["Monthly Rental", fmtCompact(monthlyRental)],
          ["Avg. Yield", `${avgYield.toFixed(1)}%`],
        ].map(([l, v]) => (
          <div key={l} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
            <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">{l}</div>
            <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 relative z-10">
        {properties.map((p) => {
          const equity = p.currentValue - p.mortgage;
          const net = p.monthlyRent - p.monthlyExpenses;
          return (
            <button key={p.id} onClick={() => setDetail(p)} className="text-left p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07] hover:border-[#5C8DFF]/30 transition-colors">
              <div className="text-[12.5px] font-extrabold text-[#EAEDF7] truncate">{p.name}</div>
              <div className="flex items-center gap-1 text-[10px] text-white/40 mb-3"><MapPin size={9} /> {p.location}</div>
              <div className="font-mono text-[18px] font-extrabold text-[#F7F9FF]">{fmtCompact(p.currentValue)}</div>
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                <div>
                  <div className="text-[7.5px] tracking-[0.08em] uppercase text-white/30">Equity</div>
                  <div className="font-mono text-[11px] font-bold text-[#34D399]">{fmtCompact(equity)}</div>
                </div>
                <div>
                  <div className="text-[7.5px] tracking-[0.08em] uppercase text-white/30">Net Rental / mo</div>
                  <div className="font-mono text-[11px] font-bold text-white/75">{p.monthlyRent ? fmtCompact(net) : "—"}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <Badge tone="blue">{p.occupancy}</Badge>
                <span className="flex items-center gap-1 text-[10px] text-[#7CA6FF]">Details <ChevronRight size={11} /></span>
              </div>
            </button>
          );
        })}
      </div>
      <PropertyDetailModal property={detail} onClose={() => setDetail(null)} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: VEHICLES
═══════════════════════════════════════════════════════════════ */
const VehiclesSection = ({ vehicles, onAdd }) => {
  const [ownerFilter, setOwnerFilter] = useState("");
  const filtered = ownerFilter ? vehicles.filter((v) => v.ownership === ownerFilter) : vehicles;
  const totalValue = vehicles.reduce((s, v) => s + v.currentValue, 0);
  const totalDepreciation = vehicles.reduce((s, v) => s + (v.purchasePrice - v.currentValue), 0);

  const columns = [
    { key: "name", label: "Vehicle", primary: true },
    { key: "year", label: "Year" },
    { key: "ownership", label: "Ownership", render: (r) => <Badge tone={r.ownership === "Business" ? "blue" : "muted"}>{r.ownership}</Badge> },
    { key: "currentValue", label: "Current Value", align: "right", render: (r) => <span className="font-mono font-bold text-white/85">{fmtCompact(r.currentValue)}</span> },
    { key: "financing", label: "Financing", align: "right", render: (r) => <span className="font-mono">{r.financing ? fmtCompact(r.financing) : "—"}</span> },
    { key: "annualCost", label: "Annual Running Cost", align: "right", render: (r) => <span className="font-mono">{fmtCompact(r.insuranceAnnual + r.maintenanceAnnual)}</span> },
  ];

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Car} title="Vehicle Portfolio" subtitle={`${vehicles.length} vehicles`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Vehicle</button>} />
      <div className="grid grid-cols-3 gap-2.5 mb-4 relative z-10">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Total Value</div>
          <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(totalValue)}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Total Depreciation</div>
          <div className="font-mono text-[15px] font-extrabold text-[#F87171]">{fmtCompact(totalDepreciation)}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Fleet Count</div>
          <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{vehicles.length}</div>
        </div>
      </div>
      <FilterBar search="" onSearch={() => {}} placeholder="" filters={[
        { key: "ownership", label: "All Ownership", value: ownerFilter, onChange: setOwnerFilter, options: ["Personal", "Business"] },
      ]} />
      <ResponsiveTable columns={columns} rows={filtered} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: LIABILITIES / DEBT
═══════════════════════════════════════════════════════════════ */
const LiabilitiesSection = ({ liabilities, totals, onAdd, onSelect }) => {
  const [categoryFilter, setCategoryFilter] = useState("");
  const categories = useMemo(() => [...new Set(liabilities.map((l) => l.category))], [liabilities]);
  const filtered = categoryFilter ? liabilities.filter((l) => l.category === categoryFilter) : liabilities;
  const totalOutstanding = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const monthlyObligations = liabilities.reduce((s, l) => s + l.monthlyPayment, 0);

  const columns = [
    { key: "name", label: "Liability", primary: true },
    { key: "category", label: "Category", render: (r) => <Badge tone="amber">{r.category}</Badge> },
    { key: "outstanding", label: "Outstanding", align: "right", render: (r) => <span className="font-mono font-bold text-white/85">{fmtCompact(r.outstanding)}</span> },
    { key: "rate", label: "Rate", align: "right", render: (r) => <span className="font-mono">{r.rate ? `${r.rate}%` : "—"}</span> },
    { key: "monthlyPayment", label: "Monthly Payment", align: "right", render: (r) => <span className="font-mono">{r.monthlyPayment ? fmtCompact(r.monthlyPayment) : "—"}</span> },
    { key: "dueDate", label: "Next Due", render: (r) => <span className="font-mono text-[10.5px]">{r.dueDate}</span> },
    { key: "remainingTerm", label: "Term", hideOnMobile: false },
  ];

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={AlertTriangle} title="Liabilities & Debt" subtitle={`${liabilities.length} obligations`}
        right={<button onClick={onAdd} className={MINI_BTN}><Plus size={12} /> Add Liability</button>} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 relative z-10">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Total Liabilities</div>
          <div className="font-mono text-[15px] font-extrabold text-[#EAEDF7]">{fmtCompact(totalOutstanding)}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Monthly Obligations</div>
          <div className="font-mono text-[15px] font-extrabold text-[#F87171]">{fmtCompact(monthlyObligations)}</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Debt-to-Asset</div>
          <div className="font-mono text-[15px] font-extrabold text-[#E8A855]">{totals.debtToAsset.toFixed(1)}%</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07]">
          <div className="text-[8px] tracking-[0.1em] uppercase text-white/35 mb-1">Liability Change (YoY)</div>
          <div className="font-mono text-[15px] font-extrabold text-[#34D399]">-4.2%</div>
        </div>
      </div>
      <FilterBar search="" onSearch={() => {}} placeholder="" filters={[
        { key: "category", label: "All Categories", value: categoryFilter, onChange: setCategoryFilter, options: categories },
      ]} />
      <ResponsiveTable columns={columns} rows={filtered} onRowClick={onSelect} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: CASH FLOW
═══════════════════════════════════════════════════════════════ */
const cashFlowMonthly = (() => {
  const arr = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(2026, 8 - i, 1);
    const income = 88_000_000 + (11 - i) * 350_000 + Math.sin(i * 1.3) * 3_500_000;
    const expenses = 32_000_000 + (11 - i) * 120_000 + Math.cos(i * 1.1) * 2_000_000;
    arr.push({ month: d.toLocaleDateString("en-US", { month: "short" }), income: Math.round(income), expenses: Math.round(expenses), net: Math.round(income - expenses) });
  }
  return arr;
})();

const CashFlowSection = ({ totals }) => (
  <div className="flex flex-col gap-3">
    <div className="grid sm:grid-cols-3 gap-3">
      <MetricCard icon={TrendingUp} label="Income" value={fmtCompact(totals.monthlyIncome)} sub="Monthly" positive={true} accent={GREEN} />
      <MetricCard icon={TrendingDown} label="Expenses" value={fmtCompact(totals.monthlyExpenses)} sub="Monthly" positive={false} accent={RED} />
      <MetricCard icon={Activity} label="Net Cash Flow" value={fmtCompact(totals.netCashFlow)} sub="Income − Expenses" positive={totals.netCashFlow >= 0} accent={BLUE_LT} />
    </div>
    <ChartCard icon={BarChart3} title="Monthly Cash Flow" subtitle="Income vs. expenses, trailing 12 months" height={260}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={cashFlowMonthly} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
          <CartesianGrid stroke="rgba(92,141,255,0.06)" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={60} />
          <Tooltip content={({ active, payload }) => active && payload?.length ? (
            <div className="bg-[#0A0D16]/97 border border-[#5C8DFF]/30 rounded-[10px] px-3 py-2 flex flex-col gap-1">
              <span className="font-mono text-[11px] text-[#34D399]">Income: {fmtMoney(payload[0]?.payload.income)}</span>
              <span className="font-mono text-[11px] text-[#F87171]">Expenses: {fmtMoney(payload[0]?.payload.expenses)}</span>
              <span className="font-mono text-[11px] text-[#7CA6FF]">Net: {fmtMoney(payload[0]?.payload.net)}</span>
            </div>
          ) : null} cursor={{ fill: "rgba(92,141,255,0.04)" }} />
          <Bar dataKey="income" fill={GREEN} radius={[3, 3, 0, 0]} maxBarSize={16} fillOpacity={0.85} />
          <Bar dataKey="expenses" fill={RED} radius={[3, 3, 0, 0]} maxBarSize={16} fillOpacity={0.75} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Layers} title="Cash Flow by Activity" subtitle="Operating, investing and financing" />
      <div className="grid sm:grid-cols-3 gap-3 relative z-10">
        <div className="p-4 rounded-2xl bg-[#34D399]/[0.06] border border-[#34D399]/20">
          <div className="text-[9px] tracking-[0.14em] uppercase text-[#34D399]/70 mb-2">Operating</div>
          <div className="font-mono text-[19px] font-extrabold text-[#EAEDF7]">{fmtCompact(totals.monthlyIncome - totals.monthlyExpenses * 0.7)}</div>
          <p className="text-[10px] text-white/40 mt-1.5">Business, rental & operating income less running costs.</p>
        </div>
        <div className="p-4 rounded-2xl bg-[#A78BFA]/[0.06] border border-[#A78BFA]/20">
          <div className="text-[9px] tracking-[0.14em] uppercase text-[#A78BFA]/70 mb-2">Investing</div>
          <div className="font-mono text-[19px] font-extrabold text-[#EAEDF7]">-{fmtCompact(37_000_000)}</div>
          <p className="text-[10px] text-white/40 mt-1.5">Capital deployed into holdings, funds and capital calls.</p>
        </div>
        <div className="p-4 rounded-2xl bg-[#E8A855]/[0.06] border border-[#E8A855]/20">
          <div className="text-[9px] tracking-[0.14em] uppercase text-[#E8A855]/70 mb-2">Financing</div>
          <div className="font-mono text-[19px] font-extrabold text-[#EAEDF7]">-{fmtCompact(18_500_000)}</div>
          <p className="text-[10px] text-white/40 mt-1.5">Mortgage, loan and lease principal repayments.</p>
        </div>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   SECTION: FINANCIAL STATEMENTS
═══════════════════════════════════════════════════════════════ */
const StatementsSection = ({ totals, assetBreakdown, liabilityBreakdown }) => {
  const [tab, setTab] = useState("balance");
  const [period, setPeriod] = useState("Monthly");
  const tabs = [
    { id: "balance", label: "Balance Sheet", icon: Layers },
    { id: "income", label: "Income Statement", icon: TrendingUp },
    { id: "cashflow", label: "Cash Flow Statement", icon: Activity },
  ];
  const divisor = period === "Monthly" ? 1 : period === "Quarterly" ? 3 : period === "Annual" ? 12 : 1;

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={FileText} title="Financial Statements" subtitle="Balance sheet, income & cash flow"
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-2.5 py-1.5 bg-white/[0.025] border border-white/[0.08] rounded-[9px] text-[10.5px] text-white/70 outline-none cursor-pointer [&>option]:bg-[#0C0F18]">
              {["Monthly", "Quarterly", "Annual", "Custom"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className={GHOST_BTN}><Download size={12} /> Export</button>
          </div>
        } />
      <div className="flex gap-1.5 mb-4 relative z-10">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[11px] font-bold transition-colors ${tab === t.id ? "bg-[#5C8DFF]/15 border border-[#5C8DFF]/30 text-[#7CA6FF]" : "border border-white/[0.08] text-white/45"}`}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "balance" && (
        <div className="grid sm:grid-cols-2 gap-4 relative z-10">
          <div className="p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07]">
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#34D399] mb-3">Assets</div>
            <div className="flex flex-col gap-2">
              {assetBreakdown.map((a) => (
                <div key={a.id} className="flex items-center justify-between">
                  <span className="text-[11.5px] text-white/60">{a.label}</span>
                  <span className="font-mono text-[11.5px] font-bold text-white/85">{fmtCompact(a.value / divisor)}</span>
                </div>
              ))}
              <Divider />
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-white/85">Total Assets</span>
                <span className="font-mono text-[13px] font-extrabold text-[#EAEDF7]">{fmtCompact(totals.assets / divisor)}</span>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.015] border border-white/[0.07]">
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#F87171] mb-3">Liabilities</div>
            <div className="flex flex-col gap-2">
              {liabilityBreakdown.map((l) => (
                <div key={l.id} className="flex items-center justify-between">
                  <span className="text-[11.5px] text-white/60">{l.label}</span>
                  <span className="font-mono text-[11.5px] font-bold text-white/85">{fmtCompact(l.value / divisor)}</span>
                </div>
              ))}
              <Divider />
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-white/85">Total Liabilities</span>
                <span className="font-mono text-[13px] font-extrabold text-[#EAEDF7]">{fmtCompact(totals.liabilities / divisor)}</span>
              </div>
            </div>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between p-4 rounded-2xl bg-[#5C8DFF]/[0.08] border border-[#5C8DFF]/25">
            <span className="text-[13px] font-bold text-[#EAEDF7]">Net Worth</span>
            <span className="font-mono text-[18px] font-extrabold text-[#EAEDF7]">{fmtCompact(totals.netWorth / divisor)}</span>
          </div>
        </div>
      )}

      {tab === "income" && (
        <div className="flex flex-col gap-2 relative z-10 max-w-xl">
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#34D399] mb-1">Revenue / Income</div>
          {INCOME_SOURCES.map((s) => (
            <div key={s.id} className="flex items-center justify-between">
              <span className="text-[11.5px] text-white/60">{s.label}</span>
              <span className="font-mono text-[11.5px] font-bold text-white/85">{fmtCompact((s.monthly * 12) / divisor)}</span>
            </div>
          ))}
          <Divider />
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#F87171] mb-1">Expenses</div>
          {EXPENSE_CATEGORIES.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <span className="text-[11.5px] text-white/60">{c.label}</span>
              <span className="font-mono text-[11.5px] font-bold text-white/85">{fmtCompact((c.monthly * 12) / divisor)}</span>
            </div>
          ))}
          <Divider />
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#5C8DFF]/[0.08] border border-[#5C8DFF]/25">
            <span className="text-[12px] font-bold text-[#EAEDF7]">Net Income</span>
            <span className="font-mono text-[15px] font-extrabold text-[#34D399]">{fmtCompact(totals.netCashFlow * 12 / divisor)}</span>
          </div>
        </div>
      )}

      {tab === "cashflow" && (
        <div className="flex flex-col gap-2 relative z-10 max-w-xl">
          {[
            ["Operating Activities", totals.netCashFlow * 0.72],
            ["Investing Activities", -37_000_000 / divisor],
            ["Financing Activities", -18_500_000 / divisor],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11.5px] text-white/60">{label}</span>
              <span className="font-mono text-[11.5px] font-bold" style={{ color: val >= 0 ? GREEN : RED }}>{val >= 0 ? "+" : ""}{fmtCompact(val)}</span>
            </div>
          ))}
          <Divider />
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#5C8DFF]/[0.08] border border-[#5C8DFF]/25">
            <span className="text-[12px] font-bold text-[#EAEDF7]">Net Change in Cash</span>
            <span className="font-mono text-[15px] font-extrabold text-[#34D399]">{fmtCompact(totals.netCashFlow / divisor)}</span>
          </div>
        </div>
      )}

      <p className="text-[9.5px] text-white/25 mt-5 relative z-10">Generate Statement / Export is ready for wiring to a PDF or accounting export once connected to real data.</p>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: ANALYTICS
═══════════════════════════════════════════════════════════════ */
const AnalyticsSection = ({ totals, assetBreakdown }) => {
  const businessPerf = BUSINESSES.map((b) => ({ name: b.name.split(" ")[0], profit: Math.round(b.annualProfit / 1_000_000) }));
  const investmentPerf = INVESTMENTS.map((i) => {
    const valueKES = toKES(i.quantity * i.price, i.currency);
    const costKES = toKES(i.quantity * i.avgCost, i.currency);
    return { name: i.asset.split(" ")[0], returnPct: costKES ? Math.round(((valueKES - costKES) / costKES) * 100) : 0 };
  });

  return (
    <div className="flex flex-col gap-3">
      <ChartCard icon={LineChartIcon} title="Net Worth Over Time" subtitle="Full 5-year history" height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={NET_WORTH_HISTORY} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PURPLE} stopOpacity={0.3} />
                <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(92,141,255,0.06)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "rgba(237,239,245,0.28)", fontSize: 8 }} axisLine={false} tickLine={false} minTickGap={50} />
            <YAxis tick={{ fill: "rgba(237,239,245,0.28)", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={58} />
            <Tooltip content={({ active, payload }) => active && payload?.length ? (
              <div className="bg-[#0A0D16]/97 border border-[#A78BFA]/30 rounded-[10px] px-3 py-2">
                <div className="font-mono text-[12px] font-bold text-[#A78BFA]">{fmtMoney(payload[0].value)}</div>
              </div>
            ) : null} />
            <Area type="monotone" dataKey="value" stroke={PURPLE} strokeWidth={2} fill="url(#analyticsFill)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid lg:grid-cols-2 gap-3">
        <ChartCard icon={Building2} title="Business Performance" subtitle="Annual profit by business (KSh M)" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={businessPerf} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
              <CartesianGrid stroke="rgba(92,141,255,0.06)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(92,141,255,0.04)" }} content={({ active, payload }) => active && payload?.length ? (
                <div className="bg-[#0A0D16]/97 border border-[#5C8DFF]/30 rounded-[10px] px-3 py-2">
                  <span className="font-mono text-[12px] font-bold" style={{ color: payload[0].value >= 0 ? GREEN : RED }}>KSh {payload[0].value}M</span>
                </div>
              ) : null} />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={30}>
                {businessPerf.map((b, i) => <Cell key={i} fill={b.profit >= 0 ? GREEN : RED} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard icon={LineChartIcon} title="Investment Performance" subtitle="Return % by holding" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={investmentPerf} margin={{ left: 0, right: 0, top: 6, bottom: 0 }} layout="vertical">
              <CartesianGrid stroke="rgba(92,141,255,0.06)" strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" tick={{ fill: "rgba(237,239,245,0.32)", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fill: "rgba(237,239,245,0.4)", fontSize: 9 }} axisLine={false} tickLine={false} width={70} />
              <Tooltip cursor={{ fill: "rgba(92,141,255,0.04)" }} content={({ active, payload }) => active && payload?.length ? (
                <div className="bg-[#0A0D16]/97 border border-[#5C8DFF]/30 rounded-[10px] px-3 py-2">
                  <span className="font-mono text-[12px] font-bold" style={{ color: payload[0].value >= 0 ? GREEN : RED }}>{fmtPct(payload[0].value)}</span>
                </div>
              ) : null} />
              <Bar dataKey="returnPct" radius={[0, 4, 4, 0]} maxBarSize={14}>
                {investmentPerf.map((b, i) => <Cell key={i} fill={b.returnPct >= 0 ? GREEN : RED} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className={`${CARD} p-5`}>
        <CornerAccents />
        <SectionHeader icon={PieChartIcon} title="Asset Allocation" subtitle="Full portfolio diversification" />
        <DonutBreakdown data={assetBreakdown} />
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: DOCUMENTS
═══════════════════════════════════════════════════════════════ */
const DocumentsSection = ({ documents }) => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const categories = useMemo(() => [...new Set(documents.map((d) => d.category))], [documents]);
  const filtered = documents.filter((d) =>
    (!search || d.name.toLowerCase().includes(search.toLowerCase())) && (!categoryFilter || d.category === categoryFilter)
  );

  const columns = [
    { key: "name", label: "Document", primary: true, render: (r) => (
      <div className="flex items-center gap-2">
        <IconBox icon={FileText} size={24} />
        <span className="whitespace-normal">{r.name}</span>
      </div>
    ) },
    { key: "category", label: "Category", render: (r) => <Badge>{r.category}</Badge> },
    { key: "type", label: "Type" },
    { key: "date", label: "Date", render: (r) => <span className="font-mono text-[10.5px]">{r.date}</span> },
    { key: "size", label: "Size", align: "right" },
  ];

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={Folder} title="Documents" subtitle={`${documents.length} files across the estate`}
        right={<button className={MINI_BTN}><Upload size={12} /> Upload</button>} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search documents…" filters={[
        { key: "category", label: "All Categories", value: categoryFilter, onChange: setCategoryFilter, options: categories },
      ]} />
      <ResponsiveTable columns={columns} rows={filtered} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECTION: UPCOMING OBLIGATIONS
═══════════════════════════════════════════════════════════════ */
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - new Date("2026-09-12")) / 86400000);

const enrichObligation = (o) => {
  const daysUntilDue = daysUntil(o.dueDate);
  let status = "Upcoming";
  if (o.paid) status = "Paid";
  else if (daysUntilDue < 0) status = "Overdue";
  else if (daysUntilDue <= 5) status = "Due Soon";
  return { ...o, daysUntilDue, status };
};

const sortObligationsByUrgency = (list) =>
  [...list].sort((a, b) => a.daysUntilDue - b.daysUntilDue);

// Normalize a liability into the obligation feed shape
const normalizeLiabilityAsObligation = (l) => ({
  id: `lia-ob-${l.id}`,
  label: l.name,
  amount: l.monthlyPayment || 0,
  dueDate: l.dueDate || null,
  category: l.category,
  paid: l.paid ?? false,
  settledTransactionId: l.settledTransactionId ?? null,
  lastPaidDate: l.lastPaidDate ?? null,
});

// Folds recurring (non one-time) unpaid expense-ledger items into the same
// obligation shape, so mortgages/loans and recurring bills show in one feed.
const normalizeExpenseAsObligation = (e) => ({
  id: `exp-${e.id}`,
  label: e.name,
  amount: e.amount,
  dueDate: e.nextDue,
  category: e.category,
  paid: e.paid ?? false,
  settledTransactionId: e.settledTransactionId ?? null,
  lastPaidDate: e.lastPaidDate ?? null,
});

const buildDueSoonFeed = (liabilities, expenses) => {
  const fromLiabilities = (liabilities || [])
    .filter((l) => l.dueDate && (l.monthlyPayment || 0) > 0)
    .map(normalizeLiabilityAsObligation);
  const fromExpenses = (expenses || [])
    .filter((e) => e.frequency !== "One-time" && e.nextDue && e.nextDue !== "—" && e.amount > 0)
    .map(normalizeExpenseAsObligation);
  return [...fromLiabilities, ...fromExpenses].map(enrichObligation);
};

const CATEGORY_TO_SECTION = {
  Mortgage: "realestate",
  "Business Loan": "businesses",
  "Auto Financing": "vehicles",
  "Credit Facility": "liabilities",
  "Property Tax": "realestate",
  Insurance: "expenseledger",
  Utilities: "expenseledger",
};

const OBLIGATION_STATUS_TONE = { Overdue: "red", "Due Soon": "amber", Upcoming: "blue", Paid: "green" };

const ObligationsSection = ({ obligations, cash = 0 }) => {
  const [statusFilter, setStatusFilter] = useState("");
  const sorted = sortObligationsByUrgency(obligations);
  const filtered = statusFilter ? sorted.filter((o) => o.status === statusFilter) : sorted;

  const unpaid = obligations.filter((o) => o.status !== "Paid");
  const totalUnpaid = unpaid.reduce((s, o) => s + o.amount, 0);
  const due14d = unpaid.filter((o) => o.daysUntilDue <= 14).reduce((s, o) => s + o.amount, 0);
  const shortfall = due14d - cash;

  return (
    <div className={`${CARD} p-5`}>
      <CornerAccents />
      <SectionHeader icon={CalendarClock} title="Upcoming Obligations" subtitle={`${unpaid.length} unpaid · ${fmtCompact(totalUnpaid)} outstanding`} />

      {shortfall > 0 && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-[#E8A855]/[0.08] border border-[#E8A855]/25 relative z-10">
          <AlertTriangle size={14} color={AMBER} />
          <span className="text-[11.5px] text-[#E8A855]">
            {fmtCompact(due14d)} due in the next 14 days exceeds current cash on hand ({fmtCompact(cash)}) by {fmtCompact(shortfall)}.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4 relative z-10">
        <button onClick={() => setStatusFilter("")} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${!statusFilter ? "border-[#5C8DFF]/40 bg-[#5C8DFF]/15 text-[#7CA6FF]" : "border-white/[0.08] text-white/40"}`}>All</button>
        {["Overdue", "Due Soon", "Upcoming", "Paid"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${statusFilter === s ? "border-[#5C8DFF]/40 bg-[#5C8DFF]/15 text-[#7CA6FF]" : "border-white/[0.08] text-white/40"}`}>{s}</button>
        ))}
      </div>

      <div className="flex flex-col gap-2 relative z-10">
        {filtered.length === 0 && <EmptyState text="Nothing matches this filter." />}
        {filtered.map((o) => (
          <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.015] border border-white/[0.07]">
            <div className={`w-1.5 h-10 rounded-full flex-shrink-0`} style={{ background: o.status === "Overdue" ? RED : o.status === "Due Soon" ? AMBER : o.status === "Paid" ? GREEN : BLUE_LT }} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-[#EAEDF7] truncate">{o.label}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-white/40">{o.category}</span>
                <span className="text-[10px] text-white/30">·</span>
                <span className="text-[10px] text-white/40 font-mono">{o.dueDate}</span>
                {o.paid && o.lastPaidDate && (
                  <>
                    <span className="text-[10px] text-white/30">·</span>
                    <span className="text-[10px] text-[#34D399]">Paid {o.lastPaidDate}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono text-[13px] font-bold text-[#EAEDF7]">{fmtCompact(o.amount)}</div>
              <Badge tone={OBLIGATION_STATUS_TONE[o.status]}>
                {o.status === "Overdue" ? `${Math.abs(o.daysUntilDue)}d overdue` : o.status === "Paid" ? "Paid" : `${o.daysUntilDue}d · ${o.status}`}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION CONFIG
═══════════════════════════════════════════════════════════════ */
const NAV_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "networth", label: "Net Worth", icon: PieChartIcon },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "wealth", label: "Wealth Management", icon: PiggyBank },
  { id: "expenseledger", label: "Expense Ledger", icon: Banknote },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "income", label: "Income", icon: TrendingUp },
  { id: "expenses", label: "Expenses", icon: TrendingDown },
  { id: "businesses", label: "Businesses", icon: Building2 },
  { id: "ventures", label: "Ventures", icon: Lightbulb },
  { id: "investments", label: "Investments", icon: LineChartIcon },
  { id: "realestate", label: "Real Estate", icon: Home },
  { id: "vehicles", label: "Vehicles", icon: Car },
  { id: "liabilities", label: "Liabilities", icon: AlertTriangle },
  { id: "cashflow", label: "Cash Flow", icon: Activity },
  { id: "statements", label: "Statements", icon: FileText },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "documents", label: "Documents", icon: Folder },
  { id: "obligations", label: "Obligations", icon: CalendarClock },
];

const NAV_GROUPS = [
  {
    id: "wealth-group", label: "Accounts & Wealth", icon: Wallet,
    items: ["accounts", "wealth", "expenseledger", "liabilities"],
  },
  {
    id: "activity-group", label: "Activity", icon: Activity,
    items: ["transactions", "income", "expenses", "cashflow"],
  },
  {
    id: "growth-group", label: "Businesses & Ventures", icon: Building2,
    items: ["businesses", "ventures"],
  },
  {
    id: "assets-group", label: "Investments & Assets", icon: LineChartIcon,
    items: ["investments", "realestate", "vehicles"],
  },
  {
    id: "reports-group", label: "Reports", icon: FileText,
    items: ["statements", "analytics", "documents", "obligations"],
  },
];

const NAV_SECTION_MAP = NAV_SECTIONS.reduce((map, s) => {
  map[s.id] = s;
  return map;
}, {});

const QUICK_ACTIONS = [
  { type: "transaction", label: "Add Transaction", icon: ArrowLeftRight },
  { type: "account", label: "Add Account", icon: Wallet },
  { type: "asset", label: "Add Asset", icon: PiggyBank },
  { type: "expense", label: "Add Expense", icon: Banknote },
  { type: "investment", label: "Add Investment", icon: LineChartIcon },
  { type: "property", label: "Add Property", icon: Home },
  { type: "vehicle", label: "Add Vehicle", icon: Car },
  { type: "business", label: "Add Business", icon: Building2 },
  { type: "venture", label: "Add Venture", icon: Lightbulb },
  { type: "liability", label: "Add Liability", icon: AlertTriangle },
];

/* ═══════════════════════════════════════════════════════════════
   GLOBAL SEARCH
═══════════════════════════════════════════════════════════════ */
const buildSearchIndex = (state) => {
  const idx = [];
  state.transactions.forEach((t) => idx.push({ id: `tx-${t.id}`, group: "Transactions", label: t.description, sub: t.category, section: "transactions" }));
  state.businesses.forEach((b) => idx.push({ id: `biz-${b.id}`, group: "Businesses", label: b.name, sub: b.industry, section: "businesses" }));
  state.properties.forEach((p) => idx.push({ id: `prop-${p.id}`, group: "Real Estate", label: p.name, sub: p.location, section: "realestate" }));
  state.vehicles.forEach((v) => idx.push({ id: `veh-${v.id}`, group: "Vehicles", label: v.name, sub: `${v.year}`, section: "vehicles" }));
  state.investments.forEach((i) => idx.push({ id: `inv-${i.id}`, group: "Investments", label: i.asset, sub: i.category, section: "investments" }));
  state.accounts.forEach((a) => idx.push({ id: `acc-${a.id}`, group: "Accounts", label: a.name, sub: a.institution, section: "accounts" }));
  state.documents.forEach((d) => idx.push({ id: `doc-${d.id}`, group: "Documents", label: d.name, sub: d.category, section: "documents" }));
  state.ventures.forEach((v) => idx.push({ id: `ven-${v.id}`, group: "Ventures", label: v.name, sub: v.industry, section: "ventures" }));
  return idx;
};

const GlobalSearch = ({ index, onNavigate }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = query.length > 1
    ? index.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()) || i.sub?.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative w-full sm:w-72">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search everything…"
        className="w-full pl-8 pr-3 py-2 bg-white/[0.03] border border-white/[0.09] rounded-[10px] text-[12px] text-white placeholder:text-white/30 outline-none focus:border-[#5C8DFF]/40 focus:bg-[#5C8DFF]/[0.06] transition-colors"
      />
      <AnimatePresence>
        {open && query.length > 1 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute top-full mt-1.5 left-0 right-0 bg-[#0A0D16]/98 border border-white/[0.12] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] max-h-80 overflow-y-auto z-50">
            {results.length === 0 ? (
              <div className="p-4 text-[11px] text-white/35 text-center">No matches across accounts, transactions, businesses, properties, vehicles, investments, ventures or documents.</div>
            ) : results.map((r) => (
              <button key={r.id} onClick={() => { onNavigate(r.section); setOpen(false); setQuery(""); }}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-white/[0.05] transition-colors border-b border-white/[0.04] last:border-b-0">
                <div className="min-w-0">
                  <div className="text-[11.5px] text-white/85 truncate">{r.label}</div>
                  <div className="text-[9.5px] text-white/35 truncate">{r.sub}</div>
                </div>
                <Badge tone="blue">{r.group}</Badge>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   TOP NAV — brand + pinned links + grouped dropdowns, mirrors the
   TradingTab nav pattern (transparent → solid on scroll, dropdown
   groups instead of one long flat list).
═══════════════════════════════════════════════════════════════ */
const SectionsMenu = ({ activeSection, onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const activeGroup = NAV_GROUPS.find((g) => g.items.includes(activeSection));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-[11.5px] font-bold transition-colors border whitespace-nowrap ${open || activeGroup ? "bg-[#5C8DFF]/15 border-[#5C8DFF]/30 text-[#7CA6FF]" : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white/80"}`}>
        {activeGroup ? activeGroup.label : "Sections"}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute top-full mt-2 right-0 w-[min(92vw,560px)] bg-[#0A0D16]/98 border border-white/[0.12] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-3 z-50 grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.id}>
                <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                  <group.icon size={12} color={BLUE_LT} />
                  <span className="text-[9.5px] font-bold tracking-[0.1em] uppercase text-white/40">{group.label}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((id) => {
                    const section = NAV_SECTION_MAP[id];
                    if (!section) return null;
                    const active = activeSection === id;
                    return (
                      <button
                        key={id}
                        onClick={() => { onSelect(id); setOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[12px] font-semibold text-left transition-colors ${active ? "bg-[#5C8DFF]/15 text-[#7CA6FF]" : "text-white/70 hover:bg-white/[0.06]"}`}
                      >
                        <section.icon size={13} />
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TopNav = ({ activeSection, onSelect, scrolled, searchIndex }) => (
  <div className="fixed top-0 left-0 right-0 z-40" style={{ willChange: "opacity" }}>
    {/* Background layer is always mounted with backdrop-blur applied;
        only its opacity animates. This avoids the browser repeatedly
        creating/destroying a backdrop-filter compositing layer on every
        scroll-threshold crossing, which is what causes the white flash. */}
    <div
      className="absolute inset-0 backdrop-blur-sm bg-[#070810]/80 border border-white/[0.04] rounded-2xl transition-opacity duration-200 pointer-events-none"
      style={{ opacity: scrolled ? 1 : 0 }}
    />
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3">
      <div className="flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-sm font-extrabold">Vantage</div>
          <div className="text-[11px] text-white/40">Family Office</div>
        </div>

        <div className="w-px h-6 bg-white/[0.08] flex-shrink-0 hidden sm:block" />

        {/* Pinned links */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onSelect("overview")}
            className={`px-3 py-2 rounded-[9px] text-[11.5px] font-bold transition-colors border whitespace-nowrap ${
              activeSection === "overview" ? "bg-[#5C8DFF]/15 border-[#5C8DFF]/30 text-[#7CA6FF]" : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => onSelect("networth")}
            className={`px-3 py-2 rounded-[9px] text-[11.5px] font-bold transition-colors border whitespace-nowrap hidden md:inline-flex ${
              activeSection === "networth" ? "bg-[#5C8DFF]/15 border-[#5C8DFF]/30 text-[#7CA6FF]" : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05]"
            }`}
          >
            Net Worth
          </button>
        </div>

        {/* Search takes remaining space, never fights other elements for room */}
        <div className="flex-1 min-w-0 hidden lg:block">
          <GlobalSearch index={searchIndex} onNavigate={onSelect} />
        </div>

        {/* Single sections menu, pinned to the right */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <SectionsMenu activeSection={activeSection} onSelect={onSelect} />
        </div>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   QUICK ADD MENU
═══════════════════════════════════════════════════════════════ */
const QuickAddMenu = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-[#5C8DFF] text-[#05060A] text-[11.5px] font-bold hover:bg-[#75A0FF] transition-colors shadow-[0_8px_20px_-6px_rgba(92,141,255,0.55)]">
        <Plus size={13} /> Quick Add <ChevronDown size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute top-full mt-2 right-0 w-64 bg-[#0A0D16]/98 border border-white/[0.12] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-2 z-50 grid grid-cols-2 gap-1.5">
            {QUICK_ACTIONS.map((a) => (
              <button key={a.type} onClick={() => { onSelect(a.type); setOpen(false); }}
                className="flex flex-col items-start gap-1.5 p-2.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left">
                <IconBox icon={a.icon} size={24} />
                <span className="text-[10px] font-semibold text-white/75 leading-tight">{a.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}