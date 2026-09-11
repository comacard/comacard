import type { AppKit } from "@reown/appkit";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { toWalletError, WalletError, USER_CLOSED_MODAL } from "./wallet-error";

/**
 * Reown AppKit is the wallet layer: one modal that lists the injected extensions
 * (MetaMask, Rabby, ...) and every WalletConnect wallet behind the same project id.
 *
 * It replaces Stellar Wallets Kit (`wallet-real.ts`, kept unwired for reference) because
 * Comacard settles on Creditcoin, an EVM chain. The five exports at the bottom are the whole
 * seam `lib/wallet.ts` re-exports, so nothing above this file knows which kit is in use.
 *
 * **Everything from `@reown/*` is imported dynamically, and that is load-bearing — not style.**
 * `WalletProvider` is a client component, so Next also renders it on the server, and a static
 * `import { EthersAdapter }` drags the adapter's optional Coinbase/Base account SDK into the
 * SSR graph. That SDK lazily imports `@x402/*` packages nobody installs, Turbopack cannot
 * resolve them, and *every route 500s* — on an import path this app never calls. Types are
 * `import type` (erased) and the two networks below are plain literals rather than
 * `defineChain()` calls for the same reason: nothing here may reach a real `@reown` module
 * until a browser asks for a wallet.
 */

/** Creditcoin CC3 testnet. Chain id and RPC match `contracts/foundry.toml`. */
export const creditcoinTestnet: AppKitNetwork = {
  id: 102031,
  caipNetworkId: "eip155:102031",
  chainNamespace: "eip155",
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  // Both keys are required and they are not interchangeable: the modal reads `default`,
  // while AppKit's `wallet_addEthereumChain` reads `chainDefault` and sends an EMPTY rpcUrls
  // array without it, which every wallet rejects.
  rpcUrls: {
    default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
    chainDefault: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: { name: "Creditcoin Explorer", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
};

/** Where the collateral lives (Attestcoin proves Sepolia transactions on Creditcoin). */
export const sepolia: AppKitNetwork = {
  id: 11155111,
  caipNetworkId: "eip155:11155111",
  chainNamespace: "eip155",
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
    chainDefault: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
  testnet: true,
};

/** WalletConnect ids for the wallets the connect screen illustrates. */
const METAMASK_ID = "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96";
const RABBY_ID = "18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1";

const EIP155 = "eip155" as const;

let kit: AppKit | null = null;
let building: Promise<AppKit> | null = null;

function projectId() {
  const id = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
  if (!id) {
    throw new WalletError(
      "Reown project ID is not configured. Set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID.",
    );
  }
  return id;
}

export function getKit(): Promise<AppKit> {
  if (typeof window === "undefined") {
    return Promise.reject(new WalletError("wallet is client-only"));
  }
  if (kit) return Promise.resolve(kit);
  if (!building) {
    building = (async () => {
      const [{ createAppKit }, { EthersAdapter }] = await Promise.all([
        import("@reown/appkit"),
        import("@reown/appkit-adapter-ethers"),
      ]);
      kit = createAppKit({
        adapters: [new EthersAdapter()],
        // Sepolia, not Creditcoin, is the network AppKit connects on. See `connect()` below:
        // the adapter always fires `wallet_switchEthereumChain` while connecting and never
        // offers to ADD the chain, so a Creditcoin default dead-ends at "Connection declined"
        // for every wallet that does not already have CC3. Sepolia is built into every wallet,
        // so that switch always succeeds; Creditcoin is selected straight after.
        networks: [sepolia, creditcoinTestnet],
        defaultNetwork: sepolia,
        projectId: projectId(),
        metadata: {
          name: "Comacard",
          description: "A card sized by what you have repaid, not what you hold.",
          url: window.location.origin,
          icons: [`${window.location.origin}/brand/comacard-logo.png`],
        },
        featuredWalletIds: [METAMASK_ID, RABBY_ID],
        // Email/social sign-in mints a wallet that cannot carry an on-chain credit history,
        // and on-ramp/swap are out of scope. Wallet connect only.
        features: { email: false, socials: false, onramp: false, swaps: false, analytics: false },
        themeMode: "light",
      });
      return kit;
    })();
    building.catch(() => {
      // A failed build must not be cached, or every later attempt replays the same error.
      building = null;
    });
  }
  return building;
}

/**
 * `getWalletId()` / `getWalletName()` are called by `WalletProvider` *after* `connect()` has
 * resolved, so the kit is already built and a synchronous read is safe. They are the only two
 * places the seam is not async, which is why this exists rather than making them async too.
 */
function builtKit(): AppKit | null {
  return kit;
}

/**
 * AppKit reports a connection through `subscribeAccount`, not through a promise, and it
 * restores a previous session asynchronously on boot. Both `connect()` and `getAddress()`
 * therefore need the same thing: an address, or a decision that there is not going to be one.
 *
 * `opts.openModal` distinguishes the two callers. With the modal open, closing it without
 * connecting is a *cancellation* (code -1, which `page.tsx` already swallows silently);
 * without it we are only re-verifying a stored session and a miss is an ordinary rejection.
 */
async function waitForAddress({ openModal }: { openModal: boolean }): Promise<string> {
  const appKit = await getKit();

  return new Promise<string>((resolve, reject) => {
    const existing = appKit.getAddress(EIP155);
    if (existing) {
      resolve(existing);
      return;
    }

    let settled = false;
    const cleanups: Array<() => void> = [];
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      for (const c of cleanups) c();
      fn();
    };

    cleanups.push(
      appKit.subscribeAccount((account) => {
        if (account.address) finish(() => resolve(account.address as string));
      }, EIP155),
    );

    if (openModal) {
      // A transition back to closed with no address is the user dismissing the picker.
      let sawOpen = false;
      cleanups.push(
        appKit.subscribeState((state) => {
          if (state.open) {
            sawOpen = true;
            return;
          }
          if (!sawOpen) return;
          if (appKit.getAddress(EIP155)) return;
          finish(() => reject(new WalletError("The user closed the modal.", USER_CLOSED_MODAL)));
        }),
      );
      void appKit.open({ view: "Connect", namespace: EIP155 }).catch((e) => {
        finish(() => reject(toWalletError(e)));
      });
    } else {
      // Reconnect only. AppKit rehydrates from its own storage; give it a bounded window
      // rather than leaving hydration hanging on a wallet that will never answer.
      const timer = window.setTimeout(() => {
        finish(() => reject(new WalletError("No connected wallet.")));
      }, 4000);
      cleanups.push(() => window.clearTimeout(timer));
      void appKit.ready().then(() => {
        const address = appKit.getAddress(EIP155);
        if (address) finish(() => resolve(address));
      });
    }
  });
}

export function getWalletName(): string {
  return builtKit()?.getWalletInfo(EIP155)?.name ?? "Wallet";
}

export function getWalletId(): string {
  return builtKit()?.getWalletProviderType() ?? "reown";
}

/**
 * Moves the connected wallet onto Creditcoin, adding the chain first when the wallet does not
 * know it. This has to happen *after* connecting, not through `defaultNetwork`, because the two
 * code paths differ: the adapter's connect-time switch throws on an unrecognised chain, while
 * `switchNetwork()` catches that same error and falls back to `wallet_addEthereumChain`.
 *
 * A refusal here is not a failed connection. The user stays connected on Sepolia (where the
 * collateral lives anyway) and can switch from the account screen, which beats throwing away a
 * wallet session they already approved.
 */
async function selectCreditcoin(appKit: AppKit): Promise<void> {
  try {
    await appKit.switchNetwork(creditcoinTestnet);
  } catch {
    // Declined, or the wallet cannot hold a custom chain. Leave the session alone.
  }
}

export async function connect(): Promise<{ address: string; name: string }> {
  try {
    const address = await waitForAddress({ openModal: true });
    const appKit = await getKit();
    await appKit.close();
    await selectCreditcoin(appKit);
    return { address, name: getWalletName() };
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function getAddress(): Promise<string> {
  return waitForAddress({ openModal: false });
}

/**
 * The vault seam still speaks Stellar: `MockVaultClient` hands out placeholder XDRs
 * ("mock-xdr-N") and the real bindings would hand out real ones. An EVM wallet can sign
 * neither, so the mock's placeholders are signed as an arbitrary message (`personal_sign`) —
 * the wallet still pops, the user still approves, and the mock discards the signature, which
 * keeps every flow demoable end to end. A *real* Stellar XDR is refused outright rather than
 * silently mis-signed; that path needs EVM contract calls, not this function.
 */
export async function signTransaction(xdr: string): Promise<string> {
  try {
    if (!xdr.startsWith("mock-xdr-")) {
      throw new WalletError(
        "This wallet signs Creditcoin (EVM) transactions. A Stellar XDR cannot be signed here.",
      );
    }
    const appKit = await getKit();
    const provider = appKit.getWalletProvider() as
      | { request: (args: { method: string; params: unknown[] }) => Promise<unknown> }
      | undefined;
    const address = appKit.getAddress(EIP155);
    if (!provider || !address) throw new WalletError("No connected wallet.");
    const hex = Array.from(new TextEncoder().encode(xdr))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const signature = await provider.request({
      method: "personal_sign",
      params: [`0x${hex}`, address],
    });
    return String(signature);
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function disconnect(): Promise<void> {
  if (!kit) return;
  await kit.disconnect(EIP155);
}
