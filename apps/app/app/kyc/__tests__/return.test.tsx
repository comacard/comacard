import { render, screen } from "@testing-library/react";
import KycReturn from "../return/page";

/**
 * The route Didit redirects to after verification.
 *
 * It exists because the KYC service is configured with this exact path; renaming it without
 * repointing `KYC_CALLBACK_URL` lands every verified user on a 404, and quietly, since the webhook
 * still records them. These tests pin the two things that matter: the route renders at all, and it
 * never decides anything from the query string.
 */

async function renderPage(status?: string) {
  const ui = await KycReturn({ searchParams: Promise.resolve(status ? { status } : {}) });
  render(ui);
}

test("tells an approved user their card is on the way", async () => {
  await renderPage("Approved");

  expect(screen.getByText("All done")).toBeInTheDocument();
  expect(screen.getByText(/your identity is verified/i)).toBeInTheDocument();
});

test("anything other than Approved reads as still in progress, not as a refusal", async () => {
  await renderPage("In Review");

  // Didit reviews; a redirect is not a verdict. Telling someone they were rejected on the strength
  // of a query parameter would be wrong twice over.
  expect(screen.getByText(/still reviewing/i)).toBeInTheDocument();
  expect(screen.queryByText(/reject|denied|failed/i)).toBeNull();
});

test("renders without a status at all, which is what a bare visit looks like", async () => {
  await renderPage();

  expect(screen.getByText("Finished")).toBeInTheDocument();
});

test("always offers the way back to the card", async () => {
  await renderPage("Approved");

  expect(screen.getByRole("link", { name: /back to your card/i })).toHaveAttribute("href", "/card");
});
