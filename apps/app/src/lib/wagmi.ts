import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { required } from "./api";

/** Creditcoin CC3 testnet, where the credit line lives. */
export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Testnet CTC", symbol: "tCTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        required("NEXT_PUBLIC_CREDITCOIN_RPC_URL", process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL),
      ],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [creditcoinTestnet],
  connectors: [injected()],
  transports: { [creditcoinTestnet.id]: http() },
  ssr: true,
});
