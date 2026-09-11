import "@testing-library/jest-dom/vitest";

/**
 * jsdom implements neither `matchMedia` nor the Web Animations API, and `torph` uses both: it asks
 * about `prefers-reduced-motion`, then calls `element.getAnimations()` on the animated path.
 *
 * The shim answers **`matches: true` for reduced motion**, which sends every morphing label down
 * its no-animation branch. That is deliberate, not a dodge: this is the same stance the app's own
 * `CountUp` already takes (`NODE_ENV === "test"` counts as reduced motion), it keeps assertions
 * reading final text rather than racing an animation frame, and it means a component that only
 * works when animating is a component this suite will catch.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: /prefers-reduced-motion/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// Present on every real browser, absent in jsdom. Returning no running animations is truthful here.
if (typeof Element !== "undefined" && typeof Element.prototype.getAnimations !== "function") {
  Element.prototype.getAnimations = () => [];
}
