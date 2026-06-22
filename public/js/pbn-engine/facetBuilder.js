// Client-side Facet Builder module.
// Implements 2D typed arrays, flood-fill algorithm, and component grouping.

export class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  distanceTo(p) {
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceToCoord(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

export class BoundingBox {
  constructor() {
    this.minX = Number.MAX_VALUE;
    this.maxX = -Number.MAX_VALUE;
    this.minY = Number.MAX_VALUE;
    this.maxY = -Number.MAX_VALUE;
  }

  get width() {
    return this.maxX - this.minX + 1;
  }

  get height() {
    return this.maxY - this.minY + 1;
  }
}

export class Uint32Array2D {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.arr = new Uint32Array(width * height);
  }
  get(x, y) {
    return this.arr[y * this.width + x];
  }
  set(x, y, value) {
    this.arr[y * this.width + x] = value;
  }
}

export class Uint8Array2D {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.arr = new Uint8Array(width * height);
  }
  get(x, y) {
    return this.arr[y * this.width + x];
  }
  set(x, y, value) {
    this.arr[y * this.width + x] = value;
  }
  matchAllAround(x, y, value) {
    const idx = y * this.width + x;
    return (
      x - 1 >= 0 &&
      this.arr[idx - 1] === value &&
      y - 1 >= 0 &&
      this.arr[idx - this.width] === value &&
      x + 1 < this.width &&
      this.arr[idx + 1] === value &&
      y + 1 < this.height &&
      this.arr[idx + this.width] === value
    );
  }
}

export class BooleanArray2D {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.arr = new Uint8Array(width * height);
  }
  get(x, y) {
    return this.arr[y * this.width + x] !== 0;
  }
  set(x, y, value) {
    this.arr[y * this.width + x] = value ? 1 : 0;
  }
}

export class Facet {
  constructor() {
    this.id = -1;
    this.color = -1;
    this.pointCount = 0;
    this.borderPoints = [];
    this.neighbourFacets = null;
    this.neighbourFacetsIsDirty = false;
    this.bbox = new BoundingBox();
    this.borderPath = null;
    this.borderSegments = null;
    this.labelBounds = null;
  }

  getFullPathFromBorderSegments(useWalls) {
    const newpath = [];
    const addPoint = (pt) => {
      if (useWalls) {
        newpath.push(new Point(pt.getWallX(), pt.getWallY()));
      } else {
        newpath.push(new Point(pt.x, pt.y));
      }
    };

    let lastSegment = null;
    for (const seg of this.borderSegments) {
      if (lastSegment != null) {
        if (lastSegment.reverseOrder) {
          addPoint(lastSegment.originalSegment.points[0]);
        } else {
          addPoint(
            lastSegment.originalSegment.points[
              lastSegment.originalSegment.points.length - 1
            ]
          );
        }
      }

      for (let i = 0; i < seg.originalSegment.points.length; i++) {
        const idx = seg.reverseOrder
          ? seg.originalSegment.points.length - 1 - i
          : i;
        addPoint(seg.originalSegment.points[idx]);
      }

      lastSegment = seg;
    }
    return newpath;
  }
}

export class FacetResult {
  constructor() {
    this.facetMap = null;
    this.facets = [];
    this.width = 0;
    this.height = 0;
  }
}

// Fast flood-fill implementation
export function fill(x, y, width, height, visitedCheck, setFill) {
  let xx = x;
  let yy = y;
  while (true) {
    const ox = xx;
    const oy = yy;
    while (yy !== 0 && !visitedCheck(xx, yy - 1)) {
      yy--;
    }
    while (xx !== 0 && !visitedCheck(xx - 1, yy)) {
      xx--;
    }
    if (xx === ox && yy === oy) {
      break;
    }
  }
  fillCore(xx, yy, width, height, visitedCheck, setFill);
}

function fillCore(x, y, width, height, visitedCheck, setFill) {
  let lastRowLength = 0;
  do {
    let rowLength = 0;
    let sx = x;
    if (lastRowLength !== 0 && visitedCheck(x, y)) {
      do {
        if (--lastRowLength === 0) {
          return;
        }
      } while (visitedCheck(++x, y));
      sx = x;
    } else {
      for (; x !== 0 && !visitedCheck(x - 1, y); rowLength++, lastRowLength++) {
        x--;
        setFill(x, y);
        if (y !== 0 && !visitedCheck(x, y - 1)) {
          fill(x, y - 1, width, height, visitedCheck, setFill);
        }
      }
    }

    for (; sx < width && !visitedCheck(sx, y); rowLength++, sx++) {
      setFill(sx, y);
    }

    if (rowLength < lastRowLength) {
      for (const end = x + lastRowLength; ++sx < end; ) {
        if (!visitedCheck(sx, y)) {
          fillCore(sx, y, width, height, visitedCheck, setFill);
        }
      }
    } else if (rowLength > lastRowLength && y !== 0) {
      for (let ux = x + lastRowLength; ++ux < sx; ) {
        if (!visitedCheck(ux, y - 1)) {
          fill(ux, y - 1, width, height, visitedCheck, setFill);
        }
      }
    }
    lastRowLength = rowLength;
  } while (lastRowLength !== 0 && ++y < height);
}

export class FacetCreator {
  static async getFacets(width, height, imgColorIndices, onUpdate = null) {
    const result = new FacetResult();
    result.width = width;
    result.height = height;

    const visited = new BooleanArray2D(width, height);
    result.facetMap = new Uint32Array2D(width, height);
    result.facets = [];

    let count = 0;
    const totalPixels = width * height;

    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const colorIndex = imgColorIndices.get(i, j);
        if (!visited.get(i, j)) {
          const facetIndex = result.facets.length;
          const facet = FacetCreator.buildFacet(
            facetIndex,
            colorIndex,
            i,
            j,
            visited,
            imgColorIndices,
            result
          );
          result.facets.push(facet);

          if (count % 400 === 0 && onUpdate) {
            onUpdate(count / totalPixels);
          }
        }
        count++;
      }
    }

    // Build neighbor relationships
    for (const f of result.facets) {
      if (f != null) {
        FacetCreator.buildFacetNeighbour(f, result);
      }
    }

    if (onUpdate) {
      onUpdate(1.0);
    }
    return result;
  }

  static buildFacet(
    facetIndex,
    facetColorIndex,
    x,
    y,
    visited,
    imgColorIndices,
    facetResult
  ) {
    const facet = new Facet();
    facet.id = facetIndex;
    facet.color = facetColorIndex;
    facet.neighbourFacetsIsDirty = true;
    facet.neighbourFacets = null;

    fill(
      x,
      y,
      facetResult.width,
      facetResult.height,
      (ptx, pty) =>
        visited.get(ptx, pty) ||
        imgColorIndices.get(ptx, pty) !== facetColorIndex,
      (ptx, pty) => {
        visited.set(ptx, pty, true);
        facetResult.facetMap.set(ptx, pty, facetIndex);
        facet.pointCount++;

        // Determine if point is border point
        const isInnerPoint = imgColorIndices.matchAllAround(
          ptx,
          pty,
          facetColorIndex
        );
        if (!isInnerPoint) {
          facet.borderPoints.push(new Point(ptx, pty));
        }

        // Bounding box bounds
        if (ptx > facet.bbox.maxX) facet.bbox.maxX = ptx;
        if (pty > facet.bbox.maxY) facet.bbox.maxY = pty;
        if (ptx < facet.bbox.minX) facet.bbox.minX = ptx;
        if (pty < facet.bbox.minY) facet.bbox.minY = pty;
      }
    );

    return facet;
  }

  static buildFacetNeighbour(facet, facetResult) {
    facet.neighbourFacets = [];
    const uniqueFacets = {};

    for (const pt of facet.borderPoints) {
      if (pt.x - 1 >= 0) {
        const leftFacetId = facetResult.facetMap.get(pt.x - 1, pt.y);
        if (leftFacetId !== facet.id) uniqueFacets[leftFacetId] = true;
      }
      if (pt.y - 1 >= 0) {
        const topFacetId = facetResult.facetMap.get(pt.x, pt.y - 1);
        if (topFacetId !== facet.id) uniqueFacets[topFacetId] = true;
      }
      if (pt.x + 1 < facetResult.width) {
        const rightFacetId = facetResult.facetMap.get(pt.x + 1, pt.y);
        if (rightFacetId !== facet.id) uniqueFacets[rightFacetId] = true;
      }
      if (pt.y + 1 < facetResult.height) {
        const bottomFacetId = facetResult.facetMap.get(pt.x, pt.y + 1);
        if (bottomFacetId !== facet.id) uniqueFacets[bottomFacetId] = true;
      }
    }

    for (const k of Object.keys(uniqueFacets)) {
      facet.neighbourFacets.push(parseInt(k, 10));
    }
    facet.neighbourFacetsIsDirty = false;
  }
}
