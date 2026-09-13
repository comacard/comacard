import type { Hex } from "viem";

/**
 * The signed message the guardians publish, fetched by the app rather than waited on.
 *
 * **Why the app asks at all.** A withdrawal is three transactions: the holder requests a release on
 * Creditcoin, the guardians sign it, and somebody submits that signature to the far chain so the
 * relay can approve the release. The app presented the middle step as "nothing for you to do" and
 * waited for the worker, which is a daemon that has been down for a day at a time (#12). Meanwhile
 * `ReleaseRelay.executeRelease(bytes calldata vaa)` carries no access modifier at all: its safety
 * comes from verifying that the message was emitted by our hub on Creditcoin, not from who sent it.
 * So the holder can submit it themselves, and an app that makes them wait on our infrastructure to
 * get their own collateral back is making a custodial product out of a trustless path.
 *
 * The worker still relays. This is the same button it presses, in the holder's hands, and whichever
 * gets there first wins: `consumedVaa` makes the second attempt revert with `AlreadyConsumed`
 * rather than paying out twice.
 *
 * **The emitter is the hub, not the vault.** Deposits are emitted by each chain's vault and
 * releases by the hub on Creditcoin, so the same endpoint with the wrong emitter returns a
 * confident 404 for a message that exists. The worker carries the same footgun in a comment.
 */

/**
 * Wormhole's own id for Creditcoin, which is where a release is published from.
 *
 * **59, and it does not follow the 10000-block testnet pattern.** I wrote 10009 here first, by
 * extrapolating from Base at 10004, which is the exact mistake that put Fuji at 10006 and shipped.
 * This is read off the deployed relay: `HUB_CHAIN_ID()` on BSC Testnet's ReleaseRelay returns 59,
 * and it is the value a release VAA is rejected against, so a wrong one here means every fetch
 * returns a confident 404 for a message that exists.
 */
export const CREDITCOIN_WORMHOLE_ID = 59;

const WORMHOLESCAN =
  process.env.NEXT_PUBLIC_WORMHOLESCAN_URL ?? "https://api.testnet.wormholescan.io";

/** An address as Wormhole writes it: 32 bytes, no `0x`, left-padded with zeroes. */
export function emitterAddress(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

/**
 * The signed VAA for one message, or null while the guardians have not signed it yet.
 *
 * Null rather than a throw for the not-yet case, because "not signed yet" is the normal state for
 * the first thirty seconds and a caller polling this should not be writing a try/catch to express
 * patience. A malformed response is also null: there is nothing a person does differently.
 */
export async function fetchSignedVaa(
  emitterChainId: number,
  emitter: string,
  sequence: bigint,
): Promise<Hex | null> {
  const url = `${WORMHOLESCAN}/v1/signed_vaa/${emitterChainId}/${emitterAddress(emitter)}/${sequence}`;

  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return null;

    const body = (await response.json()) as { vaaBytes?: string };
    if (!body.vaaBytes) return null;

    return base64ToHex(body.vaaBytes);
  } catch {
    return null;
  }
}

/**
 * Base64 to `0x` hex, without Buffer.
 *
 * `Buffer` is a Node global. The worker uses it because the worker is Node; this runs in a browser,
 * where reaching for it either fails outright or drags in a polyfill to move a few hundred bytes.
 */
export function base64ToHex(base64: string): Hex {
  const binary = atob(base64);
  let out = "";
  for (let i = 0; i < binary.length; i++) {
    out += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `0x${out}`;
}
