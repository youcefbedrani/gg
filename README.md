# 🎨 Paint-by-Numbers Arabic E-commerce Store | متجر بهو الفنون

A complete, production-ready, full-stack e-commerce web application for a Paint-by-Numbers store, fully localized in Arabic (RTL). This application runs the entire image-to-canvas processing pipeline client-side in the browser via Web Workers and logs orders directly into a Google Sheet with computed paint-mixing recipes.

متجر إلكتروني متكامل باللغة العربية (RTL) لبيع لوحات التلوين بالأرقام. يتيح المتجر شراء لوحات جاهزة أو تحويل الصور الشخصية للعميل مباشرة في المتصفح إلى لوحة مرقمة مع تحديد خلطات الألوان بدقة، ومن ثم تسجيل الطلبات تلقائياً في جدول بيانات جوجل (Google Sheets).

---

## 🚀 Quick Start / البدء السريع

### 1. Local Development / التشغيل المحلي
1. Clone this repository to your local machine.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment variables template and configure it:
   ```bash
   cp .env.example .env
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open your browser at [http://localhost:3000](http://localhost:3000).

---

## 📂 Repository Structure / هيكل المشروع

```
paint-by-number-store/
├── render.yaml                   # Render deployment configuration
├── README.md                     # Main documentation
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore file
├── package.json                  # Root node dependencies
├── server/
│   ├── index.js                  # Express.js server entry point
│   ├── routes/
│   │   └── orders.js             # Order routing (validates, computes recipes, forwards to Sheets)
│   ├── services/
│   │   ├── googleSheets.js       # Outbound Apps Script Web App poster
│   │   └── colorMixer.js         # Color recipes CIELAB mixer logic (backend)
│   └── data/
│       ├── artworks.json         # 6 Predefined artworks catalog
│       └── basePaints.json       # 21 Base acrylic paint tubes table
├── public/                       # Static front-end assets served by Express
│   ├── index.html                # Arabic e-commerce landing page
│   ├── css/
│   │   └── style.css             # artsy terracotta & cream design stylesheet
│   ├── js/
│   │   ├── main.js               # Gallery renderer, file uploader, Web Worker listener
│   │   ├── orderForm.js          # checkout price calculator and order POST submitter
│   │   └── pbn-engine/           # client-side image processing logic
│   │       ├── kmeans.js         # CIELAB K-means clustering
│   │       ├── facetBuilder.js   # Flood fill region finder
│   │       ├── facetReducer.js   # Tiny region pruner
│   │       ├── borderTracer.js   # Border outlines tracer
│   │       ├── facetBorderSegmenter.js # Douglas-Peucker polyline simplifier
│   │       ├── labelPlacer.js    # Mapbox Polylabel placement
│   │       └── colorMixer.js     # color recipe mixer (client mirror)
│   └── assets/
│       └── artworks/             # SVG previews for the 6 catalog artworks
└── google-apps-script/
    └── Code.gs                   # Apps Script code to copy to script.google.com
```

---

## 📊 Google Sheets Integration / ربط جدول بيانات جوجل

To log orders and mixing recipes directly into a Google Sheet:
1. Create a blank Google Sheet.
2. Go to **Extensions** -> **Apps Script**.
3. Paste the contents of [google-apps-script/Code.gs](file:///home/badran/Downloads/NOW/Ecom2025/Pain_By_Number/paintbynumbersgenerator/google-apps-script/Code.gs).
4. Run the `setupSheet` function to generate the headers.
5. Deploy as a Web App (Execute as: **Me**, Access: **Anyone**).
6. Copy the Web App URL and add it to your `.env` as `GOOGLE_SCRIPT_URL`.

For detailed step-by-step instructions with screenshots, refer to the [Google Sheets Setup Guide](file:///home/badran/Downloads/NOW/Ecom2025/Pain_By_Number/paintbynumbersgenerator/docs/SETUP_GOOGLE_SHEET.md).

---

## ☁️ Deployment on Render / الرفع على منصة Render

This repository is pre-configured for Render.com:
1. Push this repository to your GitHub account.
2. Log in to [Render](https://render.com) and create a **New Web Service**.
3. Connect your GitHub repository.
4. Render will automatically read the [render.yaml](file:///home/badran/Downloads/NOW/Ecom2025/Pain_By_Number/paintbynumbersgenerator/render.yaml) file to set up the build command (`npm install`) and start command (`node server/index.js`).
5. Under **Environment Variables**, add:
   - `GOOGLE_SCRIPT_URL` = Your Google Apps Script Web App URL.
   - `NODE_ENV` = `production`
6. Click **Deploy Web Service**.
