// Client-side Border Tracer module.
// Traces outlines around each facet component and tracks border orientations.

import { Point, BooleanArray2D } from "./facetBuilder.js";

export const OrientationEnum = {
  Left: 0,
  Top: 1,
  Right: 2,
  Bottom: 3,
};

export class PathPoint extends Point {
  constructor(pt, orientation) {
    super(pt.x, pt.y);
    this.orientation = orientation;
  }

  getWallX() {
    let x = this.x;
    if (this.orientation === OrientationEnum.Left) {
      x -= 0.5;
    } else if (this.orientation === OrientationEnum.Right) {
      x += 0.5;
    }
    return x;
  }

  getWallY() {
    let y = this.y;
    if (this.orientation === OrientationEnum.Top) {
      y -= 0.5;
    } else if (this.orientation === OrientationEnum.Bottom) {
      y += 0.5;
    }
    return y;
  }

  getNeighbour(facetResult) {
    switch (this.orientation) {
      case OrientationEnum.Left:
        if (this.x - 1 >= 0) {
          return facetResult.facetMap.get(this.x - 1, this.y);
        }
        break;
      case OrientationEnum.Right:
        if (this.x + 1 < facetResult.width) {
          return facetResult.facetMap.get(this.x + 1, this.y);
        }
        break;
      case OrientationEnum.Top:
        if (this.y - 1 >= 0) {
          return facetResult.facetMap.get(this.x, this.y - 1);
        }
        break;
      case OrientationEnum.Bottom:
        if (this.y + 1 < facetResult.height) {
          return facetResult.facetMap.get(this.x, this.y + 1);
        }
        break;
    }
    return -1;
  }
}

export class FacetBorderTracer {
  static async buildFacetBorderPaths(facetResult, onUpdate = null) {
    let count = 0;
    const borderMask = new BooleanArray2D(facetResult.width, facetResult.height);

    // Sort by largest facets first
    const facetProcessingOrder = facetResult.facets
      .filter((f) => f != null)
      .sort((a, b) => b.pointCount - a.pointCount)
      .map((f) => f.id);

    let lastProgressTime = Date.now();

    for (let fidx = 0; fidx < facetProcessingOrder.length; fidx++) {
      const fid = facetProcessingOrder[fidx];
      const f = facetResult.facets[fid];

      if (f != null) {
        for (const bp of f.borderPoints) {
          borderMask.set(bp.x, bp.y, true);
        }

        const xWall = new BooleanArray2D(facetResult.width + 1, facetResult.height + 1);
        const yWall = new BooleanArray2D(facetResult.width + 1, facetResult.height + 1);

        let borderStartIndex = -1;
        for (let i = 0; i < f.borderPoints.length; i++) {
          const bp = f.borderPoints[i];
          if (
            bp.x === f.bbox.minX ||
            bp.x === f.bbox.maxX ||
            bp.y === f.bbox.minY ||
            bp.y === f.bbox.maxY
          ) {
            borderStartIndex = i;
            break;
          }
        }

        if (borderStartIndex === -1) {
          borderStartIndex = 0;
        }

        const pt = new PathPoint(f.borderPoints[borderStartIndex], OrientationEnum.Left);

        if (pt.x - 1 < 0 || facetResult.facetMap.get(pt.x - 1, pt.y) !== f.id) {
          pt.orientation = OrientationEnum.Left;
        } else if (pt.y - 1 < 0 || facetResult.facetMap.get(pt.x, pt.y - 1) !== f.id) {
          pt.orientation = OrientationEnum.Top;
        } else if (pt.x + 1 >= facetResult.width || facetResult.facetMap.get(pt.x + 1, pt.y) !== f.id) {
          pt.orientation = OrientationEnum.Right;
        } else if (pt.y + 1 >= facetResult.height || facetResult.facetMap.get(pt.x, pt.y + 1) !== f.id) {
          pt.orientation = OrientationEnum.Bottom;
        }

        const path = FacetBorderTracer.getPath(pt, facetResult, f, borderMask, xWall, yWall);
        f.borderPath = path;

        const now = Date.now();
        if (now - lastProgressTime > 200) {
          lastProgressTime = now;
          if (onUpdate) {
            onUpdate(fidx / facetProcessingOrder.length);
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

  static addPointToPath(path, pt, xWall, f, yWall) {
    path.push(pt);
    if (pt.orientation === OrientationEnum.Left) {
      xWall.set(pt.x, pt.y, true);
    } else if (pt.orientation === OrientationEnum.Right) {
      xWall.set(pt.x + 1, pt.y, true);
    } else if (pt.orientation === OrientationEnum.Top) {
      yWall.set(pt.x, pt.y, true);
    } else if (pt.orientation === OrientationEnum.Bottom) {
      yWall.set(pt.x, pt.y + 1, true);
    }
  }

  static getPath(pt, facetResult, f, borderMask, xWall, yWall) {
    let finished = false;
    const path = [];
    FacetBorderTracer.addPointToPath(path, pt, xWall, f, yWall);

    while (!finished) {
      const possibleNextPoints = [];

      if (pt.orientation === OrientationEnum.Left) {
        // Rotate to top
        if (
          (pt.y - 1 < 0 || facetResult.facetMap.get(pt.x, pt.y - 1) !== f.id) &&
          !yWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Top));
        }
        // Rotate to bottom
        if (
          (pt.y + 1 >= facetResult.height || facetResult.facetMap.get(pt.x, pt.y + 1) !== f.id) &&
          !yWall.get(pt.x, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Bottom));
        }
        // Go upwards
        if (
          pt.y - 1 >= 0 &&
          facetResult.facetMap.get(pt.x, pt.y - 1) === f.id &&
          (pt.x - 1 < 0 || facetResult.facetMap.get(pt.x - 1, pt.y - 1) !== f.id) &&
          borderMask.get(pt.x, pt.y - 1) &&
          !xWall.get(pt.x, pt.y - 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y - 1), OrientationEnum.Left));
        }
        // Go downwards
        if (
          pt.y + 1 < facetResult.height &&
          facetResult.facetMap.get(pt.x, pt.y + 1) === f.id &&
          (pt.x - 1 < 0 || facetResult.facetMap.get(pt.x - 1, pt.y + 1) !== f.id) &&
          borderMask.get(pt.x, pt.y + 1) &&
          !xWall.get(pt.x, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y + 1), OrientationEnum.Left));
        }
        // Left upwards diagonal
        if (
          pt.y - 1 >= 0 &&
          pt.x - 1 >= 0 &&
          facetResult.facetMap.get(pt.x - 1, pt.y - 1) === f.id &&
          borderMask.get(pt.x - 1, pt.y - 1) &&
          !yWall.get(pt.x - 1, pt.y) &&
          !yWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x - 1, pt.y - 1), OrientationEnum.Bottom));
        }
        // Left downwards diagonal
        if (
          pt.y + 1 < facetResult.height &&
          pt.x - 1 >= 0 &&
          facetResult.facetMap.get(pt.x - 1, pt.y + 1) === f.id &&
          borderMask.get(pt.x - 1, pt.y + 1) &&
          !yWall.get(pt.x - 1, pt.y + 1) &&
          !yWall.get(pt.x, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x - 1, pt.y + 1), OrientationEnum.Top));
        }
      } else if (pt.orientation === OrientationEnum.Top) {
        // Rotate to left
        if (
          (pt.x - 1 < 0 || facetResult.facetMap.get(pt.x - 1, pt.y) !== f.id) &&
          !xWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Left));
        }
        // Rotate to right
        if (
          (pt.x + 1 >= facetResult.width || facetResult.facetMap.get(pt.x + 1, pt.y) !== f.id) &&
          !xWall.get(pt.x + 1, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Right));
        }
        // Go leftwards
        if (
          pt.x - 1 >= 0 &&
          facetResult.facetMap.get(pt.x - 1, pt.y) === f.id &&
          (pt.y - 1 < 0 || facetResult.facetMap.get(pt.x - 1, pt.y - 1) !== f.id) &&
          borderMask.get(pt.x - 1, pt.y) &&
          !yWall.get(pt.x - 1, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x - 1, pt.y), OrientationEnum.Top));
        }
        // Go rightwards
        if (
          pt.x + 1 < facetResult.width &&
          facetResult.facetMap.get(pt.x + 1, pt.y) === f.id &&
          (pt.y - 1 < 0 || facetResult.facetMap.get(pt.x + 1, pt.y - 1) !== f.id) &&
          borderMask.get(pt.x + 1, pt.y) &&
          !yWall.get(pt.x + 1, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x + 1, pt.y), OrientationEnum.Top));
        }
        // Top-left diagonal
        if (
          pt.x - 1 >= 0 &&
          pt.y - 1 >= 0 &&
          facetResult.facetMap.get(pt.x - 1, pt.y - 1) === f.id &&
          borderMask.get(pt.x - 1, pt.y - 1) &&
          !xWall.get(pt.x, pt.y - 1) &&
          !xWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x - 1, pt.y - 1), OrientationEnum.Right));
        }
        // Top-right diagonal
        if (
          pt.x + 1 < facetResult.width &&
          pt.y - 1 >= 0 &&
          facetResult.facetMap.get(pt.x + 1, pt.y - 1) === f.id &&
          borderMask.get(pt.x + 1, pt.y - 1) &&
          !xWall.get(pt.x + 1, pt.y - 1) &&
          !xWall.get(pt.x + 1, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x + 1, pt.y - 1), OrientationEnum.Left));
        }
      } else if (pt.orientation === OrientationEnum.Right) {
        // Rotate to top
        if (
          (pt.y - 1 < 0 || facetResult.facetMap.get(pt.x, pt.y - 1) !== f.id) &&
          !yWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Top));
        }
        // Rotate to bottom
        if (
          (pt.y + 1 >= facetResult.height || facetResult.facetMap.get(pt.x, pt.y + 1) !== f.id) &&
          !yWall.get(pt.x, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Bottom));
        }
        // Go upwards
        if (
          pt.y - 1 >= 0 &&
          facetResult.facetMap.get(pt.x, pt.y - 1) === f.id &&
          (pt.x + 1 >= facetResult.width || facetResult.facetMap.get(pt.x + 1, pt.y - 1) !== f.id) &&
          borderMask.get(pt.x, pt.y - 1) &&
          !xWall.get(pt.x + 1, pt.y - 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y - 1), OrientationEnum.Right));
        }
        // Go downwards
        if (
          pt.y + 1 < facetResult.height &&
          facetResult.facetMap.get(pt.x, pt.y + 1) === f.id &&
          (pt.x + 1 >= facetResult.width || facetResult.facetMap.get(pt.x + 1, pt.y + 1) !== f.id) &&
          borderMask.get(pt.x, pt.y + 1) &&
          !xWall.get(pt.x + 1, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y + 1), OrientationEnum.Right));
        }
        // Right-upwards diagonal
        if (
          pt.y - 1 >= 0 &&
          pt.x + 1 < facetResult.width &&
          facetResult.facetMap.get(pt.x + 1, pt.y - 1) === f.id &&
          borderMask.get(pt.x + 1, pt.y - 1) &&
          !yWall.get(pt.x + 1, pt.y) &&
          !yWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x + 1, pt.y - 1), OrientationEnum.Bottom));
        }
        // Right-downwards diagonal
        if (
          pt.y + 1 < facetResult.height &&
          pt.x + 1 < facetResult.width &&
          facetResult.facetMap.get(pt.x + 1, pt.y + 1) === f.id &&
          borderMask.get(pt.x + 1, pt.y + 1) &&
          !yWall.get(pt.x + 1, pt.y + 1) &&
          !yWall.get(pt.x, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x + 1, pt.y + 1), OrientationEnum.Top));
        }
      } else if (pt.orientation === OrientationEnum.Bottom) {
        // Rotate to left
        if (
          (pt.x - 1 < 0 || facetResult.facetMap.get(pt.x - 1, pt.y) !== f.id) &&
          !xWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Left));
        }
        // Rotate to right
        if (
          (pt.x + 1 >= facetResult.width || facetResult.facetMap.get(pt.x + 1, pt.y) !== f.id) &&
          !xWall.get(pt.x + 1, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x, pt.y), OrientationEnum.Right));
        }
        // Go leftwards
        if (
          pt.x - 1 >= 0 &&
          facetResult.facetMap.get(pt.x - 1, pt.y) === f.id &&
          (pt.y + 1 >= facetResult.height || facetResult.facetMap.get(pt.x - 1, pt.y + 1) !== f.id) &&
          borderMask.get(pt.x - 1, pt.y) &&
          !yWall.get(pt.x - 1, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x - 1, pt.y), OrientationEnum.Bottom));
        }
        // Go rightwards
        if (
          pt.x + 1 < facetResult.width &&
          facetResult.facetMap.get(pt.x + 1, pt.y) === f.id &&
          (pt.y + 1 >= facetResult.height || facetResult.facetMap.get(pt.x + 1, pt.y + 1) !== f.id) &&
          borderMask.get(pt.x + 1, pt.y) &&
          !yWall.get(pt.x + 1, pt.y + 1)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x + 1, pt.y), OrientationEnum.Bottom));
        }
        // Bottom-left diagonal
        if (
          pt.x - 1 >= 0 &&
          pt.y + 1 < facetResult.height &&
          facetResult.facetMap.get(pt.x - 1, pt.y + 1) === f.id &&
          borderMask.get(pt.x - 1, pt.y + 1) &&
          !xWall.get(pt.x, pt.y + 1) &&
          !xWall.get(pt.x, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x - 1, pt.y + 1), OrientationEnum.Right));
        }
        // Bottom-right diagonal
        if (
          pt.x + 1 < facetResult.width &&
          pt.y + 1 < facetResult.height &&
          facetResult.facetMap.get(pt.x + 1, pt.y + 1) === f.id &&
          borderMask.get(pt.x + 1, pt.y + 1) &&
          !xWall.get(pt.x + 1, pt.y + 1) &&
          !xWall.get(pt.x + 1, pt.y)
        ) {
          possibleNextPoints.push(new PathPoint(new Point(pt.x + 1, pt.y + 1), OrientationEnum.Left));
        }
      }

      if (possibleNextPoints.length > 0) {
        // Prefer points already on the path or with tight turns to prevent skipping borders
        let next = possibleNextPoints[0];
        pt = next;
        FacetBorderTracer.addPointToPath(path, pt, xWall, f, yWall);
      } else {
        finished = true;
      }

      // Safeguard loop lock
      if (path.length > f.borderPoints.length * 4 + 10) {
        finished = true;
      }
    }

    return path;
  }
}
