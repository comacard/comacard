import { expect, test } from "bun:test";
import { AbiCoder, id } from "ethers";

/**
 * The relay decides "somebody already delivered this" by matching a revert
 * selector out of an RPC error string, because that is all the node gives back.
 * Two four-byte constants in TypeScript, defined by Solidity somewhere else —
 * the same shape of hazard as the action ordinals and the chain map, and the
 * failure would be quiet: a delivered release logged as an unexplained error,
 * retried forever.
 *
 * I got one of these wrong by writing it from memory rather than computing it.
 */
const selector = (signature: string) => id(signature).slice(0, 10);

test.each([
  ["VaaAlreadyConsumed(bytes32)", "0x8665b3f2"], // WormholeCollateralHub
  ["AlreadyConsumed(bytes32)", "0x0f50872f"], // ReleaseRelay
])("%s is %s", (signature, expected) => {
  expect(selector(signature as string)).toBe(expected as string);
});

/**
 * The destination parser, against real signed VAAs.
 *
 * Sequences 0 and 1 predate the destination field and must come back null —
 * they are the messages that were valid on every chain, and treating them as
 * deliverable is what sent five reverted transactions per sweep. Sequence 2
 * carries Fuji, and is the one that actually released.
 */
function destinationOf(vaa: string): number | null {
  try {
    const bytes = Buffer.from(vaa.replace("0x", ""), "hex");
    const signatures = bytes[5] ?? 0;
    const payload = bytes.subarray(6 + signatures * 66 + 51);
    if (payload.length !== 192) return null;
    const [version, chainId] = AbiCoder.defaultAbiCoder().decode(
      ["uint8", "uint16", "bytes32", "bytes32", "uint256", "uint8"],
      payload,
    );
    return Number(version) === 2 ? Number(chainId) : null;
  } catch {
    return null;
  }
}

/** Hub sequence 0: the Fuji release that also executed on BSC, before the fix. */
const RELEASE_WITHOUT_DESTINATION =
  "0x01000000000100cf019358550d78fb4b62ad560df1647017a8a6391ba811bbfdc7b6df488b07163cbb33d2462851670cf5ad3a45a6f7ce1b5fe41bc4acd9d770bbff390a7be070006aa540eb00000000003b0000000000000000000000009d77f5e1d5afe5258ca16f808dc5ba1e9f68437f00000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000003b4f0135465d444a5bd06ab90fc59b73916c85f5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c68af0bb1400000000000000000000000000000000000000000000000000000000000000000012";

/** Hub sequence 2: the same kind of release, addressed to Fuji (Wormhole 6). */
const RELEASE_TO_FUJI =
  "0x010000000001005e7a2ddc1b7a9ae37642c2210e8cd53bbf9500707f64775d79ea840e8aa63add2951df27a2baebdb876202dba29c140826be4f274ed748e760a5d082e8601370016aa546b800000000003b0000000000000000000000009d77f5e1d5afe5258ca16f808dc5ba1e9f68437f000000000000000201000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000060000000000000000000000003b4f0135465d444a5bd06ab90fc59b73916c85f5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b1a2bc2ec500000000000000000000000000000000000000000000000000000000000000000012";

test("a release published before the destination field names no chain", () => {
  expect(destinationOf(RELEASE_WITHOUT_DESTINATION)).toBeNull();
});

test("a release addressed to Fuji reads as Fuji", () => {
  expect(destinationOf(RELEASE_TO_FUJI)).toBe(6);
});

test("a payload too short to be a release is refused rather than guessed", () => {
  expect(destinationOf("0x01")).toBeNull();
  expect(destinationOf("0x")).toBeNull();
});
