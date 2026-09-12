import { describe, expect, test } from "bun:test";
import { formatUnits, type RemoteDepositRow, remoteDepositView } from "../src/shape";

const LOCKED = 1_789_000_000;
const baseUsdc = {
  wormholeChainId: 10004,
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  decimals: 6,
};

const row = (over: Partial<RemoteDepositRow> = {}): RemoteDepositRow => ({
  id: "10004-7",
  account: "0xabc",
  amount: "50000000",
  sequence: "7",
  lockedAt: String(LOCKED),
  lockTxHash: "0xlock",
  creditedAt: null,
  creditTxHash: null,
  asset: baseUsdc,
  ...over,
});

describe("formatUnits", () => {
  test("honours the asset's own decimals", () => {
    expect(formatUnits(50_000_000n, 6)).toBe("50.0000");
    expect(formatUnits(10_000_000_000_000_000n, 18)).toBe("0.0100");
  });
  test("truncates rather than rounding, and never uses a float", () => {
    expect(formatUnits(1_999_999n, 6)).toBe("1.9999");
    expect(formatUnits(0n, 6)).toBe("0.0000");
  });
});

describe("remoteDepositView", () => {
  test("in flight: not credited, named chain, linked lock", () => {
    const v = remoteDepositView(row(), LOCKED + 60);
    expect(v).toMatchObject({
      chain: "Base Sepolia",
      credited: false,
      slow: false,
      amountFormatted: "50.0000",
      elapsedSeconds: 60,
      creditTxUrl: null,
    });
    expect(v.lockTxUrl).toBe("https://sepolia.basescan.org/tx/0xlock");
  });

  test("past the nominal wait it is slow, never failed", () => {
    expect(remoteDepositView(row(), LOCKED + 901).slow).toBe(true);
    expect(remoteDepositView(row(), LOCKED + 901).credited).toBe(false);
  });

  test("delivered: credited, with the Creditcoin transaction linked", () => {
    const v = remoteDepositView(
      row({ creditedAt: String(LOCKED + 1049), creditTxHash: "0xcredit" }),
      LOCKED + 2000,
    );
    expect(v.credited).toBe(true);
    expect(v.slow).toBe(false);
    expect(v.creditTxUrl).toBe("https://creditcoin-testnet.blockscout.com/tx/0xcredit");
  });

  test("the same token on two chains stays two assets", () => {
    const arb = remoteDepositView(
      row({ id: "10003-7", asset: { ...baseUsdc, wormholeChainId: 10003 } }),
      LOCKED,
    );
    expect(arb.chain).toBe("Arbitrum Sepolia");
    expect(arb.id).not.toBe(remoteDepositView(row(), LOCKED).id);
  });

  test("every vault chain the worker knows is named here", () => {
    // Mirrors `vaults` in apps/worker/src/config.ts. A chain missing from the
    // map still works, but renders as a number with no explorer link.
    for (const id of [4, 6, 10003, 10004, 10005]) {
      const v = remoteDepositView(row({ asset: { ...baseUsdc, wormholeChainId: id } }), LOCKED);
      expect(v.chain).not.toMatch(/^Wormhole chain/);
      expect(v.lockTxUrl).toContain("https://");
    }
  });

  test("an unlisted chain degrades to its number, with no link", () => {
    const v = remoteDepositView(row({ asset: { ...baseUsdc, wormholeChainId: 30 } }), LOCKED);
    expect(v.chain).toBe("Wormhole chain 30");
    expect(v.lockTxUrl).toBeNull();
  });

  test("a clock behind the indexer never yields negative elapsed time", () => {
    expect(remoteDepositView(row(), LOCKED - 30).elapsedSeconds).toBe(0);
  });
});
