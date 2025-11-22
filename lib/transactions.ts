// lib/transactions.ts

// All possible spending categories your backend returns.
export type Category =
  | "RENT"
  | "GROCERIES"
  | "FOOD_DELIVERY"
  | "SHOPPING"
  | "TRANSPORT"
  | "UTILITIES"
  | "SUBSCRIPTION"
  | "BANK_FEES"
  | "INCOME"
  | "TRANSFER"
  | "OTHER";

// Basic transaction type returned by the FastAPI backend.
export type TransactionType = "DEBIT" | "CREDIT";

export type Transaction = {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: Category;
  // NEW: merchant is present in backend response and used in page.tsx
  merchant?: string;
};

// "Leaks" section summary
export type LeaksSummary = {
  bankFees: number;
  subscriptions: number;
  foodDelivery: number;
};

// Monthly entry for trend chart (YYYY-MM -> income/spending)
export type MonthlyEntry = {
  income: number;
  spending: number;
};

// Top merchants item
export type TopMerchant = {
  merchant: string;
  amount: number;
};

// Overall summary shape coming from /analyze backend API
export type AnalysisSummary = {
  totalIncome: number;
  totalSpending: number;
  net: number;
  byCategory: Record<string, number>;
  leaks: LeaksSummary;
  topMerchants: TopMerchant[];
  monthly: Record<string, MonthlyEntry>;
};

