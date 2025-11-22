// lib/transactions.ts

export type TransactionType = "DEBIT" | "CREDIT";

export type Category =
  | "INCOME"
  | "RENT"
  | "GROCERIES"
  | "FOOD_DELIVERY"
  | "SHOPPING"
  | "TRANSPORT"
  | "UTILITIES"
  | "SUBSCRIPTION"
  | "BANK_FEES"
  | "TRANSFER"
  | "OTHER";

export interface Transaction {
  date: string; // raw date string
  description: string;
  amount: number;
  type: TransactionType;
  category: Category;
  raw?: Record<string, string>;
}

export interface AnalysisSummary {
  totalIncome: number;
  totalSpending: number;
  net: number;
  byCategory: Record<Category, number>;
  leaks: {
    bankFees: number;
    subscriptions: number;
    foodDelivery: number;
  };
}

/**
 * Very basic CSV parser for comma-separated values.
 * Assumes first line = headers.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

/**
 * PDF → rows parser for bank statements like:
 * DATE | TRANSACTION DETAILS | CHEQUE/REF# | DEBIT | CREDIT | BALANCE
 *
 * Example text after pdf-parse:
 * 01 Oct, 2025 UPI/RAGHVENDRA/.../Sent using Payt UPI-527431570952 -135.00 20,127.38
 * 01 Oct, 2025 OPENING BALANCE +20,262.38 20,262.38
 */
export function parsePdfTextToRows(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: Record<string, string>[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Skip headers
    if (
      lower.startsWith("date") ||
      lower.startsWith("transaction details") ||
      lower.includes("cheque/reference") ||
      (lower.includes("debit") && lower.includes("credit") && lower.includes("balance"))
    ) {
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    // First 3 tokens assumed date: "01 Oct, 2025"
    const dateCandidate = parts.slice(0, 3).join(" ");

    if (!/^\d{2}\s\w{3},\s\d{4}$/.test(dateCandidate)) {
      continue;
    }

    // tokens that look numeric (amounts / balances)
    const numericIdx: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      const token = parts[i];
      if (/[0-9]/.test(token)) numericIdx.push(i);
    }
    if (numericIdx.length < 2) continue;

    const balanceIdx = numericIdx[numericIdx.length - 1];
    const amountIdx = numericIdx[numericIdx.length - 2];

    const date = dateCandidate;
    const descriptionTokens = parts.slice(3, amountIdx); // between date and amount
    const description = descriptionTokens.join(" ") || "UNKNOWN TRANSACTION";

    const amountToken = parts[amountIdx];   // "-135.00" or "+20,262.38"
    const balanceToken = parts[balanceIdx]; // "20,127.38"

    let type: TransactionType = "DEBIT";
    if (!amountToken.includes("-")) {
      type = "CREDIT";
    }

    rows.push({
      Date: date,
      Description: description,
      Amount: amountToken,
      Balance: balanceToken,
      "Credit/Debit": type === "CREDIT" ? "Credit" : "Debit",
    });
  }

  return rows;
}

/**
 * Map a raw row (from CSV/PDF) to a Transaction.
 */
export function mapRowToTransaction(row: Record<string, string>): Transaction | null {
  const description =
    row["Description"] ||
    row["Transaction Details"] ||
    row["Narration"] ||
    row["details"] ||
    Object.values(row)[1] ||
    "";

  const amountStr =
    row["Amount"] ||
    row["Withdrawal Amt."] ||
    row["Debit"] ||
    row["DEBIT"] ||
    row["Deposit Amt."] ||
    row["Credit"] ||
    row["CREDIT"] ||
    Object.values(row)[2] ||
    "0";

  const cleaned = amountStr.replace(/[^0-9.-]/g, "");
  const amount = Number(cleaned);
  if (!amount || Number.isNaN(amount)) return null;

  let type: TransactionType = "DEBIT";
  const typeField =
    (row["Credit/Debit"] ||
      row["Cr/Dr"] ||
      row["Dr/Cr"] ||
      row["Type"] ||
      "").toLowerCase();

  if (typeField.includes("credit") || typeField.includes("cr") || amount < 0) {
    type = "CREDIT";
  }

  const date =
    row["Date"] ||
    row["DATE"] ||
    row["Transaction Date"] ||
    row["Value Date"] ||
    new Date().toISOString().slice(0, 10);

  return {
    date,
    description,
    amount: Math.abs(amount),
    type,
    category: "OTHER",
    raw: row,
  };
}

/**
 * Rule-based categorization based on description keywords.
 */
export function categorizeTransaction(tx: Transaction): Transaction {
  const desc = tx.description.toLowerCase();

  if (tx.type === "CREDIT") {
    return { ...tx, category: "INCOME" };
  }

  if (/netflix|spotify|youtube premium|hotstar|prime|zee5|subscription|renewal/.test(desc)) {
    return { ...tx, category: "SUBSCRIPTION" };
  }

  if (/swiggy|zomato|blinkit|eats|foodpanda/.test(desc)) {
    return { ...tx, category: "FOOD_DELIVERY" };
  }

  if (/rent/i.test(desc)) {
    return { ...tx, category: "RENT" };
  }

  if (/big bazaar|d-mart|dmart|grofers|grocery|more supermarket|reliance fresh/.test(desc)) {
    return { ...tx, category: "GROCERIES" };
  }

  if (/amazon|flipkart|myntra|ajio|nykaa/.test(desc)) {
    return { ...tx, category: "SHOPPING" };
  }

  if (/uber|ola|rapido|metro|bus|auto|cab/.test(desc)) {
    return { ...tx, category: "TRANSPORT" };
  }

  if (/electricity|water bill|gas bill|mobile bill|postpaid|prepaid|wifi|broadband|jio|airtel/.test(desc)) {
    return { ...tx, category: "UTILITIES" };
  }

  if (/charge|fee|penalty|fine|interest|late fee|bank charge|annual fee/.test(desc)) {
    return { ...tx, category: "BANK_FEES" };
  }

  if (/neft|rtgs|imps|upi|transfer|to account|from account/.test(desc)) {
    return { ...tx, category: "TRANSFER" };
  }

  return tx;
}

/**
 * Compute totals + leaks from categorized transactions.
 */
export function computeSummary(transactions: Transaction[]): AnalysisSummary {
  const byCategory: Record<Category, number> = {
    INCOME: 0,
    RENT: 0,
    GROCERIES: 0,
    FOOD_DELIVERY: 0,
    SHOPPING: 0,
    TRANSPORT: 0,
    UTILITIES: 0,
    SUBSCRIPTION: 0,
    BANK_FEES: 0,
    TRANSFER: 0,
    OTHER: 0,
  };

  let totalIncome = 0;
  let totalSpending = 0;

  for (const tx of transactions) {
    if (tx.type === "CREDIT") {
      totalIncome += tx.amount;
    } else {
      totalSpending += tx.amount;
    }
    byCategory[tx.category] += tx.amount;
  }

  const leaks = {
    bankFees: byCategory["BANK_FEES"],
    subscriptions: byCategory["SUBSCRIPTION"],
    foodDelivery: byCategory["FOOD_DELIVERY"],
  };

  return {
    totalIncome,
    totalSpending,
    net: totalIncome - totalSpending,
    byCategory,
    leaks,
  };

  // lib/transactions.ts

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

export type TransactionType = "DEBIT" | "CREDIT";

export type Transaction = {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: Category;
  merchant: string;
};

export type MonthlySummary = {
  income: number;
  spending: number;
};

export type MerchantTotal = {
  merchant: string;
  amount: number;
};

export type LeaksSummary = {
  bankFees: number;
  subscriptions: number;
  foodDelivery: number;
};

export type AnalysisSummary = {
  totalIncome: number;
  totalSpending: number;
  net: number;
  byCategory: Record<string, number>;
  leaks: LeaksSummary;
  topMerchants?: MerchantTotal[];
  // NEW: key is "YYYY-MM"
  monthly?: Record<string, MonthlySummary>;
};

}
