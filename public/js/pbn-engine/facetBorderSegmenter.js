// Client-side Facet Border Segmenter module.
// Breaks outlines into shared boundary segments and simplifies them using the Douglas-Peucker algorithm.

import { Point } from "./facetBuilder.js";
import { PathPoint, OrientationEnum } from "./borderTracer.js";

export class PathSegment {
  constructor(points, neighbour) {
    this.points = points;
    this.neighbour = neighbour;
  }
}

export class FacetBoundarySegment {
  constructor(originalSegment, neighbour, reverseOrder) {
    this.originalSegment = originalSegment;
    this.neighbour = neighbour;
    this.reverseOrder = reverseOrder;
  }
}

// Helper: Square distance between two points
function getSqSegDist(p, p1, p2) {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p.x - x;
  dy = p.y - y;

  return dx * dx + dy * dy;
}

// Recursive step for Douglas-Peucker polyline simplification
function simplifyDPStep(points, first, last, sqTolerance, simplified) {
  let maxSqDist = sqTolerance;
  let index = -1;

  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if (maxSqDist > sqTolerance) {
    if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
  }
}

// Douglas-Peucker polyline simplification (substituted for Haar Wavelet simplification as requested)
export function simplifyDouglasPeucker(points, tolerance = 0.7) {
  if (points.length <= 4) return points;
  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

export class FacetBorderSegmenter {
  static async buildFacetBorderSegments(facetResult, nrOfTimesToHalvePoints = 2, onUpdate = null) {
    const segmentsPerFacet = FacetBorderSegmenter.prepareSegmentsPerFacet(facetResult);

    // Simplify segments using Douglas-Peucker
    // We simplify each segment in isolation, keeping the start and end coordinates locked.
    // This guarantees that shared borders between facets remain closed.
    for (const f of facetResult.facets) {
      if (f != null) {
        for (const segment of segmentsPerFacet[f.id]) {
          // If border is on the outside of the image, we do not simplify it to keep the canvas bounds rectangular.
          const hasOutsidePoints = segment.points.some(
            (pt) =>
              pt.x === 0 ||
              pt.y === 0 ||
              pt.x === facetResult.width - 1 ||
              pt.y === facetResult.height - 1
          );

          if (!hasOutsidePoints) {
            segment.points = simplifyDouglasPeucker(segment.points, 0.7 * nrOfTimesToHalvePoints);
          }
        }
      }
    }

    await FacetBorderSegmenter.matchSegmentsWithNeighbours(facetResult, segmentsPerFacet, onUpdate);
  }

  static prepareSegmentsPerFacet(facetResult) {
    const segmentsPerFacet = new Array(facetResult.facets.length);

    for (const f of facetResult.facets) {
      if (f != null) {
        const segments = [];
        if (f.borderPath.length > 1) {
          let currentPoints = [f.borderPath[0]];

          for (let i = 1; i < f.borderPath.length; i++) {
            const prevBorderPoint = f.borderPath[i - 1];
            const curBorderPoint = f.borderPath[i];
            const oldNeighbour = prevBorderPoint.getNeighbour(facetResult);
            const curNeighbour = curBorderPoint.getNeighbour(facetResult);
            let isTransitionPoint = oldNeighbour !== curNeighbour;

            if (!isTransitionPoint && oldNeighbour !== -1) {
              // Diagonal neighbour checks to break path at tight corner turns
              if (prevBorderPoint.x === curBorderPoint.x && prevBorderPoint.y === curBorderPoint.y) {
                if (
                  (prevBorderPoint.orientation === OrientationEnum.Top && curBorderPoint.orientation === OrientationEnum.Left) ||
                  (prevBorderPoint.orientation === OrientationEnum.Left && curBorderPoint.orientation === OrientationEnum.Top)
                ) {
                  const diagNeighbour = facetResult.facetMap.get(curBorderPoint.x - 1, curBorderPoint.y - 1);
                  if (diagNeighbour !== oldNeighbour) isTransitionPoint = true;
                } else if (
                  (prevBorderPoint.orientation === OrientationEnum.Top && curBorderPoint.orientation === OrientationEnum.Right) ||
                  (prevBorderPoint.orientation === OrientationEnum.Right && curBorderPoint.orientation === OrientationEnum.Top)
                ) {
                  const diagNeighbour = facetResult.facetMap.get(curBorderPoint.x + 1, curBorderPoint.y - 1);
                  if (diagNeighbour !== oldNeighbour) isTransitionPoint = true;
                } else if (
                  (prevBorderPoint.orientation === OrientationEnum.Bottom && curBorderPoint.orientation === OrientationEnum.Left) ||
                  (prevBorderPoint.orientation === OrientationEnum.Left && curBorderPoint.orientation === OrientationEnum.Bottom)
                ) {
                  const diagNeighbour = facetResult.facetMap.get(curBorderPoint.x - 1, curBorderPoint.y + 1);
                  if (diagNeighbour !== oldNeighbour) isTransitionPoint = true;
                } else if (
                  (prevBorderPoint.orientation === OrientationEnum.Bottom && curBorderPoint.orientation === OrientationEnum.Right) ||
                  (prevBorderPoint.orientation === OrientationEnum.Right && curBorderPoint.orientation === OrientationEnum.Bottom)
                ) {
                  const diagNeighbour = facetResult.facetMap.get(curBorderPoint.x + 1, curBorderPoint.y + 1);
                  if (diagNeighbour !== oldNeighbour) isTransitionPoint = true;
                }
              }
            }

            currentPoints.push(curBorderPoint);

            if (isTransitionPoint) {
              if (currentPoints.length > 1) {
                const segment = new PathSegment(currentPoints, oldNeighbour);
                segments.push(segment);
                currentPoints = [curBorderPoint];
              }
            }
          }

          // Remainder segment
          if (currentPoints.length > 1) {
            const oldNeighbour = f.borderPath[f.borderPath.length - 1].getNeighbour(facetResult);
            if (segments.length > 0 && segments[0].neighbour === oldNeighbour) {
              const mergedPoints = currentPoints.concat(segments[0].points);
              segments[0].points = mergedPoints;
            } else {
              const segment = new PathSegment(currentPoints, oldNeighbour);
              segments.push(segment);
            }
          }
        }
        segmentsPerFacet[f.id] = segments;
      }
    }
    return segmentsPerFacet;
  }

  static async matchSegmentsWithNeighbours(facetResult, segmentsPerFacet, onUpdate = null) {
    const MAX_DISTANCE = 4.0;

    for (const f of facetResult.facets) {
      if (f != null) {
        f.borderSegments = new Array(segmentsPerFacet[f.id].length);
      }
    }

    let count = 0;
    let lastProgressTime = Date.now();

    for (const f of facetResult.facets) {
      if (f != null) {
        for (let s = 0; s < segmentsPerFacet[f.id].length; s++) {
          const segment = segmentsPerFacet[f.id][s];

          if (segment != null && f.borderSegments[s] == null) {
            f.borderSegments[s] = new FacetBoundarySegment(segment, segment.neighbour, false);

            if (segment.neighbour !== -1) {
              const neighbourFacet = facetResult.facets[segment.neighbour];

              if (neighbourFacet != null) {
                const neighbourSegments = segmentsPerFacet[segment.neighbour];

                for (let ns = 0; ns < neighbourSegments.length; ns++) {
                  const neighbourSegment = neighbourSegments[ns];

                  if (neighbourSegment != null && neighbourSegment.neighbour === f.id) {
                    const segStartPoint = segment.points[0];
                    const segEndPoint = segment.points[segment.points.length - 1];
                    const nSegStartPoint = neighbourSegment.points[0];
                    const nSegEndPoint = neighbourSegment.points[neighbourSegment.points.length - 1];

                    let matchesStraight =
                      segStartPoint.distanceTo(nSegStartPoint) <= MAX_DISTANCE &&
                      segEndPoint.distanceTo(nSegEndPoint) <= MAX_DISTANCE;

                    let matchesReverse =
                      segStartPoint.distanceTo(nSegEndPoint) <= MAX_DISTANCE &&
                      segEndPoint.distanceTo(nSegStartPoint) <= MAX_DISTANCE;

                    if (matchesStraight && matchesReverse) {
                      // Resolve ambiguity for tiny loop segments by selecting the closest distance pair
                      const distStraight = segStartPoint.distanceTo(nSegStartPoint) + segEndPoint.distanceTo(nSegEndPoint);
                      const distReverse = segStartPoint.distanceTo(nSegEndPoint) + segEndPoint.distanceTo(nSegStartPoint);
                      if (distStraight < distReverse) {
                        matchesStraight = true;
                        matchesReverse = false;
                      } else {
                        matchesStraight = false;
                        matchesReverse = true;
                      }
                    }

                    if (matchesStraight) {
                      neighbourFacet.borderSegments[ns] = new FacetBoundarySegment(segment, f.id, false);
                      segmentsPerFacet[neighbourFacet.id][ns] = null;
                      break;
                    } else if (matchesReverse) {
                      neighbourFacet.borderSegments[ns] = new FacetBoundarySegment(segment, f.id, true);
                      segmentsPerFacet[neighbourFacet.id][ns] = null;
                      break;
                    }
                  }
                }
              }
            }
          }
          segmentsPerFacet[f.id][s] = null;
        }

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
}
