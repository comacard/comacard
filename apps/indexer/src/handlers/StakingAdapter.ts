import { indexer } from "envio";
import { ADAPTER_ID, emptyYieldPosition, minus } from "../shared";

indexer.onEvent(
  { contract: "CtcStakingAdapter", event: "Delegated" },
  async ({ event, context }) => {
    const timestamp = BigInt(event.block.timestamp);
    const position = (await context.YieldPosition.get(ADAPTER_ID)) ?? emptyYieldPosition(timestamp);

    context.YieldPosition.set({
      ...position,
      deployedPrincipal: position.deployedPrincipal + event.params.amount,
      totalDelegated: position.totalDelegated + event.params.amount,
      lastUpdatedAt: timestamp,
    });
  },
);

indexer.onEvent(
  { contract: "CtcStakingAdapter", event: "PrincipalReturned" },
  async ({ event, context }) => {
    const timestamp = BigInt(event.block.timestamp);
    const position = (await context.YieldPosition.get(ADAPTER_ID)) ?? emptyYieldPosition(timestamp);

    context.YieldPosition.set({
      ...position,
      deployedPrincipal: minus(position.deployedPrincipal, event.params.amount),
      totalReturned: position.totalReturned + event.params.amount,
      lastUpdatedAt: timestamp,
    });
  },
);

indexer.onEvent(
  { contract: "CtcStakingAdapter", event: "RewardsReported" },
  async ({ event, context }) => {
    const timestamp = BigInt(event.block.timestamp);
    const position = (await context.YieldPosition.get(ADAPTER_ID)) ?? emptyYieldPosition(timestamp);

    context.YieldPosition.set({
      ...position,
      accruedRewards: position.accruedRewards + event.params.amount,
      lastUpdatedAt: timestamp,
    });
  },
);
