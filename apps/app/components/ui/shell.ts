/**
 * The one definition of how wide the desktop shell is, shared by the navigation bar and the content
 * column beneath it. Two copies of these classes is two chances for the brand to stop lining up
 * with the first card under it.
 *
 * 1280 with 40px of padding yields 1200px of content at a 1440px viewport. That is the band every
 * dashboard measured sits in — Aave 1240, coinbase 1200, privacy 1280, robinhood 1280, stripe 1232
 * — and it is 168px narrower than what this app was doing, which ran the column to 95% of the
 * screen and left nothing for the eye to rest against. See docs/desktop-layout-research.md.
 */
export const SHELL = "mx-auto w-full max-w-[1280px] px-5 lg:px-10";
