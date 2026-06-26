let selectedProduct = null;
let isCustom = false;
let basePaintsCached = [];
let artworksCached = [];

const CUSTOM_BASE_PRICE = 4900;

export function initOrderForm(basePaints) {
  basePaintsCached = basePaints;
  const form = document.getElementById("orderForm");
  const quantityInput = document.getElementById("quantity");
  const citySelect = document.getElementById("city");
  const baladiyaSelect = document.getElementById("baladiya");
  const artworkSelect = document.getElementById("artworkSelect");

  quantityInput.addEventListener("input", updatePriceSummary);

  // Populate artwork dropdown
  const wilayasData = window.WILAYAS_DATA || null;

  function showBaladiya(code) {
    let hasOptions = false;
    Array.from(baladiyaSelect.options).forEach(opt => {
      if (opt.dataset.wilaya) {
        const match = opt.dataset.wilaya === code;
        opt.style.display = match ? "" : "none";
        if (match) hasOptions = true;
      }
    });
    const placeholder = baladiyaSelect.options[0];
    if (placeholder) placeholder.style.display = hasOptions ? "none" : "";
    baladiyaSelect.value = "";
  }

  if (wilayasData) {
    citySelect.innerHTML = '<option value="" disabled selected>اختر ولايتك</option>';
    wilayasData.wilayas.forEach(w => {
      const opt = document.createElement("option");
      opt.value = `${w.code} - ${w.name}`;
      opt.textContent = `${w.code} - ${w.name}`;
      citySelect.appendChild(opt);
    });

    wilayasData.wilayas.forEach(w => {
      w.communes.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        opt.dataset.wilaya = w.code;
        opt.style.display = "none";
        baladiyaSelect.appendChild(opt);
      });
    });
  }

  function onCityChange() {
    const val = citySelect.value;
    if (!val) return;
    const code = val.split(" - ")[0];
    showBaladiya(code);
  }

  citySelect.addEventListener("change", onCityChange);
  citySelect.addEventListener("input", onCityChange);
  if (citySelect.value) onCityChange();

  // Artwork dropdown change
  artworkSelect.addEventListener("change", (e) => {
    const artId = e.target.value;
    if (!artId) {
      selectedProduct = null;
      document.getElementById("submitOrderBtn").disabled = true;
      document.getElementById("totalPriceVal").textContent = "0 د.ج";
      document.getElementById("selectedPreview").style.display = "none";
      return;
    }
    const art = artworksCached.find(a => a.id === artId);
    if (art) selectPredefinedArtwork(art);
  });

  form.addEventListener("submit", handleOrderSubmit);
}

export function populateArtworkDropdown(artworks) {
  artworksCached = artworks;
  const select = document.getElementById("artworkSelect");
  artworks.forEach(art => {
    const opt = document.createElement("option");
    opt.value = art.id;
    const name = art.name_ar || `تصميم فني ${art.id}`;
    opt.textContent = `${name} — ${art.default_size} · ${art.palette.length} ألوان`;
    select.appendChild(opt);
  });
}

export function selectPredefinedArtwork(artwork) {
  selectedProduct = artwork;
  isCustom = false;

  const select = document.getElementById("artworkSelect");
  select.value = artwork.id;

  document.getElementById("selectedPreview").style.display = "flex";
  document.getElementById("previewThumb").src = artwork.image_thumbnail;
  document.getElementById("previewName").textContent = "تصميم فني";
  document.getElementById("previewSpec").textContent = `📏 ${artwork.default_size} · 🎨 ${artwork.palette.length} ألوان · فاخر`;

  document.getElementById("submitOrderBtn").disabled = false;
  updatePriceSummary();

  document.getElementById("order-section").scrollIntoView({ behavior: "smooth" });
}

export function selectCustomDesign(pbnResult) {
  selectedProduct = pbnResult;
  isCustom = true;

  document.getElementById("selectedPreview").style.display = "flex";
  document.getElementById("previewThumb").src = "";
  document.getElementById("previewThumb").style.display = "none";
  document.getElementById("previewName").textContent = "صورتك الشخصية المحوّلة";
  document.getElementById("previewSpec").textContent = `حجم الطباعة: 30x30 سم · ${pbnResult.colorsByIndex.length} ألوان`;

  document.getElementById("submitOrderBtn").disabled = false;
  updatePriceSummary();
  document.getElementById("order-section").scrollIntoView({ behavior: "smooth" });
}

function updatePriceSummary() {
  if (!selectedProduct) return;

  const basePrice = isCustom ? CUSTOM_BASE_PRICE : selectedProduct.base_price;
  const quantity = Math.max(1, parseInt(document.getElementById("quantity").value, 10) || 1);
  const grandTotal = basePrice * quantity;

  document.getElementById("totalPriceVal").textContent = `${grandTotal} د.ج`;
}

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
    errorAlert.textContent = "الرجاء اختيار تصميم أولاً.";
    errorAlert.style.display = "block";
    return;
  }

  const customerName = document.getElementById("customerName").value.trim();
  const phoneNumber = document.getElementById("phoneNumber").value.trim();
  const city = document.getElementById("city").value.trim();
  const baladiya = document.getElementById("baladiya").value.trim();
  const address = document.getElementById("address").value.trim();
  const frameOption = "modern_black";
  const quantity = parseInt(document.getElementById("quantity").value, 10);
  const notes = "";

  if (customerName.length < 3) {
    errorAlert.textContent = "الرجاء إدخال الاسم الكامل.";
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const resData = await response.json();

    if (response.ok && resData.success) {
      document.getElementById("successOrderId").textContent = resData.order_id;
      document.getElementById("successModal").style.display = "flex";

      if (typeof fbq === "function") {
        const totalEl = document.getElementById("totalPriceVal");
        const value = parseFloat(totalEl.textContent.replace(/[^0-9]/g, "")) || 0;
        fbq("track", "Purchase", { value, currency: "DZD" });
      }

      document.getElementById("orderForm").reset();
      selectedProduct = null;
      document.getElementById("selectedPreview").style.display = "none";
      document.getElementById("totalPriceVal").textContent = "0 د.ج";
      submitBtn.disabled = true;
    } else {
      const errorMsg = resData.errors ? resData.errors.join(" | ") : "حدث خطأ غير متوقع.";
      errorAlert.textContent = errorMsg;
      errorAlert.style.display = "block";
      submitBtn.disabled = false;
    }
  } catch (error) {
    errorAlert.textContent = "فشل الاتصال بالخادم. تحقق من اتصالك.";
    errorAlert.style.display = "block";
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = "✅ تأكيد الطلب — الدفع عند الاستلام";
  }
}
