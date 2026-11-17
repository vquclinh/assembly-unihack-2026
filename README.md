# Coc (Cọc)

**A neutral rental deposit escrow for students, running on Avalanche.**
Team Assembly, Team1 Vietnam UniHack 2026.

Full project proposal (target users, Vietnam context, solution, legal analysis): [docs/PROPOSAL.md](docs/PROPOSAL.md) · [PDF](docs/PROPOSAL.pdf)

*"Cọc" is Vietnamese for "deposit".* The deposit sits in a smart contract instead of in the landlord's pocket. Nobody, not the mediator and not the team that built this, can send it anywhere except to the tenant or the landlord.

## The problem

- Every back-to-school season, students lose holding deposits to fake room listings.
- At move-out, landlords find excuses to keep the deposit, and tenants have nowhere to turn.
- Vietnam has no neutral third party that holds rental deposits, unlike deposit protection schemes in countries such as the UK.

## How it works

| Step | Who | What happens on-chain |
|---|---|---|
| 1. Create a deposit link | Landlord | `createOfferWithWindows`: holding amount, total deposit, move-in deadline, mediator, and this lease's own response and mediation windows |
| 2. Reserve | Tenant | `reserve`: the holding deposit moves into the contract; the landlord cannot touch it |
| 3. Move in | Both | Landlord `proposeCondition` (hash of the photo report), tenant `confirmMoveIn` and tops up to the full deposit |
| 4. Move out | Landlord | `proposeSettlement(0)`: the full deposit goes back in one transaction |
| 4b. Deduction | Both | Landlord proposes a deduction with evidence; tenant `acceptSettlement` or `dispute` |
| 5. Dispute | Mediator | `resolve`: can only split the disputed amount between the two parties |

Every waiting state has a deadline. After it passes, anyone can call `finalize`, so money never gets stuck:

- Landlord disappears after taking a reservation: the tenant is refunded.
- Tenant never shows up: the landlord receives the holding deposit (the same rule as Article 328 of Vietnam's Civil Code).
- Landlord stays silent when the tenant asks for the deposit: full refund to the tenant.
- Tenant stays silent on a proposed deduction: the deduction stands.
- Mediator stays silent: the disputed amount is split 50/50.

### Highlights

- **A fake landlord gets nothing.** Only the tenant can confirm the room was handed over.
- **The mediator cannot take the money.** No code path pays the mediator.
- **Undisputed money is paid at once.** In a dispute, the tenant immediately receives everything the landlord is not claiming.
- **No AVAX needed.** Users sign, a relayer pays gas (ERC-2771), and deposits move with a signed USDC authorization (EIP-3009).
- **On-chain reputation.** Completed leases, amicable settlements, disputes lost, silences. Weighted by value and time, so it is expensive to fake.
- **Optional yield.** Only on when both sides agree, split 50/50. The demo uses a simulated vault.
- **Tamper-evident evidence.** Photos and reports are stored off-chain under their keccak256 hash; only the hash goes on-chain, and the app shows whether a document still matches it.
- **Deadlines per lease.** Each deposit link carries its own response and mediation windows (30 seconds to 60 days), so a real lease uses days while a demo lease settles in minutes on the same contract.
- **Bilingual UI.** English by default, Vietnamese with one tap. Installable as an app on phones (PWA).

### Built for the demo, useful after it

| Feature | Where | What it shows |
|---|---|---|
| **Judge demo** | `/demo` | Pick a story (happy ending, dispute with AI, landlord ghosts) and press **Play**: Coc plays landlord, tenant and mediator with real gasless transactions, step by step, in three live panels, with narration and the time each step took on Avalanche. Or click through every step yourself. |
| **Transparency** | `/transparency` | Every contract with its Sourcify verification status and bytecode size, a live solvency check (USDC held by the escrow and the vault against money owed on open deposits), and how many transactions the gas relayer has paid for. |
| **Full on-chain history** | lease page | Every event of a lease from the offer to the last payment, each linked to its transaction, with the payouts as a receipt. Read through Routescan, or the RPC as a fallback. |
| **Needs your action** | `/me`, red dot in the menu | Every lease waiting on you, with a countdown to the moment the contract decides without you. Also a one-tap withdrawal if a payment was held as credit. |
| **One-tap reserve** | lease page | A newcomer with no wallet presses one button: Coc creates a wallet, adds test USDC and locks the holding deposit. |
| **Wallet backup** | wallet menu | Download a backup file, restore it or a private key, rename and remove wallets, with a warning when a wallet holding money was never backed up. |
| **Before/after photos** | lease page, after a deduction | Drag across one image to compare the move-in photo with the move-out evidence. The mediator can copy the AI's suggested split into the ruling in one tap. |
| **AI damage report, paid over x402** | lease page, after a deduction | A vision model (Qwen VL through OpenRouter) compares the move-in photos with the move-out evidence and suggests a split. The mediator pays 0.10 test USDC per report with the HTTP 402 "exact" scheme: an EIP-3009 authorization that the server verifies, then settles on Avalanche. Advice only: the contract accepts nothing but the mediator's ruling. |
| **Trusted landlord badge** | `/u/[address]`, `/me` | `CocBadge` is a soulbound ERC-5192 token with fully on-chain SVG metadata. A landlord claims it gasless once the escrow has recorded clean leases. Anyone can revoke it the moment the record stops qualifying, and any contract can call `isTrusted(address)`. |
| **Find a room** | `/rooms` | Public listings are open Coc deposit links, so the holding deposit can only go into the contract. Search, "trusted landlords only", sort by record, and the landlord's on-chain verdict on every card. |
| **Scam reports** | room cards, lease page, profile | Community warnings signed with EIP-712 (one per wallet per landlord), shown apart from the on-chain facts. Reports from wallets that really reserved with that landlord are marked "Real tenant" and listed first. |
| **Mediator directory** | `/create` | Mediators who already ruled on Coc leases, with their ruled and timed-out counts from the contract. |
| **Live stats** | `/stats` | Money locked now, total secured, amicable rate, refunds, rulings, read straight from the contract. |
| **Keeper** | automatic | When a deadline passes, the lease page asks the server to call `finalize`; a GitHub Actions workflow sweeps every 5 minutes, a Vercel cron daily, and `npm run keeper` runs a loop. Nobody has to press a button for the promised outcome. |
| **Gasless, with proof** | every action | After each transaction a toast shows how long Avalanche took to confirm it and the gas Coc paid. Relayer transactions are queued so they never clash on a nonce, and the relay, faucet and uploads are rate-limited per IP. |
| **Bilingual agreement and reminders** | `/l/[id]/agreement` | A printable A4 agreement in English and Vietnamese, built only from on-chain data, with the terms fingerprint and a QR code. Deadlines download as a `.ics` file with reminders a day and an hour before. |

## Deployment (Avalanche Fuji)

Contract v2 (per-lease deadlines) is redeployed with `npm run deploy:fuji` then `npm run deploy-badge:fuji`; the scripts write the new addresses to `contracts/deployments/fuji.json` and `web/src/lib/deployment.json`, and the app's **Transparency** page lists them with their verification status.

Every contract is source-verified on [Sourcify](https://sourcify.dev), which also forwards it to Routescan (Snowtrace): `npm run verify:sourcify -- <ContractName> <address>` in `contracts/` verifies any contract from the local build.

## Repository layout

```
contracts/            Hardhat project
  contracts/CocEscrow.sol        Main escrow contract
  contracts/CocForwarder.sol     ERC-2771 forwarder for gasless calls
  contracts/CocBadge.sol         Soulbound "Trusted landlord" badge (ERC-5192)
  contracts/mocks/               Test USDC (with EIP-3009) and a simulated yield vault
  test/                          37 tests (escrow and badge)
  scripts/deploy.js              Deploys and points the web app at the new addresses
  scripts/deploy-badge.js        Adds the badge to an existing deployment
  scripts/verify-sourcify.js     Verifies a contract on Sourcify (API v2) from the local build
web/                  Next.js app (UI + relayer + evidence store)
  src/app/                       Pages: /, /create, /l/[id], /l/[id]/agreement, /me, /u/[address],
                                 /rooms, /stats, /demo, /transparency
  src/app/api/relay              Relayer: the user signs, the server pays gas
  src/app/api/faucet             Hands out test USDC
  src/app/api/files              Content-addressed photo and report store
  src/app/api/ai-report/[id]     AI damage report behind an x402 paywall
  src/app/api/keeper             Calls finalize on leases whose deadline passed
  src/app/api/rooms, stats, reports   Room listings, live numbers, signed scam reports
  src/app/api/history/[id]       Full on-chain event history of a lease
  src/app/api/transparency       Verification status and live solvency check
  src/app/api/rpc                Read-only RPC proxy with retries (the browser reads through it)
  src/lib/x402.ts                x402 "exact" scheme: requirements, verify, settle
  src/lib/store.ts               Vercel Blob in production, a local folder otherwise
  src/lib/server.ts              Relayer wallet with a transaction queue (no nonce clashes)
  src/lib/i18n.tsx               English and Vietnamese UI text
  scripts/keeper-loop.mjs        npm run keeper: settles due leases every 20 seconds
  src/lib/deployment.json        Contract addresses (written by the deploy script)
.github/workflows/    ci.yml (tests, gas report, lint, build), keeper.yml (sweep every 5 minutes)
SECURITY.md           Threat model and known limits
docs/
  PROPOSAL.md         Full project proposal (also as PROPOSAL.pdf)
  IDEA.md             Idea, scoring rubric fit, and answers to hard questions
```

## Run the contract tests

Requires Node.js 20 or newer.

```bash
cd contracts
npm install
npm test
npm run test:gas    # same tests with a gas report per function
```

GitHub Actions (`.github/workflows/ci.yml`) runs the contract tests with a gas report and lints, type-checks and builds the web app on every push. See [SECURITY.md](SECURITY.md) for the threat model.

## Run the web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000. The relayer reuses `PRIVATE_KEY` from `contracts/.env` to pay gas for users, so no extra setup is needed. To use a different wallet, copy `web/.env.example` to `web/.env.local` and set `RELAYER_PRIVATE_KEY`.

Optional settings in `web/.env.local` (all described in `web/.env.example`):

| Variable | Turns on |
|---|---|
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | AI damage reports. The default `qwen/qwen-2.5-vl-7b-instruct` costs a fraction of a cent per report. |
| `AI_REPORT_PRICE_USDC` | Price of one AI report over x402 (default 0.10 test USDC). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage, so photos and records survive redeploys. |
| `CRON_SECRET` | Protects the keeper sweep (`/api/keeper`) called by Vercel cron and GitHub Actions. |
| `RPC_URL` | A private Avalanche RPC instead of the public one (recommended on Vercel). |

### Fastest demo: the judge demo page

Open http://localhost:3000/demo, pick a story and press **Play**. It creates three wallets, funds them, opens a deposit with short deadlines and plays every step with real transactions. "Dispute with AI" takes about a minute; "Landlord ghosts" waits about 70 seconds for the deadline and then the keeper refunds the tenant on its own. Choose **Click through yourself** to press every button in the three panels instead.

### Demo script by hand

1. Press **Create wallet** at the top and create three quick wallets: "Landlord", "Tenant", "Mediator".
2. Pick Landlord, open **Create deposit link**, choose the Mediator wallet as mediator, pick **Quick demo** under "Time to respond", and create the link.
3. Switch to Tenant, press **Get 500 test USDC**, then **Pay holding deposit**.
4. Switch to Landlord, photograph each item and send the condition report.
5. Switch to Tenant, check the photos (marked "Matches on-chain fingerprint") and **Confirm move-in**.
6. Tenant presses **I moved out, return my deposit**. Landlord **Proposes a deduction** with a photo.
7. Tenant presses **I disagree**: the undisputed part arrives at once.
8. Switch to Mediator, press **Buy AI report** (paid over x402), then **Use the AI suggestion** (or drag the slider), and **Finalize ruling**. See the **On-chain history**.
9. Open the landlord's profile and claim the **Trusted landlord** badge (only if the landlord did not lose the dispute: at most one lost dispute in five leases).

### Fully offline (no Fuji)

```bash
cd contracts && npm run node                 # terminal 1: local blockchain
cd contracts && npm run deploy:localhost     # terminal 2
cd web && npm run dev                        # terminal 3
```

For a local chain, `contracts/.env` needs `PRIVATE_KEY` set to the first account printed by `npm run node`. Deploy to Fuji again before committing, because `deployment.json` will point at localhost.

## Deploy to Avalanche Fuji

```bash
cd contracts
cp .env.example .env      # set PRIVATE_KEY to a testnet-only wallet
npm run deploy:fuji
```

No wallet yet? This creates one, saves the key into `.env` and prints the address:

```bash
node -e "const fs=require('fs');const w=require('ethers').Wallet.createRandom();fs.writeFileSync('.env',fs.readFileSync('.env','utf8').replace(/^PRIVATE_KEY=.*$/m,'PRIVATE_KEY='+w.privateKey));console.log(w.address)"
```

Get testnet AVAX from the organisers' faucet (https://team1vn.xyz/faucet.html) or https://core.app/tools/testnet-faucet (coupon `avalanche-academy`). Addresses are written to `contracts/deployments/fuji.json` and `web/src/lib/deployment.json`, and the script prints the Snowtrace verify commands.

Leave `USDC_ADDRESS` empty to deploy a test USDC with a public faucet, or set it to Circle's Fuji test USDC: `0x5425890298aed601595a70AB815c96711a31Bc65`. The AI report payment needs a token with EIP-3009 `receiveWithAuthorization`, which both of these have.

Then add the badge contract to the same deployment:

```bash
npm run deploy-badge:fuji
```

## Host on Vercel

1. Import the repository on Vercel and set the **Root Directory** to `web`.
2. Add the environment variables: `RELAYER_PRIVATE_KEY` (required, a testnet wallet with a little AVAX), and optionally `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `CRON_SECRET`.
3. Under **Storage**, create a **Blob** store and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
4. Deploy. `web/vercel.json` registers the keeper cron (daily on the Hobby plan; the lease page also triggers it as soon as a deadline passes).
5. For a sweep every 5 minutes, add two GitHub repository secrets: `KEEPER_URL` (your Vercel URL) and `CRON_SECRET` (same value as on Vercel). `.github/workflows/keeper.yml` then calls the keeper on schedule.

## Disclaimer

This is a testnet prototype built for a hackathon. It has not been audited and is not legal advice. The contract is token-agnostic. Coc only holds the security deposit and never handles rent.

Privacy notes: photos of a room listed on **Find a room** are public, and AI damage reports send the lease's photos to the configured OpenRouter model. Evidence for unlisted leases is only reachable by its hash.
