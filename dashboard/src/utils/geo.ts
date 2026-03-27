/**
 * Lightweight geodesic helpers for route direction coloring and trail rendering.
 * No external library dependency — keeps the bundle small.
 */

/** Returns the compass bearing (0–360, 0=N, 90=E) from p1 to p2. */
export function bearing(p1: [number, number], p2: [number, number]): number {
  const lat1 = (p1[0] * Math.PI) / 180;
  const lat2 = (p2[0] * Math.PI) / 180;
  const dLon = ((p2[1] - p1[1]) * Math.PI) / 180;
  const y    = Math.sin(dLon) * Math.cos(lat2);
  const x    = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/**
 * Returns the absolute angular difference between two bearings (0–180).
 * Used to determine if a vehicle is heading "with" or "against" the route shape.
 */
export function angularDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Finds the index of the shape point nearest to the given position.
 * O(n) scan — shapes have a few hundred points, so this is imperceptible.
 */
export function nearestPointIndex(
  shape: [number, number][],
  pos:   [number, number],
): number {
  let minDist = Infinity;
  let nearest = 0;

  for (let i = 0; i < shape.length; i++) {
    const d = approxDistanceSq(shape[i], pos);
    if (d < minDist) { minDist = d; nearest = i; }
  }

  return nearest;
}

/**
 * Split a polyline into [traveled, upcoming] segments at index i.
 * traveled  = shape[0..i]   (inclusive — includes the split point in both)
 * upcoming  = shape[i..]
 * If goingForward is false (vehicle traveling in reverse direction),
 * the segments are swapped.
 */
export function splitPolyline(
  shape:         [number, number][],
  splitIdx:      number,
  goingForward:  boolean,
): { traveled: [number, number][]; upcoming: [number, number][] } {
  const traveled  = shape.slice(0, splitIdx + 1);
  const upcoming  = shape.slice(splitIdx);

  return goingForward
    ? { traveled, upcoming }
    : { traveled: upcoming, upcoming: traveled };
}

/** Squared Euclidean approximation of distance (fine for nearby points). */
function approxDistanceSq(a: [number, number], b: [number, number]): number {
  const dlat = a[0] - b[0];
  const dlon = (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180);
  return dlat * dlat + dlon * dlon;
}
