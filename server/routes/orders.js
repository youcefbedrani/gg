const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const validateOrder = require("../middleware/validateOrder");
const { matchColor } = require("../services/colorMixer");
const { submitOrderToSheets } = require("../services/googleSheets");
const db = require("../services/database");

// Load predefined artworks
let artworks = [];
try {
  const filePath = path.join(__dirname, "../data/artworks.json");
  artworks = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (err) {
  console.error("Failed to load artworks in orders router:", err);
}

// Frame ID to Arabic name map
const FRAMES_MAP = {
  no_frame: "بدون برواز",
  wood_white: "برواز خشبي أبيض",
  wood_brown: "برواز خشبي بني",
  modern_black: "برواز عصري أسود",
};

// Generate a local order ID
function generateOrderId() {
  return "PBN-" + Math.floor(100000 + Math.random() * 900000);
}

router.post("/", validateOrder, async (req, res) => {
  try {
    const {
      customer_name,
      phone_number,
      city,
      address,
      frame_id,
      quantity,
      artwork_id,
      custom_design,
      colors, // Array of hex values for custom designs
      notes,
      svg_outline,
    } = req.body;

    let designType = "";
    let artworkName = "";
    let size = "";
    let colorList = [];

    if (custom_design) {
      designType = "صورة مخصصة";
      artworkName = "تصميم مخصص من العميل";
      size = "30x30 سم (افتراضي)";
      
      // Use the client-submitted colors for the custom image
      colorList = colors.map((hex) => ({ hex }));
    } else {
      designType = "تصميم جاهز";
      const artwork = artworks.find((a) => a.id === artwork_id);
      if (!artwork) {
        return res.status(400).json({
          success: false,
          errors: ["اللوحة الفنية المطلوبة غير موجودة في الكتالوج"],
        });
      }
      artworkName = artwork.name_ar;
      size = artwork.default_size;
      colorList = artwork.palette;
    }

    // Compute color mixing recipes for each color in the palette
    const colorsDetail = colorList.map((colorItem) => {
      const matchResult = matchColor(colorItem.hex);
      return {
        hex: colorItem.hex,
        name_ar: colorItem.name_ar || "",
        ...matchResult,
      };
    });

    const frameName = FRAMES_MAP[frame_id] || frame_id;
    const orderId = generateOrderId();

    // Build local order record
    const localOrderRecord = {
      order_id: orderId,
      timestamp: new Date().toISOString(),
      customer_name,
      phone_number,
      city,
      address,
      design_type: designType,
      artwork_name: artworkName,
      artwork_id: artwork_id || null,
      size,
      frame: frameName,
      quantity: parseInt(quantity),
      color_count: colorsDetail.length,
      colors_detail: colorsDetail,
      notes: notes || "",
      svg_outline: svg_outline || null,
      status: "جديد",
    };

    // 1. Save locally FIRST (always works, no external dependency)
    try {
      await db.saveOrder(localOrderRecord);

      // Deduct stock of colors (5ml per color)
      try {
        const basePaintsPath = path.join(__dirname, "../data/basePaints.json");
        if (fs.existsSync(basePaintsPath)) {
          const basePaintsList = JSON.parse(fs.readFileSync(basePaintsPath, "utf8"));
          
          colorsDetail.forEach((colorItem) => {
            const totalVolume = 5.0;
            if (colorItem.available_direct) {
              const paint = basePaintsList.find(p => p.hex.toLowerCase() === colorItem.match.hex.toLowerCase());
              if (paint) {
                paint.stock_ml = Math.max(0, (paint.stock_ml || 0) - totalVolume);
              }
            } else if (colorItem.match && colorItem.match.components) {
              colorItem.match.components.forEach((comp) => {
                const paint = basePaintsList.find(p => p.hex.toLowerCase() === comp.hex.toLowerCase());
                if (paint) {
                  const compVolume = totalVolume * (comp.percentage / 100);
                  paint.stock_ml = Math.max(0, (paint.stock_ml || 0) - compVolume);
                }
              });
            }
          });
          
          fs.writeFileSync(basePaintsPath, JSON.stringify(basePaintsList, null, 2), "utf8");
        }
      } catch (stockErr) {
        console.error("Failed to deduct stock:", stockErr);
      }
    } catch (localWriteErr) {
      console.error("Failed to save order locally:", localWriteErr);
      return res.status(500).json({
        success: false,
        errors: ["حدث خطأ في حفظ الطلب"],
      });
    }

    // 2. Optionally submit to Google Sheets (non-blocking)
    if (process.env.USE_GOOGLE_SHEETS === "true") {
      const appsScriptPayload = {
        customerName: customer_name,
        phone: phone_number,
        city: city,
        address: address,
        designType: designType,
        artworkName: artworkName,
        size: size,
        frame: frameName,
        quantity: parseInt(quantity),
        colorCount: colorsDetail.length,
        colorsDetail: colorsDetail,
        notes: notes || "",
        orderId: orderId,
      };

      try {
        await submitOrderToSheets(appsScriptPayload);
      } catch (sheetErr) {
        // Google Sheets failure does NOT block the order
        console.error("Google Sheets submission failed (order saved locally):", sheetErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      order_id: orderId,
    });
  } catch (error) {
    console.error("Order processing error:", error);
    return res.status(500).json({
      success: false,
      errors: ["حدث خطأ أثناء معالجة الطلب. الرجاء المحاولة مرة أخرى لاحقاً."],
    });
  }
});

module.exports = router;
