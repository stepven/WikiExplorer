/**
 * Tuneable values for the focus-mode background gradient shader.
 */
export const gradientDials = {
  /**
   * Fraction of viewport from the bottom that is **solid** white overlay (alpha 1.0).
   * Above this line the overlay ramps from bottomOpacity → topOpacity.
   */
  solidBand: 5 / 8,
  /** Overlay alpha at the very top of the screen (0–1) */
  topOpacity: 1.0,
  /** Overlay alpha at the seam where the gradient begins (0–1) */
  bottomOpacity: 0.85,
  /** Vertical Gaussian blur radius in pixels — softens the entire gradient overlay */
  blur: 0,
  /** Grain / noise intensity mixed into the gradient (0–1) */
  noise: 0,
}
