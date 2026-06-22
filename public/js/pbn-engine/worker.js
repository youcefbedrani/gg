// Web Worker for running the Paint-by-Numbers pipeline in the background.

import { runPipeline, generateSVGString } from "./pipeline.js";

self.onmessage = async function (e) {
  const { imageData, options } = e.data;

  try {
    const result = await runPipeline(imageData, options, (text, progress) => {
      // Send progress updates back to main thread
      self.postMessage({
        type: "progress",
        text,
        progress,
      });
    });

    // Generate output SVGs: one filled for preview, one outline-only for printing
    const sizeMultiplier = options.sizeMultiplier || 3;
    const fontSize = options.fontSize || 35;
    const fontColor = options.fontColor || "#333333";

    const svgFilled = generateSVGString(
      result.facetResult,
      result.colorsByIndex,
      sizeMultiplier,
      true, // stroke
      true, // fill
      true, // labels
      fontSize,
      fontColor
    );

    const svgOutline = generateSVGString(
      result.facetResult,
      result.colorsByIndex,
      sizeMultiplier,
      true, // stroke
      false, // fill
      true, // labels
      fontSize,
      fontColor
    );

    // Send the final result back to main thread
    self.postMessage({
      type: "result",
      colorsByIndex: result.colorsByIndex,
      svgFilled,
      svgOutline,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error("Worker pipeline error:", error);
    self.postMessage({
      type: "error",
      error: error.message || error.toString(),
    });
  }
};
