// app/page.tsx
"use client";

import type { AnalysisSummary, Category, Transaction } from "@/lib/transactions";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | "ALL">(
    "ALL"
  );
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);

  // AI budget coach state
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setSummary(null);
    setTransactions([]);
    setError(null);
    setSelectedMerchant(null);
    setAiAdvice(null);
    setAiError(null);
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("Please choose a CSV or PDF file first.");
      return;
    }

    setLoading(true);
    setError(null);
    setAiAdvice(null);
    setAiError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const baseUrl =
        process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

      const res = await fetch(`${baseUrl}/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error || data.detail) {
        throw new Error(data.error || data.detail || "Failed to analyze file.");
      }

      setSummary(data.summary);
      setTransactions(data.transactions);
      setSelectedMerchant(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleGetAdvice = async () => {
    if (!summary) return;

    setAiLoading(true);
    setAiError(null);

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

      const res = await fetch(`${baseUrl}/advice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summary }),
      });

      const data = await res.json();

      if (!res.ok || data.detail || data.error) {
        throw new Error(data.detail || data.error || "Failed to get advice");
      }

      setAiAdvice(data.advice || "No advice generated.");
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Something went wrong while getting advice.");
    } finally {
      setAiLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    let list = transactions;

    if (selectedCategory !== "ALL") {
      list = list.filter((t) => t.category === selectedCategory);
    }

    if (selectedMerchant) {
      list = list.filter((t) => t.merchant === selectedMerchant);
    }

    return list;
  }, [transactions, selectedCategory, selectedMerchant]);

  const categoryChartData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.byCategory || {})
      .filter(([_, amount]) => amount > 0)
      .map(([cat, amount]) => ({
        category: cat,
        amount,
      }));
  }, [summary]);

  const topMerchants = useMemo(() => {
    if (!summary || !summary.topMerchants) return [];
    return summary.topMerchants;
  }, [summary]);

  // Spending trend (multi-month)
  const trendData = useMemo(() => {
    if (!summary?.monthly) return [];
    const entries = Object.entries(summary.monthly);

    if (!entries.length) return [];

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const sorted = entries.sort(([a], [b]) => (a < b ? -1 : 1));

    return sorted.map(([key, value]) => {
      const [year, monthStr] = key.split("-");
      const idx = Number(monthStr) - 1;
      const label =
        idx >= 0 && idx < 12 ? `${monthNames[idx]} ${year}` : key;

      return {
        key,
        label,
        income: value.income,
        spending: value.spending,
      };
    });
  }, [summary]);

  const totalPotentialLeak = summary
    ? summary.leaks.bankFees +
      summary.leaks.subscriptions +
      summary.leaks.foodDelivery
    : 0;

  return (
    <main className="space-y-8 pb-10">
      {/* Hero / intro */}
      <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900/90 p-6 sm:p-7 shadow-[0_0_80px_rgba(16,185,129,0.12)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80 mb-1">
              MoneyLeaks · Smart statement analyzer
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50">
              Find where your money secretly leaks every month.
            </h1>
            <p className="mt-2 text-sm text-slate-400 max-w-xl">
              Upload your bank / UPI / card statement and instantly see{" "}
              <span className="text-emerald-300 font-medium">
                fees, food delivery, subscriptions
              </span>{" "}
              and merchants that eat most of your money – even over multiple
              months.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-slate-400 sm:text-right">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-slate-950/70 px-3 py-1 self-start sm:self-end">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Runs locally on this page · no account needed</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Works with single-month or multi-month statements (6–24 months in
              one file).
            </span>
          </div>
        </div>
      </section>

      {/* Upload section */}
      <section className="border border-slate-800 rounded-2xl p-6 bg-slate-950/70 shadow-xl shadow-emerald-500/10">
        <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 text-xs font-bold">
            1
          </span>
          Upload your statement
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Export your bank / UPI / card statement as a{" "}
          <span className="font-semibold text-emerald-300">CSV</span> or{" "}
          <span className="font-semibold text-emerald-300">PDF</span> and drop
          it here.
        </p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <input
            type="file"
            accept=".csv,application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-300
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-emerald-500 file:text-slate-900
              hover:file:bg-emerald-400 cursor-pointer"
          />
          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-emerald-500 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
                Analyzing…
              </>
            ) : (
              "Analyze money leaks"
            )}
          </button>
        </div>
        {file && (
          <p className="text-xs text-slate-400 mt-2">
            Selected file:{" "}
            <span className="text-slate-200 font-medium">{file.name}</span>
          </p>
        )}
        {error && (
          <p className="text-sm text-red-400 mt-3">
            {error}
          </p>
        )}
      </section>

      {/* Results */}
      {summary && (
        <>
          {/* Summary cards */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 text-xs font-bold">
                2
              </span>
              Overview of your period
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SummaryCard
                label="Total Income"
                value={summary.totalIncome}
                accent="text-emerald-400"
                sub="All credits detected in your statement"
              />
              <SummaryCard
                label="Total Spending"
                value={summary.totalSpending}
                accent="text-rose-400"
                sub="All debits excluding internal transfers"
              />
              <SummaryCard
                label="Net Balance"
                value={summary.net}
                accent={
                  summary.net >= 0 ? "text-emerald-400" : "text-rose-400"
                }
                sub={
                  summary.net >= 0
                    ? "You spent less than you earned"
                    : "You spent more than you earned"
                }
              />
            </div>

            {/* Leaks section */}
            <section className="border border-slate-800 rounded-2xl p-4 sm:p-5 bg-slate-950/70 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-semibold mb-1">Your main money leaks</h3>
                  <p className="text-xs sm:text-sm text-slate-400">
                    These are not basic necessities; they&apos;re the easiest
                    places to cut back without breaking your life.
                  </p>
                </div>
                <div className="text-right text-xs sm:text-sm">
                  <p className="text-slate-400">Potential monthly saving</p>
                  <p className="text-lg font-semibold text-emerald-300">
                    ₹{totalPotentialLeak.toFixed(0)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <LeakItem
                  label="Bank fees & charges"
                  amount={summary.leaks.bankFees}
                  description="Penalties, annual fees, late fees, avoidable charges."
                />
                <LeakItem
                  label="Subscriptions"
                  amount={summary.leaks.subscriptions}
                  description="Streaming, apps, services auto-renewing every month."
                />
                <LeakItem
                  label="Food delivery"
                  amount={summary.leaks.foodDelivery}
                  description="Swiggy, Zomato, Blinkit and similar services."
                />
              </div>

              <p className="text-xs text-slate-400">
                If you only fix these three categories, you&apos;d save roughly{" "}
                <span className="text-emerald-300 font-semibold">
                  ₹{(totalPotentialLeak * 12).toFixed(0)} per year
                </span>
                . That&apos;s like gifting yourself a bonus.
              </p>
            </section>

            {/* AI Budget Coach (Gemini) */}
            <section className="border border-slate-800 rounded-2xl p-4 sm:p-5 bg-slate-950/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-semibold mb-1 flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 text-[10px] font-bold">
                      AI
                    </span>
                    Budget coach
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Let AI read your leaks, categories and top merchants, then
                    suggest concrete steps to fix your budget and save more.
                  </p>
                </div>
                <button
                  onClick={handleGetAdvice}
                  disabled={aiLoading || !summary}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold bg-emerald-500 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
                >
                  {aiLoading ? "Thinking..." : "Ask AI for a plan"}
                </button>
              </div>

              {aiError && (
                <p className="text-xs text-red-400">
                  {aiError}
                </p>
              )}

              {aiAdvice && !aiError && (
                <div className="mt-2 border border-slate-800 rounded-xl bg-slate-950/80 p-3 text-sm text-slate-200 whitespace-pre-line">
                  {aiAdvice}
                </div>
              )}

              {!aiAdvice && !aiLoading && !aiError && (
                <p className="text-xs text-slate-500">
                  Tip: upload at least 1–2 months of data so the coach can see
                  patterns and give more useful suggestions.
                </p>
              )}
            </section>
          </section>

          {/* Category chart + filters + table */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 text-xs font-bold">
                3
              </span>
              Dive into categories & transactions
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Chart */}
              <div className="border border-slate-800 rounded-2xl p-4 bg-slate-950/70 lg:col-span-1">
                <h3 className="font-semibold mb-2 text-sm">
                  Spending by category
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Hover over bars to see how much each category took from your
                  pocket.
                </p>
                <div className="h-64">
                  {categoryChartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryChartData}>
                        <XAxis
                          dataKey="category"
                          stroke="#cbd5f5"
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          stroke="#cbd5f5"
                          tick={{ fontSize: 10 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#020617",
                            border: "1px solid #1f2937",
                            borderRadius: "0.5rem",
                            fontSize: "0.75rem",
                          }}
                          formatter={(value: any) => [
                            `₹${Number(value).toFixed(0)}`,
                            "Amount",
                          ]}
                        />
                        <Legend />
                        <Bar dataKey="amount" name="Amount" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-slate-500">
                      No spending categories detected.
                    </div>
                  )}
                </div>
              </div>

              {/* Transactions table */}
              <div className="border border-slate-800 rounded-2xl p-4 bg-slate-950/70 lg:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">Transactions</h3>
                    <p className="text-xs text-slate-400">
                      Filter by category or merchant to inspect specific
                      spending patterns.
                    </p>
                    {selectedMerchant && (
                      <p className="text-xs text-emerald-300 mt-1">
                        Showing only payments to{" "}
                        <span className="font-semibold">
                          {selectedMerchant}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    {selectedMerchant && (
                      <button
                        type="button"
                        onClick={() => setSelectedMerchant(null)}
                        className="px-2.5 py-1 rounded-full text-xs border border-emerald-400 text-emerald-300 bg-slate-900/60 hover:bg-emerald-500/10"
                      >
                        Clear merchant filter
                      </button>
                    )}
                    <CategoryFilter
                      selected={selectedCategory}
                      onChange={setSelectedCategory}
                    />
                  </div>
                </div>

                <div className="max-h-80 overflow-auto border-t border-slate-800 mt-2">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-900 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-2 text-left font-semibold text-slate-300">
                          Date
                        </th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-300">
                          Description
                        </th>
                        <th className="px-2 py-2 text-right font-semibold text-slate-300">
                          Amount
                        </th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-300">
                          Type
                        </th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-300">
                          Category
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((tx, i) => (
                        <tr key={i} className="border-t border-slate-800">
                          <td className="px-2 py-1 text-slate-400">
                            {tx.date}
                          </td>
                          <td className="px-2 py-1 text-slate-100 max-w-xs truncate">
                            {tx.description}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <span
                              className={
                                tx.type === "DEBIT"
                                  ? "text-rose-300"
                                  : "text-emerald-300"
                              }
                            >
                              ₹{tx.amount.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-slate-400">
                            {tx.type}
                          </td>
                          <td className="px-2 py-1 text-slate-300">
                            {tx.category}
                          </td>
                        </tr>
                      ))}
                      {!filteredTransactions.length && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-2 py-4 text-center text-slate-500"
                          >
                            No transactions matching the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* Spending over time (multi-month view) */}
          {trendData.length > 1 && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 text-xs font-bold">
                  4
                </span>
                Spending over time
              </h2>

              <div className="border border-slate-800 rounded-2xl p-4 bg-slate-950/70">
                <p className="text-xs text-slate-400 mb-3">
                  This statement covers multiple months. Here&apos;s how your
                  income and spending changed month by month.
                </p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <XAxis
                        dataKey="label"
                        stroke="#cbd5f5"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        stroke="#cbd5f5"
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          border: "1px solid #1f2937",
                          borderRadius: "0.5rem",
                          fontSize: "0.75rem",
                        }}
                        formatter={(value: any, name) => [
                          `₹${Number(value).toFixed(0)}`,
                          name === "spending" ? "Spending" : "Income",
                        ]}
                      />
                      <Legend />
                      <Bar dataKey="spending" name="Spending" fill="#f97373" />
                      <Bar dataKey="income" name="Income" fill="#22c55e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

          {/* Top merchants section */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 text-xs font-bold">
                {trendData.length > 1 ? "5" : "4"}
              </span>
              Top merchants you pay the most
            </h2>

            <div className="border border-slate-800 rounded-2xl p-4 bg-slate-950/70">
              {topMerchants.length ? (
                <>
                  <p className="text-xs text-slate-400 mb-2">
                    Tip: click a merchant row to filter the transactions table
                    above.
                  </p>
                  <div className="max-h-72 overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-900 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold text-slate-300">
                            #
                          </th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-300">
                            Merchant / Person
                          </th>
                          <th className="px-2 py-2 text-right font-semibold text-slate-300">
                            Total paid
                          </th>
                          <th className="px-2 py-2 text-right font-semibold text-slate-300">
                            % of spending
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {topMerchants.map((m, idx) => {
                          const pct =
                            summary.totalSpending > 0
                              ? (m.amount / summary.totalSpending) * 100
                              : 0;
                          const isActive = selectedMerchant === m.merchant;
                          return (
                            <tr
                              key={m.merchant}
                              className={`border-t border-slate-800 cursor-pointer hover:bg-slate-900/60 ${
                                isActive ? "bg-slate-900" : ""
                              }`}
                              onClick={() =>
                                setSelectedMerchant(
                                  isActive ? null : m.merchant
                                )
                              }
                            >
                              <td className="px-2 py-1 text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="px-2 py-1 text-slate-100">
                                {m.merchant}
                              </td>
                              <td className="px-2 py-1 text-right text-rose-300">
                                ₹{m.amount.toFixed(0)}
                              </td>
                              <td className="px-2 py-1 text-right text-slate-400">
                                {pct.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  We couldn&apos;t detect individual merchants yet. Try with a
                  full month of UPI/card transactions.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {/* Empty state when nothing uploaded yet */}
      {!summary && !loading && !error && (
        <section className="border border-dashed border-slate-700 rounded-2xl p-5 bg-slate-950/40 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-1">
              Ready to see where your money leaks?
            </h3>
            <p className="text-xs text-slate-400 max-w-xl">
              Export one or more months of transactions from your bank / UPI app
              as CSV or PDF, upload it above, and MoneyLeaks will highlight
              avoidable fees, food delivery, subscriptions and high-spend
              merchants.
            </p>
          </div>
          <ul className="text-xs text-slate-400 space-y-1">
            <li>• Works with single-month or multi-month statements</li>
            <li>• We don&apos;t store your files; data stays in this session</li>
            <li>• You can re-upload anytime to compare different periods</li>
          </ul>
        </section>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="border border-slate-800 rounded-2xl p-4 bg-slate-950/70">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${accent ?? "text-slate-100"}`}>
        ₹{value.toFixed(0)}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function LeakItem({
  label,
  amount,
  description,
}: {
  label: string;
  amount: number;
  description: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/80 p-3">
      <span className="text-slate-200 text-sm font-medium">{label}</span>
      <span className="font-semibold text-rose-300 mt-1">
        ₹{amount.toFixed(0)}
      </span>
      <span className="text-xs text-slate-500 mt-1">{description}</span>
    </div>
  );
}

type CategoryOrAll = Category | "ALL";

const CATEGORY_LABELS: { value: CategoryOrAll; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "RENT", label: "Rent" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "FOOD_DELIVERY", label: "Food delivery" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "SUBSCRIPTION", label: "Subscriptions" },
  { value: "BANK_FEES", label: "Bank fees" },
  { value: "INCOME", label: "Income" },
  { value: "TRANSFER", label: "Transfers" },
  { value: "OTHER", label: "Other" },
];

function CategoryFilter({
  selected,
  onChange,
}: {
  selected: CategoryOrAll;
  onChange: (c: CategoryOrAll) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
      {CATEGORY_LABELS.map((cat) => {
        const isActive = selected === cat.value;
        return (
          <button
            key={cat.value}
            type="button"
            className={`px-2.5 py-1 rounded-full text-xs border ${
              isActive
                ? "bg-emerald-500 text-slate-900 border-emerald-400"
                : "bg-slate-900/60 text-slate-300 border-slate-700 hover:border-emerald-400/60"
            }`}
            onClick={() => onChange(cat.value)}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
