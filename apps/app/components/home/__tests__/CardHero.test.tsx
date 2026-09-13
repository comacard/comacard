import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComacardAccount } from "../../../lib/comacard/api";
import { CardHero } from "../CardHero";

/**
 * The headline, and the one control that changes what it says.
 *
 * The swap exists only on this figure. The keypads on Send and Repay take an amount that gets
 * signed, and a dollar figure there would be a number nobody can enter.
 */

const prices = vi.fn();
vi.mock("../../../hooks/usePrices", () => ({
  usePrices: () => ({ prices: prices(), loading: false }),
}));

vi.mock("../../ui", async () => {
  const actual = await vi.importActual<typeof import("../../ui")>("../../ui");
  return {
    ...actual,
    // CountUp animates toward its value over several frames, which a synchronous assertion loses a
    // race with. The figure and its formatting are what these tests are about.
    CountUp: ({
      value,
      format,
      className,
    }: {
      value: number;
      format: (n: number) => string;
      className?: string;
    }) => <span className={className}>{format(value)}</span>,
  };
});

const account = (spendableCtc: string): ComacardAccount =>
  ({
    kyc: { verified: true, status: "Approved", sessionId: "s" },
    card: { spendableCtc },
  }) as unknown as ComacardAccount;

beforeEach(() => {
  prices.mockReturnValue({ CTC: 0.104368 });
});

test("leads in tCTC and swaps to dollars when asked", async () => {
  const user = userEvent.setup();
  render(<CardHero account={account("36.3333")} />);

  expect(screen.getByText("36.3333 tCTC")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /show in us dollars/i }));

  // 36.3333 at 0.104368.
  expect(screen.getByText("$3.79")).toBeInTheDocument();
  expect(screen.queryByText("36.3333 tCTC")).toBeNull();
});

test("swaps back, and says which way the next press goes", async () => {
  const user = userEvent.setup();
  render(<CardHero account={account("36.3333")} />);

  await user.click(screen.getByRole("button", { name: /show in us dollars/i }));
  // The name names the destination rather than just "swap", so somebody who cannot see the figure
  // still knows what a press changes.
  await user.click(screen.getByRole("button", { name: /show in tCTC/i }));

  expect(screen.getByText("36.3333 tCTC")).toBeInTheDocument();
});

test("no price means no button, and the screen is exactly what it was", () => {
  // CoinGecko rate limited or unreachable. A control that cannot do anything is worse than an
  // absent one: absence is silent, a dead button is a question.
  prices.mockReturnValue({});
  render(<CardHero account={account("36.3333")} />);

  expect(screen.getByText("36.3333 tCTC")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});

test("an unissued card is not offered a currency at all", () => {
  render(
    <CardHero
      account={
        {
          kyc: { verified: false, status: "Pending", sessionId: "s" },
          card: { spendableCtc: "0" },
        } as unknown as ComacardAccount
      }
    />,
  );

  // "Not issued yet" is not a figure, and $0.00 beside it would be a claim about money that nothing
  // here knows.
  expect(screen.getByText("Not issued yet")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});

test("an unreadable account is a dash, with nothing to convert", () => {
  render(<CardHero account={null} />);

  expect(screen.getByText("—")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});
