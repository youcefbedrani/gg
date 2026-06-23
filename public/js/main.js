// Client-side Application Main Entry Point.
// Coordinates gallery rendering, file uploads, Web Worker integration, and UI tabs.

import { initOrderForm, selectPredefinedArtwork, selectCustomDesign } from "./orderForm.js";
import { matchColorClient } from "./pbn-engine/colorMixer.js";

let artworks = [];
let basePaints = [];
let currentUploadResult = null; // Stores computed custom image data
let uploadedImageData = null;   // Stores resized canvas ImageData for processing

document.addEventListener("DOMContentLoaded", async () => {
  // Mobile menu toggle
  const menuToggle = document.getElementById("menuToggle");
  const navMenu = document.getElementById("navMenu");
  menuToggle.addEventListener("click", () => {
    navMenu.classList.toggle("active");
  });

  // Fetch initial catalog data
  try {
    const [artworksRes, basePaintsRes] = await Promise.all([
      fetch("/api/artworks"),
      fetch("/api/basePaints"),
    ]);

    artworks = await artworksRes.json();
    basePaints = await basePaintsRes.json();

    // Initialize checkout form logic
    initOrderForm(basePaints);

    // Render designs gallery
    renderGallery();

    // Auto-select artwork from URL search params (e.g. ?art=art_15)
    const urlParams = new URLSearchParams(window.location.search);
    const artIdParam = urlParams.get("art");
    
    if (artIdParam) {
      const art = artworks.find(a => a.id === artIdParam);
      if (art) selectPredefinedArtwork(art);
    }
  } catch (error) {
    console.error("Initialization error:", error);
    document.getElementById("artworksGrid").innerHTML = `
      <div class="alert alert-danger" style="grid-column: 1/-1; text-align: center;">
        فشل تحميل المنتجات. الرجاء التحقق من اتصالك بالإنترنت وإعادة تحديث الصفحة.
      </div>
    `;
  }

  // Setup drag-and-drop file upload listeners
  setupFileUpload();

  // Setup conversion processor triggers
  setupImageProcessor();

  // Setup success modal close button
  document.getElementById("closeSuccessBtn").addEventListener("click", () => {
    document.getElementById("successModal").style.display = "none";
  });

  // Setup before-after comparison slider
  initBeforeAfterSlider();

  // Setup floating mobile button
  initMobileFloatingCta();
});

/**
 * Renders the 6 predefined artworks from the catalog.
 */
function renderGallery() {
  const grid = document.getElementById("artworksGrid");
  grid.innerHTML = "";

  artworks.forEach((art) => {
    const card = document.createElement("div");
    card.className = "art-card";

    card.innerHTML = `
      <div class="art-img-container">
        <img src="${art.image_thumbnail}" alt="" loading="lazy" width="500" height="500">
      </div>
      <div class="art-details">
        <div class="art-specs">
          <span>📏 ${art.default_size} · 🎨 ${art.palette.length} ألوان · فاخر</span>
        </div>
        <button class="btn btn-primary order-btn" data-id="${art.id}">اطلب هذا التصميم</button>
      </div>
    `;

    // Bind selection event to checkout form
    card.querySelector(".order-btn").addEventListener("click", () => {
      selectPredefinedArtwork(art);
    });

    grid.appendChild(card);
  });
}

/**
 * Configures drag-and-drop or file selector uploads for custom photos.
 */
function setupFileUpload() {
  const area = document.getElementById("dragDropArea");
  const fileInput = document.getElementById("imageInput");

  area.addEventListener("click", () => fileInput.click());

  // Drag over effects
  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    area.classList.add("dragover");
  });

  area.addEventListener("dragleave", () => {
    area.classList.remove("dragover");
  });

  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });
}

function handleFileSelection(file) {
  // Enforce 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    alert("حجم الصورة كبير جداً. الحد الأقصى المسموح به هو 10 ميغابايت.");
    return;
  }

  // Enforce image files only
  if (!file.type.startsWith("image/")) {
    alert("الرجاء رفع ملف صورة صالح فقط.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Draw image to an offscreen canvas and downscale it to max 600px dimension
      // This is crucial to run K-means efficiently inside the browser.
      const maxDim = 600;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      uploadedImageData = ctx.getImageData(0, 0, width, height);

      // Visual feedback
      const dragArea = document.getElementById("dragDropArea");
      dragArea.innerHTML = `
        <span class="upload-icon">✅</span>
        <h3>تم تحميل الصورة بنجاح!</h3>
        <p>${file.name} (${width}x${height} بكسل)</p>
      `;

      document.getElementById("processBtn").disabled = false;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Handles Web Worker pipeline orchestration for custom image conversion.
 */
function setupImageProcessor() {
  const processBtn = document.getElementById("processBtn");
  const overlay = document.getElementById("processingOverlay");
  const progressText = document.getElementById("progressText");
  const barFill = document.getElementById("progressBarFill");
  const pbnResultContainer = document.getElementById("pbnResultContainer");
  const previewPlaceholder = document.getElementById("previewPlaceholder");

  processBtn.addEventListener("click", () => {
    if (!uploadedImageData) return;

    // Reset view states
    overlay.style.display = "flex";
    progressText.textContent = "تحميل المحرك الفني...";
    barFill.style.width = "0%";

    // Get detail options based on user selector
    const detailLevel = document.getElementById("detailLevel").value;
    let k = 18;
    let minFacetSize = 18;

    if (detailLevel === "easy") {
      k = 12;
      minFacetSize = 25;
    } else if (detailLevel === "hard") {
      k = 24;
      minFacetSize = 10;
    }

    // Spawn the processing Web Worker
    const worker = new Worker("/js/pbn-engine/worker.js", { type: "module" });

    // Send ImageData and options to worker thread
    worker.postMessage({
      imageData: {
        width: uploadedImageData.width,
        height: uploadedImageData.height,
        data: uploadedImageData.data, // Uint8ClampedArray
      },
      options: {
        k,
        minFacetSize,
        maxFacets: 1200,
        simplifyFactor: 2,
        narrowCleanupRuns: 3,
        sizeMultiplier: 4, // Larger multiplier renders high quality SVG lines
        fontSize: 38,
        fontColor: "#333333",
      },
    });

    worker.onmessage = (e) => {
      const msg = e.data;

      if (msg.type === "progress") {
        progressText.textContent = msg.text;
        barFill.style.width = `${Math.round(msg.progress * 100)}%`;
      } else if (msg.type === "result") {
        overlay.style.display = "none";
        previewPlaceholder.style.display = "none";
        pbnResultContainer.style.display = "flex";

        currentUploadResult = msg;

        // Render filled preview initially
        renderPreviewSVG(true);

        // Build client-side palette recipes preview
        renderPaletteLegend(msg.colorsByIndex);

        // Terminate worker
        worker.terminate();
      } else if (msg.type === "error") {
        overlay.style.display = "none";
        alert(`فشل معالجة الصورة: ${msg.error}`);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      console.error("Worker error event:", err);
      overlay.style.display = "none";
      alert("حدث خطأ داخلي أثناء تحويل الصورة.");
      worker.terminate();
    };
  });

  // Tab views toggle (Filled Preview vs Outline blueprint)
  const tabFilled = document.getElementById("btnShowFilled");
  const tabOutline = document.getElementById("btnShowOutline");

  tabFilled.addEventListener("click", () => {
    tabFilled.classList.add("active");
    tabOutline.classList.remove("active");
    renderPreviewSVG(true);
  });

  tabOutline.addEventListener("click", () => {
    tabOutline.classList.add("active");
    tabFilled.classList.remove("active");
    renderPreviewSVG(false);
  });

  // Wire Order Custom Design button to checkout form
  document.getElementById("orderCustomBtn").addEventListener("click", () => {
    if (currentUploadResult) {
      selectCustomDesign(currentUploadResult);
    }
  });
}

function renderPreviewSVG(showFilled) {
  if (!currentUploadResult) return;
  const box = document.getElementById("svgOutputBox");
  box.innerHTML = showFilled ? currentUploadResult.svgFilled : currentUploadResult.svgOutline;
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

/**
 * Builds the visual color recipe legends on the client side.
 */
function renderPaletteLegend(colorsByIndex) {
  const container = document.getElementById("paletteLegend");
  container.innerHTML = "";

  colorsByIndex.forEach((color, idx) => {
    const num = idx + 1;
    const hex = rgbToHex(color[0], color[1], color[2]);

    // Match against database base paints
    const recipe = matchColorClient(hex, basePaints);
    
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";

    let recipeTextStr = "";
    if (recipe.available_direct) {
      recipeTextStr = `<strong>${recipe.match.name_ar}</strong> (جاهز)`;
    } else if (recipe.match && recipe.match.components) {
      const comp1 = recipe.match.components[0];
      const comp2 = recipe.match.components[1];
      recipeTextStr = `مزج <strong>${comp1.percentage}% ${comp1.name_ar}</strong> + <strong>${comp2.percentage}% ${comp2.name_ar}</strong>`;
      if (recipe.adjustment_tip) {
        recipeTextStr += ` <span class="tip" title="${recipe.adjustment_tip}">💡</span>`;
      }
    }

    legendItem.innerHTML = `
      <span class="color-dot" style="background-color: ${hex};" title="${hex}">${num}</span>
      <span class="recipe-text">${recipeTextStr}</span>
    `;

    container.appendChild(legendItem);
  });
}

/**
 * Initializes the interactive before-after coloring slider.
 */
function initBeforeAfterSlider() {
  const slider = document.getElementById("beforeAfterSlider");
  const outlineWrapper = document.getElementById("outlineWrapper");
  const handle = document.getElementById("sliderHandle");
  
  if (!slider || !outlineWrapper || !handle) return;
  
  const outlineImg = outlineWrapper.querySelector("img");
  if (!outlineImg) return;

  function updateImageSize() {
    const containerWidth = slider.clientWidth;
    outlineImg.style.width = containerWidth + "px";
    outlineImg.style.height = containerWidth + "px";
  }

  // Initial call and listener for window resize
  updateImageSize();
  window.addEventListener("resize", updateImageSize);

  let isDragging = false;

  function moveSlider(x) {
    const rect = slider.getBoundingClientRect();
    let position = (x - rect.left) / rect.width;
    
    // Constrain position between 0 and 1
    position = Math.max(0, Math.min(1, position));
    
    const percentage = position * 100;
    
    // We cover the left side with the outline (cropped wrapper)
    outlineWrapper.style.width = percentage + "%";
    handle.style.left = percentage + "%";
    
    // Disable transition during drag to prevent delay lag
    outlineWrapper.style.transition = "none";
    handle.style.transition = "none";
  }

  // Mouse drag events
  slider.addEventListener("mousedown", (e) => {
    isDragging = true;
    moveSlider(e.clientX);
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    moveSlider(e.clientX);
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // Touch drag events (Mobile)
  slider.addEventListener("touchstart", (e) => {
    isDragging = true;
    if (e.touches && e.touches.length > 0) {
      moveSlider(e.touches[0].clientX);
    }
  });

  window.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    if (e.touches && e.touches.length > 0) {
      moveSlider(e.touches[0].clientX);
    }
  });

  window.addEventListener("touchend", () => {
    isDragging = false;
  });
}

/**
 * Handles persistent floating button functionality on mobile version.
 */
function initMobileFloatingCta() {
  const mobileCta = document.getElementById("mobileFloatingCta");
  const ctaBtn = document.getElementById("mobileCtaBtn");
  const orderSection = document.getElementById("order-section");
  const gallerySection = document.getElementById("gallery");

  if (!mobileCta || !ctaBtn || !orderSection) return;

  ctaBtn.addEventListener("click", () => {
    // Check if an artwork is selected
    const selectedName = document.getElementById("selectedName")?.textContent || "";
    const isSelected = selectedName && selectedName.trim() !== "لم يتم تحديد تصميم بعد" && selectedName.trim() !== "";

    if (isSelected) {
      // Scroll directly to order / frame selection
      orderSection.scrollIntoView({ behavior: "smooth" });
      
      // Focus frame select option if visible
      setTimeout(() => {
        document.getElementById("frameOption")?.focus();
      }, 800);
    } else {
      // Prompt user to select design first by scrolling to gallery
      gallerySection.scrollIntoView({ behavior: "smooth" });
    }
  });

  // Show floating CTA on scroll down (hidden on load), hide when order section in view
  let scrollTimeout;
  window.addEventListener("scroll", () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      if (window.innerWidth > 768) return;
      const rect = orderSection.getBoundingClientRect();
      const scrolledPast = window.scrollY > 300;
      const orderVisible = rect.top < window.innerHeight && rect.bottom > 0;
      if (orderVisible) {
        mobileCta.style.display = "none";
      } else if (scrolledPast) {
        mobileCta.style.display = "block";
      } else {
        mobileCta.style.display = "none";
      }
    }, 100);
  });
}
