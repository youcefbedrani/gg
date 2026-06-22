// Admin Dashboard JavaScript Controller (Algerian Paint-by-Numbers Store)

document.addEventListener("DOMContentLoaded", () => {
  // Elements Selection
  const loginOverlay = document.getElementById("loginOverlay");
  const adminMain = document.getElementById("adminMain");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchFilter = document.getElementById("searchFilter");
  const statusFilter = document.getElementById("statusFilter");
  const cityFilter = document.getElementById("cityFilter");
  const ordersList = document.getElementById("ordersList");
  const noOrders = document.getElementById("noOrders");
  const dashboardLoading = document.getElementById("dashboardLoading");

  const statTotal = document.getElementById("statTotal");
  const statNew = document.getElementById("statNew");
  const statConfirmed = document.getElementById("statConfirmed");

  // Tab Elements
  const tabOrders = document.getElementById("tabOrders");
  const tabConverter = document.getElementById("tabConverter");
  const tabStock = document.getElementById("tabStock");
  const ordersView = document.getElementById("ordersView");
  const converterView = document.getElementById("converterView");
  const stockView = document.getElementById("stockView");
  const stockTableBody = document.getElementById("stockTableBody");
  const btnRefreshStock = document.getElementById("btnRefreshStock");

  // Global variables cache
  let allOrders = [];
  let artworks = [];
  let basePaints = [];

  // General Converter State variables
  let convUploadedImageData = null;
  let convCurrentUploadResult = null;
  let convFileUploaderInitialized = false;

  // ==========================================
  // 🎨 Color Mixing & CIELAB comparison logic
  // ==========================================
  function hexToRgb(hex) {
    let c = hex.replace(/^#/, "");
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const num = parseInt(c, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function rgbToXyz(r, g, b) {
    let rL = r / 255;
    let gL = g / 255;
    let bL = b / 255;

    rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
    gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
    bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

    rL *= 100;
    gL *= 100;
    bL *= 100;

    const x = rL * 0.4124 + gL * 0.3576 + bL * 0.1805;
    const y = rL * 0.2126 + gL * 0.7152 + bL * 0.0722;
    const z = rL * 0.0193 + gL * 0.1192 + bL * 0.9505;
    return [x, y, z];
  }

  function xyzToLab(x, y, z) {
    const refX = 95.047;
    const refY = 100.000;
    const refZ = 108.883;

    let xL = x / refX;
    let yL = y / refY;
    let zL = z / refZ;

    xL = xL > 0.008856 ? Math.pow(xL, 1 / 3) : 7.787 * xL + 16 / 116;
    yL = yL > 0.008856 ? Math.pow(yL, 1 / 3) : 7.787 * yL + 16 / 116;
    zL = zL > 0.008856 ? Math.pow(zL, 1 / 3) : 7.787 * zL + 16 / 116;

    const L = 116 * yL - 16;
    const a = 500 * (xL - yL);
    const b = 200 * (yL - zL);
    return [L, a, b];
  }

  function hexToLab(hex) {
    const [r, g, b] = hexToRgb(hex);
    const [x, y, z] = rgbToXyz(r, g, b);
    return xyzToLab(x, y, z);
  }

  function calculateDeltaE(lab1, lab2) {
    const dL = lab1[0] - lab2[0];
    const da = lab1[1] - lab2[1];
    const db = lab1[2] - lab2[2];
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  function matchColorClient(targetHex, basePaintsList) {
    if (!basePaintsList || basePaintsList.length === 0) {
      return {
        color_hex: targetHex,
        available_direct: true,
        match: { name_ar: "درجة أساسية", hex: targetHex, delta_e: 0 },
        adjustment_tip: "",
      };
    }

    const targetLab = hexToLab(targetHex);

    const basePaintsWithLab = basePaintsList.map((p) => ({
      ...p,
      lab: hexToLab(p.hex),
      rgb: hexToRgb(p.hex),
    }));

    let closestDirect = null;
    let minDirectDeltaE = Number.MAX_VALUE;

    for (const bp of basePaintsWithLab) {
      const dE = calculateDeltaE(targetLab, bp.lab);
      if (dE < minDirectDeltaE) {
        minDirectDeltaE = dE;
        closestDirect = bp;
      }
    }

    if (minDirectDeltaE < 5.0 && closestDirect) {
      return {
        color_hex: targetHex,
        available_direct: true,
        match: {
          name_ar: closestDirect.name_ar,
          hex: closestDirect.hex,
          delta_e: parseFloat(minDirectDeltaE.toFixed(2)),
        },
        adjustment_tip: "",
      };
    }

    let bestMix = null;
    let minMixDeltaE = Number.MAX_VALUE;

    for (let i = 0; i < basePaintsWithLab.length; i++) {
      for (let j = i + 1; j < basePaintsWithLab.length; j++) {
        const p1 = basePaintsWithLab[i];
        const p2 = basePaintsWithLab[j];

        for (let ratio = 5; ratio <= 95; ratio += 5) {
          const r1 = ratio / 100;
          const r2 = 1 - r1;

          const mixedR = Math.round(p1.rgb[0] * r1 + p2.rgb[0] * r2);
          const mixedG = Math.round(p1.rgb[1] * r1 + p2.rgb[1] * r2);
          const mixedB = Math.round(p1.rgb[2] * r1 + p2.rgb[2] * r2);

          const mixedLab = xyzToLab(...rgbToXyz(mixedR, mixedG, mixedB));
          const dE = calculateDeltaE(targetLab, mixedLab);

          if (dE < minMixDeltaE) {
            minMixDeltaE = dE;
            bestMix = {
              components: [
                { name_ar: p1.name_ar, hex: p1.hex, percentage: ratio },
                { name_ar: p2.name_ar, hex: p2.hex, percentage: 100 - ratio },
              ],
              delta_e: parseFloat(dE.toFixed(2)),
              mixedRGB: [mixedR, mixedG, mixedB],
              mixedLab: mixedLab,
            };
          }
        }
      }
    }

    let adjustment_tip = "";
    if (bestMix) {
      const targetL = targetLab[0];
      const mixedL = bestMix.mixedLab[0];
      if (targetL > mixedL + 6.0) {
        adjustment_tip = "أضف نقطة أبيض لتفتيح الدرجة إذا لزم";
      } else if (targetL < mixedL - 6.0) {
        adjustment_tip = "أضف نقطة أسود لتغميق الدرجة إذا لزم";
      }
    }

    return {
      color_hex: targetHex,
      available_direct: false,
      match: bestMix
        ? {
            components: bestMix.components,
            delta_e: bestMix.delta_e,
          }
        : null,
      adjustment_tip,
    };
  }

  // Convert RGB components to Hex
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

  // ==========================================
  // ⚙️ Navigation Tabs toggles
  // ==========================================
  tabOrders.addEventListener("click", () => {
    tabOrders.classList.add("active");
    tabConverter.classList.remove("active");
    tabStock.classList.remove("active");
    ordersView.style.display = "block";
    converterView.style.display = "none";
    stockView.style.display = "none";
  });

  tabConverter.addEventListener("click", () => {
    tabConverter.classList.add("active");
    tabOrders.classList.remove("active");
    tabStock.classList.remove("active");
    ordersView.style.display = "none";
    converterView.style.display = "block";
    stockView.style.display = "none";
    initConverterFileUpload();
  });

  tabStock.addEventListener("click", () => {
    tabStock.classList.add("active");
    tabOrders.classList.remove("active");
    tabConverter.classList.remove("active");
    ordersView.style.display = "none";
    converterView.style.display = "none";
    stockView.style.display = "block";
    loadStockData();
  });

  // ==========================================
  // 🔒 Authentication session helpers
  // ==========================================
  const checkSession = () => {
    const token = localStorage.getItem("pbn_admin_token");
    if (token === "PBN-ADMIN-SESSION-TOKEN") {
      loginOverlay.style.display = "none";
      adminMain.style.display = "block";
      fetchCatalogAndOrders();
    } else {
      loginOverlay.style.display = "flex";
      adminMain.style.display = "none";
    }
  };

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    loginError.textContent = "";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem("pbn_admin_token", data.token);
        checkSession();
      } else {
        const errorMsg = data.errors ? data.errors.join(" | ") : "فشل تسجيل الدخول. يرجى التحقق من المدخلات.";
        loginError.textContent = errorMsg;
        loginError.style.display = "block";
      }
    } catch (err) {
      console.error("Login error:", err);
      loginError.textContent = "حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة لاحقاً.";
      loginError.style.display = "block";
    }
  });

  logoutBtn.addEventListener("submit", (e) => e.preventDefault());
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("pbn_admin_token");
    checkSession();
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
  });

  // ==========================================
  // 📥 Fetch catalog data and orders
  // ==========================================
  const fetchCatalogAndOrders = async () => {
    dashboardLoading.style.display = "block";
    ordersList.style.display = "none";
    noOrders.style.display = "none";

    try {
      // Fetch Artworks and Base Paints
      const [artworksRes, basePaintsRes] = await Promise.all([
        fetch("/api/artworks"),
        fetch("/api/basePaints"),
      ]);
      artworks = await artworksRes.json();
      basePaints = await basePaintsRes.json();
    } catch (err) {
      console.error("Failed to load catalog catalog values:", err);
    }

    await fetchOrders();
  };

  const fetchOrders = async () => {
    const token = localStorage.getItem("pbn_admin_token");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("pbn_admin_token");
        checkSession();
        return;
      }

      const data = await response.json();

      if (response.ok && data.success) {
        allOrders = data.orders || [];
        updateStats();
        populateCityFilter();
        renderOrders();
      } else {
        alert("فشل جلب الطلبات: " + (data.errors ? data.errors.join(" | ") : "خطأ غير معروف"));
      }
    } catch (err) {
      console.error("Fetch orders error:", err);
      alert("حدث خطأ أثناء جلب الطلبات من الخادم.");
    } finally {
      dashboardLoading.style.display = "none";
    }
  };

  const updateStats = () => {
    statTotal.textContent = allOrders.length;
    
    const newOrders = allOrders.filter(o => o.status === "جديد").length;
    statNew.textContent = newOrders;

    const confirmedOrders = allOrders.filter(o => o.status === "مؤكد").length;
    statConfirmed.textContent = confirmedOrders;
  };

  const populateCityFilter = () => {
    const selectedCity = cityFilter.value;
    const cities = [...new Set(allOrders.map(o => o.city).filter(Boolean))];
    cityFilter.innerHTML = '<option value="all">كل الولايات</option>';
    
    cities.forEach(city => {
      cityFilter.innerHTML += `<option value="${city}">${city}</option>`;
    });

    if (cities.includes(selectedCity)) {
      cityFilter.value = selectedCity;
    } else {
      cityFilter.value = "all";
    }
  };

  const formatDateTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("ar-DZ", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return isoString;
    }
  };

  // ==========================================
  // 📋 Render orders list
  // ==========================================
  const renderOrders = () => {
    ordersList.innerHTML = "";
    
    const searchText = searchFilter.value.toLowerCase().trim();
    const statusVal = statusFilter.value;
    const cityVal = cityFilter.value;

    const filtered = allOrders.filter(order => {
      const matchSearch = 
        !searchText ||
        (order.customer_name && order.customer_name.toLowerCase().includes(searchText)) ||
        (order.phone_number && order.phone_number.includes(searchText)) ||
        (order.order_id && order.order_id.toLowerCase().includes(searchText));

      const matchStatus = statusVal === "all" || order.status === statusVal;
      const matchCity = cityVal === "all" || order.city === cityVal;

      return matchSearch && matchStatus && matchCity;
    });

    if (filtered.length === 0) {
      ordersList.style.display = "none";
      noOrders.style.display = "block";
      return;
    }

    noOrders.style.display = "none";
    ordersList.style.display = "flex";

      filtered.forEach(order => {
        const isNew = order.status === "جديد";
        const statusText = isNew ? "جديد (قيد الانتظار)" : "مؤكد";
        const statusClass = isNew ? "new" : "confirmed";

        const artwork = artworks.find(a => a.id === order.artwork_id);
        const artworkImg = artwork ? artwork.image_thumbnail : null;

        const orderCard = document.createElement("div");
        orderCard.className = "order-card";
        orderCard.innerHTML = `
        <div class="order-header">
          <div class="order-meta">
            <span class="order-id">طلب رقم: ${order.order_id}</span>
            <span class="order-date">${formatDateTime(order.timestamp)}</span>
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        
        <div class="order-body">
          <!-- Client Details -->
          <div class="info-section">
            <h4>معلومات العميل</h4>
            <div class="info-grid">
              <span class="info-label">الاسم:</span>
              <span class="info-value" style="font-weight: 600;">${order.customer_name}</span>
              
              <span class="info-label">الهاتف:</span>
              <span class="info-value">
                <a href="tel:${order.phone_number}" class="phone-link">${order.phone_number}</a>
              </span>
              
              <span class="info-label">الولاية:</span>
              <span class="info-value">${order.city}</span>
              
              <span class="info-label">العنوان الكامل:</span>
              <span class="info-value">${order.address}</span>
            </div>
          </div>
          
          <!-- Product Details -->
          <div class="info-section">
            <h4>معلومات الطلبية</h4>
            <div class="info-grid">
              <span class="info-label">اللوحة:</span>
              <span class="info-value" style="font-weight: 600;">${order.artwork_name}</span>
              
              <span class="info-label">النوع:</span>
              <span class="info-value">${order.design_type}</span>
              
              <span class="info-label">المقاس:</span>
              <span class="info-value">${order.size}</span>
              
              <span class="info-label">الإطار:</span>
              <span class="info-value">${order.frame}</span>
              
              <span class="info-label">الكمية:</span>
              <span class="info-value" style="font-weight: 700; font-size: 1.1rem; color: var(--dark-teal);">${order.quantity} لوحة</span>
            </div>
          </div>

          ${artworkImg ? `
          <!-- Artwork Photo -->
          <div style="grid-column: 1 / -1; margin-top: 10px; display: flex; align-items: center; gap: 15px; background-color: #FAF6F0; padding: 12px 16px; border-radius: 10px;">
            <img src="${artworkImg}" alt="${order.artwork_name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); flex-shrink: 0;">
            <div>
              <strong style="font-size: 0.95rem; color: var(--dark-teal);">${order.artwork_name}</strong>
              <p style="font-size: 0.85rem; color: var(--text-light); margin-top: 3px;">${artwork ? artwork.description_ar : ''}</p>
            </div>
          </div>
          ` : ""}

          ${order.notes ? `
          <div class="order-notes">
            <strong>ملاحظات العميل:</strong> ${order.notes}
          </div>
          ` : ""}

          <!-- Dynamic SVG Outline printable segment -->
          <div class="outline-display-container" style="grid-column: 1 / -1; margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 15px;">
            ${order.svg_outline ? `
              <div class="outline-active-section">
                <h4 style="font-size: 1.05rem; color: var(--dark-teal); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                  <span>تخطيط الرسم المخصص للطباعة (بدون ألوان)</span>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-download-outline" data-id="${order.order_id}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px;" title="تحميل SVG">
                      📥 SVG
                    </button>
                    <button class="btn btn-secondary btn-download-pdf" data-id="${order.order_id}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px;" title="تحميل PDF متجه">
                      📄 PDF متجه
                    </button>
                    <button class="btn btn-secondary btn-download-image" data-id="${order.order_id}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px;" title="تحميل صورة 300 DPI">
                      🖼️ صورة (300 DPI)
                    </button>
                    <button class="btn btn-primary btn-print-outline" data-id="${order.order_id}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px; background-color: var(--light-teal); box-shadow: none;">
                      🖨️ طباعة
                    </button>
                  </div>
                </h4>
                <div class="outline-preview-container" style="border: 1px solid var(--border); border-radius: 8px; background-color: #fff; padding: 15px; height: 350px; overflow: auto; display: flex; justify-content: center; align-items: center;">
                  ${order.svg_outline}
                </div>
              </div>
            ` : `
              <div class="outline-generation-section" id="generation-section-${order.order_id}">
                <h4 style="font-size: 1.05rem; color: var(--dark-teal); margin-bottom: 8px;">تخطيط الرسم المرقم للطباعة (غير مولّد)</h4>
                <p style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 12px;">هذه الطلبية تمثل لوحة جاهزة من المتجر. يمكنك توليد التخطيط الفني المرقم الخاص بها مباشرة هنا لطبعها للعميل.</p>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center;">
                  <button class="btn btn-secondary btn-generate-outline" data-id="${order.order_id}" data-artwork="${order.artwork_id}" data-colors="${order.color_count || 18}" style="font-size: 0.9rem; padding: 8px 18px;">
                    ⚙️ توليد وتجهيز مخطط التلوين للطباعة
                  </button>
                  <span style="font-size: 0.8rem; color: var(--text-light);">عدد الألوان: ${order.color_count || 18}</span>
                </div>
                <div class="gen-loading-spinner" id="gen-spinner-${order.order_id}" style="display: none; align-items: center; gap: 10px; margin-top: 10px; font-size: 0.9rem; color: var(--text-light);">
                  <div class="spinner" style="width: 20px; height: 20px; border: 2px solid rgba(231,111,81,0.1); border-left-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                  <span>جاري توليد مخطط التلوين المرقم... يرجى الانتظار</span>
                </div>
              </div>
            `}
          </div>

          <!-- Color Recipes Drawer (collapsible) -->
          <div class="recipes-drawer" id="recipes-${order.order_id}">
            <h5 style="font-size: 0.95rem; margin-bottom: 12px; color: var(--dark-teal);">خلطات الألوان وتركيباتها الفنية (${order.color_count} لون):</h5>
            <div class="recipes-grid">
              ${renderRecipesHTML(order.colors_detail, order.quantity)}
            </div>
          </div>
        </div>

        <div class="order-footer">
          <button class="btn-recipe-toggle" data-id="${order.order_id}">
            🎨 خلطات وتركيبات الألوان (${order.color_count})
          </button>
          
          ${isNew ? `
            <button class="btn-confirm-order" data-id="${order.order_id}">تأكيد وتجهيز الطلب</button>
          ` : `
            <span style="color: var(--light-teal); font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 5px;">
              ✅ تم تأكيد الطلب
            </span>
          `}
        </div>
      `;

      ordersList.appendChild(orderCard);
    });

    setupCardEventListeners();
  };

  const renderRecipesHTML = (colorsDetail, quantity = 1) => {
    if (!colorsDetail || colorsDetail.length === 0) {
      return '<p style="color: var(--text-light); font-size: 0.85rem;">لا توجد تفاصيل ألوان متاحة.</p>';
    }

    const requiredVolume = 5.0 * quantity;

    return colorsDetail.map((color, index) => {
      let mixText = "";
      
      if (color.available_direct) {
        const bp = basePaints.find(p => p.hex.toLowerCase() === color.match.hex.toLowerCase());
        const currentStock = bp ? (bp.stock_ml || 0) : 0;
        const isAvailable = currentStock >= requiredVolume;
        let availabilityHtml = "";

        if (isAvailable) {
          availabilityHtml = `
            <div style="margin-top: 6px; font-size: 0.8rem; color: #2eb086; font-weight: 600; display: flex; align-items: center; gap: 4px;">
              <span>✅ متوفر في المخزن (${currentStock.toFixed(1)} ml)</span>
            </div>
          `;
        } else {
          availabilityHtml = `
            <div style="margin-top: 6px; font-size: 0.8rem; color: #e76f51; font-weight: 600; display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
              <span>⚠️ غير متوفر (المخزون: ${currentStock.toFixed(1)} ml / المطلوب: ${requiredVolume.toFixed(1)} ml)</span>
              <button class="btn-quick-refill" data-paint-id="${bp ? bp.id : ''}" data-paint-name="${bp ? bp.name_ar : color.match.name_ar}" style="padding: 2px 6px; font-size: 0.75rem; border-radius: 4px; background-color: var(--primary); color: #fff; border: none; cursor: pointer; font-family: 'Cairo', sans-serif;">تعديل المخزون</button>
            </div>
          `;
        }

        mixText = `
          <span class="direct-badge">درجة جاهزة</span>
          <div>علبة الطلاء الأساسية: <strong>${color.match.name_ar}</strong></div>
          ${availabilityHtml}
        `;
      } else if (color.match && color.match.components) {
        const componentsHtml = color.match.components.map(comp => {
          const bp = basePaints.find(p => p.hex.toLowerCase() === comp.hex.toLowerCase());
          const compVolume = requiredVolume * (comp.percentage / 100);
          const currentStock = bp ? (bp.stock_ml || 0) : 0;
          const isCompAvailable = currentStock >= compVolume;

          return `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; font-size: 0.8rem;">
              <span><strong>${comp.percentage}%</strong> ${comp.name_ar}</span>
              ${isCompAvailable ? `
                <span style="color: #2eb086; font-weight: 600;">✅ متوفر (${currentStock.toFixed(1)}ml)</span>
              ` : `
                <span style="color: #e76f51; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                  <span>❌ غير كافٍ (${currentStock.toFixed(1)}ml / المطلوب: ${compVolume.toFixed(1)}ml)</span>
                  <button class="btn-quick-refill" data-paint-id="${bp ? bp.id : ''}" data-paint-name="${bp ? bp.name_ar : comp.name_ar}" style="padding: 1px 4px; font-size: 0.7rem; border-radius: 3px; background-color: #e76f51; color: #fff; border: none; cursor: pointer; font-family: 'Cairo', sans-serif;">تعديل</button>
                </span>
              `}
            </div>
          `;
        }).join("");
        
        mixText = `
          <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 4px; color: var(--dark-teal);">النسب والتوفر:</div>
          <div style="display: flex; flex-direction: column; gap: 2px; border-right: 2px solid var(--border); padding-right: 8px; margin-bottom: 6px;">
            ${componentsHtml}
          </div>
          ${color.adjustment_tip ? `<div class="recipe-tip">⚠️ ${color.adjustment_tip}</div>` : ""}
        `;
      } else {
        mixText = "لا توجد صيغة تركيب محددة";
      }

      return `
        <div class="recipe-item">
          <div class="recipe-color-block" style="background-color: ${color.hex || color.color_hex};"></div>
          <div class="recipe-info">
            <div class="recipe-title">
              <span>لون #${index + 1}</span>
              <span class="recipe-hex">${color.hex || color.color_hex}</span>
            </div>
            <div class="recipe-details">
              ${mixText}
            </div>
          </div>
        </div>
      `;
    }).join("");
  };

  // ==========================================
  // ⚙️ Bind Order Cards Interaction Events
  // ==========================================
  const setupCardEventListeners = () => {
    // Quick Refill/Update Stock from drawer
    document.querySelectorAll(".btn-quick-refill").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".btn-quick-refill").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const paintId = btn.getAttribute("data-paint-id");
        const paintName = btn.getAttribute("data-paint-name");
        if (!paintId) {
          alert("كود الطلاء غير متوفر لتحديث مخزونه.");
          return;
        }

        const bp = basePaints.find(p => p.id === paintId);
        const currentVal = bp ? (bp.stock_ml || 0) : 0;

        const newValStr = prompt(`تعديل كمية المخزون لـ "${paintName}":\nأدخل الكمية الجديدة بالمليمتر (ml):`, currentVal.toFixed(1));
        if (newValStr === null) return;

        const newVal = parseFloat(newValStr);
        if (isNaN(newVal) || newVal < 0) {
          alert("الرجاء إدخال كمية صحيحة (0 أو أكثر).");
          return;
        }

        const token = localStorage.getItem("pbn_admin_token");
        try {
          const response = await fetch("/api/admin/stock/update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              paint_id: paintId,
              amount_ml: newVal
            })
          });

          const data = await response.json();
          if (response.ok && data.success) {
            alert(`تم تحديث مخزون "${paintName}" إلى ${newVal.toFixed(1)} ml بنجاح!`);
            
            if (bp) {
              bp.stock_ml = newVal;
            }
            
            renderOrders();
            if (stockView.style.display === "block") {
              loadStockData();
            }
          } else {
            alert("فشل تحديث المخزون: " + (data.errors ? data.errors.join(" | ") : "خطأ غير معروف"));
          }
        } catch (err) {
          console.error("Quick update stock error:", err);
          alert("حدث خطأ أثناء تعديل المخزون.");
        }
      });
    });

    // Recipes drawer toggle
    document.querySelectorAll(".btn-recipe-toggle").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true)); // Clear old listeners
    });
    document.querySelectorAll(".btn-recipe-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderId = btn.getAttribute("data-id");
        const drawer = document.getElementById(`recipes-${orderId}`);
        if (drawer.style.display === "block") {
          drawer.style.display = "none";
          btn.style.backgroundColor = "transparent";
          btn.style.color = "var(--dark-teal)";
        } else {
          drawer.style.display = "block";
          btn.style.backgroundColor = "rgba(38, 70, 83, 0.08)";
          btn.style.color = "var(--text-dark)";
        }
      });
    });

    // Confirmation buttons
    document.querySelectorAll(".btn-confirm-order").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".btn-confirm-order").forEach(btn => {
      btn.addEventListener("click", async () => {
        const orderId = btn.getAttribute("data-id");
        if (confirm(`هل أنت متأكد من تأكيد الطلب رقم ${orderId}؟ سيؤدي ذلك لتحديث حالته إلى "مؤكد".`)) {
          await confirmOrder(orderId, btn);
        }
      });
    });

    // Download SVG outline buttons
    document.querySelectorAll(".btn-download-outline").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".btn-download-outline").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderId = btn.getAttribute("data-id");
        const order = allOrders.find(o => o.order_id === orderId);
        if (order && order.svg_outline) {
          const blob = new Blob([order.svg_outline], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `order_${order.order_id}_outline.svg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      });
    });

    // Download PDF outline buttons
    document.querySelectorAll(".btn-download-pdf").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".btn-download-pdf").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderId = btn.getAttribute("data-id");
        const order = allOrders.find(o => o.order_id === orderId);
        if (order && order.svg_outline) {
          exportSVGToPDF(order.svg_outline, `order_${order.order_id}_outline.pdf`);
        }
      });
    });

    // Download Image (300 DPI) outline buttons
    document.querySelectorAll(".btn-download-image").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".btn-download-image").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderId = btn.getAttribute("data-id");
        const order = allOrders.find(o => o.order_id === orderId);
        if (order && order.svg_outline) {
          exportSVGToHighResPNG(order.svg_outline, order.size, `order_${order.order_id}_print_300dpi.png`);
        }
      });
    });

    // Print SVG outline buttons
    document.querySelectorAll(".btn-print-outline").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".btn-print-outline").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderId = btn.getAttribute("data-id");
        const order = allOrders.find(o => o.order_id === orderId);
        if (order && order.svg_outline) {
          const printWindow = window.open("", "_blank");
          printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
              <meta charset="UTF-8">
              <title>طباعة تخطيط الطلب: ${order.order_id}</title>
              <style>
                body {
                  margin: 0;
                  padding: 20px;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  box-sizing: border-box;
                  background-color: #fff;
                }
                svg {
                  max-width: 100%;
                  max-height: 100%;
                  width: auto;
                  height: auto;
                  display: block;
                }
                @media print {
                  body {
                    padding: 0;
                    margin: 0;
                  }
                  svg {
                    width: 100vw;
                    height: 100vh;
                    page-break-after: avoid;
                    page-break-before: avoid;
                  }
                }
              </style>
            </head>
            <body>
              ${order.svg_outline}
              <script>
                window.addEventListener("load", () => {
                  setTimeout(() => {
                    window.print();
                    window.close();
                  }, 500);
                });
              <\/script>
            </body>
            </html>
          `);
          printWindow.document.close();
        }
      });
    });

    // Preset designs outline generator button click
    document.querySelectorAll(".btn-generate-outline").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll(".btn-generate-outline").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderId = btn.getAttribute("data-id");
        const artworkId = btn.getAttribute("data-artwork");
        const colorCount = parseInt(btn.getAttribute("data-colors")) || 18;
        
        generateOutlineForPredefined(orderId, artworkId, colorCount, btn);
      });
    });
  };

  // ==========================================
  // ⚙️ Dynamic generator for predefined catalog orders
  // ==========================================
  const generateOutlineForPredefined = (orderId, artworkId, colorCount, btnElement) => {
    const spinner = document.getElementById(`gen-spinner-${orderId}`);
    
    // UI state loading
    btnElement.style.display = "none";
    spinner.style.display = "flex";

    // Validate artworkId
    if (!artworkId || artworkId === "undefined" || artworkId === "null") {
      alert("معرف اللوحة الفنية غير متوفر لهذا الطلب. لا يمكن توليد التخطيط.");
      spinner.style.display = "none";
      btnElement.style.display = "inline-block";
      return;
    }

    // Find the artwork thumbnail
    const artwork = artworks.find(a => a.id === artworkId);
    // Fallback path if artwork catalog item is deleted/missing
    const imageSrc = artwork ? artwork.image_thumbnail : `/assets/artworks/${artworkId}.svg`;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Draw SVG / image to offscreen canvas to scale and sample ImageData
      const canvas = document.createElement("canvas");
      const isSvg = imageSrc.endsWith(".svg");
      const maxDim = isSvg ? 1200 : 600;
      let w = img.width || 400;
      let h = img.height || 500;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h / w) * maxDim);
          w = maxDim;
        } else {
          w = Math.round((w / h) * maxDim);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      try {
        const imgData = ctx.getImageData(0, 0, w, h);
        
        // Spawn K-means Web Worker thread
        const worker = new Worker("/js/pbn-engine/worker.js", { type: "module" });
        worker.postMessage({
          imageData: {
            width: imgData.width,
            height: imgData.height,
            data: imgData.data,
          },
          options: {
            k: colorCount,
            minFacetSize: 18,
            maxFacets: 1200,
            simplifyFactor: 2,
            narrowCleanupRuns: 3,
            sizeMultiplier: 4,
            fontSize: 38,
            fontColor: "#333333",
          }
        });

        worker.onmessage = (e) => {
          const msg = e.data;
          
          if (msg.type === "result") {
            // Save in-memory
            const orderIndex = allOrders.findIndex(o => o.order_id === orderId);
            if (orderIndex !== -1) {
              allOrders[orderIndex].svg_outline = msg.svgOutline;
            }

            // Persist to server so it survives page refresh
            saveOutlineToServer(orderId, msg.svgOutline);

            // Replace generation container UI with download/print layout
            const section = document.getElementById(`generation-section-${orderId}`);
            section.outerHTML = `
              <div class="outline-active-section">
                <h4 style="font-size: 1.05rem; color: var(--dark-teal); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                  <span>تخطيط الرسم المخصص للطباعة (بدون ألوان)</span>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-download-outline" data-id="${orderId}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px;" title="تحميل SVG">
                      📥 SVG
                    </button>
                    <button class="btn btn-secondary btn-download-pdf" data-id="${orderId}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px;" title="تحميل PDF متجه">
                      📄 PDF متجه
                    </button>
                    <button class="btn btn-secondary btn-download-image" data-id="${orderId}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px;" title="تحميل صورة 300 DPI">
                      🖼️ صورة (300 DPI)
                    </button>
                    <button class="btn btn-primary btn-print-outline" data-id="${orderId}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 4px; background-color: var(--light-teal); box-shadow: none;">
                      🖨️ طباعة
                    </button>
                  </div>
                </h4>
                <div class="outline-preview-container" style="border: 1px solid var(--border); border-radius: 8px; background-color: #fff; padding: 15px; height: 350px; overflow: auto; display: flex; justify-content: center; align-items: center;">
                  ${msg.svgOutline}
                </div>
              </div>
            `;

            // Re-bind listeners for newly rendered buttons
            setupCardEventListeners();
            worker.terminate();
          } else if (msg.type === "error") {
            alert("فشل توليد التخطيط: " + msg.error);
            spinner.style.display = "none";
            btnElement.style.display = "inline-block";
            worker.terminate();
          }
        };

        worker.onerror = (err) => {
          console.error("Worker error in generation:", err);
          alert("حدث خطأ أثناء تشغيل محرك معالجة التخطيط.");
          spinner.style.display = "none";
          btnElement.style.display = "inline-block";
          worker.terminate();
        };

      } catch (err) {
        console.error("Failed to get image pixel data:", err);
        alert("فشل في استخراج بيانات ألوان اللوحة للتحويل.");
        spinner.style.display = "none";
        btnElement.style.display = "inline-block";
      }
    };

    img.onerror = (e) => {
      console.error("Image loading failed:", imageSrc, e);
      alert("فشل تحميل اللوحة من الخادم للتحويل.");
      spinner.style.display = "none";
      btnElement.style.display = "inline-block";
    };

    img.src = imageSrc;
  };

  // Persist generated SVG outline to server
  const saveOutlineToServer = async (orderId, svgOutline) => {
    const token = localStorage.getItem("pbn_admin_token");
    try {
      await fetch(`/api/admin/orders/${orderId}/outline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ svg_outline: svgOutline })
      });
    } catch (err) {
      console.error("Failed to save outline to server:", err);
    }
  };

  // Request order confirmation from API
  const confirmOrder = async (orderId, btnElement) => {
    const token = localStorage.getItem("pbn_admin_token");
    const originalText = btnElement.textContent;
    btnElement.disabled = true;
    btnElement.textContent = "جاري التأكيد...";

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/confirm`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const index = allOrders.findIndex(o => o.order_id === orderId);
        if (index !== -1) {
          allOrders[index].status = "مؤكد";
        }
        updateStats();
        renderOrders();
      } else {
        alert("فشل تأكيد الطلب: " + (data.errors ? data.errors.join(" | ") : "خطأ غير معروف"));
        btnElement.disabled = false;
        btnElement.textContent = originalText;
      }
    } catch (err) {
      console.error("Confirm order error:", err);
      alert("حدث خطأ غير متوقع أثناء معالجة الطلب.");
      btnElement.disabled = false;
      btnElement.textContent = originalText;
    }
  };

  // ==========================================
  // ⚙️ Stand-alone General Image Converter logic
  // ==========================================
  function initConverterFileUpload() {
    if (convFileUploaderInitialized) return;
    convFileUploaderInitialized = true;
    
    const area = document.getElementById("convDragDropArea");
    const fileInput = document.getElementById("convImageInput");
    const processBtn = document.getElementById("convProcessBtn");
    
    area.addEventListener("click", () => fileInput.click());
    
    area.addEventListener("dragover", (e) => {
      e.preventDefault();
      area.style.borderColor = "var(--primary)";
      area.style.backgroundColor = "rgba(231, 111, 81, 0.05)";
    });
    
    area.addEventListener("dragleave", () => {
      area.style.borderColor = "var(--border)";
      area.style.backgroundColor = "#FAF6F0";
    });
    
    area.addEventListener("drop", (e) => {
      e.preventDefault();
      area.style.borderColor = "var(--border)";
      area.style.backgroundColor = "#FAF6F0";
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleConverterFile(e.dataTransfer.files[0]);
      }
    });
    
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleConverterFile(e.target.files[0]);
      }
    });

    // Converter view triggers
    const convBtnOutline = document.getElementById("convBtnShowOutline");
    const convBtnFilled = document.getElementById("convBtnShowFilled");
    
    convBtnOutline.addEventListener("click", () => {
      convBtnOutline.classList.add("active");
      convBtnFilled.classList.remove("active");
      renderConvSVG(false);
    });
    
    convBtnFilled.addEventListener("click", () => {
      convBtnFilled.classList.add("active");
      convBtnOutline.classList.remove("active");
      renderConvSVG(true);
    });

    // Converter Processing Action
    processBtn.addEventListener("click", runConverterPipeline);

    // Download / Print Converter Outlines Action
    document.getElementById("convBtnDownload").addEventListener("click", downloadConvSVG);
    document.getElementById("convBtnDownloadPDF").addEventListener("click", () => {
      if (convCurrentUploadResult && convCurrentUploadResult.svgOutline) {
        exportSVGToPDF(convCurrentUploadResult.svgOutline, "paint_by_number_general_outline.pdf");
      }
    });
    document.getElementById("convBtnDownloadImage").addEventListener("click", () => {
      if (convCurrentUploadResult && convCurrentUploadResult.svgOutline) {
        exportSVGToHighResPNG(convCurrentUploadResult.svgOutline, "30x30", "paint_by_number_general_print_300dpi.png");
      }
    });
    document.getElementById("convBtnPrint").addEventListener("click", printConvSVG);
  }

  function handleConverterFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("الرجاء اختيار ملف صورة صالح فقط.");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 600;
        let w = img.width;
        let h = img.height;
        
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h / w) * maxDim);
            w = maxDim;
          } else {
            w = Math.round((w / h) * maxDim);
            h = maxDim;
          }
        }
        
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        
        convUploadedImageData = ctx.getImageData(0, 0, w, h);
        
        document.getElementById("convDragDropArea").innerHTML = `
          <span style="font-size: 3rem; display: block; margin-bottom: 10px;">✅</span>
          <h3 style="font-size: 1.1rem; color: var(--dark-teal); font-family: 'Cairo', sans-serif;">تم تحميل الصورة بنجاح!</h3>
          <p style="font-size: 0.85rem; color: var(--text-light);">${file.name} (${w}x${h} بكسل)</p>
        `;
        
        document.getElementById("convProcessBtn").disabled = false;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function runConverterPipeline() {
    if (!convUploadedImageData) return;
    
    const processBtn = document.getElementById("convProcessBtn");
    const overlay = document.getElementById("convProgressOverlay");
    const text = document.getElementById("convProgressText");
    const percent = document.getElementById("convProgressPercent");
    const bar = document.getElementById("convProgressBarFill");
    
    overlay.style.display = "flex";
    processBtn.disabled = true;
    
    const k = Math.min(36, Math.max(2, parseInt(document.getElementById("convColorCount").value) || 18));
    const minFacet = parseInt(document.getElementById("convMinFacet").value) || 18;
    
    const worker = new Worker("/js/pbn-engine/worker.js", { type: "module" });
    worker.postMessage({
      imageData: {
        width: convUploadedImageData.width,
        height: convUploadedImageData.height,
        data: convUploadedImageData.data,
      },
      options: {
        k,
        minFacetSize: minFacet,
        maxFacets: 1200,
        simplifyFactor: 2,
        narrowCleanupRuns: 3,
        sizeMultiplier: 4,
        fontSize: 38,
        fontColor: "#333333",
      }
    });
    
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        text.textContent = msg.text;
        const p = Math.round(msg.progress * 100);
        percent.textContent = `${p}%`;
        bar.style.width = `${p}%`;
      } else if (msg.type === "result") {
        overlay.style.display = "none";
        processBtn.disabled = false;
        
        convCurrentUploadResult = msg;
        
        // Hide placeholder, display result area
        document.getElementById("convPreviewPlaceholder").style.display = "none";
        document.getElementById("convResultArea").style.display = "flex";
        document.getElementById("convPaletteSection").style.display = "block";
        
        // Switch to outline preview and render palette
        document.getElementById("convBtnShowOutline").classList.add("active");
        document.getElementById("convBtnShowFilled").classList.remove("active");
        renderConvSVG(false); 
        renderConvPalette(msg.colorsByIndex);
        
        worker.terminate();
      } else if (msg.type === "error") {
        overlay.style.display = "none";
        processBtn.disabled = false;
        alert("فشل التحويل: " + msg.error);
        worker.terminate();
      }
    };
    
    worker.onerror = () => {
      overlay.style.display = "none";
      processBtn.disabled = false;
      alert("حدث خطأ غير متوقع أثناء معالجة الصورة.");
      worker.terminate();
    };
  }

  function renderConvSVG(showFilled) {
    if (!convCurrentUploadResult) return;
    const box = document.getElementById("convSvgOutputBox");
    box.innerHTML = showFilled ? convCurrentUploadResult.svgFilled : convCurrentUploadResult.svgOutline;
  }

  function downloadConvSVG() {
    if (convCurrentUploadResult && convCurrentUploadResult.svgOutline) {
      const blob = new Blob([convCurrentUploadResult.svgOutline], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `paint_by_number_general_outline.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  function printConvSVG() {
    if (convCurrentUploadResult && convCurrentUploadResult.svgOutline) {
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>طباعة تخطيط لوحتي بالأرقام</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              box-sizing: border-box;
              background-color: #fff;
            }
            svg {
              max-width: 100%;
              max-height: 100%;
              width: auto;
              height: auto;
              display: block;
            }
            @media print {
              body {
                padding: 0;
                margin: 0;
              }
              svg {
                width: 100vw;
                height: 100vh;
                page-break-after: avoid;
                page-break-before: avoid;
              }
            }
          </style>
        </head>
        <body>
          ${convCurrentUploadResult.svgOutline}
          <script>
            window.addEventListener("load", () => {
              setTimeout(() => {
                window.print();
                window.close();
              }, 500);
            });
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  function renderConvPalette(colorsByIndex) {
    const container = document.getElementById("convPaletteLegend");
    container.innerHTML = "";
    
    colorsByIndex.forEach((color, idx) => {
      const num = idx + 1;
      const hex = rgbToHex(color[0], color[1], color[2]);
      const recipe = matchColorClient(hex, basePaints);
      
      let mixText = "";
      if (recipe.available_direct) {
        mixText = `
          <span class="direct-badge">درجة جاهزة</span>
          <div>علبة الطلاء الأساسية: <strong>${recipe.match.name_ar}</strong></div>
        `;
      } else if (recipe.match && recipe.match.components) {
        const comps = recipe.match.components.map(c => `<strong>${c.percentage}%</strong> ${c.name_ar}`).join(" + ");
        mixText = `
          <div>النسبة: ${comps}</div>
          ${recipe.adjustment_tip ? `<div class="recipe-tip">⚠️ ${recipe.adjustment_tip}</div>` : ""}
        `;
      }
      
      const item = document.createElement("div");
      item.className = "recipe-item";
      item.innerHTML = `
        <div class="recipe-color-block" style="background-color: ${hex};"></div>
        <div class="recipe-info">
          <div class="recipe-title">
            <span>لون #${num}</span>
            <span class="recipe-hex">${hex}</span>
          </div>
          <div class="recipe-details">
            ${mixText}
          </div>
        </div>
      `;
      
      container.appendChild(item);
    });
  }

  // ==========================================
  // 🎨 Vector PDF & High-Res Image Export Helpers
  // ==========================================
  function setPDFColor(colorStr, type, pdf) {
    if (!colorStr || colorStr === "none") return false;
    colorStr = colorStr.trim();
    if (colorStr.startsWith("rgb")) {
      const matches = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (matches) {
        const r = parseInt(matches[1]);
        const g = parseInt(matches[2]);
        const b = parseInt(matches[3]);
        if (type === "fill") {
          pdf.setFillColor(r, g, b);
        } else {
          pdf.setDrawColor(r, g, b);
        }
        return true;
      }
    } else if (colorStr.startsWith("#")) {
      if (type === "fill") {
        pdf.setFillColor(colorStr);
      } else {
        pdf.setDrawColor(colorStr);
      }
      return true;
    }
    return false;
  }

  function setPDFTextColor(colorStr, pdf) {
    if (!colorStr) return;
    colorStr = colorStr.trim();
    if (colorStr.startsWith("rgb")) {
      const matches = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (matches) {
        pdf.setTextColor(parseInt(matches[1]), parseInt(matches[2]), parseInt(matches[3]));
      }
    } else {
      pdf.setTextColor(colorStr);
    }
  }

  function drawSVGPathToPDF(d, pdf) {
    const pathRegex = /([MQLZz])|(-?\d*\.?\d+)/g;
    let match;
    let currentCmd = "";
    let coords = [];
    let currentX = 0;
    let currentY = 0;

    while ((match = pathRegex.exec(d)) !== null) {
      if (match[1]) {
        currentCmd = match[1].toUpperCase();
        coords = [];
        if (currentCmd === "Z") {
          pdf.closePath();
        }
      } else if (match[2]) {
        coords.push(parseFloat(match[2]));
        if (currentCmd === "M" && coords.length === 2) {
          currentX = coords[0];
          currentY = coords[1];
          pdf.moveTo(currentX, currentY);
          coords = [];
        } else if (currentCmd === "L" && coords.length === 2) {
          currentX = coords[0];
          currentY = coords[1];
          pdf.lineTo(currentX, currentY);
          coords = [];
        } else if (currentCmd === "Q" && coords.length === 4) {
          const qx = coords[0];
          const qy = coords[1];
          const endx = coords[2];
          const endy = coords[3];

          // Convert quadratic curve to cubic bezier
          const cx1 = currentX + (2/3) * (qx - currentX);
          const cy1 = currentY + (2/3) * (qy - currentY);
          const cx2 = endx + (2/3) * (qx - endx);
          const cy2 = endy + (2/3) * (qy - endy);

          pdf.curveTo(cx1, cy1, cx2, cy2, endx, endy);
          currentX = endx;
          currentY = endy;
          coords = [];
        }
      }
    }
  }

  function exportSVGToPDF(svgString, filename) {
    try {
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
      const svgEl = svgDoc.documentElement;

      let svgWidth = parseFloat(svgEl.getAttribute("width"));
      let svgHeight = parseFloat(svgEl.getAttribute("height"));

      if (isNaN(svgWidth) || isNaN(svgHeight)) {
        const viewBox = svgEl.getAttribute("viewBox");
        if (viewBox) {
          const parts = viewBox.trim().split(/\s+/);
          if (parts.length === 4) {
            svgWidth = parseFloat(parts[2]);
            svgHeight = parseFloat(parts[3]);
          }
        }
      }

      if (isNaN(svgWidth) || isNaN(svgHeight)) {
        svgWidth = 600;
        svgHeight = 600;
      }

      const { jsPDF } = window.jspdf;
      const orientation = svgWidth >= svgHeight ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation: orientation,
        unit: "pt",
        format: [svgWidth, svgHeight]
      });

      const paths = svgEl.querySelectorAll("path");
      paths.forEach(path => {
        const d = path.getAttribute("d");
        if (!d) return;

        const fill = path.getAttribute("fill");
        const stroke = path.getAttribute("stroke");
        const strokeWidth = path.getAttribute("stroke-width");

        const hasFill = setPDFColor(fill, "fill", pdf);
        const hasStroke = setPDFColor(stroke, "stroke", pdf);

        pdf.setLineWidth(parseFloat(strokeWidth) || 0.7);

        drawSVGPathToPDF(d, pdf);

        if (hasFill && hasStroke) {
          pdf.fillStroke();
        } else if (hasFill) {
          pdf.fill();
        } else if (hasStroke) {
          pdf.stroke();
        }
      });

      const texts = svgEl.querySelectorAll("text");
      texts.forEach(text => {
        const x = parseFloat(text.getAttribute("x"));
        const y = parseFloat(text.getAttribute("y"));
        const content = text.textContent;
        const fontSizeAttr = text.getAttribute("font-size");
        const fill = text.getAttribute("fill");

        if (isNaN(x) || isNaN(y) || !content) return;

        const fontSize = parseFloat(fontSizeAttr) || 8;
        pdf.setFont("Helvetica", "normal");
        pdf.setFontSize(fontSize);
        setPDFTextColor(fill || "#000000", pdf);

        pdf.text(content, x, y, { align: "center", baseline: "middle" });
      });

      pdf.save(filename);
    } catch (err) {
      console.error("Failed to export PDF:", err);
      alert("حدث خطأ أثناء تصدير ملف PDF: " + err.message);
    }
  }

  function exportSVGToHighResPNG(svgString, size, filename) {
    try {
      let targetPx = 3540; // Default for 30x30cm at 300 DPI
      if (size && size.includes("40")) {
        targetPx = 4724; // 40x40cm at 300 DPI
      }

      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
      const svgEl = svgDoc.documentElement;

      let svgWidth = parseFloat(svgEl.getAttribute("width"));
      let svgHeight = parseFloat(svgEl.getAttribute("height"));

      if (isNaN(svgWidth) || isNaN(svgHeight)) {
        const viewBox = svgEl.getAttribute("viewBox");
        if (viewBox) {
          const parts = viewBox.trim().split(/\s+/);
          if (parts.length === 4) {
            svgWidth = parseFloat(parts[2]);
            svgHeight = parseFloat(parts[3]);
          }
        }
      }

      let targetWidth = targetPx;
      let targetHeight = targetPx;

      if (!isNaN(svgWidth) && !isNaN(svgHeight) && svgWidth > 0 && svgHeight > 0) {
        const aspectRatio = svgWidth / svgHeight;
        if (aspectRatio > 1) {
          targetWidth = targetPx;
          targetHeight = Math.round(targetPx / aspectRatio);
        } else {
          targetHeight = targetPx;
          targetWidth = Math.round(targetPx * aspectRatio);
        }
      }

      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob((pngBlob) => {
          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement("a");
          link.href = pngUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
        }, "image/png");

        URL.revokeObjectURL(url);
      };

      img.onerror = (err) => {
        console.error("Image loading failed:", err);
        alert("فشل تحميل الصورة للتصدير.");
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (err) {
      console.error("Failed to export PNG:", err);
      alert("حدث خطأ أثناء تصدير الصورة: " + err.message);
    }
  }

  // ==========================================
  // 🎨 Color Stock Management Functions
  // ==========================================
  const loadStockData = async () => {
    const token = localStorage.getItem("pbn_admin_token");
    try {
      stockTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-light); font-family: 'Cairo', sans-serif;">جاري تحميل بيانات المخزون...</td></tr>`;

      const response = await fetch("/api/admin/stock", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("pbn_admin_token");
        checkSession();
        return;
      }

      const data = await response.json();
      if (response.ok && data.success) {
        renderStockTable(data.stock);
      } else {
        alert("فشل تحميل بيانات المخزون: " + (data.errors ? data.errors.join(" | ") : "خطأ غير معروف"));
      }
    } catch (err) {
      console.error("Load stock error:", err);
      stockTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #e76f51; font-family: 'Cairo', sans-serif;">حدث خطأ أثناء تحميل المخزون.</td></tr>`;
    }
  };

  const renderStockTable = (stock) => {
    stockTableBody.innerHTML = "";
    if (!stock || stock.length === 0) {
      stockTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-light); font-family: 'Cairo', sans-serif;">لا توجد ألوان مسجلة.</td></tr>`;
      return;
    }

    stock.forEach(paint => {
      let statusBadge = "";
      const val = paint.stock_ml || 0;
      if (val > 1000) {
        statusBadge = `<span style="background-color: rgba(46, 176, 134, 0.1); color: #2eb086; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; display: inline-block;">كافٍ</span>`;
      } else if (val > 250) {
        statusBadge = `<span style="background-color: rgba(233, 196, 106, 0.1); color: #cfa12f; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; display: inline-block;">متوسط</span>`;
      } else if (val > 0) {
        statusBadge = `<span style="background-color: rgba(231, 111, 81, 0.1); color: #e76f51; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; display: inline-block;">منخفض</span>`;
      } else {
        statusBadge = `<span style="background-color: rgba(231, 76, 60, 0.1); color: #e74c3c; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; display: inline-block;">نفد المخزون</span>`;
      }

      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border)";
      tr.innerHTML = `
        <td style="padding: 12px 15px; font-weight: 600; color: var(--text-dark);">${paint.name_ar || paint.id}</td>
        <td style="padding: 12px 15px; text-align: center;">
          <div style="width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.15); margin: 0 auto; background-color: ${paint.hex};" title="${paint.hex}"></div>
        </td>
        <td style="padding: 12px 15px; text-align: center; font-family: monospace; font-size: 0.9rem; color: var(--text-dark); font-weight: 600;">${paint.hex}</td>
        <td style="padding: 12px 15px; text-align: center; font-family: monospace; font-size: 0.9rem; color: var(--text-dark); font-weight: 600;">${paint.ncs || "S 0000-N"}</td>
        <td style="padding: 12px 15px; font-weight: 700; color: var(--dark-teal);">${val.toFixed(1)} ml</td>
        <td style="padding: 12px 15px;">${statusBadge}</td>
        <td style="padding: 12px 15px; text-align: center;">
          <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
            <input type="number" id="refill-input-${paint.id}" value="${val.toFixed(1)}" placeholder="مثال: 500" style="width: 90px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-family: 'Cairo', sans-serif; font-size: 0.85rem; outline: none; text-align: center;" min="0">
            <span style="font-size: 0.85rem; color: var(--text-light);">ml</span>
            <button class="btn btn-primary btn-refill-paint" data-id="${paint.id}" style="padding: 6px 14px; font-size: 0.85rem; background-color: var(--primary); box-shadow: none; border-radius: 6px;">حفظ</button>
          </div>
        </td>
      `;
      stockTableBody.appendChild(tr);
    });

    document.querySelectorAll(".btn-refill-paint").forEach(btn => {
      btn.addEventListener("click", async () => {
        const paintId = btn.getAttribute("data-id");
        const input = document.getElementById(`refill-input-${paintId}`);
        const amount = parseFloat(input.value);
        if (isNaN(amount) || amount < 0) {
          alert("الرجاء إدخال كمية صحيحة (0 أو أكثر).");
          return;
        }
        await refillStock(paintId, amount, btn);
      });
    });
  };

  const refillStock = async (paintId, amount, btn) => {
    const token = localStorage.getItem("pbn_admin_token");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "جاري الحفظ...";

    try {
      const response = await fetch("/api/admin/stock/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          paint_id: paintId,
          amount_ml: amount
        })
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("pbn_admin_token");
        checkSession();
        return;
      }

      const data = await response.json();
      if (response.ok && data.success) {
        alert("تم تحديث كمية المخزون بنجاح!");
        loadStockData();
      } else {
        alert("فشل تحديث المخزون: " + (data.errors ? data.errors.join(" | ") : "خطأ غير معروف"));
      }
    } catch (err) {
      console.error("Update stock error:", err);
      alert("حدث خطأ أثناء الاتصال بالخادم لتعديل المخزون.");
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  // Sync color picker and text input for adding new colors
  const newPaintColorPicker = document.getElementById("newPaintColorPicker");
  const newPaintHex = document.getElementById("newPaintHex");

  if (newPaintColorPicker && newPaintHex) {
    // Sync color picker to text input
    newPaintColorPicker.addEventListener("input", (e) => {
      newPaintHex.value = e.target.value.toUpperCase();
    });

    // Sync text input to color picker
    newPaintHex.addEventListener("input", (e) => {
      let val = e.target.value.trim();
      if (val && !val.startsWith("#")) {
        val = "#" + val;
      }
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        newPaintColorPicker.value = val.toLowerCase();
      }
    });
  }

  if (btnRefreshStock) {
    btnRefreshStock.addEventListener("click", loadStockData);
  }

  // Handle adding new paint color form
  const addPaintForm = document.getElementById("addPaintForm");
  if (addPaintForm) {
    addPaintForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const token = localStorage.getItem("pbn_admin_token");
      const name_ar = document.getElementById("newPaintName").value.trim();
      const hex = document.getElementById("newPaintHex").value.trim();
      const ncs = document.getElementById("newPaintNcs").value.trim();
      const stock_ml = parseFloat(document.getElementById("newPaintStock").value);

      if (!name_ar || !hex || !ncs || isNaN(stock_ml)) {
        alert("الرجاء تعبئة جميع الحقول بشكل صحيح.");
        return;
      }

      try {
        const response = await fetch("/api/admin/stock/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ name_ar, hex, ncs, stock_ml })
        });

        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("pbn_admin_token");
          checkSession();
          return;
        }

        const data = await response.json();
        if (response.ok && data.success) {
          alert("تمت إضافة اللون الجديد بنجاح!");
          addPaintForm.reset();
          loadStockData();
        } else {
          alert("فشل إضافة اللون: " + (data.errors ? data.errors.join(" | ") : "خطأ غير معروف"));
        }
      } catch (err) {
        console.error("Add paint error:", err);
        alert("حدث خطأ أثناء الاتصال بالخادم لإضافة اللون الجديد.");
      }
    });
  }

  // ==========================================
  // ⚙️ Live search and filters event bindings
  // ==========================================
  searchFilter.addEventListener("input", renderOrders);
  statusFilter.addEventListener("change", renderOrders);
  cityFilter.addEventListener("change", renderOrders);

  // Initialize Auth Check
  checkSession();
});
