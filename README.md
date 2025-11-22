# 💸 MoneyLeaks – Smart Statement Analyzer

MoneyLeaks helps you **find where your money secretly leaks every month**.

Upload your **bank / UPI / card statement** as CSV or PDF and the app will:

- Parse & clean raw transactions
- Detect **spending categories** (food delivery, rent, utilities, shopping, etc.)
- Highlight **money leaks** (bank fees, subscriptions, food delivery)
- Show **top merchants / people** you pay the most
- Visualize **multi-month spending trends**
- Give **budgeting advice** based on your data  
  (using Gemini when available, with an offline fallback)

---

## ✨ Features

- 🧾 **CSV + PDF support**  
  Works with common Indian bank/UPI exports (Kotak-style, etc.).  
  PDFs must be text-based (exported from netbanking, not scanned images).

- 🧠 **Smart categorization**
  - Food delivery: Swiggy, Zomato, Blinkit, Instamart, etc.
  - Shopping: Amazon, Flipkart, Myntra, Ajio, Nykaa, etc.
  - Transport: Ola, Uber, Rapido, IRCTC, fuel, etc.
  - Subscriptions: Netflix, Prime Video, Spotify, etc.
  - Bank fees, rent, utilities, transfers, income…

- 🧍 **Merchant grouping**
  - Cleans UPI-style narrations (e.g. `UPI/DEVRAJ VERMA/29xxxx/Sent using Paytm`)
  - Extracts a proper merchant/person name (`DEVRAJ VERMA`)
  - Shows **top 10 merchants** by total spending
  - Click a merchant to **filter** the transaction table

- 📊 **Multi-month analytics**
  - Aggregates income & spending **per month** (`YYYY-MM`)
  - Shows an **income vs spending** chart over time (if statement spans multiple months)

- 🕳️ **Money leaks insight**
  - Bank fees & charges
  - Subscriptions
  - Food delivery  
  Shows potential **monthly** and **yearly** savings if you fix these.

- 🤖 **Budget advice (AI + fallback)**
  - Backend calls Gemini (Google Generative AI) to generate a friendly saving plan
  - If the model/API fails, a **rule-based offline advisor** still gives useful tips

---

## 🧱 Tech Stack

**Frontend**

- Next.js (App Router, TypeScript)
- React
- Tailwind CSS
- Recharts (for charts)

**Backend**

- FastAPI (Python)
- Uvicorn
- `pdfplumber` – parse tables from PDF statements
- `google-generativeai` – Gemini integration (optional; has fallback)

---

## 📂 Project Structure

Monorepo layout:

```bash
moneyleaks/               # Repo root (Next.js app)
  app/
    page.tsx              # Main UI page
  public/
  package.json
  tsconfig.json
  next.config.mjs
  tailwind.config.*       
  ...

  moneyleaks-backend/     # FastAPI backend
    main.py               # All backend logic + routes
    requirements.txt
    ...
