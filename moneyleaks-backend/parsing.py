# parsing.py
import csv
import io
import re
from typing import List, Dict

TransactionType = str  # "DEBIT" | "CREDIT"
Category = str         # category strings


def parse_csv_bytes(data: bytes) -> List[Dict[str, str]]:
    """Parse CSV bytes into list of dict rows."""
    text = data.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    return [row for row in reader]


def parse_pdf_text_to_rows(text: str) -> List[Dict[str, str]]:
    """
    Parse plain text (from PDF or OCR) into row dicts.
    Assumes lines roughly like:

    01 Oct, 2025 UPI/RAGHVENDRA/.../Sent using Payt UPI-527431570952 -135.00 20,127.38
    01 Oct, 2025 OPENING BALANCE +20,262.38 20,262.38
    """
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    rows: List[Dict[str, str]] = []

    date_pattern = re.compile(r"^\d{2}\s+\w{3},\s+\d{4}$")

    for line in lines:
        lower = line.lower()
        # skip headers
        if (
            lower.startswith("date")
            or "transaction details" in lower
            or "cheque/reference" in lower
            or ("debit" in lower and "credit" in lower and "balance" in lower)
        ):
            continue

        parts = line.split()
        if len(parts) < 5:
            continue

        date_candidate = " ".join(parts[:3])

        if not date_pattern.match(date_candidate):
            continue

        # find tokens containing digits (likely amounts)
        numeric_idx = [i for i, tok in enumerate(parts) if any(c.isdigit() for c in tok)]
        if len(numeric_idx) < 2:
            continue

        balance_idx = numeric_idx[-1]
        amount_idx = numeric_idx[-2]

        description_tokens = parts[3:amount_idx]
        description = " ".join(description_tokens) or "UNKNOWN TRANSACTION"

        amount_token = parts[amount_idx]
        balance_token = parts[balance_idx]

        # treat "-" as debit, "+" or none as credit
        tx_type = "DEBIT"
        if not amount_token.startswith("-"):
            tx_type = "CREDIT"

        rows.append(
            {
                "Date": date_candidate,
                "Description": description,
                "Amount": amount_token,
                "Balance": balance_token,
                "Credit/Debit": "Credit" if tx_type == "CREDIT" else "Debit",
            }
        )

    return rows


def map_row_to_transaction(row: Dict[str, str]) -> Dict:
    """Convert raw row to normalized transaction dict."""
    values = list(row.values())

    description = (
        row.get("Description")
        or row.get("Transaction Details")
        or row.get("Narration")
        or (values[1] if len(values) > 1 else "")
    )

    amount_str = (
        row.get("Amount")
        or row.get("Withdrawal Amt.")
        or row.get("Debit")
        or row.get("DEBIT")
        or row.get("Deposit Amt.")
        or row.get("Credit")
        or row.get("CREDIT")
        or (values[2] if len(values) > 2 else "0")
        or "0"
    )

    cleaned = re.sub(r"[^0-9\.-]", "", amount_str)
    try:
        amount = abs(float(cleaned))
    except Exception:
        return None

    type_field = (
        row.get("Credit/Debit")
        or row.get("Cr/Dr")
        or row.get("Dr/Cr")
        or row.get("Type")
        or ""
    ).lower()

    tx_type: TransactionType = "DEBIT"
    if "credit" in type_field or "cr" in type_field or (
        "-" in amount_str and amount_str.strip().startswith("-") is False
    ):
        tx_type = "CREDIT"

    date = (
        row.get("Date")
        or row.get("DATE")
        or row.get("Transaction Date")
        or row.get("Value Date")
        or ""
    )

    tx = {
        "date": date,
        "description": description,
        "amount": amount,
        "type": tx_type,
        "category": "OTHER",
    }
    return tx


def categorize_transaction(tx: Dict) -> Dict:
    desc = tx["description"].lower()

    if tx["type"] == "CREDIT":
        tx["category"] = "INCOME"
        return tx

    def m(pattern: str) -> bool:
        return re.search(pattern, desc) is not None

    if m(r"netflix|spotify|youtube premium|hotstar|prime|zee5|subscription|renewal"):
        tx["category"] = "SUBSCRIPTION"
    elif m(r"swiggy|zomato|blinkit|instamart|eats|foodpanda|dominos|pizza hut"):
        tx["category"] = "FOOD_DELIVERY"
    elif "rent" in desc:
        tx["category"] = "RENT"
    elif m(r"big bazaar|d-mart|dmart|grofers|grocery|more supermarket|reliance fresh"):
        tx["category"] = "GROCERIES"
    elif m(r"amazon|flipkart|myntra|ajio|nykaa|meesho|croma|reliance digital"):
        tx["category"] = "SHOPPING"
    elif m(r"uber|ola|rapido|metro|bus|auto|cab|olacabs"):
        tx["category"] = "TRANSPORT"
    elif m(r"electricity|water bill|gas bill|mobile bill|postpaid|prepaid|wifi|broadband|jio|airtel|vi "):
        tx["category"] = "UTILITIES"
    elif m(r"charge|fee|penalty|fine|interest|late fee|bank charge|annual fee"):
        tx["category"] = "BANK_FEES"
    elif m(r"neft|rtgs|imps|upi|transfer|to account|from account"):
        tx["category"] = "TRANSFER"
    else:
        tx["category"] = "OTHER"

    return tx


# --------- NEW: merchant extraction & top merchants ---------


def extract_merchant_name(tx: Dict) -> str:
    """
    Try to extract a merchant / counterparty name from the description.

    Works reasonably well for:
    - UPI/NAME/... patterns (e.g. UPI/RAGHVENDRA/29256.../Sent using Paytm)
    - Known brands: SWIGGY, ZOMATO, UBER, OLA, AMAZON, etc.
    - Fallback: first 1–2 alphabetic words.
    """
    desc = (tx.get("description") or "").upper()

    if not desc:
        return "Unknown"

    # Known brands first
    known_brands = [
        "SWIGGY",
        "ZOMATO",
        "BLINKIT",
        "INSTAMART",
        "UBER",
        "OLA",
        "RAPIDO",
        "AMAZON",
        "FLIPKART",
        "MYNTRA",
        "AJIO",
        "NYKAA",
        "MEESHO",
        "DOMINOS",
        "DOMINO'S",
        "PIZZA HUT",
        "NETFLIX",
        "SPOTIFY",
        "PRIME VIDEO",
        "HOTSTAR",
        "AIRTEL",
        "JIO",
        "VI ",
    ]
    for brand in known_brands:
        if brand in desc:
            return brand.title().strip()

    # UPI/NAME/... pattern
    m = re.search(r"UPI/([^/]+)/", desc)
    if m:
        name = m.group(1)
        # strip ids / numbers / @ handles
        name = re.sub(r"[\d@\-_]", " ", name)
        name = re.sub(r"\s+", " ", name).strip()
        if name:
            return name.title()

    # "TO NAME" pattern (NEFT/IMPS etc)
    m = re.search(r"TO\s+([A-Z ]{3,30})", desc)
    if m:
        name = m.group(1)
        name = re.sub(r"\s+", " ", name).strip()
        return name.title()

    # Fallback: first 1–2 alphabetic words
    words = re.split(r"\s+", desc)
    words = [w for w in words if w.isalpha()]
    if not words:
        return "Unknown"
    if len(words) == 1:
        return words[0].title()
    return (" ".join(words[:2])).title()


def compute_summary(transactions: List[Dict]) -> Dict:
    categories = [
        "INCOME",
        "RENT",
        "GROCERIES",
        "FOOD_DELIVERY",
        "SHOPPING",
        "TRANSPORT",
        "UTILITIES",
        "SUBSCRIPTION",
        "BANK_FEES",
        "TRANSFER",
        "OTHER",
    ]
    by_category: Dict[str, float] = {c: 0.0 for c in categories}

    total_income = 0.0
    total_spending = 0.0

    merchant_spend: Dict[str, float] = {}

    for tx in transactions:
        amt = float(tx["amount"])

        # categorisation already done outside, but ensure category exists
        if tx.get("category") not in by_category:
            tx["category"] = "OTHER"

        if tx["type"] == "CREDIT":
            total_income += amt
        else:
            total_spending += amt
            # track merchant for debits only (money going out)
            merchant = tx.get("merchant") or extract_merchant_name(tx)
            tx["merchant"] = merchant
            merchant_spend[merchant] = merchant_spend.get(merchant, 0.0) + amt

        by_category[tx["category"]] += amt

    leaks = {
        "bankFees": by_category["BANK_FEES"],
        "subscriptions": by_category["SUBSCRIPTION"],
        "foodDelivery": by_category["FOOD_DELIVERY"],
    }

    # Build top merchants list (top 10 by spend)
    top_merchants_raw = sorted(
        merchant_spend.items(), key=lambda x: x[1], reverse=True
    )[:10]

    top_merchants = [
        {"merchant": name, "amount": amount} for name, amount in top_merchants_raw
    ]

    return {
        "totalIncome": total_income,
        "totalSpending": total_spending,
        "net": total_income - total_spending,
        "byCategory": by_category,
        "leaks": leaks,
        "topMerchants": top_merchants,
    }
