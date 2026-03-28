/**
 * Bus marker icon — a bold directional shield/arrow.
 *
 * Design goals:
 *  - Large enough to read against dense dark tile backgrounds (26×30px)
 *  - White drop shadow / halo so it pops regardless of route color
 *  - Clearly asymmetrical: pointed nose (front) vs. flat roof + squared body (rear)
 *  - White arrow chevron cut into the body for redundant direction cue
 *  - Tracked variant adds a white pulse ring around the whole icon
 */

/**
 * Creates a bold shield-shaped bus icon.
 *
 * Shape: a rounded rectangle body with a downward "fin" tail, wider at the
 * base, narrowing to the fin tip (bottom of SVG = front of travel direction
 * after the marker is rotated). The white stroke halo ensures visibility on
 * both light and dark map tiles.
 *
 * @param routeColor - Fill color from route palette
 * @param isTracked  - Adds a white outer ring when actively tracked
 */
export function createArrowBusIcon(routeColor: string, isTracked = false): string {
  const trackedRing = isTracked
    ? `<circle cx="15" cy="15" r="14" fill="none" stroke="white" stroke-width="2.5" opacity="0.95"/>`
    : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 34" width="26" height="30">
      <!-- Drop-shadow halo: white stroke slightly larger than body -->
      <path d="M15 2 L26 9 L26 24 L15 32 L4 24 L4 9 Z"
            fill="none"
            stroke="white"
            stroke-width="3.5"
            stroke-linejoin="round"
            opacity="0.7"/>

      ${trackedRing}

      <!-- Main hexagonal shield body: top vertex = direction of travel -->
      <path d="M15 2 L26 9 L26 24 L15 32 L4 24 L4 9 Z"
            fill="${routeColor}"
            stroke="rgba(0,0,0,0.25)"
            stroke-width="1"
            stroke-linejoin="round"/>

      <!-- Bold white directional chevron in centre -->
      <path d="M15 7 L22 16 L17 14 L17 25 L13 25 L13 14 L8 16 Z"
            fill="white"
            opacity="0.9"/>
    </svg>
  `.trim();
}

/** @deprecated Use createArrowBusIcon */
export function createTeardropBusIcon(routeColor: string): string {
  return createArrowBusIcon(routeColor);
}
