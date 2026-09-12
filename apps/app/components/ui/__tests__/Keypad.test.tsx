import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Keypad } from "../Keypad";

function Harness() {
  const [v, setV] = useState("0");
  return <Keypad value={v} onChange={setV} symbol="$" onQuick={() => setV("100.00")} />;
}

test("typing digits builds the amount; backspace trims", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "2" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("12");
  await user.click(screen.getByRole("button", { name: "Backspace" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1");
});

test("quick-fill sets the amount", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Max" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("100.00");
});

test("the physical keyboard types into the pad", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  // The pad is buttons, not an input, so a laptop user typing got nothing at all before this.
  await user.keyboard("250");
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("250");

  await user.keyboard("{Backspace}");
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("25");
});

test("a comma types a decimal point, and only one point is ever allowed", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  // Most of the world's numeric keypads emit a comma for the decimal separator.
  await user.keyboard("1,5");
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1.5");

  await user.keyboard(".");
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1.5");
});

test("keystrokes aimed at a real input are left alone", async () => {
  const user = userEvent.setup();
  render(
    <>
      <input aria-label="note" />
      <Harness />
    </>,
  );

  await user.click(screen.getByLabelText("note"));
  await user.keyboard("77");

  // A window listener that swallowed these would break every other field on the page.
  expect(screen.getByLabelText("note")).toHaveValue("77");
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("0");
});

test("groups thousands on screen without putting separators into the value", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Keypad value="1122" onChange={onChange} symbol="" onQuick={() => {}} />);

  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1,122");

  // The value stays raw. A separator in it would have to be stripped again before it could be
  // parsed into an on-chain amount.
  await user.keyboard("3");
  expect(onChange).toHaveBeenCalledWith("11223");
});

test("leaves a half-typed decimal alone", () => {
  // A formatter run over the whole value would drop the point in "12." and the zero in "1.50",
  // each fighting the keystroke that just produced it.
  const { rerender } = render(
    <Keypad value="1234." onChange={() => {}} symbol="" onQuick={() => {}} />,
  );
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1,234.");

  rerender(<Keypad value="1234.50" onChange={() => {}} symbol="" onQuick={() => {}} />);
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1,234.50");
});
