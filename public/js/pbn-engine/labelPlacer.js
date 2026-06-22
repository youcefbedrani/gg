// Client-side Label Placer module.
// Implements the polylabel algorithm using a priority queue to place labels inside facets.

import { Point, BoundingBox, FacetCreator } from "./facetBuilder.js";

// Helper: Simple Priority Queue using a sorted array for clean, dependency-free code
class SimplePriorityQueue {
  constructor() {
    this.items = [];
  }

  enqueue(item) {
    // Insert item in sorted order of max priority (descending order of item.max)
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (item.max > this.items[i].max) {
        this.items.splice(i, 0, item);
        added = true;
        break;
      }
    }
    if (!added) {
      this.items.push(item);
    }
  }

  dequeue() {
    return this.items.shift();
  }

  get size() {
    return this.items.length;
  }
}

class Cell {
  constructor(x, y, h, polygon) {
    this.x = x;
    this.y = y;
    this.h = h;
    this.d = pointToPolygonDist(x, y, polygon);
    this.max = this.d + this.h * Math.SQRT2;
  }
}

// Get squared distance from a point to a segment
function getSegDistSq(px, py, a, b) {
  let x = a.x;
  let y = a.y;
  let dx = b.x - x;
  let dy = b.y - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.x;
      y = b.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = px - x;
  dy = py - y;

  return dx * dx + dy * dy;
}

// Signed distance from point to polygon (negative if outside)
export function pointToPolygonDist(x, y, polygon) {
  let inside = false;
  let minDistSq = Infinity;

  for (let k = 0; k < polygon.length; k++) {
    const ring = polygon[k];
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i];
      const b = ring[j];

      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
      minDistSq = Math.min(minDistSq, getSegDistSq(x, y, a, b));
    }
  }

  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

// Get polygon centroid
function getCentroidCell(polygon) {
  let area = 0;
  let x = 0;
  let y = 0;
  const points = polygon[0];

  for (let i = 0, len = points.length, j = len - 1; i < len; j = i++) {
    const a = points[i];
    const b = points[j];
    const f = a.x * b.y - b.x * a.y;
    x += (a.x + b.x) * f;
    y += (a.y + b.y) * f;
    area += f * 3;
  }
  if (area === 0) {
    return new Cell(points[0].x, points[0].y, 0, polygon);
  }
  return new Cell(x / area, y / area, 0, polygon);
}

export function polylabel(polygon, precision = 1.0) {
  // Find bounding box of outer ring
  let minX = Number.MAX_VALUE;
  let minY = Number.MAX_VALUE;
  let maxX = -Number.MAX_VALUE;
  let maxY = -Number.MAX_VALUE;

  for (let i = 0; i < polygon[0].length; i++) {
    const p = polygon[0][i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  let h = cellSize / 2;

  if (cellSize === 0) {
    return { pt: new Point(minX, minY), distance: 0 };
  }

  const cellQueue = new SimplePriorityQueue();

  // Cover polygon with initial cells
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      cellQueue.enqueue(new Cell(x + h, y + h, h, polygon));
    }
  }

  let bestCell = getCentroidCell(polygon);
  const bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, polygon);
  if (bboxCell.d > bestCell.d) {
    bestCell = bboxCell;
  }

  while (cellQueue.size > 0) {
    const cell = cellQueue.dequeue();

    if (cell.d > bestCell.d) {
      bestCell = cell;
    }

    if (cell.max - bestCell.d <= precision) {
      continue;
    }

    h = cell.h / 2;
    cellQueue.enqueue(new Cell(cell.x - h, cell.y - h, h, polygon));
    cellQueue.enqueue(new Cell(cell.x + h, cell.y - h, h, polygon));
    cellQueue.enqueue(new Cell(cell.x - h, cell.y + h, h, polygon));
    cellQueue.enqueue(new Cell(cell.x + h, cell.y + h, h, polygon));
  }

  return { pt: new Point(bestCell.x, bestCell.y), distance: bestCell.d };
}

export class FacetLabelPlacer {
  static async buildFacetLabelBounds(facetResult, onUpdate = null) {
    let count = 0;
    let lastProgressTime = Date.now();

    for (const f of facetResult.facets) {
      if (f != null) {
        const polyRings = [];
        const borderPath = f.getFullPathFromBorderSegments(true);
        polyRings.push(borderPath);

        const onlyOuterRing = [borderPath];

        if (f.neighbourFacetsIsDirty) {
          FacetCreator.buildFacetNeighbour(f, facetResult);
        }

        // Add neighbors fully inside as holes
        for (const neighbourIdx of f.neighbourFacets) {
          const neighbour = facetResult.facets[neighbourIdx];
          if (neighbour != null && neighbour.borderSegments) {
            const neighbourPath = neighbour.getFullPathFromBorderSegments(true);
            if (FacetLabelPlacer.doesNeighbourFallInsideInCurrentFacet(neighbourPath, f, onlyOuterRing)) {
              polyRings.push(neighbourPath);
            }
          }
        }

        const result = polylabel(polyRings, 1.0);
        f.labelBounds = new BoundingBox();
        f.labelDistance = result.distance; // Save distance for dynamic font scaling

        // Inner label boundary square
        const innerPadding = 2.0 * Math.sqrt(2 * result.distance);
        f.labelBounds.minX = result.pt.x - innerPadding;
        f.labelBounds.maxX = result.pt.x + innerPadding;
        f.labelBounds.minY = result.pt.y - innerPadding;
        f.labelBounds.maxY = result.pt.y + innerPadding;

        const now = Date.now();
        if (now - lastProgressTime > 200) {
          lastProgressTime = now;
          if (onUpdate) {
            onUpdate(f.id / facetResult.facets.length);
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      count++;
    }

    if (onUpdate) {
      onUpdate(1.0);
    }
  }

  static doesNeighbourFallInsideInCurrentFacet(neighbourPath, f, onlyOuterRing) {
    let fallsInside = true;

    // A fast bounding box check first
    for (let i = 0; i < neighbourPath.length && fallsInside; i++) {
      const pt = neighbourPath[i];
      if (pt.x >= f.bbox.minX && pt.x <= f.bbox.maxX && pt.y >= f.bbox.minY && pt.y <= f.bbox.maxY) {
        // inside bbox
      } else {
        fallsInside = false;
      }
    }

    // High fidelity inside check
    if (fallsInside) {
      for (let i = 0; i < neighbourPath.length && fallsInside; i++) {
        const pt = neighbourPath[i];
        const distance = pointToPolygonDist(pt.x, pt.y, onlyOuterRing);
        if (distance < 0) {
          fallsInside = false;
        }
      }
    }

    return fallsInside;
  }
}
