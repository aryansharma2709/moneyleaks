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

<img width="1891" height="872" alt="image" src="https://github.com/user-attachments/assets/de6eec04-de48-49b9-9c9a-85d26ee3ad4e" />

<img width="1861" height="670" alt="image" src="https://github.com/user-attachments/assets/2b23b122-cb28-49f2-a910-43db43bb8902" />

<img width="1726" height="550" alt="image" src="https://github.com/user-attachments/assets/a53cd3c7-0e1d-4154-8049-c9a0da2a27ed" />

<img width="1754" height="810" alt="image" src="https://github.com/user-attachments/assets/df8da3dc-16d1-4a80-81a7-ab67c0c9eeb3" />

<img width="1847" height="680" alt="image" src="https://github.com/user-attachments/assets/f7309622-91e3-4d5e-a059-0e89d33706a7" />

<img width="1864" height="392" alt="image" src="https://github.com/user-attachments/assets/e0196d85-eaa5-4ab1-9021-cc1c9000c298" />


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






