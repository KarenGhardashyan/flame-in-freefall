export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(value, max));
}

export function interpolate(points, x) {
  if (x < points[0][0] || x > points.at(-1)[0]) return null;
  for (let i = 1; i < points.length; i++) {
    const [end, endValue] = points[i];
    if (x <= end) {
      const [start, startValue] = points[i - 1];
      return startValue + (endValue - startValue) * (x - start) / (end - start);
    }
  }
  return points.at(-1)[1];
}

// Figure 2.12, approximate points from the 100 µm computational curves.
// Zero-rate points are anchored to the reported critical speeds.
const air = [[1.5,0],[1.95,1.22],[2.94,1.79],[3.97,2.10],[4.98,2.29],[9.99,2.77],[14.97,2.90],[20,2.92]];
const diluted = [[3.5,0],[3.62,.43],[3.96,.64],[5,.91],[10.02,1.26],[15,1.25],[20,1.11]];
export const filmDefaults = {filmFlow:5,filmO2:21,filmThickness:100};
export const rodDefaults = {flow:3,o2:15.8,radius:0.476};

export function filmModel(flow, oxygen, thickness) {
  const mix = (oxygen - 16) / 5;
  const threshold = 3.5 - 2 * mix;
  const margin = flow - threshold;
  // Align the low-flow starts before blending the curves so the cutoff
  // varies continuously with oxygen. Apply the §2.2.7 thin-fuel scaling.
  const progress = clamp(margin / (20 - threshold));
  const high = interpolate(air, 1.5 + progress * 18.5);
  const low = interpolate(diluted, 3.5 + progress * 16.5);
  const spread = margin <= 0 ? 0 : (low + (high - low) * mix) * 100 / thickness;
  return {threshold, spread, margin};
}

export function rodBoundary(stretch) {
  return 6 * Math.exp(-.5 * stretch) + .0167 * stretch + 13.4;
}

const boundaryMinimum = -2 * Math.log(.0167 / 3);

export function rodModel(flow, oxygen, radius) {
  const a = 1.5 * flow / radius * Math.sqrt(radius / .318);
  const threshold = rodBoundary(a);
  return {a, threshold, margin:oxygen-threshold, outside:a>150, branch:a<boundaryMinimum?'quench':'blowoff'};
}
