/** The two calls a cardholder signs. Everything else is read through the API. */
export const CREDIT_LINE = (process.env.NEXT_PUBLIC_CREDIT_LINE ??
  "0x18052272cC69113DE2b45d2BDB4E1fB287F4E906") as `0x${string}`;

export const creditLineAbi = [
  {
    type: "function",
    name: "draw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "repay", stateMutability: "payable", inputs: [], outputs: [] },
] as const;
