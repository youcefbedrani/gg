const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const rateLimit = require("express-rate-limit");
const ordersRouter = require("./routes/orders");
const adminRouter = require("./routes/admin");
const { initDatabase, closePool } = require("./services/database");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// Predefined catalog endpoints
app.get("/api/artworks", (req, res) => {
  res.sendFile(path.join(__dirname, "data/artworks.json"));
});

app.get("/api/basePaints", (req, res) => {
  res.sendFile(path.join(__dirname, "data/basePaints.json"));
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../public")));

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
