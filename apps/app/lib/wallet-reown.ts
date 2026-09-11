import { getAppKit } from "./comacard/appkit";
import { creditcoinTestnet, wagmiConfig } from "./comacard/wagmi";
import { toWalletError, USER_CLOSED_MODAL, WalletError } from "./wallet-error";

/**
 * The five functions `lib/wallet.ts` re-exports, implemented on wagmi core actions.
 *
 * Imperative rather than hooks on purpose. `WalletProvider` and every screen above it already
 * consume this seam, and the whole point of keeping it is that swapping ethers for wagmi did not
 * have to touch a single component. Wagmi's React hooks are still available to new code that wants
 * them; `wagmi/actions` is the same machinery with the config passed explicitly.
 *
 * Every wagmi action is imported dynamically, and that is load-bearing. `WalletProvider`
 * is a client component, so Next renders it on the server too, and a static import drags the
 * connector stack into the SSR graph where some of its optional deps do not resolve. Types are
 * `import type` (erased); nothing here reaches a real wallet module until a browser asks.
 */

const EIP155 = "eip155" as const;

// `wagmi/actions` re-exports `@wagmi/core/actions`, so importing it needs no extra dependency
// and keeps the version pinned to whatever wagmi itself resolves.
type CoreActions = typeof import("wagmi/actions");
let core: CoreActions | null = null;

async function actions(): Promise<CoreActions> {
  if (typeof window === "undefined") throw new WalletError("wallet is client-only");
  if (!core) core = await import("wagmi/actions");
  return core;
}

/** Reads that happen after a connect, where the module is already loaded. */
const loaded = (): CoreActions | null => core;

export function getWalletName(): string {
  const c = loaded();
  if (!c) return "Wallet";
  return c.getAccount(wagmiConfig).connector?.name ?? "Wallet";
}

export function getWalletId(): string {
  const c = loaded();
  if (!c) return "reown";
  return c.getAccount(wagmiConfig).connector?.id ?? "reown";
}

/**
 * Moves the connected wallet onto Creditcoin, adding the chain when the wallet does not know it.
 *
 * This has to happen after connecting rather than through `defaultNetwork`, because the two code
 * paths differ: AppKit's connect-time switch throws on an unrecognised chain, while `switchChain`
 * falls back to `wallet_addEthereumChain`. A refusal here is not a failed connection: the user
 * stays on Sepolia, where the collateral lives anyway, and can switch later.
 */
async function selectCreditcoin(): Promise<void> {
  try {
    const { switchChain } = await actions();
    await switchChain(wagmiConfig, { chainId: creditcoinTestnet.id as number });
  } catch {
    // Declined, or the wallet cannot hold a custom chain. Leave the session alone.
  }
}

export async function connect(): Promise<{ address: string; name: string }> {
  try {
    const appKit = await getAppKit();
    const { getAccount, watchAccount } = await actions();

    const existing = getAccount(wagmiConfig).address;
    if (existing) {
      await appKit.close();
      return { address: existing, name: getWalletName() };
    }

    const address = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const cleanups: Array<() => void> = [];
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        for (const c of cleanups) c();
        fn();
      };

      cleanups.push(
        watchAccount(wagmiConfig, {
          onChange(account) {
            if (account.address) finish(() => resolve(account.address as string));
          },
        }),
      );

      // The modal closing with no account is the user dismissing the picker, which `page.tsx`
      // already swallows silently by its code rather than by its message.
      let sawOpen = false;
      cleanups.push(
        appKit.subscribeState((state) => {
          if (state.open) {
            sawOpen = true;
            return;
          }
          if (!sawOpen) return;
          if (getAccount(wagmiConfig).address) return;
          finish(() => reject(new WalletError("The user closed the modal.", USER_CLOSED_MODAL)));
        }),
      );

      void appKit.open({ view: "Connect", namespace: EIP155 }).catch((e) => {
        finish(() => reject(toWalletError(e)));
      });
    });

    await appKit.close();
    await selectCreditcoin();
    return { address, name: getWalletName() };
  } catch (e) {
    throw toWalletError(e);
  }
}

/**
 * The address of a session wagmi has already restored, or a rejection.
 *
 * `WalletProvider` calls this to re-verify a saved address on hydration. Reconnection is async and
 * cookie-driven, so a miss on the first tick is not proof of absence; the bounded wait is what
 * stops hydration hanging on a wallet that will never answer.
 */
export async function getAddress(): Promise<string> {
  const { getAccount, watchAccount } = await actions();
  const now = getAccount(wagmiConfig);
  if (now.address) return now.address;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unwatch();
      window.clearTimeout(timer);
      fn();
    };
    const unwatch = watchAccount(wagmiConfig, {
      onChange(account) {
        if (account.address) finish(() => resolve(account.address as string));
        else if (account.status === "disconnected") {
          finish(() => reject(new WalletError("No connected wallet.")));
        }
      },
    });
    const timer = window.setTimeout(
      () => finish(() => reject(new WalletError("No connected wallet."))),
      4000,
    );
  });
}

/**
 * The vault seam still speaks Stellar: `MockVaultClient` hands out placeholder XDRs ("mock-xdr-N").
 * An EVM wallet can sign neither those nor a real one, so the placeholders are signed as an
 * arbitrary message, which keeps every mocked flow demoable end to end. A real Stellar XDR is
 * refused outright rather than silently mis-signed.
 *
 * Creditcoin transactions do NOT come through here. They are `writeContract` calls in
 * `lib/comacard/contracts.ts`, where the ABI makes the intent legible.
 */
export async function signTransaction(xdr: string): Promise<string> {
  try {
    if (!xdr.startsWith("mock-xdr-")) {
      throw new WalletError(
        "This wallet signs Creditcoin (EVM) transactions. A Stellar XDR cannot be signed here.",
      );
    }
    const { signMessage } = await actions();
    return await signMessage(wagmiConfig, { message: xdr });
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function disconnect(): Promise<void> {
  const c = loaded();
  if (!c) return;
  await c.disconnect(wagmiConfig);
}
