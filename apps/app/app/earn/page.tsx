import { redirect } from "next/navigation";

/**
 * `/earn` was this tab's path until the screen stopped being about yield. Kept as a redirect rather
 * than deleted: the rename cannot reach a link already posted in a chat or bookmarked by somebody
 * about to judge this, and a 404 there costs more than one file does.
 *
 * Deliberately outside the `(app)` route group. Inside it the shell and `AuthGate` would render
 * first and the reader would see a flash of the wrong screen before the bounce.
 */
export default function EarnRedirect() {
  redirect("/credit");
}
