import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KycSheet } from "../KycSheet";

const URL = "https://verify.didit.me/session/abc123";

test("renders nothing until it is open and has a session", () => {
  const { rerender } = render(<KycSheet open={false} url={URL} onClose={vi.fn()} onPoll={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();

  rerender(<KycSheet open url={null} onClose={vi.fn()} onPoll={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("embeds the session and delegates the camera to it", () => {
  render(<KycSheet open url={URL} onClose={vi.fn()} onPoll={vi.fn()} />);

  const frame = screen.getByTitle("Identity verification");
  expect(frame).toHaveAttribute("src", URL);

  // Load policy and permission policy are separate gates. Without `allow`, Didit's page renders and
  // then fails at the face check with NotAllowedError, which reads as a broken product rather than
  // a missing attribute. Verified against a live session; do not drop it.
  const allow = frame.getAttribute("allow") ?? "";
  expect(allow).toContain("camera");
  expect(allow).toContain("microphone");
});

test("offers a way out for a browser that will not embed", () => {
  render(<KycSheet open url={URL} onClose={vi.fn()} onPoll={vi.fn()} />);
  const escape = screen.getByRole("link", { name: /open in a new tab/i });
  expect(escape).toHaveAttribute("href", URL);
  expect(escape).toHaveAttribute("target", "_blank");
});

test("closes on the button and on Escape", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<KycSheet open url={URL} onClose={onClose} onPoll={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Close verification" }));
  expect(onClose).toHaveBeenCalledTimes(1);

  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("polls while open, and stops once closed", () => {
  vi.useFakeTimers();
  const onPoll = vi.fn();
  // Didit reports the verdict by webhook to our own backend, never through the iframe, so polling
  // our account is the only signal that verification finished.
  const { rerender, unmount } = render(<KycSheet open url={URL} onClose={vi.fn()} onPoll={onPoll} />);

  vi.advanceTimersByTime(12_000);
  expect(onPoll.mock.calls.length).toBeGreaterThanOrEqual(2);

  const seen = onPoll.mock.calls.length;
  rerender(<KycSheet open={false} url={URL} onClose={vi.fn()} onPoll={onPoll} />);
  vi.advanceTimersByTime(12_000);
  expect(onPoll).toHaveBeenCalledTimes(seen);

  unmount();
  vi.useRealTimers();
});

test("takes over with a success state once our backend says verified, then closes itself", () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const onPoll = vi.fn();
  const { rerender } = render(
    <KycSheet open url={URL} verified={false} onClose={onClose} onPoll={onPoll} />,
  );
  expect(screen.getByTitle("Identity verification")).toBeInTheDocument();

  // Didit's own "you're done" page staying up is how someone sits there wondering whether the app
  // noticed. The sheet takes the screen back.
  rerender(<KycSheet open url={URL} verified onClose={onClose} onPoll={onPoll} />);
  expect(screen.queryByTitle("Identity verification")).toBeNull();
  expect(screen.getByText("Your card is ready")).toBeInTheDocument();

  onPoll.mockClear();
  vi.advanceTimersByTime(9000);
  // Nothing left to poll for once it is verified.
  expect(onPoll).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
  vi.useRealTimers();
});

test("the escape hatch is always offered, because a blocked frame cannot be detected", () => {
  // Brave's shields refuse the cross-origin frame on a localhost page, and a cross-origin frame
  // cannot be inspected. Revealing the fallback only "on failure" would mean never revealing it.
  render(<KycSheet open url={URL} onClose={vi.fn()} onPoll={vi.fn()} />);
  expect(screen.getByRole("link", { name: /not loading\? open in a new tab/i })).toBeInTheDocument();
});
