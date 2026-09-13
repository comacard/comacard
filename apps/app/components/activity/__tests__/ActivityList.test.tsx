import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityItem } from "../../../lib/comacard/activity";
import { ActivityList } from "../ActivityList";

/**
 * The list renders the six kinds `useTransactions` emits and nothing else.
 *
 * It used to be tested against `rebalanced` and `proposed-exit` — a SoroSense agent moving money
 * between Stellar yield buckets, with a Review button for approving a proposed exit. Nothing in
 * Comacard sets `review`, and no row has since the port, so the affordance and its fourteen sibling
 * cases were asserting behaviour the product does not have.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);

const row = (over: Partial<ActivityItem> & Pick<ActivityItem, "id" | "kind">): ActivityItem => ({
  cat: "you",
  detail: "",
  when: "",
  ...over,
});

test("words each kind for someone who has held a secured credit card", () => {
  render(
    <ActivityList
      items={[
        row({ id: 1, kind: "drew", detail: "1.0000 tCTC from your credit limit" }),
        row({ id: 2, kind: "collateral-locked", detail: "0.0100 BNB put down on BSC Testnet" }),
        row({ id: 3, kind: "proved", detail: "0.0100 BNB now backs your credit limit" }),
      ]}
    />,
  );

  // No chain names in a title, and no protocol vocabulary anywhere near one.
  expect(screen.getByText("Spent")).toBeInTheDocument();
  expect(screen.getByText("Deposit")).toBeInTheDocument();
  expect(screen.getByText("Deposit confirmed")).toBeInTheDocument();
  expect(screen.queryByText(/collateral|attestation|drew/i)).toBeNull();
});

test("an unknown kind shows its detail rather than inventing a title", () => {
  render(<ActivityList items={[row({ id: 1, kind: "something-new", detail: "42 tCTC moved" })]} />);

  expect(screen.getByText("42 tCTC moved")).toBeInTheDocument();
});

test("grouped: splits by day and names today and yesterday", () => {
  render(
    <ActivityList
      grouped
      now={NOW}
      items={[
        row({ id: 1, kind: "drew", detail: "a", at: NOW - 3_600_000 }),
        row({ id: 2, kind: "repaid", detail: "b", at: NOW - DAY }),
        row({ id: 3, kind: "repaid", detail: "c", at: NOW - 5 * DAY }),
      ]}
    />,
  );

  expect(screen.getByText("Today")).toBeInTheDocument();
  expect(screen.getByText("Yesterday")).toBeInTheDocument();
  // Older than that gets a date, and no year because it is this one. "Sep 8" rather than "8 Sep":
  // en-US month-first, which is also what the reference app this was modelled on shows.
  expect(screen.getByText("Sep 8")).toBeInTheDocument();
});

test("grouped: two rows on the same day share one heading", () => {
  render(
    <ActivityList
      grouped
      now={NOW}
      items={[
        row({ id: 1, kind: "drew", detail: "a", at: NOW - 3_600_000 }),
        row({ id: 2, kind: "repaid", detail: "b", at: NOW - 7_200_000 }),
      ]}
    />,
  );

  expect(screen.getAllByText("Today")).toHaveLength(1);
});

test("grouped needs a clock, and renders flat without one", () => {
  // `now` is read after mount, so the first paint has none. Deciding "Today" during render would
  // bake the server's clock into the HTML.
  render(
    <ActivityList
      grouped
      now={null}
      items={[row({ id: 1, kind: "drew", detail: "a", at: NOW })]}
    />,
  );

  expect(screen.queryByText("Today")).toBeNull();
  expect(screen.getByText("Spent")).toBeInTheDocument();
});

test("renders a designed empty state when empty copy is provided", () => {
  render(
    <ActivityList
      items={[]}
      emptyTitle="No transactions yet"
      emptyDescription="Put down a deposit and everything that follows will show here."
    />,
  );

  expect(screen.getByText("No transactions yet")).toBeInTheDocument();
});

test("pageSize shows a page and a Load more that grows it", async () => {
  const user = userEvent.setup();
  const items = Array.from({ length: 7 }, (_, i) =>
    row({ id: i, kind: "drew", detail: `row ${i}` }),
  );
  render(<ActivityList items={items} pageSize={3} />);

  expect(screen.getAllByText("Spent")).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByText("Spent")).toHaveLength(6);
  // The last page is short, and the button goes once there is nothing left behind it.
  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByText("Spent")).toHaveLength(7);
  expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
});

test("no pageSize means no button, however long the list", () => {
  render(
    <ActivityList
      items={Array.from({ length: 20 }, (_, i) => row({ id: i, kind: "drew", detail: `r${i}` }))}
    />,
  );

  expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  expect(screen.getAllByText("Spent")).toHaveLength(20);
});

test("a lock reads Deposit, so it is not two different things beside its confirmation", () => {
  render(
    <ActivityList
      items={[
        row({ id: 1, kind: "proved", detail: "0.0100 BNB now backs your credit limit" }),
        row({ id: 2, kind: "collateral-locked", detail: "0.0100 BNB put down on BSC Testnet" }),
      ]}
    />,
  );

  expect(screen.getByText("Deposit")).toBeInTheDocument();
  expect(screen.getByText("Deposit confirmed")).toBeInTheDocument();
});
