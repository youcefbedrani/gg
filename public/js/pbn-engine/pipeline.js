// Client-side Paint-by-Numbers Pipeline Orchestrator.
// Integrates all stages (K-means, facets, pruning, boundary tracing, Douglas-Peucker, Polylabel).

import { Vector, KMeans, rgbToLab, labToRgb } from "./kmeans.js";
import { FacetCreator, Uint8Array2D, BooleanArray2D } from "./facetBuilder.js";
import { FacetReducer } from "./facetReducer.js";
import { FacetBorderTracer } from "./borderTracer.js";
import { FacetBorderSegmenter } from "./facetBorderSegmenter.js";
import { FacetLabelPlacer } from "./labelPlacer.js";

// Helper: Calculate standard color distances
function buildDistanceMatrix(colorsByIndex) {
  const size = colorsByIndex.length;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let j = 0; j < size; j++) {
    for (let i = j; i < size; i++) {
      const c1 = colorsByIndex[j];
      const c2 = colorsByIndex[i];
      const distance = Math.sqrt(
        (c1[0] - c2[0]) * (c1[0] - c2[0]) +
        (c1[1] - c2[1]) * (c1[1] - c2[1]) +
        (c1[2] - c2[2]) * (c1[2] - c2[2])
      );
      matrix[i][j] = distance;
      matrix[j][i] = distance;
    }
  }
  return matrix;
}

// Helper: Removes single pixel rows/columns that make the canvas messy to paint
function cleanNarrowPixelStrips(width, height, imgColorIndices, colorsByIndex) {
  const colorDistances = buildDistanceMatrix(colorsByIndex);
  let count = 0;

  for (let j = 1; j < height - 1; j++) {
    for (let i = 1; i < width - 1; i++) {
      const top = imgColorIndices.get(i, j - 1);
      const bottom = imgColorIndices.get(i, j + 1);
      const left = imgColorIndices.get(i - 1, j);
      const right = imgColorIndices.get(i + 1, j);
      const cur = imgColorIndices.get(i, j);

      if (cur !== top && cur !== bottom && cur !== left && cur !== right) {
        // Single isolated pixel
      } else if (cur !== top && cur !== bottom) {
        const topDist = colorDistances[cur][top];
        const bottomDist = colorDistances[cur][bottom];
        imgColorIndices.set(i, j, topDist < bottomDist ? top : bottom);
        count++;
      } else if (cur !== left && cur !== right) {
        const leftDist = colorDistances[cur][left];
        const rightDist = colorDistances[cur][right];
        imgColorIndices.set(i, j, leftDist < rightDist ? left : right);
        count++;
      }
    }
  }
}

/**
 * Runs the entire image-to-paint-by-number process on the provided pixel data.
 */
export async function runPipeline(imgData, options = {}, onProgress = null) {
  const k = options.k || 16;
  const minFacetSize = options.minFacetSize || 20;
  const maxFacets = options.maxFacets || 1000;
  const simplifyFactor = options.simplifyFactor || 2; // simplification level
  const narrowCleanupRuns = options.narrowCleanupRuns || 3;

  const width = imgData.width;
  const height = imgData.height;

  // Step 1: Prepare vectors for K-means clustering (RGB space)
  if (onProgress) onProgress("تحليل ألوان الصورة...", 0.05);

  const points = [];
  const pointsByColor = {};
  const bitsToChopOff = 2; // small performance boost by grouping very close colors

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = imgData.data[idx];
      let g = imgData.data[idx + 1];
      let b = imgData.data[idx + 2];

      r = (r >> bitsToChopOff) << bitsToChopOff;
      g = (g >> bitsToChopOff) << bitsToChopOff;
      b = (b >> bitsToChopOff) << bitsToChopOff;

      const colorKey = `${r},${g},${b}`;
      if (!pointsByColor[colorKey]) {
        pointsByColor[colorKey] = [y * width + x];
      } else {
        pointsByColor[colorKey].push(y * width + x);
      }
    }
  }

  let vIdx = 0;
  for (const color of Object.keys(pointsByColor)) {
    const rgb = color.split(",").map((v) => parseInt(v, 10));
    const labValues = rgbToLab(rgb[0], rgb[1], rgb[2]); // Cluster in CIELAB space
    const weight = pointsByColor[color].length / (width * height);
    const vec = new Vector(labValues, weight);
    vec.tag = rgb;
    points[vIdx++] = vec;
  }

  if (onProgress) onProgress("تقسيم درجات الألوان (K-means)...", 0.1);

  // Run K-means clustering
  const kmeans = new KMeans(points, k, 12345); // Seeded random for consistency
  kmeans.step();

  let iterations = 0;
  while (kmeans.currentDeltaDistanceDifference > 1.0 && iterations < 30) {
    kmeans.step();
    iterations++;
    if (onProgress) {
      const progress = 0.1 + 0.15 * (iterations / 30);
      onProgress(`جاري دمج الألوان (دورة ${iterations})...`, progress);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  // Create quantized Image Data representation
  const outputImgData = new Uint8Array(width * height * 4);
  const colorsByIndex = [];
  const colorsMap = {};
  let colorIndexCounter = 0;

  for (let c = 0; c < kmeans.centroids.length; c++) {
    const centroid = kmeans.centroids[c];
    const rgb = labToRgb(centroid.values[0], centroid.values[1], centroid.values[2]);
    const colorKey = `${rgb[0]},${rgb[1]},${rgb[2]}`;

    if (colorsMap[colorKey] === undefined) {
      colorsMap[colorKey] = colorIndexCounter;
      colorsByIndex.push(rgb);
      colorIndexCounter++;
    }

    const currentIdx = colorsMap[colorKey];

    for (const v of kmeans.pointsPerCategory[c]) {
      const ptColorKey = `${v.tag[0]},${v.tag[1]},${v.tag[2]}`;
      for (const pt of pointsByColor[ptColorKey]) {
        const ptx = pt % width;
        const pty = Math.floor(pt / width);
        const dataOffset = (pty * width + ptx) * 4;

        outputImgData[dataOffset] = rgb[0];
        outputImgData[dataOffset + 1] = rgb[1];
        outputImgData[dataOffset + 2] = rgb[2];
        outputImgData[dataOffset + 3] = 255;
      }
    }
  }

  // Step 2: Build color map index grid
  if (onProgress) onProgress("جاري تهيئة خريطة الألوان...", 0.3);

  const imgColorIndices = new Uint8Array2D(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = outputImgData[offset];
      const g = outputImgData[offset + 1];
      const b = outputImgData[offset + 2];
      const colorKey = `${r},${g},${b}`;
      imgColorIndices.set(x, y, colorsMap[colorKey]);
    }
  }

  // Run narrow pixel strip cleanup runs to smooth out regions
  const colormapResult = {
    imgColorIndices,
    colorsByIndex,
    width,
    height,
  };

  if (onProgress) onProgress("تنعيم المساحات الصغيرة وتصفيتها...", 0.35);

  let facetResult;
  if (narrowCleanupRuns === 0) {
    facetResult = await FacetCreator.getFacets(width, height, imgColorIndices);
    await FacetReducer.reduceFacets(
      minFacetSize,
      true,
      maxFacets,
      colorsByIndex,
      facetResult,
      imgColorIndices
    );
  } else {
    for (let run = 0; run < narrowCleanupRuns; run++) {
      cleanNarrowPixelStrips(width, height, imgColorIndices, colorsByIndex);
      facetResult = await FacetCreator.getFacets(width, height, imgColorIndices);
      await FacetReducer.reduceFacets(
        minFacetSize,
        true,
        maxFacets,
        colorsByIndex,
        facetResult,
        imgColorIndices
      );
    }
  }

  // Step 3: Outline tracing
  if (onProgress) onProgress("تحديد حدود المساحات اللونية...", 0.6);
  await FacetBorderTracer.buildFacetBorderPaths(facetResult);

  // Step 4: Simplify borders and align boundaries
  if (onProgress) onProgress("تنعيم وتطابق خطوط الرسم...", 0.75);
  await FacetBorderSegmenter.buildFacetBorderSegments(facetResult, simplifyFactor);

  // Step 5: Placement of color number labels
  if (onProgress) onProgress("تحديد مواقع أرقام الألوان...", 0.9);
  await FacetLabelPlacer.buildFacetLabelBounds(facetResult);

  if (onProgress) onProgress("اكتمل التحويل بنجاح!", 1.0);

  return {
    facetResult,
    colorsByIndex,
    width,
    height,
  };
}

/**
 * Generates an SVG string representation of the Paint-by-Numbers canvas.
 */
export function generateSVGString(
  facetResult,
  colorsByIndex,
  sizeMultiplier = 3,
  stroke = true,
  fill = false,
  addLabels = true,
  fontSize = 35,
  fontColor = "#333333"
) {
  const svgWidth = sizeMultiplier * facetResult.width;
  const svgHeight = sizeMultiplier * facetResult.height;
  let svg = `<?xml version="1.0" standalone="no"?>\n<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" dir="ltr">\n`;

  // Draw paths
  for (const f of facetResult.facets) {
    if (f != null && f.borderSegments && f.borderSegments.length > 0) {
      const newpath = f.getFullPathFromBorderSegments(false);
      if (newpath.length === 0) continue;

      // Close loop
      if (newpath[0].x !== newpath[newpath.length - 1].x || newpath[0].y !== newpath[newpath.length - 1].y) {
        newpath.push(newpath[0]);
      }

      let data = "M ";
      data += newpath[0].x * sizeMultiplier + " " + newpath[0].y * sizeMultiplier + " ";
      for (let i = 1; i < newpath.length; i++) {
        const midpointX = (newpath[i].x + newpath[i - 1].x) / 2;
        const midpointY = (newpath[i].y + newpath[i - 1].y) / 2;
        data += `Q ${midpointX * sizeMultiplier} ${midpointY * sizeMultiplier} ${newpath[i].x * sizeMultiplier} ${newpath[i].y * sizeMultiplier} `;
      }
      data += "Z";

      const color = colorsByIndex[f.color];
      const rgbStr = `rgb(${color[0]},${color[1]},${color[2]})`;
      const fillStr = fill ? rgbStr : "none";
      const strokeStr = stroke ? "#888888" : fill ? rgbStr : "none";
      const strokeWidth = "0.7px";

      svg += `  <path d="${data}" fill="${fillStr}" stroke="${strokeStr}" stroke-width="${strokeWidth}" data-facet="${f.id}" />\n`;
    }
  }

  // Draw text labels (always on top so they remain readable)
  if (addLabels) {
    for (const f of facetResult.facets) {
      if (f != null && f.labelBounds) {
        const labelX = ((f.labelBounds.minX + f.labelBounds.maxX) / 2) * sizeMultiplier;
        const labelY = ((f.labelBounds.minY + f.labelBounds.maxY) / 2) * sizeMultiplier;
        const nrOfDigits = (f.color + 1 + "").length;
        
        // Scale font size based on inscribed circle radius (f.labelDistance)
        const radiusInPixels = (f.labelDistance || 0) * sizeMultiplier;
        
        // If the area is extremely small, do not render a label to prevent overflow clutter
        if (radiusInPixels < 5.5) continue;
        
        let size = Math.max(8, fontSize / nrOfDigits);
        // Cap the font size to avoid overflowing the shape
        const limitSize = radiusInPixels * 1.6;
        if (size > limitSize) {
          size = limitSize;
        }
        
        // If the scaled size is too small to read, omit it
        if (size < 7.5) continue;

        svg += `  <text x="${labelX}" y="${labelY}" font-family="Cairo, Tahoma, sans-serif" font-size="${size}px" fill="${fontColor}" dominant-baseline="middle" text-anchor="middle">${f.color + 1}</text>\n`;
      }
    }
  }

  svg += "</svg>";
  return svg;
}
