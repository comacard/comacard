/** The two calls a cardholder signs. Everything else is read through the API. */
import { required } from "./api";

export const CREDIT_LINE = required(
  "NEXT_PUBLIC_CREDIT_LINE",
  process.env.NEXT_PUBLIC_CREDIT_LINE,
) as `0x${string}`;

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
