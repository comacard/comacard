import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyButton } from "../CopyButton";

const writeText = vi.fn();

/**
 * `userEvent.setup()` installs its OWN clipboard stub on `navigator.clipboard`, so the spy has to
 * be planted after it or the component writes to user-event's stub and this file asserts on a spy
 * nobody called.
 */
function setup() {
  const user = userEvent.setup();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return user;
}

test("copies the value and says so", async () => {
  const user = setup();
  const onCopied = vi.fn();
  render(<CopyButton value="105457977269" onCopied={onCopied} />);

  const button = screen.getByRole("button", { name: "Copy" });
  expect(button).toHaveAttribute("data-state", "idle");

  await user.click(button);
  expect(writeText).toHaveBeenCalledWith("105457977269");
  await waitFor(() => expect(button).toHaveAttribute("data-state", "copied"));
  expect(onCopied).toHaveBeenCalled();
});

test("a clipboard that refuses says so instead of pretending", async () => {
  // `navigator.clipboard` rejects on an insecure origin and inside some in-app browsers. A button
  // that reports success there is worse than one that admits it failed.
  const user = setup();
  writeText.mockRejectedValue(new Error("denied"));
  render(<CopyButton value="105457977269" />);

  const button = screen.getByRole("button", { name: "Copy" });
  await user.click(button);
  await waitFor(() => expect(button).toHaveAttribute("data-state", "failed"));
});

test("keeps its accessible name while the visible label morphs", async () => {
  const user = setup();
  render(<CopyButton value="x" label="Copy account number" />);
  const button = screen.getByRole("button", { name: "Copy account number" });
  await user.click(button);
  // The visible text changes; the name a screen reader announces must not move under the user.
  await waitFor(() => expect(button).toHaveAttribute("data-state", "copied"));
  expect(screen.getByRole("button", { name: "Copy account number" })).toBe(button);
});
