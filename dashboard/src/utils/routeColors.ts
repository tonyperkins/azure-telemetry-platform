/**
 * Step 2: Route color palette and assignment logic
 * Each route gets a consistent color from this palette based on its position
 * in the sorted route list.
 */

export const ROUTE_COLORS = [
  "#0D9488", // teal
  "#2563EB", // blue
  "#7C3AED", // purple
  "#DB2777", // pink
  "#EA580C", // orange
  "#65A30D", // green
  "#0891B2", // cyan
  "#9333EA", // violet
  "#D97706", // amber
  "#DC2626", // red
];

/**
 * Get the color for a specific route based on its position in the sorted route list.
 * Routes are sorted numerically/alphabetically, and colors cycle if there are more than 10 routes.
 */
export function getRouteColor(routeId: string, allRouteIds: string[]): string {
  const sortedRoutes = [...allRouteIds].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const index = sortedRoutes.indexOf(routeId);
  if (index === -1) return ROUTE_COLORS[0]; // fallback
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}
