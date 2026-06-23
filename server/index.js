const express = require("express");
const cors = require("cors");
const compression = require("compression");
const dotenv = require("dotenv");
const path = require("path");
const rateLimit = require("express-rate-limit");
const ordersRouter = require("./routes/orders");
const adminRouter = require("./routes/admin");
const { initDatabase, closePool } = require("./services/database");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Gzip compression for all responses
app.use(compression());

// CORS configuration
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(
  cors({
    origin: allowedOrigin === "*" ? true : allowedOrigin,
    methods: ["GET", "POST"],
  })
);

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting for order submissions to prevent spam (max 10 submissions per 15 minutes per IP)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    errors: ["تم تجاوز الحد المسموح به من الطلبات. الرجاء المحاولة بعد 15 دقيقة."],
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.use("/api/orders", orderLimiter, ordersRouter);
app.use("/api/admin", adminRouter);

// In-memory cache for catalog JSON files (reduces disk I/O under high traffic)
const fs = require("fs");
const cache = {};
function serveCachedJSON(filePath) {
  return (req, res) => {
    if (!cache[filePath] || Date.now() - cache[filePath].time > 60000) {
      cache[filePath] = { data: fs.readFileSync(filePath, "utf8"), time: Date.now() };
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(cache[filePath].data);
  };
}

// Predefined catalog endpoints (cached in memory for 60s)
app.get("/api/artworks", serveCachedJSON(path.join(__dirname, "data/artworks.json")));
app.get("/api/basePaints", serveCachedJSON(path.join(__dirname, "data/basePaints.json")));

// Serve static frontend files with caching
const publicPath = path.join(__dirname, "../public");
app.use(express.static(publicPath, {
  maxAge: "7d",
  immutable: true,
  setHeaders(res, filePath) {
    // Cache HTML files for less time (they may reference new assets)
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    }
    // Cache images, CSS, JS for a year (they have content-hash or are immutable)
    if (filePath.match(/\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|woff2?)$/)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
}));

// Fallback to index.html for SPA behavior
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start Server
app.listen(PORT, async () => {
  await initDatabase();
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});
