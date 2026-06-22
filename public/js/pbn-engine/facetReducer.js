// Client-side Facet Reducer module.
// Merges small facets with neighbors of similar color to make the canvas paintable.

import { FacetCreator, BooleanArray2D } from "./facetBuilder.js";

function buildColorDistanceMatrix(colorsByIndex) {
  const size = colorsByIndex.length;
  const colorDistances = Array.from({ length: size }, () => new Array(size).fill(0));

  for (let j = 0; j < size; j++) {
    for (let i = j; i < size; i++) {
      const c1 = colorsByIndex[j];
      const c2 = colorsByIndex[i];
      const distance = Math.sqrt(
        (c1[0] - c2[0]) * (c1[0] - c2[0]) +
        (c1[1] - c2[1]) * (c1[1] - c2[1]) +
        (c1[2] - c2[2]) * (c1[2] - c2[2])
      );
      colorDistances[i][j] = distance;
      colorDistances[j][i] = distance;
    }
  }
  return colorDistances;
}

export class FacetReducer {
  static async reduceFacets(
    smallerThan,
    removeFacetsFromLargeToSmall,
    maximumNumberOfFacets,
    colorsByIndex,
    facetResult,
    imgColorIndices,
    onUpdate = null
  ) {
    const visitedCache = new BooleanArray2D(facetResult.width, facetResult.height);
    const colorDistances = buildColorDistanceMatrix(colorsByIndex);

    // Sort active facets by point count
    const facetProcessingOrder = facetResult.facets
      .filter((f) => f != null)
      .sort((a, b) => b.pointCount - a.pointCount)
      .map((f) => f.id);

    if (!removeFacetsFromLargeToSmall) {
      facetProcessingOrder.reverse();
    }

    let lastProgressTime = Date.now();

    // Pass 1: Prune facets smaller than pixel threshold
    for (let fidx = 0; fidx < facetProcessingOrder.length; fidx++) {
      const fid = facetProcessingOrder[fidx];
      const f = facetResult.facets[fid];

      if (f != null && f.pointCount < smallerThan) {
        FacetReducer.deleteFacet(f.id, facetResult, imgColorIndices, colorDistances, visitedCache);

        const now = Date.now();
        if (now - lastProgressTime > 200) {
          lastProgressTime = now;
          if (onUpdate) {
            onUpdate(0.5 * (fidx / facetProcessingOrder.length));
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
    }

    // Pass 2: Limit maximum number of facets
    let facetCount = facetResult.facets.filter((f) => f != null).length;
    const startFacetCount = facetCount;

    while (facetCount > maximumNumberOfFacets) {
      // Re-sort current active facets to remove the absolute smallest first
      const currentOrder = facetResult.facets
        .filter((f) => f != null)
        .sort((a, b) => a.pointCount - b.pointCount)
        .map((f) => f.id);

      if (currentOrder.length === 0) break;

      const facetToRemove = facetResult.facets[currentOrder[0]];
      FacetReducer.deleteFacet(facetToRemove.id, facetResult, imgColorIndices, colorDistances, visitedCache);
      facetCount = facetResult.facets.filter((f) => f != null).length;

      const now = Date.now();
      if (now - lastProgressTime > 200) {
        lastProgressTime = now;
        if (onUpdate && startFacetCount > maximumNumberOfFacets) {
          onUpdate(0.5 + 0.5 * (1.0 - (facetCount - maximumNumberOfFacets) / (startFacetCount - maximumNumberOfFacets)));
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    if (onUpdate) {
      onUpdate(1.0);
    }
  }

  static deleteFacet(facetIdToRemove, facetResult, imgColorIndices, colorDistances, visitedArrayCache) {
    const facetToRemove = facetResult.facets[facetIdToRemove];
    if (facetToRemove === null) return; // Already deleted

    if (facetToRemove.neighbourFacetsIsDirty) {
      FacetCreator.buildFacetNeighbour(facetToRemove, facetResult);
    }

    if (facetToRemove.neighbourFacets.length > 0) {
      // Reassign all pixels of this facet to its closest neighbor
      for (let j = facetToRemove.bbox.minY; j <= facetToRemove.bbox.maxY; j++) {
        for (let i = facetToRemove.bbox.minX; i <= facetToRemove.bbox.maxX; i++) {
          if (facetResult.facetMap.get(i, j) === facetToRemove.id) {
            const closestNeighbour = FacetReducer.getClosestNeighbourForPixel(
              facetToRemove,
              facetResult,
              i,
              j,
              colorDistances
            );
            if (closestNeighbour !== -1) {
              imgColorIndices.set(i, j, facetResult.facets[closestNeighbour].color);
            }
          }
        }
      }
    }

    FacetReducer.rebuildForFacetChange(visitedArrayCache, facetToRemove, imgColorIndices, facetResult);
    facetResult.facets[facetToRemove.id] = null; // Mark as deleted
  }

  static rebuildForFacetChange(visitedArrayCache, facet, imgColorIndices, facetResult) {
    FacetReducer.rebuildChangedNeighbourFacets(visitedArrayCache, facet, imgColorIndices, facetResult);

    // Sanity check: Ensure all pixels mapping to this deleted facet are updated
    let needsRebuild = false;
    for (let y = facet.bbox.minY; y <= facet.bbox.maxY; y++) {
      for (let x = facet.bbox.minX; x <= facet.bbox.maxX; x++) {
        if (facetResult.facetMap.get(x, y) === facet.id) {
          needsRebuild = true;
          // Merge with any direct valid neighbor
          if (x - 1 >= 0 && facetResult.facetMap.get(x - 1, y) !== facet.id && facetResult.facets[facetResult.facetMap.get(x - 1, y)] !== null) {
            imgColorIndices.set(x, y, facetResult.facets[facetResult.facetMap.get(x - 1, y)].color);
          } else if (y - 1 >= 0 && facetResult.facetMap.get(x, y - 1) !== facet.id && facetResult.facets[facetResult.facetMap.get(x, y - 1)] !== null) {
            imgColorIndices.set(x, y, facetResult.facets[facetResult.facetMap.get(x, y - 1)].color);
          } else if (x + 1 < facetResult.width && facetResult.facetMap.get(x + 1, y) !== facet.id && facetResult.facets[facetResult.facetMap.get(x + 1, y)] !== null) {
            imgColorIndices.set(x, y, facetResult.facets[facetResult.facetMap.get(x + 1, y)].color);
          } else if (y + 1 < facetResult.height && facetResult.facetMap.get(x, y + 1) !== facet.id && facetResult.facets[facetResult.facetMap.get(x, y + 1)] !== null) {
            imgColorIndices.set(x, y, facetResult.facets[facetResult.facetMap.get(x, y + 1)].color);
          }
        }
      }
    }

    if (needsRebuild) {
      FacetReducer.rebuildChangedNeighbourFacets(visitedArrayCache, facet, imgColorIndices, facetResult);
    }
  }

  static getClosestNeighbourForPixel(facetToRemove, facetResult, x, y, colorDistances) {
    let closestNeighbour = -1;
    let minDistance = Number.MAX_VALUE;
    let minColorDistance = Number.MAX_VALUE;

    if (facetToRemove.neighbourFacetsIsDirty) {
      FacetCreator.buildFacetNeighbour(facetToRemove, facetResult);
    }

    for (const neighbourIdx of facetToRemove.neighbourFacets) {
      const neighbour = facetResult.facets[neighbourIdx];
      if (neighbour != null) {
        for (const bpt of neighbour.borderPoints) {
          const distance = bpt.distanceToCoord(x, y);
          if (distance < minDistance) {
            minDistance = distance;
            closestNeighbour = neighbourIdx;
            minColorDistance = Number.MAX_VALUE;
          } else if (distance === minDistance) {
            const colorDistance = colorDistances[facetToRemove.color][neighbour.color];
            if (colorDistance < minColorDistance) {
              minColorDistance = colorDistance;
              closestNeighbour = neighbourIdx;
            }
          }
        }
      }
    }
    return closestNeighbour;
  }

  static rebuildChangedNeighbourFacets(visitedArrayCache, facetToRemove, imgColorIndices, facetResult) {
    const changedNeighboursSet = {};

    if (facetToRemove.neighbourFacetsIsDirty) {
      FacetCreator.buildFacetNeighbour(facetToRemove, facetResult);
    }

    for (const neighbourIdx of facetToRemove.neighbourFacets) {
      const neighbour = facetResult.facets[neighbourIdx];
      if (neighbour != null) {
        changedNeighboursSet[neighbourIdx] = true;

        if (neighbour.neighbourFacetsIsDirty) {
          FacetCreator.buildFacetNeighbour(neighbour, facetResult);
        }

        for (const n of neighbour.neighbourFacets) {
          changedNeighboursSet[n] = true;
        }

        // Re-construct neighbor facet
        const newFacet = FacetCreator.buildFacet(
          neighbourIdx,
          neighbour.color,
          neighbour.borderPoints[0].x,
          neighbour.borderPoints[0].y,
          visitedArrayCache,
          imgColorIndices,
          facetResult
        );
        facetResult.facets[neighbourIdx] = newFacet;

        if (newFacet.pointCount === 0) {
          facetResult.facets[neighbourIdx] = null;
        }
      }
    }

    // Reset visited cache values
    for (const neighbourIdx of facetToRemove.neighbourFacets) {
      const neighbour = facetResult.facets[neighbourIdx];
      if (neighbour != null) {
        for (let y = neighbour.bbox.minY; y <= neighbour.bbox.maxY; y++) {
          for (let x = neighbour.bbox.minX; x <= neighbour.bbox.maxX; x++) {
            if (facetResult.facetMap.get(x, y) === neighbour.id) {
              visitedArrayCache.set(x, y, false);
            }
          }
        }
      }
    }

    // Mark neighbor relationships as dirty so they recalculate later
    for (const k of Object.keys(changedNeighboursSet)) {
      const idx = parseInt(k, 10);
      const f = facetResult.facets[idx];
      if (f != null) {
        f.neighbourFacets = null;
        f.neighbourFacetsIsDirty = true;
      }
    }
  }
}
