/**
 * Step 4: Teardrop SVG bus icon with route color
 * Asymmetrical design where the pointed end clearly indicates direction of travel.
 */

/**
 * Creates a teardrop-shaped SVG icon for a bus marker.
 * The pointed end (top of SVG) indicates the front/direction of travel.
 * 
 * @param routeColor - The color to fill the teardrop (from route color palette)
 * @returns SVG string
 */
export function createTeardropBusIcon(routeColor: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 28" width="20" height="28">
      <!-- Teardrop: pointed top (front), rounded bottom (back) -->
      <path d="M10 0 C10 0, 20 8, 20 16 C20 22.627 15.523 28 10 28
               C4.477 28 0 22.627 0 16 C0 8, 10 0, 10 0 Z"
            fill="${routeColor}"
            stroke="rgba(0,0,0,0.25)"
            stroke-width="1.5"/>
      <!-- Small white dot at the pointed front to make direction clear -->
      <circle cx="10" cy="2" r="2.5" fill="white" opacity="0.9"/>
    </svg>
  `.trim();
}
