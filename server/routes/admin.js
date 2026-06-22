const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const zrExpress = require("../services/zrExpress");

const SETTINGS_FILE_PATH = path.join(__dirname, "../data/settings.json");

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "PBN-Algeria-2026";
const ADMIN_TOKEN = "PBN-ADMIN-SESSION-TOKEN";
const ORDERS_FILE_PATH = path.join(__dirname, "../data/orders.json");

// Middleware to authenticate admin requests
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      errors: ["الرجاء تسجيل الدخول أولاً للوصول إلى هذه الصفحة"],
    });
  }

  const token = authHeader.split(" ")[1];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({
      success: false,
      errors: ["جلسة العمل منتهية الصلاحية أو غير صالحة. الرجاء تسجيل الدخول مجدداً."],
    });
  }

  next();
};

// Admin Login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.status(200).json({
      success: true,
      token: ADMIN_TOKEN,
      message: "تم تسجيل الدخول بنجاح",
    });
  } else {
    return res.status(401).json({
      success: false,
      errors: ["اسم المستخدم أو كلمة المرور غير صحيحة"],
    });
  }
});

// Get all orders (Admin only)
router.get("/orders", authenticateAdmin, (req, res) => {
  try {
    if (!fs.existsSync(ORDERS_FILE_PATH)) {
      fs.writeFileSync(ORDERS_FILE_PATH, "[]", "utf8");
    }

    const fileContent = fs.readFileSync(ORDERS_FILE_PATH, "utf8");
    const orders = JSON.parse(fileContent);

    // Sort orders by timestamp descending so newer orders are shown first
    const sortedOrders = orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      success: true,
      orders: sortedOrders,
    });
  } catch (err) {
    console.error("Failed to read orders file:", err);
    return res.status(500).json({
      success: false,
      errors: ["حدث خطأ أثناء قراءة ملف الطلبات"],
    });
  }
});

// Update order status (Admin only)
// Supported statuses: جديد, اتصال 1, اتصال 2, اتصال 3, مؤكد, ملغي, تم التوصيل
router.post("/orders/:id/status", authenticateAdmin, async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  const VALID_STATUSES = ["جديد", "اتصال 1", "اتصال 2", "اتصال 3", "مؤكد", "ملغي", "تم التوصيل"];

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      errors: ["حالة غير صالحة. الحالات المسموحة: " + VALID_STATUSES.join("، ")],
    });
  }

  try {
    if (!fs.existsSync(ORDERS_FILE_PATH)) {
      return res.status(404).json({
        success: false,
        errors: ["ملف الطلبات غير موجود"],
      });
    }

    const fileContent = fs.readFileSync(ORDERS_FILE_PATH, "utf8");
    const orders = JSON.parse(fileContent);

    const orderIndex = orders.findIndex((o) => o.order_id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        errors: ["الطلب المطلوب غير موجود"],
      });
    }

    orders[orderIndex].status = status;

    let zrResult = null;
    if (status === "مؤكد") {
      const zrConfig = getZrConfig();
      if (zrConfig) {
        try {
          const order = orders[orderIndex];
          order.total_price = order.total_price || 3900;
          zrResult = await zrExpress.createParcel(order, zrConfig);
          orders[orderIndex].zr_parcel_id = zrResult.zr_parcel_id;
          orders[orderIndex].zr_tracking = zrResult.zr_tracking;
          orders[orderIndex].zr_status = zrResult.zr_status;
        } catch (zrErr) {
          console.error("ZR Express parcel creation failed:", zrErr.message);
        }
      }
    }

    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), "utf8");

    const messages = {
      "جديد": "تم إرجاع الطلب إلى حالة جديد",
      "اتصال 1": "تم تسجيل المكالمة الأولى",
      "اتصال 2": "تم تسجيل المكالمة الثانية",
      "اتصال 3": "تم تسجيل المكالمة الثالثة",
      "مؤكد": "تم تأكيد الطلب بنجاح",
      "ملغي": "تم إلغاء الطلب",
      "تم التوصيل": "تم تسليم الطلب بنجاح",
    };

    return res.status(200).json({
      success: true,
      message: messages[status] || "تم تحديث حالة الطلب",
      zr: zrResult ? { tracking: zrResult.zr_tracking, parcel_id: zrResult.zr_parcel_id } : null,
    });
  } catch (err) {
    console.error("Failed to update order status:", err);
    return res.status(500).json({
      success: false,
      errors: ["حدث خطأ أثناء تحديث حالة الطلب"],
    });
  }
});

// Keep old confirm endpoint for backward compatibility
router.post("/orders/:id/confirm", authenticateAdmin, async (req, res) => {
  const orderId = req.params.id;
  try {
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE_PATH, "utf8"));
    const orderIndex = orders.findIndex((o) => o.order_id === orderId);
    if (orderIndex === -1) return res.status(404).json({ success: false, errors: ["الطلب غير موجود"] });
    orders[orderIndex].status = "مؤكد";

    let zrResult = null;
    const zrConfig = getZrConfig();
    if (zrConfig) {
      try {
        const order = orders[orderIndex];
        order.total_price = order.total_price || 3900;
        zrResult = await zrExpress.createParcel(order, zrConfig);
        orders[orderIndex].zr_parcel_id = zrResult.zr_parcel_id;
        orders[orderIndex].zr_tracking = zrResult.zr_tracking;
        orders[orderIndex].zr_status = zrResult.zr_status;
      } catch (zrErr) {
        console.error("ZR Express parcel creation failed:", zrErr.message);
      }
    }

    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), "utf8");
    return res.status(200).json({
      success: true,
      message: "تم تأكيد الطلب بنجاح",
      zr: zrResult ? { tracking: zrResult.zr_tracking, parcel_id: zrResult.zr_parcel_id } : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, errors: ["حدث خطأ"] });
  }
});

// Save generated SVG outline for an order (Admin only)
router.post("/orders/:id/outline", authenticateAdmin, (req, res) => {
  const orderId = req.params.id;
  const { svg_outline } = req.body;

  if (!svg_outline) {
    return res.status(400).json({
      success: false,
      errors: ["مخطط SVG مطلوب"],
    });
  }

  try {
    if (!fs.existsSync(ORDERS_FILE_PATH)) {
      return res.status(404).json({
        success: false,
        errors: ["ملف الطلبات غير موجود"],
      });
    }

    const fileContent = fs.readFileSync(ORDERS_FILE_PATH, "utf8");
    const orders = JSON.parse(fileContent);

    const orderIndex = orders.findIndex((o) => o.order_id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        errors: ["الطلب المطلوب غير موجود"],
      });
    }

    orders[orderIndex].svg_outline = svg_outline;
    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), "utf8");

    return res.status(200).json({
      success: true,
      message: "تم حفظ مخطط التلوين بنجاح",
    });
  } catch (err) {
    console.error("Failed to save SVG outline:", err);
    return res.status(500).json({
      success: false,
      errors: ["حدث خطأ أثناء حفظ مخطط التلوين"],
    });
  }
});

// Get current color stocks (Admin only)
router.get("/stock", authenticateAdmin, (req, res) => {
  try {
    const basePaintsPath = path.join(__dirname, "../data/basePaints.json");
    const basePaintsList = JSON.parse(fs.readFileSync(basePaintsPath, "utf8"));
    return res.status(200).json({
      success: true,
      stock: basePaintsList,
    });
  } catch (err) {
    console.error("Failed to read stock:", err);
    return res.status(500).json({
      success: false,
      errors: ["حدث خطأ أثناء قراءة المخزون"],
    });
  }
});

// Update color stock quantity directly (Admin only)
router.post("/stock/update", authenticateAdmin, (req, res) => {
  const { paint_id, amount_ml } = req.body;
  if (!paint_id || isNaN(amount_ml) || amount_ml < 0) {
    return res.status(400).json({
      success: false,
      errors: ["الرجاء إدخال اسم اللون وكمية صالحة (0 أو أكثر)"],
    });
  }

  try {
    const basePaintsPath = path.join(__dirname, "../data/basePaints.json");
    const basePaintsList = JSON.parse(fs.readFileSync(basePaintsPath, "utf8"));
    const paintIndex = basePaintsList.findIndex(p => p.id === paint_id);

    if (paintIndex === -1) {
      return res.status(404).json({
        success: false,
        errors: ["اللون المطلوب غير موجود"],
      });
    }

    basePaintsList[paintIndex].stock_ml = parseFloat(amount_ml);
    fs.writeFileSync(basePaintsPath, JSON.stringify(basePaintsList, null, 2), "utf8");

    return res.status(200).json({
      success: true,
      message: "تم تحديث المخزون بنجاح",
      paint: basePaintsList[paintIndex],
    });
  } catch (err) {
    console.error("Failed to update stock:", err);
    return res.status(500).json({
      success: false,
      errors: ["حدث خطأ أثناء تحديث المخزون"],
    });
  }
});

// Add new paint color (Admin only)
router.post("/stock/add", authenticateAdmin, (req, res) => {
  const { name_ar, hex, ncs, stock_ml } = req.body;
  if (!name_ar || !hex || !ncs || isNaN(stock_ml) || stock_ml < 0) {
    return res.status(400).json({
      success: false,
      errors: ["الرجاء إدخال اسم اللون وكود Hex ومرجع NCS وكمية مبدئية صالحة"],
    });
  }

  try {
    const basePaintsPath = path.join(__dirname, "../data/basePaints.json");
    const basePaintsList = JSON.parse(fs.readFileSync(basePaintsPath, "utf8"));
    
    // Check if hex already exists
    const exists = basePaintsList.some(p => p.hex.toLowerCase() === hex.trim().toLowerCase());
    if (exists) {
      return res.status(400).json({
        success: false,
        errors: ["هذا اللون (Hex) مسجل بالفعل في المخزون"],
      });
    }

    const cleanHex = hex.trim().replace(/^#/, "").toLowerCase();
    const paintId = "paint_" + cleanHex + "_" + Math.floor(100 + Math.random() * 900);

    const newPaint = {
      id: paintId,
      name_ar: name_ar.trim(),
      hex: hex.trim().toUpperCase(),
      ncs: ncs.trim().toUpperCase(),
      stock_ml: parseFloat(stock_ml)
    };

    basePaintsList.push(newPaint);
    fs.writeFileSync(basePaintsPath, JSON.stringify(basePaintsList, null, 2), "utf8");

    return res.status(200).json({
      success: true,
      message: "تمت إضافة اللون بنجاح للمخزون",
      paint: newPaint
    });
  } catch (err) {
    console.error("Failed to add new paint color:", err);
    return res.status(500).json({
      success: false,
      errors: ["حدث خطأ أثناء إضافة اللون الجديد للمخزن"],
    });
  }
});

// Read ZR Express config from settings.json with env fallback
function getZrConfig() {
  // First check env (deployment override)
  if (process.env.ZR_SECRET_KEY && process.env.ZR_TENANT_ID) {
    return { secretKey: process.env.ZR_SECRET_KEY, tenantId: process.env.ZR_TENANT_ID };
  }
  // Then check settings.json (admin panel)
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, "utf8"));
      if (s.zr_enabled && s.zr_secret_key && s.zr_tenant_id) {
        return { secretKey: s.zr_secret_key, tenantId: s.zr_tenant_id };
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

// Test ZR Express connection (Admin only)
router.post("/zr/test", authenticateAdmin, async (req, res) => {
  try {
    const config = getZrConfig();
    if (!config) {
      return res.status(400).json({ success: false, errors: ["الرجاء تفعيل ZR Express وحفظ الإعدادات أولاً"] });
    }
    const result = await zrExpress.testConnection(config);
    if (result) {
      return res.status(200).json({ success: true, message: "✅ اتصال ZR Express ناجح!" });
    } else {
      return res.status(400).json({ success: false, errors: ["❌ فشل الاتصال. تحقق من بيانات الاعتماد."] });
    }
  } catch (err) {
    return res.status(500).json({ success: false, errors: ["حدث خطأ أثناء اختبار الاتصال: " + err.message] });
  }
});

// Get current settings (Admin only)
router.get("/settings", authenticateAdmin, (req, res) => {
  try {
    if (!fs.existsSync(SETTINGS_FILE_PATH)) {
      fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify({ zr_enabled: false, zr_secret_key: "", zr_tenant_id: "" }, null, 2), "utf8");
    }
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, "utf8"));
    return res.status(200).json({ success: true, settings });
  } catch (err) {
    return res.status(500).json({ success: false, errors: ["حدث خطأ أثناء قراءة الإعدادات"] });
  }
});

// Update settings (Admin only)
router.post("/settings", authenticateAdmin, (req, res) => {
  try {
    const { zr_enabled, zr_secret_key, zr_tenant_id } = req.body;
    const settings = {
      zr_enabled: !!zr_enabled,
      zr_secret_key: zr_secret_key || "",
      zr_tenant_id: zr_tenant_id || "",
    };
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), "utf8");
    return res.status(200).json({ success: true, message: "تم حفظ الإعدادات بنجاح", settings });
  } catch (err) {
    return res.status(500).json({ success: false, errors: ["حدث خطأ أثناء حفظ الإعدادات"] });
  }
});

module.exports = router;
