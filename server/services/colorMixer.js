const fs = require("fs");
const path = require("path");

// Load base paints
let basePaints = [];
try {
  const filePath = path.join(__dirname, "../data/basePaints.json");
  basePaints = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (err) {
  console.error("Failed to load base paints in colorMixer:", err);
}

// Convert Hex to RGB [r, g, b]
function hexToRgb(hex) {
  let c = hex.replace(/^#/, "");
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const num = parseInt(c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Convert RGB to XYZ
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

  // D65 Standard Illuminant
  const x = rL * 0.4124 + gL * 0.3576 + bL * 0.1805;
  const y = rL * 0.2126 + gL * 0.7152 + bL * 0.0722;
  const z = rL * 0.0193 + gL * 0.1192 + bL * 0.9505;
  return [x, y, z];
}

// Convert XYZ to CIELAB
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

// Convert Hex to CIELAB
function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex);
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

// Convert RGB to CIELAB
function rgbToLab(r, g, b) {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

// Calculate CIE76 Delta-E
function calculateDeltaE(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
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
 * Finds the closest base paint or calculates the best 2-color mix recipe.
 * @param {string} targetHex - Hex code of target color (e.g. "#3B5F8A")
 * @returns {object} Match result details
 */
function matchColor(targetHex) {
  const targetLab = hexToLab(targetHex);

  // Pre-calculate CIELAB for all base paints
  const basePaintsWithLab = basePaints.map((p) => ({
    ...p,
    lab: hexToLab(p.hex),
    rgb: hexToRgb(p.hex),
  }));

  // Step 1: Check for direct match
  let closestDirect = null;
  let minDirectDeltaE = Number.MAX_VALUE;

  for (const bp of basePaintsWithLab) {
    const dE = calculateDeltaE(targetLab, bp.lab);
    if (dE < minDirectDeltaE) {
      minDirectDeltaE = dE;
      closestDirect = bp;
    }
  }

  // Threshold below which we consider the color "directly available"
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

  // Step 2: Compute best 2-color mix
  let bestMix = null;
  let minMixDeltaE = Number.MAX_VALUE;

  for (let i = 0; i < basePaintsWithLab.length; i++) {
    for (let j = i + 1; j < basePaintsWithLab.length; j++) {
      const p1 = basePaintsWithLab[i];
      const p2 = basePaintsWithLab[j];

      // Try ratios in increments of 5%
      for (let ratio = 5; ratio <= 95; ratio += 5) {
        const r1 = ratio / 100;
        const r2 = 1 - r1;

        // Subtractive color mixing approximation in RGB space
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

  // Step 3: Compute adjustment tips based on Lightness (L) differences
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

module.exports = {
  matchColor,
  hexToRgb,
  rgbToLab,
  calculateDeltaE,
};
