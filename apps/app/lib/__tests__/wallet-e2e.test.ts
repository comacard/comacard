import { beforeEach, expect, test } from "vitest";
import { connect, disconnect, E2E_ADDRESS, E2E_WALLET_NAME, getAddress } from "../wallet-e2e";

beforeEach(async () => {
  await disconnect();
});

test("the address is a well-formed EVM address", () => {
  expect(E2E_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
});

test("connect resolves a deterministic address and wallet name", async () => {
  expect(await connect()).toEqual({ address: E2E_ADDRESS, name: E2E_WALLET_NAME });
});

test("getAddress throws before connect and resolves after", async () => {
  await expect(getAddress()).rejects.toThrow("no e2e wallet connected");
  await connect();
  expect(await getAddress()).toBe(E2E_ADDRESS);
});

test("a value written under the old soro. prefix is carried across, once", async () => {
  // The rename is only safe because of this. `comacard.release.pending.v1` holds the local record
  // of a withdrawal that has been signed and not yet claimed, and nothing else holds it, so losing
  // it on a rename would leave money in a vault with nothing on screen pointing at it.
  const { migrateStorageKeys } = await import("../storage");
  localStorage.clear();
  localStorage.setItem("soro.release.pending.v1", '{"kept":true}');

  migrateStorageKeys();

  expect(localStorage.getItem("comacard.release.pending.v1")).toBe('{"kept":true}');
  expect(localStorage.getItem("soro.release.pending.v1")).toBeNull();
});
