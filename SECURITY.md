# Security

Cọc holds other people's money, so this file says plainly what the system trusts, what it does not, and what is still a known limit of this hackathon build.

## Reporting a problem

Open a GitHub issue titled "security" without details, and we will reach out for a private channel. This build runs on the Avalanche Fuji testnet with test USDC only; no real funds are at risk.

## What holds the money

Only `CocEscrow`. It has **no owner, no admin role, no pause switch and no upgrade proxy**. Once deployed, the rules cannot change. Every contract's source is verified on Sourcify and Snowtrace (see the Transparency page in the app).

## Threat model

| Actor | What they could try | Why it fails |
|---|---|---|
| Fake landlord | Take a holding deposit for a room that does not exist | The deposit sits in the contract. If the room is not handed over by the move-in deadline plus the response window, anyone can trigger a full refund, and the keeper does it automatically. A ghosted reservation is recorded on-chain against the landlord. |
| Landlord at move-out | Keep the deposit with no reason | Silence returns the whole deposit to the tenant. A deduction needs photo evidence and can be disputed; only the disputed part waits. |
| Tenant | Never show up, or dispute everything | A no-show claim gives the holding deposit to the landlord unless the tenant disputes in time. A dispute only moves the contested amount to the mediator, and a mediator ruling against the tenant is recorded in the tenant's on-chain record. |
| Mediator | Steal the disputed amount, or stall | `resolve` can only split the disputed amount between tenant and landlord. If the mediator does not rule within the mediation timeout, the amount is split 50/50 and the timeout is recorded against the mediator. |
| Gas relayer (Cọc's server) | Move user funds, or forge actions | The relayer only submits ERC-2771 requests that the user signed (checked by `CocForwarder.verify`), and only to Cọc's own contracts. It cannot sign for anyone. Deposits use EIP-3009 `receiveWithAuthorization`, which only the escrow can redeem, so a signed payment cannot be redirected or front-run. |
| Relayer goes offline | Block users | Every function can also be called directly by the user with their own gas, and every deadline can be triggered by anyone. The relayer is a convenience, not a dependency. |
| Blocked token recipient | Freeze a lease by making a transfer fail | Payouts are pushed with a pull fallback: a failed transfer is credited to the recipient, who withdraws it later with `withdrawCredit`. |
| Off-chain storage | Swap a photo or the terms after the fact | Only keccak256 fingerprints are on-chain. The app re-hashes every file it shows and flags any mismatch. The tenant confirms the exact move-in report hash. |
| AI damage report | Decide the dispute | It is advice for the mediator only, paid per report with x402. The mediator decides and signs the ruling. |
| Spam | Empty the gas wallet or the faucet | Per-IP rate limits on relay, faucet, uploads and reports; the faucet only works with the test token and caps each wallet's balance. |

## Known limits of this build

- Quick wallets keep their private key in the browser's local storage. That suits a testnet demo; users can back the key up from the wallet menu, or connect Core/MetaMask instead.
- Rate limits are per server instance, a speed bump rather than a hard quota.
- `DemoYieldVault` is a test ERC-4626 vault. A production version would use an audited vault and cap exposure.
- Scam reports are signed by wallets but not proven true; reports from wallets that really reserved with that landlord are labelled and ranked first.
- The contracts are tested (`npm test` in `contracts/`, with `REPORT_GAS=1` for a gas report) but not audited.
