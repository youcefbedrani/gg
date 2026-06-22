// Client-side Order Form Controller.
// Manages checkout state, price calculations, and form submissions to /api/orders.

let selectedProduct = null; // Can be a Predefined Artwork object OR a Custom PBN result object
let isCustom = false;
let basePaintsCached = [];

// Base prices
const CUSTOM_BASE_PRICE = 4900; // Standard price for custom photo upload (Algerian Dinar)

export function initOrderForm(basePaints) {
  basePaintsCached = basePaints;
  const form = document.getElementById("orderForm");
  const frameOptionSelect = document.getElementById("frameOption");
  const quantityInput = document.getElementById("quantity");

  // Recalculate price when frame option or quantity changes
  frameOptionSelect.addEventListener("change", updatePriceSummary);
  quantityInput.addEventListener("input", updatePriceSummary);

  form.addEventListener("submit", handleOrderSubmit);
}

/**
 * Pre-selects a predefined artwork in the checkout form.
 */
export function selectPredefinedArtwork(artwork) {
  selectedProduct = artwork;
  isCustom = false;

  document.getElementById("selectedProductBanner").style.display = "flex";
  document.getElementById("selectedThumb").innerHTML = `<img src="${artwork.image_thumbnail}" alt="${artwork.name_ar}">`;
  document.getElementById("selectedName").textContent = artwork.name_ar;
  document.getElementById("selectedSpec").textContent = `الحجم: ${artwork.default_size} | الصعوبة: ${artwork.difficulty_ar}`;

  // Populate frame options dropdown
  const frameSelect = document.getElementById("frameOption");
  frameSelect.innerHTML = '<option value="" disabled selected>اختر الإطار المناسب</option>';
  
  artwork.frame_options.forEach((opt) => {
    const priceText = opt.extra_price > 0 ? ` (+${opt.extra_price} د.ج)` : " (مشمول)";
    frameSelect.innerHTML += `<option value="${opt.id}" data-price="${opt.extra_price}">${opt.name_ar}${priceText}</option>`;
  });

  document.getElementById("submitOrderBtn").disabled = false;
  updatePriceSummary();

  // Scroll to form section
  document.getElementById("order-section").scrollIntoView({ behavior: "smooth" });
}

/**
 * Pre-selects a custom processed design in the checkout form.
 */
export function selectCustomDesign(pbnResult) {
  selectedProduct = pbnResult; // contains { colorsByIndex, svgFilled, svgOutline, width, height }
  isCustom = true;

  document.getElementById("selectedProductBanner").style.display = "flex";
  document.getElementById("selectedThumb").innerHTML = `📷`;
  document.getElementById("selectedName").textContent = "صورتك الشخصية المحوّلة";
  document.getElementById("selectedSpec").textContent = `حجم الطباعة: 30x30 سم | عدد الألوان: ${pbnResult.colorsByIndex.length}`;

  // Populate default frame options
  const frameSelect = document.getElementById("frameOption");
  frameSelect.innerHTML = `
    <option value="" disabled selected>اختر الإطار المناسب</option>
    <option value="no_frame" data-price="0">بدون برواز (مشمول)</option>
    <option value="wood_white" data-price="800">برواز خشبي أبيض (+800 د.ج)</option>
    <option value="wood_brown" data-price="800">برواز خشبي بني (+800 د.ج)</option>
    <option value="modern_black" data-price="1000">برواز عصري أسود (+1000 د.ج)</option>
  `;

  document.getElementById("submitOrderBtn").disabled = false;
  updatePriceSummary();

  // Scroll to form section
  document.getElementById("order-section").scrollIntoView({ behavior: "smooth" });
}

function updatePriceSummary() {
  if (!selectedProduct) return;

  const basePrice = isCustom ? CUSTOM_BASE_PRICE : selectedProduct.base_price;
  const frameSelect = document.getElementById("frameOption");
  const selectedOption = frameSelect.options[frameSelect.selectedIndex];
  
  let framePrice = 0;
  if (selectedOption && selectedOption.dataset.price) {
    framePrice = parseInt(selectedOption.dataset.price, 10);
  }

  const quantity = Math.max(1, parseInt(document.getElementById("quantity").value, 10) || 1);

  const baseTotal = basePrice * quantity;
  const frameTotal = framePrice * quantity;
  const grandTotal = baseTotal + frameTotal;

  document.getElementById("basePriceVal").textContent = `${baseTotal} د.ج`;
  document.getElementById("framePriceVal").textContent = `${frameTotal} د.ج`;
  document.getElementById("totalPriceVal").textContent = `${grandTotal} د.ج`;
}

// Convert RGB array [r, g, b] to Hex string
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
      .toUpperCase()
  );
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  const errorAlert = document.getElementById("errorAlert");
  errorAlert.style.display = "none";
  errorAlert.textContent = "";

  if (!selectedProduct) {
    errorAlert.textContent = "الرجاء اختيار تصميم أولاً بالضغط على 'اطلب الآن' أو 'تحويل الصورة'.";
    errorAlert.style.display = "block";
    return;
  }

  const customerName = document.getElementById("customerName").value.trim();
  const phoneNumber = document.getElementById("phoneNumber").value.trim();
  const city = document.getElementById("city").value.trim();
  const address = document.getElementById("address").value.trim();
  const frameOption = document.getElementById("frameOption").value;
  const quantity = parseInt(document.getElementById("quantity").value, 10);
  const notes = document.getElementById("notes").value.trim();

  // Basic validation checks
  if (customerName.length < 3) {
    errorAlert.textContent = "الرجاء إدخال الاسم الكامل (ثلاثة أحرف على الأقل).";
    errorAlert.style.display = "block";
    return;
  }

  if (!frameOption) {
    errorAlert.textContent = "الرجاء اختيار نوع الإطار المطلوبة لوحتك.";
    errorAlert.style.display = "block";
    return;
  }

  // Create checkout payload
  const payload = {
    customer_name: customerName,
    phone_number: phoneNumber,
    city: city,
    address: address,
    frame_id: frameOption,
    quantity: quantity,
    notes: notes,
    custom_design: isCustom,
  };

  if (isCustom) {
    // Map custom RGB palette elements to hex strings for server processing
    payload.colors = selectedProduct.colorsByIndex.map((rgb) => rgbToHex(rgb[0], rgb[1], rgb[2]));
    payload.svg_outline = selectedProduct.svgOutline;
  } else {
    payload.artwork_id = selectedProduct.id;
  }

  const submitBtn = document.getElementById("submitOrderBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "جاري إرسال طلبك...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json();

    if (response.ok && resData.success) {
      // Display success modal
      document.getElementById("successOrderId").textContent = resData.order_id;
      document.getElementById("successModal").style.display = "flex";

      // Reset form
      document.getElementById("orderForm").reset();
      selectedProduct = null;
      document.getElementById("selectedProductBanner").style.display = "none";
      document.getElementById("basePriceVal").textContent = "0 ر.س";
      document.getElementById("framePriceVal").textContent = "0 ر.س";
      document.getElementById("totalPriceVal").textContent = "0 ر.س";
      submitBtn.disabled = true;
    } else {
      const errorMsg = resData.errors ? resData.errors.join(" | ") : "حدث خطأ غير متوقع أثناء المعالجة.";
      errorAlert.textContent = errorMsg;
      errorAlert.style.display = "block";
      submitBtn.disabled = false;
    }
  } catch (error) {
    console.error("Checkout submit error:", error);
    errorAlert.textContent = "فشل الاتصال بالخادم. الرجاء التحقق من اتصالك بالإنترنت.";
    errorAlert.style.display = "block";
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = "تأكيد الطلب — الدفع عند الاستلام";
  }
}
