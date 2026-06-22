/**
 * Middleware to validate incoming order payload.
 * Returns Arabic error messages for checkout compliance.
 */
function validateOrder(req, res, next) {
  const {
    customer_name,
    phone_number,
    city,
    address,
    frame_id,
    quantity,
    artwork_id,
    custom_design,
    colors
  } = req.body;

  const errors = [];

  if (!customer_name || customer_name.trim().length < 3) {
    errors.push("الرجاء إدخال الاسم الكامل (3 أحرف على الأقل)");
  }

  // General phone check: digits and optional leading + (minimum 7 characters)
  const phoneRegex = /^\+?[0-9]{7,15}$/;
  if (!phone_number || !phoneRegex.test(phone_number.replace(/\s+/g, ""))) {
    errors.push("الرجاء إدخال رقم هاتف صحيح");
  }

  if (!city || city.trim().length === 0) {
    errors.push("الرجاء إدخال اسم المدينة");
  }

  if (!address || address.trim().length === 0) {
    errors.push("الرجاء إدخال العنوان التفصيلي");
  }

  if (!frame_id) {
    errors.push("الرجاء اختيار نوع الإطار");
  }

  const qty = parseInt(quantity);
  if (isNaN(qty) || qty <= 0) {
    errors.push("الكمية يجب أن تكون 1 أو أكثر");
  }

  if (!custom_design && !artwork_id) {
    errors.push("الرجاء تحديد لوحة فنية أو رفع صورة مخصصة");
  }

  if (custom_design && (!colors || !Array.isArray(colors) || colors.length === 0)) {
    errors.push("التصميم المخصص يجب أن يحتوي على لوحة ألوان صالحة");
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  next();
}

module.exports = validateOrder;
