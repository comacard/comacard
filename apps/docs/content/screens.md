# What it looks like

Captured from [app.comacard.xyz](https://app.comacard.xyz) rather than drawn. Every figure on these
screens is read from a contract or from the indexer's copy of one, so what is below is what the
product does rather than what it is meant to do.

## Putting collateral down

The asset stays on the chain it is already on. Nothing bridges, nothing wraps, and the row names the
chain rather than a yield, because the chain is the claim.

![The first onboarding screen: three assets, each labelled with the chain it stays on](/screens/onboarding-1.jpg)

## The limit is the thing that grows

Repaying in full is what moves the score, and the score is what decides how much credit the same
collateral buys. The bars are a limit rising, not interest accruing: this product pays no yield.

![The second onboarding screen: a limit of 41.4594 tCTC at score 42](/screens/onboarding-2.jpg)

## Spending it

A limit nobody has spent is a claim rather than a card. Drawing against it is one transaction, and
paying it back in full is what closes the cycle and moves the score.

![The third onboarding screen: 35.0097 tCTC spendable, with a repayment outstanding](/screens/onboarding-3.jpg)

## Connecting

Reown AppKit, so any injected wallet works. Connection happens on Sepolia and moves to Creditcoin
afterwards, because a wallet that has never added Creditcoin refuses a connection that leads with it.

![The wallet connection screen](/screens/connect.jpg)
