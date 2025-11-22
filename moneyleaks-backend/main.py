from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware

from collections import defaultdict
from datetime import datetime
from typing import List, Dict, Any, Optional
import csv
import io
import os

# --- Workaround for older Python (3.9) missing importlib.metadata.packages_distributions ---
import importlib.metadata as importlib_metadata  # type: ignore

if not hasattr(importlib_metadata, "packages_distributions"):
    def _packages_distributions():
        return {}
    importlib_metadata.packages_distributions = _packages_distributions  # type: ignore
# --- End workaround ---

import google.generativeai as genai

# -----------------------------
# Gemini setup
# -----------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Let model be configurable; fallback to some default string
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "models/text-bison-001")

if not GEMINI_API_KEY:
    # You can change this to a warning if you don't want hard failure
    raise RuntimeError("GEMINI_API_KEY environment variable is not set.")

genai.configure(api_key=GEMINI_API_KEY)

# -----------------------------
# PDF extraction (optional)
# -----------------------------
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

# -----------------------------
# FastAPI app + CORS
# -----------------------------
app = FastAPI(title="MoneyLeaks Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------
# Helpers
# -------------------------------------------------


def _parse_date_to_month_key(date_str: str) -> Optional[str]:
    """
    Try common date formats and return a YYYY-MM month key.
    Used for multi-month trend aggregation.
    """
    if not date_str:
        return None

    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d-%b-%y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m")
        except ValueError:
            continue
    return None


def _parse_date_to_iso(date_str: str) -> Optional[str]:
    """
    Try to normalise a date string to ISO: YYYY-MM-DD.
    If parsing fails, return original string so UI still shows something.
    """
    if not date_str:
        return None

    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d-%b-%y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Fallback: return as-is
    return date_str.strip()


def _to_float(value: Any) -> float:
    """
    Safely convert a string like '1,234.56' or '-450 ' to float.
    """
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)

    s = str(value)
    s = s.replace(",", "").strip()

    # Handle brackets like (123.45) as negative
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]

    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _normalise_headers(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map lowercase header -> original header.
    """
    return {k.lower().strip(): k for k in row.keys() if isinstance(k, str)}


def _get_field(
    row: Dict[str, Any],
    header_map: Dict[str, str],
    *candidates: str,
) -> Optional[str]:
    """
    Try to find a field in the row whose header contains one of the candidate substrings.
    """
    for candidate in candidates:
        c = candidate.lower()
        for key_lower, orig_key in header_map.items():
            if c in key_lower:
                val = row.get(orig_key)
                if val is not None:
                    return str(val)
    return None


def extract_merchant_name(description: str) -> str:
    """
    Extract a clean merchant / person name from a noisy narration.

    Examples it handles:
      "UPI/DEVRAJ VERMA/292703462833/Sent using Payt" -> "DEVRAJ VERMA"
      "UPI/RAGHVENDRA/292569274401/Sent using Paytm"  -> "RAGHVENDRA"
      "NEFT-STAR WINE PEACE-ABC123"                   -> "STAR WINE PEACE"
    """
    if not description:
        return ""

    desc = description.strip()
    lower = desc.lower()

    # 1) Strip common prefixes like "upi/", "imps/" etc.
    noisy_prefixes = [
        "upi/",
        "upi-",
        "imps/",
        "neft/",
        "rtgs/",
        "by transfer",
        "to transfer",
        "trf to",
        "transfer to",
    ]
    for prefix in noisy_prefixes:
        if lower.startswith(prefix):
            desc = desc[len(prefix):].strip()
            lower = desc.lower()
            break

    # 2) For UPI-style strings "NAME/number/extra" keep only NAME
    parts = desc.split("/")
    if len(parts) >= 2:
        candidate = parts[0].strip()
        if candidate:
            desc = candidate
            lower = desc.lower()

    # 3) Remove common trailing phrases like "sent using paytm"
    trailing_markers = [
        "sent using paytm",
        "sent using payt",
        "sent using gpay",
        "sent from paytm",
        "upi payment",
    ]
    for marker in trailing_markers:
        idx = lower.find(marker)
        if idx != -1:
            desc = desc[:idx].strip()
            lower = desc.lower()
            break

    # 4) For patterns like "STAR WINE PEACE-ABC123" keep only left side
    if "-" in desc:
        left, right = desc.split("-", 1)
        if left.strip():
            desc = left.strip()

    desc = " ".join(desc.split())
    return desc[:60]


# -------------------------------------------------
# Categorization + summary
# -------------------------------------------------


def categorize_transaction(tx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Assign a category based on description and type.
    Categories:
      RENT, GROCERIES, FOOD_DELIVERY, SHOPPING, TRANSPORT,
      UTILITIES, SUBSCRIPTION, BANK_FEES, INCOME, TRANSFER, OTHER
    """
    desc = (tx.get("description") or "").lower()
    tx_type = tx.get("type")
    category = "OTHER"

    # Credits: income vs transfer vs misc
    if tx_type == "CREDIT":
        if any(
            word in desc
            for word in [
                "salary",
                "sal ",
                "payroll",
                "salary credit",
                "credited by",
            ]
        ):
            category = "INCOME"
        elif any(word in desc for word in ["refund", "cashback", "rebate"]):
            category = "INCOME"
        elif any(
            word in desc
            for word in ["self transfer", "own account", "transfer from"]
        ):
            category = "TRANSFER"
        else:
            category = "INCOME"
        tx["category"] = category
        return tx

    # Debits: actual spending categories
    if "rent" in desc:
        category = "RENT"
    elif any(
        word in desc
        for word in [
            "grocery",
            "groceries",
            "supermarket",
            "dmart",
            "d-mart",
            "big bazaar",
            "bigbazaar",
            "reliance fresh",
        ]
    ):
        category = "GROCERIES"
    elif any(
        word in desc
        for word in [
            "swiggy",
            "zomato",
            "blinkit",
            "instamart",
            "foodpanda",
            "ubereats",
            "eatfit",
        ]
    ):
        category = "FOOD_DELIVERY"
    elif any(
        word in desc
        for word in [
            "amazon",
            "flipkart",
            "myntra",
            "ajio",
            "nykaa",
            "tatacliq",
            "tata cliq",
            "store",
            "shopping",
        ]
    ):
        category = "SHOPPING"
    elif any(
        word in desc
        for word in [
            "ola",
            "uber",
            "rapido",
            "cab",
            "metro",
            "irctc",
            "fuel",
            "petrol",
            "diesel",
            "hpcl",
            "bpcl",
            "indian oil",
        ]
    ):
        category = "TRANSPORT"
    elif any(
        word in desc
        for word in [
            "electricity",
            "power bill",
            "water bill",
            "gas bill",
            "broadband",
            "wifi",
            "dth",
            "mobile bill",
            "postpaid",
        ]
    ):
        category = "UTILITIES"
    elif any(word in desc for word in ["jio", "airtel", "vi postpaid"]):
        category = "UTILITIES"
    elif any(
        word in desc
        for word in [
            "netflix",
            "spotify",
            "youtube premium",
            "prime video",
            "hotstar",
            "disney+",
            "sonyliv",
            "zee5",
        ]
    ):
        category = "SUBSCRIPTION"
    elif any(
        word in desc
        for word in ["icloud", "google storage", "drive storage", "aws", "digitalocean"]
    ):
        category = "SUBSCRIPTION"
    elif any(
        word in desc
        for word in [
            "fee",
            "charges",
            "charge",
            "penalty",
            "fine",
            "annual charge",
            "atm fee",
            "maintenance charge",
            "imps chg",
            "neft chg",
        ]
    ):
        category = "BANK_FEES"
    elif any(
        word in desc
        for word in ["upi/", "upi-", "@ok", "@ybl", "@paytm", "@ibl"]
    ):
        category = "TRANSFER"

    tx["category"] = category
    return tx


def compute_summary(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a summary for all transactions, including:
      - totalIncome / totalSpending / net
      - byCategory (for debits)
      - leaks (bank fees, subscriptions, food delivery)
      - topMerchants (by total debit amount)
      - monthly: aggregated income / spending per month (YYYY-MM)
    """
    total_income = 0.0
    total_spending = 0.0

    by_category: Dict[str, float] = defaultdict(float)
    leaks = {
        "bankFees": 0.0,
        "subscriptions": 0.0,
        "foodDelivery": 0.0,
    }
    merchant_totals: Dict[str, float] = defaultdict(float)

    monthly: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {"income": 0.0, "spending": 0.0}
    )

    for tx in transactions:
        amount = float(tx.get("amount", 0) or 0)
        category = tx.get("category", "OTHER")
        tx_type = tx.get("type")
        merchant = tx.get("merchant") or tx.get("description") or ""
        date_str = tx.get("date")

        if tx_type == "CREDIT":
            total_income += amount
        elif tx_type == "DEBIT":
            total_spending += amount
            by_category[category] += amount

            if category == "BANK_FEES":
                leaks["bankFees"] += amount
            elif category == "SUBSCRIPTION":
                leaks["subscriptions"] += amount
            elif category == "FOOD_DELIVERY":
                leaks["foodDelivery"] += amount

            if merchant:
                merchant_totals[merchant] += amount

        # Monthly split
        month_key = _parse_date_to_month_key(date_str) if date_str else None
        if month_key:
            if tx_type == "CREDIT":
                monthly[month_key]["income"] += amount
            elif tx_type == "DEBIT":
                monthly[month_key]["spending"] += amount

    top_merchants = [
        {"merchant": m, "amount": amt}
        for m, amt in sorted(
            merchant_totals.items(), key=lambda x: x[1], reverse=True
        )[:10]
    ]

    by_category_out = {k: round(v, 2) for k, v in by_category.items()}
    monthly_out = {
        k: {
            "income": round(v["income"], 2),
            "spending": round(v["spending"], 2),
        }
        for k, v in monthly.items()
    }

    return {
        "totalIncome": round(total_income, 2),
        "totalSpending": round(total_spending, 2),
        "net": round(total_income - total_spending, 2),
        "byCategory": by_category_out,
        "leaks": {
            "bankFees": round(leaks["bankFees"], 2),
            "subscriptions": round(leaks["subscriptions"], 2),
            "foodDelivery": round(leaks["foodDelivery"], 2),
        },
        "topMerchants": top_merchants,
        "monthly": monthly_out,
    }


def build_local_advice(summary: Dict[str, Any]) -> str:
    """
    Fallback budgeting advice if Gemini API fails (404, etc.).
    Uses the summary numbers only, no AI.
    """
    total_income = summary.get("totalIncome", 0.0)
    total_spending = summary.get("totalSpending", 0.0)
    net = summary.get("net", 0.0)
    leaks = summary.get("leaks", {})
    top_merchants = summary.get("topMerchants", [])
    monthly = summary.get("monthly", {})

    bank_fees = leaks.get("bankFees", 0.0)
    subs = leaks.get("subscriptions", 0.0)
    food = leaks.get("foodDelivery", 0.0)

    worst_merchant = None
    if top_merchants:
        worst_merchant = max(top_merchants, key=lambda m: m.get("amount", 0.0))

    trend_line = ""
    if len(monthly) >= 2:
        months_sorted = sorted(monthly.items())
        first_m, first_vals = months_sorted[0]
        last_m, last_vals = months_sorted[-1]
        if last_vals.get("spending", 0) > first_vals.get("spending", 0) * 1.1:
            trend_line = (
                f"Your monthly spending has gone up from ~₹{first_vals.get('spending', 0):.0f} "
                f"to ~₹{last_vals.get('spending', 0):.0f}. "
            )
        elif last_vals.get("spending", 0) < first_vals.get("spending", 0) * 0.9:
            trend_line = (
                f"Your monthly spending has come down from ~₹{first_vals.get('spending', 0):.0f} "
                f"to ~₹{last_vals.get('spending', 0):.0f}. "
            )
        else:
            trend_line = "Your monthly spending is roughly stable. "

    possible_monthly_save = bank_fees + subs + food
    yearly_save = possible_monthly_save * 12

    lines: List[str] = []
    lines.append(
        "Here’s a quick summary of your situation based on the numbers I see."
    )
    lines.append(
        f"Your total income for this period is about ₹{total_income:.0f}, "
        f"and you spent around ₹{total_spending:.0f}, leaving you with a net of "
        f"₹{net:.0f}."
    )

    if trend_line:
        lines.append(trend_line)

    leak_details: List[str] = []
    if bank_fees > 0:
        leak_details.append(f"bank fees (₹{bank_fees:.0f})")
    if subs > 0:
        leak_details.append(f"subscriptions (₹{subs:.0f})")
    if food > 0:
        leak_details.append(f"food delivery (₹{food:.0f})")

    if leak_details:
        lines.append(
            "The easiest places to cut back without hurting your basic lifestyle are: "
            + ", ".join(leak_details)
            + "."
        )

    if worst_merchant:
        lines.append(
            f"You are also spending quite a bit at {worst_merchant.get('merchant')} "
            f"(₹{worst_merchant.get('amount', 0):.0f} in this period). "
            "Check if all those payments were actually necessary."
        )

    if possible_monthly_save > 0:
        lines.append(
            f"If you reduce these leak categories by even 50%, you could free up roughly "
            f"₹{possible_monthly_save * 0.5:.0f} per month, or about "
            f"₹{yearly_save * 0.5:.0f} per year."
        )

    lines.append("Here are a few practical next steps:")
    if bank_fees > 0:
        lines.append(
            "- Talk to your bank about charges and see if you can switch to a low-fee account or avoid penalty situations."
        )
    if subs > 0:
        lines.append(
            "- Review all your subscriptions and cancel the ones you rarely use or can share with family."
        )
    if food > 0:
        lines.append(
            "- Limit food delivery orders and replace a few of them each week with home-cooked or office meals."
        )
    lines.append(
        "- Decide a simple monthly spending limit and check this dashboard once a month to ensure you are on track."
    )

    return "\n".join(lines)


# -------------------------------------------------
# Parsing CSV / PDF rows
# -------------------------------------------------


def parse_csv_bytes(content: bytes) -> List[Dict[str, Any]]:
    text = content.decode("utf-8", errors="ignore")
    f = io.StringIO(text)
    reader = csv.DictReader(f)
    rows: List[Dict[str, Any]] = []

    for row in reader:
        clean: Dict[str, Any] = {}
        for k, v in row.items():
            if k is None:
                continue
            key = str(k).strip()
            val = "" if v is None else str(v).strip()
            clean[key] = val
        if any(clean.values()):
            rows.append(clean)

    return rows


def parse_pdf_bytes(content: bytes) -> List[Dict[str, Any]]:
    if pdfplumber is None:
        raise RuntimeError(
            "pdfplumber is not installed. Please install it with 'pip install pdfplumber'."
        )

    rows: List[Dict[str, Any]] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table or len(table) < 2:
                continue

            headers = [h.strip() if isinstance(h, str) else "" for h in table[0]]
            for raw_row in table[1:]:
                row_dict: Dict[str, Any] = {}
                for header, cell in zip(headers, raw_row):
                    if header:
                        row_dict[header] = (cell or "").strip()
                if any(row_dict.values()):
                    rows.append(row_dict)

    return rows


# -------------------------------------------------
# Row -> canonical transaction
# -------------------------------------------------


def row_to_transaction(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Map a raw row (from CSV/PDF) to our canonical Transaction shape:
      { date, description, amount, type, category, merchant }
    """
    header_map = _normalise_headers(row)

    # ---- Date ----
    raw_date = _get_field(
        row,
        header_map,
        "date",
        "txn date",
        "transaction date",
        "value date",
        "posting date",
    )
    date_iso = _parse_date_to_iso(raw_date) if raw_date else None

    # ---- Description ----
    description = _get_field(
        row,
        header_map,
        "description",
        "narration",
        "details",
        "remark",
        "particular",
        "info",
    ) or ""

    # ---- Amount & Type Detection ----

    # 1) Separate Credit / Debit columns
    credit_val = _get_field(row, header_map, "credit", "deposit", "received")
    debit_val = _get_field(row, header_map, "debit", "withdrawal", "paid")

    credit_present = credit_val is not None and str(credit_val).strip() != ""
    debit_present = debit_val is not None and str(debit_val).strip() != ""

    credit_amt = _to_float(credit_val) if credit_present else 0.0
    debit_amt = _to_float(debit_val) if debit_present else 0.0

    tx_type: Optional[str] = None
    amount: float = 0.0

    if credit_present or debit_present:
        # Treat any non-zero as valid, regardless of sign
        if credit_present and not debit_present and credit_amt != 0:
            tx_type = "CREDIT"
            amount = abs(credit_amt)
        elif debit_present and not credit_present and debit_amt != 0:
            tx_type = "DEBIT"
            amount = abs(debit_amt)
        elif debit_present and credit_present:
            # Rare: if both present, pick larger abs value
            if abs(debit_amt) >= abs(credit_amt):
                tx_type = "DEBIT"
                amount = abs(debit_amt)
            else:
                tx_type = "CREDIT"
                amount = abs(credit_amt)
    else:
        # 2) Single Amount column + indicator
        amount_val = _get_field(row, header_map, "amount", "amt")
        indicator = _get_field(
            row,
            header_map,
            "credit/debit",
            "cr/dr",
            "dr/cr",
            "transaction type",
            "txn type",
        )

        if amount_val is not None:
            parsed_amount = _to_float(amount_val)
            if indicator:
                ind = indicator.lower()
                if "credit" in ind or " cr" in ind or ind.endswith("cr"):
                    tx_type = "CREDIT"
                    amount = abs(parsed_amount)
                elif "debit" in ind or " dr" in ind or ind.endswith("dr"):
                    tx_type = "DEBIT"
                    amount = abs(parsed_amount)
            else:
                # No explicit indicator: use sign
                if parsed_amount < 0:
                    tx_type = "DEBIT"
                    amount = abs(parsed_amount)
                elif parsed_amount > 0:
                    # For many Indian banks, single positive amount often means debit
                    tx_type = "DEBIT"
                    amount = parsed_amount

    if not tx_type or amount <= 0:
        return None

    merchant = extract_merchant_name(description)

    tx: Dict[str, Any] = {
        "date": date_iso or (raw_date or ""),
        "description": description,
        "amount": round(amount, 2),
        "type": tx_type,
        "category": "OTHER",
        "merchant": merchant,
    }

    tx = categorize_transaction(tx)
    return tx


# -------------------------------------------------
# FastAPI routes
# -------------------------------------------------


@app.get("/")
def root():
    return {"status": "ok", "message": "MoneyLeaks backend is running"}


@app.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    """
    Accept a CSV or PDF statement, parse transactions, and return:
      { transactions: [...], summary: {...} }
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    rows: List[Dict[str, Any]] = []

    try:
        if filename.endswith(".csv") or "csv" in content_type:
            rows = parse_csv_bytes(content)
        elif filename.endswith(".pdf") or "pdf" in content_type:
            rows = parse_pdf_bytes(content)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a CSV or PDF statement.",
            )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse file. Error: {str(e)}",
        )

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="Could not detect any transactions. Please check your CSV/PDF format.",
        )

    transactions: List[Dict[str, Any]] = []
    for row in rows:
        tx = row_to_transaction(row)
        if tx:
            transactions.append(tx)

    if not transactions:
        raise HTTPException(
            status_code=400,
            detail=(
                "No valid transactions found after parsing. "
                "Your statement format may not be supported yet."
            ),
        )

    summary = compute_summary(transactions)
    return {"transactions": transactions, "summary": summary}


@app.post("/advice")
async def get_budget_advice(payload: Dict[str, Any] = Body(...)):
    """
    Take the summary from the frontend and return budgeting advice.

    1. It TRIES to call Gemini using GEMINI_MODEL.
    2. If that fails (404, etc.), it falls back to a local rule-based advisor.
    """
    summary = payload.get("summary")
    if not summary:
        raise HTTPException(status_code=400, detail="Missing summary in request body")

    top_merchants = summary.get("topMerchants", [])
    monthly = summary.get("monthly", {})
    leaks = summary.get("leaks", {})

    # Build a compact context string for the model
    context_lines = []

    context_lines.append(
        f"Total income this period: {summary.get('totalIncome', 0)}"
    )
    context_lines.append(
        f"Total spending this period: {summary.get('totalSpending', 0)}"
    )
    context_lines.append(
        f"Net balance (income - spending): {summary.get('net', 0)}"
    )

    context_lines.append("Leaks:")
    context_lines.append(f"  - Bank fees: {leaks.get('bankFees', 0)}")
    context_lines.append(f"  - Subscriptions: {leaks.get('subscriptions', 0)}")
    context_lines.append(f"  - Food delivery: {leaks.get('foodDelivery', 0)}")

    if top_merchants:
        context_lines.append("Top merchants (you spent the most at):")
        for m in top_merchants[:5]:
            context_lines.append(
                f"  - {m.get('merchant')}: {m.get('amount')}"
            )

    if monthly:
        context_lines.append("Monthly spending trend (YYYY-MM -> spending):")
        for month, vals in sorted(monthly.items()):
            context_lines.append(
                f"  - {month}: {vals.get('spending', 0)}"
            )

    context = "\n".join(context_lines)

    prompt = f"""
You are a friendly personal finance coach for an Indian user.

You will be given a summary of their bank/UPI/card transactions for a few months.
Based on this data, explain:

1) Where they are overspending (categories or merchants).
2) 3–5 specific, realistic actions they can take next month to save more.
3) Roughly how much they could save per month and per year by applying those actions 
   (just approximate numbers; use the leaks and major categories).

Important rules:
- DO NOT give investment advice or recommend specific financial products.
- Focus only on spending control, budgeting habits, and lifestyle changes.
- Be encouraging, non-judgmental, and practical.
- Keep the answer under 200–250 words.
- Write in simple, conversational English.

Here is the data:

{context}

Now give your advice:
""".strip()

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        advice = (getattr(response, "text", "") or "").strip()

        if not advice:
            raise RuntimeError("Empty response from Gemini")

        return {"advice": advice}

    except Exception as e:
        print("Gemini error in /advice:", e)
        fallback = build_local_advice(summary)
        return {
            "advice": fallback,
            "note": "Gemini model call failed; showing offline advice instead.",
        }
