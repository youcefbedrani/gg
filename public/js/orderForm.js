// Client-side Order Form Controller.
// Manages checkout state, price calculations, and form submissions to /api/orders.

let selectedProduct = null; // Can be a Predefined Artwork object OR a Custom PBN result object
let isCustom = false;
let basePaintsCached = [];

// Base prices
const CUSTOM_BASE_PRICE = 6500; // Standard price for custom photo upload (Algerian Dinar)

export function initOrderForm(basePaints) {
  basePaintsCached = basePaints;
  const form = document.getElementById("orderForm");
  const frameOptionSelect = document.getElementById("frameOption");
  const quantityInput = document.getElementById("quantity");
  const citySelect = document.getElementById("city");
  const baladiyaSelect = document.getElementById("baladiya");

  // Recalculate price when frame option or quantity changes
  frameOptionSelect.addEventListener("change", updatePriceSummary);
  quantityInput.addEventListener("input", updatePriceSummary);

  // Load wilayas data for baladiya dropdown
  let wilayasData = null;
  fetch("/api/wilayas")
    .then(r => r.json())
    .then(data => { wilayasData = data; })
    .catch(() => {});

  citySelect.addEventListener("change", () => {
    const val = citySelect.value;
    baladiyaSelect.innerHTML = '<option value="" disabled selected>اختر البلدية</option>';
    if (!val || !wilayasData) return;
    const code = val.split(" - ")[0];
    const wilaya = wilayasData.wilayas.find(w => w.code === code);
    if (!wilaya) return;
    wilaya.communes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      baladiyaSelect.appendChild(opt);
    });
  });

  form.addEventListener("submit", handleOrderSubmit);
}

/**
 * Pre-selects a predefined artwork in the checkout form.
 */
export function selectPredefinedArtwork(artwork) {
  selectedProduct = artwork;
  isCustom = false;

  document.getElementById("selectedProductBanner").style.display = "flex";
  document.getElementById("selectedThumb").innerHTML = `<img src="${artwork.image_thumbnail}" alt="">`;
  document.getElementById("selectedName").textContent = "تصميم فني";
  document.getElementById("selectedSpec").textContent = `📏 ${artwork.default_size} · 🎨 ${artwork.palette.length} ألوان · فاخر`;

  const frameSelect = document.getElementById("frameOption");
  frameSelect.value = "modern_black";

  document.getElementById("submitOrderBtn").disabled = false;
  updatePriceSummary();

  document.getElementById("order-section").scrollIntoView({ behavior: "smooth" });
}

/**
 * Pre-selects a custom processed design in the checkout form.
 */
export function selectCustomDesign(pbnResult) {
  selectedProduct = pbnResult;
  isCustom = true;

  document.getElementById("selectedProductBanner").style.display = "flex";
  document.getElementById("selectedThumb").innerHTML = `📷`;
  document.getElementById("selectedName").textContent = "صورتك الشخصية المحوّلة";
  document.getElementById("selectedSpec").textContent = `حجم الطباعة: 30x30 سم | عدد الألوان: ${pbnResult.colorsByIndex.length}`;

  const frameSelect = document.getElementById("frameOption");
  frameSelect.value = "modern_black";

  document.getElementById("submitOrderBtn").disabled = false;
  updatePriceSummary();

  document.getElementById("order-section").scrollIntoView({ behavior: "smooth" });
}

function updatePriceSummary() {
  if (!selectedProduct) return;

  const basePrice = isCustom ? CUSTOM_BASE_PRICE : selectedProduct.base_price;
  const quantity = Math.max(1, parseInt(document.getElementById("quantity").value, 10) || 1);
  const grandTotal = basePrice * quantity;

  document.getElementById("basePriceVal").textContent = `${grandTotal} د.ج`;
  document.getElementById("framePriceVal").textContent = `مشمول`;
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
  const baladiya = document.getElementById("baladiya").value.trim();
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
  if (!city) {
    errorAlert.textContent = "الرجاء اختيار الولاية.";
    errorAlert.style.display = "block";
    return;
  }
  if (!baladiya) {
    errorAlert.textContent = "الرجاء اختيار البلدية.";
    errorAlert.style.display = "block";
    return;
  }

  // Create checkout payload
  const payload = {
    customer_name: customerName,
    phone_number: phoneNumber,
    city: city,
    baladiya: baladiya,
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

      // Fire Meta Pixel Purchase event
      if (typeof fbq === "function") {
        const totalEl = document.getElementById("totalPriceVal");
        const value = parseFloat(totalEl.textContent.replace(/[^0-9]/g, "")) || 0;
        fbq("track", "Purchase", { value, currency: "DZD" });
      }

      // Reset form
      document.getElementById("orderForm").reset();
      selectedProduct = null;
      document.getElementById("selectedProductBanner").style.display = "none";
      document.getElementById("basePriceVal").textContent = "0 د.ج";
      document.getElementById("framePriceVal").textContent = "مشمول";
      document.getElementById("totalPriceVal").textContent = "0 د.ج";
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
