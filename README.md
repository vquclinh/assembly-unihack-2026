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
| 1. Create a deposit link | Landlord | `createOffer`: holding amount, total deposit, move-in deadline, mediator |
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
- **Bilingual UI.** English by default, Vietnamese with one tap.

### Built for the demo, useful after it

| Feature | Where | What it shows |
|---|---|---|
| **Judge demo** | `/demo` | One click creates three wallets, funds them and opens a real deposit on-chain. Landlord, tenant and mediator then act side by side in three live panels, with narration and a red frame on whoever moves next. |
| **AI damage report, paid over x402** | lease page, after a deduction | A vision model (Qwen VL through OpenRouter) compares the move-in photos with the move-out evidence and suggests a split. The mediator pays 0.10 test USDC per report with the HTTP 402 "exact" scheme: an EIP-3009 authorization that the server verifies, then settles on Avalanche. Advice only: the contract accepts nothing but the mediator's ruling. |
| **Trusted landlord badge** | `/u/[address]`, `/me` | `CocBadge` is a soulbound ERC-5192 token with fully on-chain SVG metadata. A landlord claims it gasless once the escrow has recorded clean leases. Anyone can revoke it the moment the record stops qualifying, and any contract can call `isTrusted(address)`. |
| **Find a room** | `/rooms` | Public listings are open Coc deposit links, so the holding deposit can only go into the contract. Search, "trusted landlords only", sort by record, and the landlord's on-chain verdict on every card. |
| **Scam reports** | room cards, lease page, profile | Community warnings signed with EIP-712 (one per wallet per landlord), shown apart from the on-chain facts. |
| **Live stats** | `/stats` | Money locked now, total secured, amicable rate, refunds, rulings, read straight from the contract. |
| **Keeper** | automatic | When a deadline passes, the lease page asks the server to call `finalize`; a Vercel cron sweeps daily and `npm run keeper` runs a loop. Nobody has to press a button for the promised outcome. |
| **Bilingual agreement and reminders** | `/l/[id]/agreement` | A printable A4 agreement in English and Vietnamese, built only from on-chain data, with the terms fingerprint and a QR code. Deadlines download as a `.ics` file with reminders a day and an hour before. |

## Deployment (Avalanche Fuji)

| Contract | Address |
|---|---|
| CocEscrow | [`0xE0D792A2f68545599a4502aFAeAf8B0f85881Dc3`](https://testnet.snowtrace.io/address/0xE0D792A2f68545599a4502aFAeAf8B0f85881Dc3) |
| CocForwarder | [`0xa147258E8C60fb29599F088aCCc74B97981865a8`](https://testnet.snowtrace.io/address/0xa147258E8C60fb29599F088aCCc74B97981865a8) |
| MockUSDC (test token) | [`0xd3e4a40Cc1A29DC6908A3f45E35bE0a8904eDE87`](https://testnet.snowtrace.io/address/0xd3e4a40Cc1A29DC6908A3f45E35bE0a8904eDE87) |
| DemoYieldVault | [`0xF2AFcffC92b3DF5cf19f89B3be976CD40b9D55F6`](https://testnet.snowtrace.io/address/0xF2AFcffC92b3DF5cf19f89B3be976CD40b9D55F6) |
| CocBadge | run `npm run deploy-badge:fuji` in `contracts/`; the address is added to `web/src/lib/deployment.json` |

Demo deadlines: 5 minutes to respond, 10 minutes to mediate.

## Repository layout

```
contracts/            Hardhat project
  contracts/CocEscrow.sol        Main escrow contract
  contracts/CocForwarder.sol     ERC-2771 forwarder for gasless calls
  contracts/CocBadge.sol         Soulbound "Trusted landlord" badge (ERC-5192)
  contracts/mocks/               Test USDC (with EIP-3009) and a simulated yield vault
  test/                          34 tests (escrow and badge)
  scripts/deploy.js              Deploys and points the web app at the new addresses
  scripts/deploy-badge.js        Adds the badge to an existing deployment
web/                  Next.js app (UI + relayer + evidence store)
  src/app/                       Pages: /, /create, /l/[id], /l/[id]/agreement, /me, /u/[address],
                                 /rooms, /stats, /demo
  src/app/api/relay              Relayer: the user signs, the server pays gas
  src/app/api/faucet             Hands out test USDC
  src/app/api/files              Content-addressed photo and report store
  src/app/api/ai-report/[id]     AI damage report behind an x402 paywall
  src/app/api/keeper             Calls finalize on leases whose deadline passed
  src/app/api/rooms, stats, reports   Room listings, live numbers, signed scam reports
  src/lib/x402.ts                x402 "exact" scheme: requirements, verify, settle
  src/lib/store.ts               Vercel Blob in production, a local folder otherwise
  src/lib/i18n.tsx               English and Vietnamese UI text
  scripts/keeper-loop.mjs        npm run keeper: settles due leases every 20 seconds
  src/lib/deployment.json        Contract addresses (written by the deploy script)
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
```

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
| `CRON_SECRET` | Protects the daily keeper sweep on Vercel. |

### Fastest demo: the judge demo page

Open http://localhost:3000/demo and press **Start the demo**. It creates the three wallets, funds them and opens a deposit. Then follow the red frame: reserve, report, move in, move out, propose a deduction, dispute, buy the AI report, rule. Deadlines are short on purpose, so a silent party is settled automatically within minutes.

### Demo script by hand

1. Press **Create wallet** at the top and create three quick wallets: "Landlord", "Tenant", "Mediator".
2. Pick Landlord, open **Create deposit link**, choose the Mediator wallet as mediator, and create the link.
3. Switch to Tenant, press **Get 500 test USDC**, then **Pay holding deposit**.
4. Switch to Landlord, photograph each item and send the condition report.
5. Switch to Tenant, check the photos (marked "Matches on-chain fingerprint") and **Confirm move-in**.
6. Tenant presses **I moved out, return my deposit**. Landlord **Proposes a deduction** with a photo.
7. Tenant presses **I disagree**: the undisputed part arrives at once.
8. Switch to Mediator, press **Buy AI report** (paid over x402), then drag the split slider, write a reason and **Finalize ruling**. See the **On-chain receipt**.
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

## Disclaimer

This is a testnet prototype built for a hackathon. It has not been audited and is not legal advice. The contract is token-agnostic. Coc only holds the security deposit and never handles rent.

Privacy notes: photos of a room listed on **Find a room** are public, and AI damage reports send the lease's photos to the configured OpenRouter model. Evidence for unlisted leases is only reachable by its hash.
