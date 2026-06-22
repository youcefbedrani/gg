// Client-side K-means clustering module for Paint-by-Numbers.

export class Vector {
  constructor(values, weight = 1) {
    this.values = values;
    this.weight = weight;
    this.tag = null;
  }

  distanceTo(p) {
    let sumSquares = 0;
    for (let i = 0; i < this.values.length; i++) {
      const diff = p.values[i] - this.values[i];
      sumSquares += diff * diff;
    }
    return Math.sqrt(sumSquares);
  }

  static average(pts) {
    if (pts.length === 0) {
      throw new Error("Can't average 0 elements");
    }

    const dims = pts[0].values.length;
    const values = new Array(dims).fill(0);
    let weightSum = 0;

    for (const p of pts) {
      weightSum += p.weight;
      for (let i = 0; i < dims; i++) {
        values[i] += p.weight * p.values[i];
      }
    }

    for (let i = 0; i < values.length; i++) {
      values[i] /= weightSum;
    }

    return new Vector(values);
  }
}

export class KMeans {
  constructor(points, k, randomSeed = 0) {
    this.points = points;
    this.k = k;
    this.currentIteration = 0;
    this.pointsPerCategory = Array.from({ length: k }, () => []);
    this.centroids = [];
    this.currentDeltaDistanceDifference = 0;
    this.randomSeed = randomSeed || Date.now();

    this.initCentroids();
  }

  // Simple LCG pseudo-random number generator for reproducible seeds
  random() {
    const x = Math.sin(this.randomSeed++) * 10000;
    return x - Math.floor(x);
  }

  initCentroids() {
    for (let i = 0; i < this.k; i++) {
      const randomIndex = Math.floor(this.points.length * this.random());
      this.centroids.push(this.points[randomIndex]);
    }
  }

  step() {
    // Clear category lists
    for (let i = 0; i < this.k; i++) {
      this.pointsPerCategory[i] = [];
    }

    // Allocate each point to the closest centroid
    for (const p of this.points) {
      let minDist = Number.MAX_VALUE;
      let centroidIndex = -1;

      for (let k = 0; k < this.k; k++) {
        const dist = this.centroids[k].distanceTo(p);
        if (dist < minDist) {
          centroidIndex = k;
          minDist = dist;
        }
      }
      this.pointsPerCategory[centroidIndex].push(p);
    }

    let totalDistanceDiff = 0;

    // Recalculate centroids
    for (let k = 0; k < this.pointsPerCategory.length; k++) {
      const cat = this.pointsPerCategory[k];
      if (cat.length > 0) {
        const avg = Vector.average(cat);
        const dist = this.centroids[k].distanceTo(avg);
        totalDistanceDiff += dist;
        this.centroids[k] = avg;
      }
    }

    this.currentDeltaDistanceDifference = totalDistanceDiff;
    this.currentIteration++;
  }
}

// Convert RGB to CIELAB (helper for clustering)
export function rgbToLab(r, g, b) {
  let rL = r / 255;
  let gL = g / 255;
  let bL = b / 255;

  rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
  gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
  bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

  rL *= 100;
  gL *= 100;
  bL *= 100;

  const x = (rL * 0.4124 + gL * 0.3576 + bL * 0.1805) / 95.047;
  const y = (rL * 0.2126 + gL * 0.7152 + bL * 0.0722) / 100.000;
  const z = (rL * 0.0193 + gL * 0.1192 + bL * 0.9505) / 108.883;

  const fx = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(l, a, b) {
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;

  x = 0.95047 * (x * x * x > 0.008856 ? x * x * x : (x - 16 / 116) / 7.787);
  y = 1.00000 * (y * y * y > 0.008856 ? y * y * y : (y - 16 / 116) / 7.787);
  z = 1.08883 * (z * z * z > 0.008856 ? z * z * z : (z - 16 / 116) / 7.787);

  let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let bVal = x * 0.0557 + y * -0.2040 + z * 1.0570;

  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  bVal = bVal > 0.0031308 ? 1.055 * Math.pow(bVal, 1 / 2.4) - 0.055 : 12.92 * bVal;

  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(bVal * 255))),
  ];
}
