import type { Address } from "viem";

/**
 * The URI a wallet app reads out of a QR code, per EIP-681.
 *
 * **Why this and not the vault's address on its own.** The obvious QR, and the one every exchange
 * shows, is a bare deposit address: send anything to it and a human somewhere credits your balance.
 * Comacard has nobody in that loop. A limit moves because `lockNative()` or `lockToken()` ran and
 * credited `msg.sender`, not because a vault's balance went up, and the vaults have no `receive()`
 * or `fallback()` at all. So a bare address is not merely useless here, it is a trap:
 *
 * - Native coin sent to a vault reverts. The money comes back, the deposit does not happen, and the
 *   person is left with a failed transaction and no explanation.
 * - An ERC20 sent to a vault ARRIVES. `transfer` does not run the recipient's code, so nothing is
 *   credited, no event is emitted, and there is no rescue function. The tokens are gone for good.
 *
 * An EIP-681 URI encodes the function call instead, so a wallet that scans it opens a confirmation
 * for `lockNative` with the right value on the right chain, and one that cannot parse it fails to
 * open anything rather than sending a bare transfer.
 *
 * **Wallet support is real but uneven, so this is never the only route.** MetaMask Mobile has
 * carried EIP-681 scanning for years, and function-call URIs specifically have been broken there
 * more than once, most recently in 2026. Every screen that shows one of these also shows the amount,
 * the chain, and a button that signs through the connected wallet, so the QR is the convenience and
 * not the mechanism.
 *
 * Grammar (the subset used here):
 *
 *     ethereum:<address>@<evm chain id>/<function>?<param>=<value>&value=<wei>
 *
 * `value` is the transaction's native value in wei; other parameters are the function's arguments,
 * named as the ABI names them. Integers are written in full decimal rather than the scientific
 * shorthand the spec also permits, because the shorthand has been the source of wallet bugs and
 * there is nothing to gain from it in a QR code.
 */

/** A lock of the chain's own coin: the whole amount rides in `value`, fee included. */
export function lockNativeUri(vault: Address, evmChainId: number, valueWei: bigint): string {
  assertPositive(valueWei);
  return `ethereum:${vault}@${evmChainId}/lockNative?value=${valueWei.toString(10)}`;
}

/**
 * A lock of an ERC20.
 *
 * `amount` is the token's own base units and rides as a function argument; `value` carries only the
 * Wormhole message fee, which is native. The two are separate quantities in different units and
 * writing the token amount into `value` would ask the wallet to send that many wei of the chain's
 * own coin.
 *
 * This still needs an allowance first, which no URI can express: `lockToken` calls
 * `safeTransferFrom`, and without an approval it reverts. Callers must not offer this QR before the
 * allowance is in place, or it produces a confirmation that cannot succeed.
 */
export function lockTokenUri(
  vault: Address,
  evmChainId: number,
  token: Address,
  amount: bigint,
  feeWei: bigint,
): string {
  assertPositive(amount);
  if (feeWei < 0n) throw new Error("fee cannot be negative");
  return (
    `ethereum:${vault}@${evmChainId}/lockToken` +
    `?token=${token}&amount=${amount.toString(10)}&value=${feeWei.toString(10)}`
  );
}

function assertPositive(value: bigint): void {
  // A zero-value lock reverts (`FeeNotCovered`, or `NothingToLock`), so a QR for one is a code that
  // can only produce a failed transaction. Refusing to build it keeps that off the screen.
  if (value <= 0n) throw new Error("amount must be greater than zero");
}
