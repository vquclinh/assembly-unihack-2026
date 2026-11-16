# Coc: the idea and the hard questions

## One sentence

Coc holds rental deposits in a smart contract on Avalanche, so a fake landlord cannot scam a student and a real landlord cannot keep the deposit on a whim.

## Who it is for

- **Tenants:** students and young workers who are new to the city.
- **Landlords:** honest landlords who want to prove they are trustworthy, and who want evidence when a tenant damages the room.
- **Mediators:** a third party both sides pick up front, for example a university's student affairs office.

## Fit with the judging rubric (100 points)

| Criterion | Points | How Coc earns them |
|---|---|---|
| Technical Implementation | 25 | Nine-state escrow machine, automatic deadlines, immediate payout of the undisputed part, ERC-4626 vault, push-with-pull-fallback payments, 29 tests |
| Avalanche Integration | 25 | All money and rules live on Fuji in USDC; gasless for users (ERC-2771 + EIP-3009); verified contracts |
| Creativity & Innovation | 15 | Not one of the 20 suggested topics. It combines the mechanics of #3 (stake and check-in), #8 (escrow with a dispute window) and #9 (yield on idle float) into a new, local problem |
| Impact & Use Case | 15 | Anyone who has rented a room has worried about the deposit |
| Presentation & Pitching | 10 | Opening line: "Who here has lost a deposit?" |
| UI/UX & Demo | 10 | Three-role demo on a phone, one button per step, bilingual |

## Hard questions and our answers

**Is a USDC deposit legal in Vietnam?**
It is a grey area and we say so openly. Since 1 January 2026 digital assets are recognised as property under the Law on Digital Technology Industry. The pilot framework in Resolution 05/2025/NQ-CP requires crypto trading to go through licensed providers. Coc only holds collateral and never processes rent, so it does not use crypto as a means of payment. The contract is token-agnostic: the demo uses testnet USDC like the organisers' own suggested topics, and a production version would use whatever licensed asset the law allows. The platform never holds anyone's money.

**Landlords hold the power today. Why would they use it?**
Three reasons: the contract protects landlords too when a tenant walks away or damages the room; the public record helps good landlords win tenants; and universities can require Coc for their "safe housing" lists.

**Can a fake landlord still scam a tenant?**
No. Only the tenant can confirm move-in. If the landlord claims a no-show, the tenant can object and the mediator decides.

**What if the mediator colludes with one side?**
Both sides pick the mediator up front. The mediator can only split the disputed amount, can never pay themselves, and their record of rulings and timeouts is public.

**Can reputation be faked?**
Only leases that reached move-in count, weighted by deposit size multiplied by time held. Faking it means locking real money for a long time.

**What if the yield vault loses money?**
Yield is opt-in for both sides. If the vault loses value, the contract pays out from what is left and never gets stuck. The demo uses a simulated vault.

**Privacy?**
Photos and lease details stay off-chain; only hashes are on-chain. Reputation only contains objective numbers, no comments.

## Roadmap

- v0.1: contracts and tests.
- v0.2: web app for tenants, landlords and mediators, gasless relayer, evidence store.
- v0.3: English codebase, bilingual UI, live on Fuji.
- Next: AI comparison of move-in and move-out photos (pay-per-report over x402), pitch deck and demo video.
