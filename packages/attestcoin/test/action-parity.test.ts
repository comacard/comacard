import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASC_ACTION } from "../src/index.js";

/**
 * The action ordinals are an ABI shared with a contract that lives in another
 * language, and nothing but this test connects them. When they drifted, a proof
 * of real mainnet history was submitted as action 4 and reverted with
 * UnknownAction — after the proof had already been generated and paid for.
 */
test("action ordinals match the Solidity enum", () => {
  const source = readFileSync(
    join(import.meta.dir, "../../../contracts/src/types/CreditTypes.sol"),
    "utf8",
  );

  const body = /enum CreditAction\s*\{([^}]*)\}/.exec(source)?.[1];
  expect(body).toBeDefined();

  const solidity = (body as string)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Same members, same order, therefore same ordinals.
  const typescript = Object.entries(ASC_ACTION)
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name[0]?.toUpperCase() + name.slice(1));

  expect(typescript).toEqual(solidity);
});
