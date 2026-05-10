# GigOpportunity AI

> Upload any Fiverr niche CSV → auto-clean → analyze demand vs saturation → beautiful interactive charts + Opportunity Score (🟢🟡🔴) → Gemini AI insights.

---

## Features

| Feature | Description |
|---|---|
| **Auto-clean CSV** | Fixes column names, extracts date-suffixed time-series columns (`totalOrders_2026-03-11`), fills missing values |
| **Opportunity Score** | `Score = Avg(OrdersInQueue) × Avg(DailyGrowth)` · Green >12, Yellow 6-12, Red <6 |
| **4 Interactive Charts** | Demand growth line, queue bar, saturation pie, score gauge (Recharts) |
| **PDF Report** | One-click print/export of the full analysis report |
| **AI Insights** | Google Gemini gives niche advice: title, tags, pricing, red flags, growth strategy |

---

## Quick Start

### Option A — Docker (Recommended)

**1. Clone / download the project**

```
cd gig-opportunity-ai
```

**2. Set your Gemini API key**

```bash
# Windows
copy .env.example .env
# Edit .env and replace YOUR_GEMINI_API_KEY_HERE with your real key

# Mac/Linux
cp .env.example .env && nano .env
```

Get a free Gemini API key at: https://makersuite.google.com/app/apikey

**3. Build and run (separate containers)**

```bash
docker compose up --build
```

This starts **three app-specific containers**:
- `gigopportunity-postgres`
- `gigopportunity-backend`
- `gigopportunity-frontend`

If you want the single-container variant instead:

```bash
docker compose --profile allinone up --build
```

**4. Open the app**

```
http://localhost:3001
```

---

### Option B — Local Development (No Docker)

**Backend:**

```bash
cd backend
cp .env.example .env       # add your GEMINI_API_KEY
npm install
npm run dev                # runs on http://localhost:4001
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev                # runs on http://localhost:3001
```

The Vite dev server automatically proxies `/api/*` to the backend on port 4001.

---

## CSV Format

Your CSV should contain columns with date-suffixed time series, such as:

```
gigTitle, totalOrders_2026-03-11, totalOrders_2026-03-12, ordersInQueue_2026-03-11, ordersInQueue_2026-03-12, gigReviews_2026-03-11
```

The cleaner auto-detects any column matching the pattern `fieldName_YYYY-MM-DD`.

---

## Opportunity Score Formula

```
Score = Avg(ordersInQueue across all dates & rows)
      × Avg(daily growth in totalOrders across all rows)
```

| Score | Label | Meaning |
|---|---|---|
| > 12 | 🟢 GREEN | Strong opportunity — enter now |
| 6–12 | 🟡 YELLOW | Moderate — strategic entry |
| < 6 | 🔴 RED | Saturated or stagnant — avoid |

---

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts + Tabler Icons
- **Backend**: Node.js + Express + Multer + PapaParse
- **AI**: Google Gemini 1.5 Flash (`@google/generative-ai`)
- **Container**: Docker + Docker Compose + Nginx

---

## Project Structure

```
gig-opportunity-ai/
├── backend/
│   ├── src/
│   │   ├── index.js                     # Express app entry
│   │   ├── gemini.js                    # Gemini AI integration
│   │   ├── routes/analyze.js            # Upload + insights API
│   │   └── utils/
│   │       ├── cleanCSV.js              # CSV cleaning logic
│   │       └── calculateOpportunityScore.js
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx                      # Tab navigation shell
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── UploadTab.jsx
│   │   │   ├── DashboardTab.jsx
│   │   │   ├── ReportTab.jsx
│   │   │   └── AIInsightsTab.jsx
│   │   └── utils/chartData.js
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```
