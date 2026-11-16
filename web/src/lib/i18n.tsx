"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "en" | "vi";

const en = {
  langToggle: "VI",
  langToggleTitle: "Chuyển sang tiếng Việt",
  locale: "en-US",

  common: {
    loading: "Loading…",
    none: "None yet",
    you: "(you)",
    viewTx: "View transaction on Snowtrace",
    tx: "tx",
  },

  nav: { create: "Create deposit link", mine: "My leases" },

  banner: {
    notDeployed: "No contract addresses yet. Run npm run deploy:fuji in the contracts folder.",
    testnet: (net: string) => `Test version on Avalanche ${net}. Money in this app is test USDC with no real value.`,
    fuji: "Fuji testnet",
  },

  units: {
    duration: (d: number, h: number, m: number, s: number) =>
      d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`,
  },

  wallet: {
    create: "Create wallet",
    active: "Active",
    copy: "copy",
    copied: "Address copied.",
    explorer: "explorer",
    balance: "Balance",
    faucet: "Get 500 test USDC",
    faucetOk: "Received 500 test USDC.",
    faucetFail: (m: string) => `Could not get test USDC: ${m}`,
    switch: "Switch wallet",
    add: "Add wallet",
    namePlaceholder: "Wallet name, e.g. Landlord",
    createButton: "Create",
    created: "Quick wallet created. It only lives in this browser.",
    quickHint: "Quick wallets need no install and no AVAX. Coc pays the gas.",
    connect: "Connect Core or MetaMask",
    defaultName: (n: number) => `Wallet ${n}`,
    browserWallet: "Browser wallet",
  },

  status: {
    0: "Does not exist",
    1: "Waiting for a tenant",
    2: "Reserved, waiting for move-in",
    3: "Renting",
    4: "Tenant asked for the deposit",
    5: "Landlord proposed a deduction",
    6: "Landlord reported a no-show",
    7: "In mediation",
    8: "Settled",
    9: "Cancelled",
  } as Record<number, string>,

  steps: ["Reserve", "Move in", "Renting", "Move out", "Done"],

  home: {
    eyebrow: "Neutral rental deposit escrow",
    title: "The deposit sits in nobody's pocket.",
    lead: "Coc holds rental deposits in a smart contract on Avalanche. A fake landlord cannot scam you. A real landlord cannot keep it on a whim. An honest tenant always gets the money back.",
    ctaCreate: "I'm a landlord: create a deposit link",
    ctaMine: "See my leases",
    problemTitle: "Who here has lost a deposit?",
    problemBody:
      "Every back-to-school season, students send a holding deposit for a room that does not exist. At move-out, landlords find excuses to keep the deposit and tenants have nowhere to turn. Many countries require deposits to be held by a neutral third party. Coc does that with code.",
    howTitle: "How it works",
    step: (n: number) => `Step ${n}`,
    steps: [
      ["The landlord creates a deposit link", "Set the deposit and holding amount, pick a mediator, and send the link over Zalo."],
      ["The tenant reserves the room", "The holding deposit goes into the smart contract. The landlord cannot touch a single dong yet."],
      ["Both sign the move-in report", "Photos of the room are fingerprinted on the blockchain. Nobody can change them later."],
      ["Move out", "If nothing is damaged, one tap sends the money back to the tenant."],
    ],
    guaranteesTitle: "What the contract guarantees",
    guarantees: [
      ["A fake landlord gets nothing", "Only the tenant can confirm the room was handed over. No handover means an automatic refund."],
      ["Nobody sits on the deposit", "If the landlord stays silent after you ask for your deposit, the contract refunds you in full."],
      ["The mediator cannot touch the money", "They only split the disputed amount between the two sides. No line of code pays them."],
      ["Undisputed money is paid at once", "Landlord wants to keep 400k of a 3 million deposit? You get 2.6 million right away. Only 400k waits for mediation."],
      ["Public landlord record", "How many leases, how many deposits returned on time, how many disputes lost. Facts, not reviews."],
      ["No AVAX, no wallet install", "Open the link and use it. Coc pays the gas."],
    ],
    notTitle: "What Coc does not do",
    notBody:
      "Coc only holds the security deposit. It does not collect rent. Photos and lease details stay off-chain; only their fingerprints (hashes) are on-chain. This is a test build for Team1 UniHack 2026, running on testnet with test USDC that has no value.",
  },

  create: {
    title: "Create a deposit link",
    lead: "Send this link to the tenant over Zalo or Messenger. The deposit goes into the contract, not into your wallet.",
    room: "Room",
    roomName: "Room name",
    roomNamePlaceholder: "Room 302, loft, near the University of Technology",
    address: "Address",
    addressHint: "Optional. Stored off-chain; only its hash is on-chain.",
    addressPlaceholder: "12 Ly Thuong Kiet, District 10, HCMC",
    rent: "Monthly rent (VND)",
    rentHint: "Only recorded in the agreement. Rent is paid as usual; Coc does not collect it.",
    notes: "Notes",
    notesHint: "e.g. electricity 3,500 VND/kWh, no pets.",
    deposit: "Deposit",
    hold: "Holding deposit (VND)",
    holdHint: (usdc: string) => `≈ ${usdc} locked as soon as the tenant reserves`,
    total: "Total deposit (VND)",
    totalHint: (usdc: string) => `≈ ${usdc}, holding deposit included`,
    moveIn: "Move-in deadline",
    length: "Lease length",
    moveInPresets: ["10 minutes (demo)", "1 day", "3 days", "7 days"],
    lengthPresets: ["30 minutes (demo)", "6 months", "12 months"],
    yieldTitle: "Let the deposit earn yield while renting.",
    yieldBody: "Only switched on if the tenant agrees too. Yield is split 50/50 and the principal is always paid first. The demo uses a simulated vault.",
    mediator: "Mediator",
    mediatorBody:
      "Only needed if you and the tenant cannot agree. They can only split the disputed amount between you and the tenant, never pay themselves. For example: the university's student affairs office, or someone you both trust.",
    yourWallet: "(your wallet)",
    mediatorAddress: "Mediator wallet address",
    lockSummary: "Only allow one specific tenant (optional)",
    lockAddress: "Tenant wallet address",
    lockHint: "Leave empty to let anyone with the link reserve.",
    problems: {
      title: "Enter a room name.",
      hold: "The holding deposit must be above 0.",
      total: "The total deposit must be at least the holding deposit.",
      mediator: "Enter the mediator's wallet address.",
      mediatorSelf: "The mediator cannot be you.",
      tenant: "The tenant address is not valid.",
      length: "The lease must last longer than the move-in deadline.",
    },
    submit: "Create deposit link",
    needWallet: "Create a wallet at the top first",
    created: "Deposit link created.",
  },

  lease: {
    number: (id: string) => `Deposit #${id}`,
    roomFallback: "Rental room",
    notFound: (id: string) => `There is no deposit #${id}.`,
    invalidId: "Invalid lease number.",
    notConfigured: "The app has no contract configured.",
    readFail: (m: string) => `Could not read from the blockchain: ${m}`,
    landlordEvidence: "Landlord's move-out evidence",
    tenantResponse: "Tenant's response",
    agreement: "Agreement",
  },

  money: {
    title: "Deposit",
    hold: "Holding deposit",
    total: "Total deposit",
    locked: "Locked in the contract",
    yield: "Accrued yield (split 50/50)",
    proposed: "Landlord proposes to deduct",
    disputed: "Amount in dispute",
    note: (state: string) => `VND amounts are for reference only. Yield: ${state}.`,
    yieldOn: "on",
    yieldOffered: "allowed by the landlord, the tenant chooses at move-in",
    yieldOff: "off",
  },

  parties: { title: "Parties", landlord: "Landlord", tenant: "Tenant", mediator: "Mediator" },

  share: { title: "Send this link to the tenant", copy: "Copy link", copied: "Link copied." },

  receipt: {
    title: "On-chain receipt",
    paidTo: "Paid to",
    note: (net: string) => `Read straight from the contract's events on ${net}.`,
  },

  terms: {
    rent: (vnd: string) => `Rent: ${vnd}/month`,
    rentNote: "(paid directly, Coc does not collect rent)",
  },

  roles: {
    landlord: "You are the landlord",
    tenant: "You are the tenant",
    mediator: "You are the mediator",
    candidate: "You are viewing a deposit link",
    viewer: "You are viewing as an outsider",
  },

  act: {
    todo: "What to do",
    needWallet: "Create or pick a wallet at the top first.",
    needFunds: (have: string, need: string) => `Your wallet has ${have}, it needs ${need}.`,

    offerWaiting: "The link is waiting for a tenant. Send the link or the QR code over Zalo.",
    linkExpiresIn: "Link expires in",
    linkExpired: "The link has expired.",
    cancelLink: "Cancel link",
    linkCancelled: "Deposit link cancelled.",
    reserveBody: (amount: ReactNode, date: string) => (
      <>
        Pay <b>{amount}</b> to hold the room. The money sits in the contract and the landlord cannot touch it yet. If the landlord does not hand over the room by {date}, it is refunded to you automatically.
      </>
    ),
    reserve: "Pay holding deposit",
    reserved: "Room held. The money is in the contract.",
    mediatorOffer: "You were chosen as mediator. You only need to act if there is a dispute.",
    lockedOther: "This link is locked to another tenant.",
    noWalletReserve: "Create a wallet at the top to reserve.",

    reportSent: "Condition report sent. Waiting for the tenant to confirm move-in and top up the deposit.",
    redoReport: "Redo the report",
    reportIntro: "Walk through the room with the tenant and photograph each item. The tenant confirms exactly these photos, and they become the evidence at move-out.",
    reportSentToast: "Report sent to the tenant.",
    moveInIn: "Move-in deadline in",
    moveInPassed: "The move-in deadline has passed.",
    claimNoShow: "Report the tenant as a no-show",
    noShowToast: "No-show reported.",
    refundHold: "Cancel and refund the holding deposit to the tenant",
    holdRefunded: "Holding deposit refunded.",
    finalizeRefundHold: "Refund the holding deposit to the tenant",

    waitReport: "Waiting for the landlord's condition report. You should be there when the photos are taken.",
    checkReport: (topUp: ReactNode) => (
      <>
        Check the report below. By confirming, you agree the room matches the photos and top up <b>{topUp}</b> to the full deposit.
      </>
    ),
    acceptYield: "Let the deposit earn yield, split 50/50 with the landlord. The principal is always paid first.",
    confirmMoveIn: "Confirm move-in",
    movedIn: "Moved in. Your deposit is held safely.",
    handOverIn: "The landlord must hand over the room within",
    handOverLate: "The landlord missed the handover deadline.",
    reclaimHold: "Get my holding deposit back (no handover)",
    reclaimed: "Holding deposit refunded to you.",
    backOutConfirm: "If you cancel, the holding deposit goes to the landlord. Are you sure?",
    backOut: "I no longer want the room (lose the holding deposit)",
    backedOut: "Reservation cancelled.",
    waitingMoveIn: "Waiting for both sides to complete move-in.",

    noShowBody: "The landlord says the tenant never showed up. Unless the tenant objects, the holding deposit goes to the landlord.",
    tenantHas: "Tenant has",
    objectionClosed: "The objection window has closed.",
    noShowPlaceholder: "e.g. I came on time but the room did not exist. Here are screenshots of our chat.",
    object: "Object and send to the mediator",
    disputeSent: "Dispute sent to the mediator.",
    withdrawNoShow: "Withdraw and refund the tenant",
    finalizeToLandlord: "Release the holding deposit to the landlord",
    settled: "Settled.",

    activeTenant: (minutes: number) =>
      `You are renting. When you move out, press the button below. The landlord has ${minutes} minutes (demo) to return the deposit or propose a deduction. If they stay silent, the deposit comes back to you automatically.`,
    requestRelease: "I moved out, return my deposit",
    releaseRequested: "Deposit return requested.",
    activeOther: "The lease is running. The deposit is held in the contract.",

    releaseBody: "The tenant moved out and asked for the deposit back. If the landlord stays silent past the deadline, the full deposit goes back to the tenant.",
    landlordHas: "Landlord has",
    landlordLate: "The landlord missed the deadline.",
    finalizeFullRefund: "Return the full deposit to the tenant",
    fullRefunded: "Full deposit returned to the tenant.",

    proposedBody: (amount: ReactNode) => (
      <>
        The landlord proposes to deduct <b>{amount}</b>. The tenant receives the rest. If the tenant stays silent past the deadline, the proposal takes effect.
      </>
    ),
    replyClosed: "The reply window has closed.",
    accept: (amount: string) => `Agree, receive ${amount}`,
    accepted: "Settled as agreed.",
    reject: "I disagree",
    rejectPlaceholder: "e.g. this stain was already there at move-in, see the wall photo in the report.",
    rejectSubmit: "Send to the mediator (undisputed part is paid now)",
    rejected: "Undisputed part received. The rest waits for mediation.",
    finalizeAsProposed: "Settle as the landlord proposed",

    disputedBody: (amount: ReactNode) => (
      <>
        Amount in dispute: <b>{amount}</b>. The mediator reviews both sides&apos; evidence and splits it. If the mediator stays silent past the deadline, it is split 50/50.
      </>
    ),
    mediatorHas: "Mediator has",
    mediatorLate: "The mediator missed the deadline.",
    ruling: "Ruling",
    toTenant: "Tenant",
    toLandlord: "Landlord",
    rulingPlaceholder: "Reason, e.g. the move-in photos show the stain was already there.",
    rule: "Finalize ruling",
    ruled: "Ruling recorded and funds sent.",
    mediatorNote: "You can only split between the two parties. The contract has no way to pay the mediator.",
    finalizeSplit: "Split the disputed amount 50/50",
    split: "Disputed amount split 50/50.",

    closedBody: "This lease is settled. See the on-chain receipt.",
    cancelledBody: "This deposit link was cancelled.",
    unknown: "Lease not found.",

    settleIntro: "If nothing is damaged, return the full deposit in one step.",
    returnFull: "Return the full deposit to the tenant",
    proposeDeduction: "Propose a deduction",
    deductAmount: "Amount to deduct (USDC)",
    deductPlaceholder: "e.g. 15",
    deductEvidencePlaceholder: "Reason and move-out photos, e.g. the walls are dirty and need repainting.",
    sendProposal: "Send the proposal to the tenant",
    deductInvalid: "The deduction must be above 0 and cannot exceed the deposit.",
    proposalSent: "Deduction proposal sent.",
  },

  docs: {
    verified: "✓ Matches on-chain fingerprint",
    mismatch: "Does not match on-chain",
    missing: "Original not found",
    loadingTerms: "Loading agreement…",
    reportTitle: "Move-in condition report",
    rulingTitle: "Mediator's ruling",
    noDescription: "(no description)",
    removePhoto: "Remove this photo",
    addPhoto: "+ Photo",
    itemPlaceholder: "Condition, e.g. small stain in the left corner",
    addItem: "+ Add item",
    otherItem: "Other item",
    needOne: "Add at least one photo or note.",
    uploading: "Uploading photos…",
    sendReport: (n: number) => `Send the report (${n} photos) to the tenant`,
    writeSomething: "Write a few lines of explanation.",
    defaultItems: ["Walls and ceiling", "Floor and doors", "Bathroom", "AC, fan, lights", "Bed, wardrobe, desk"],
  },

  rep: {
    noHistory: "No history yet",
    goodLandlord: "Returns deposits on time",
    goodTenant: "Reliable tenant",
    flagged: (n: number) => (n === 1 ? "1 thing to note" : `${n} things to note`),
    bad: "Many red flags",
    leases: (n: number) => `${n} leases`,
    completed: "Completed leases",
    amicable: "Settled amicably",
    disputes: "Disputes",
    lost: "Lost in mediation",
    timeoutsLandlord: "Silent when the tenant asked for the deposit",
    timeoutsTenant: "Silent on a proposed deduction",
    ghostLandlord: "Took a reservation, never handed over",
    ghostTenant: "Reserved, never showed up",
    volume: "Collateral volume",
    usdcDays: "USDC·days",
  },

  me: {
    noWalletTitle: "No wallet yet",
    noWalletBody: "Press “Create wallet” at the top. Quick wallets need no install and no AVAX.",
    title: "My leases",
    deposits: "Deposits",
    empty: "No leases yet. Landlords create a deposit link; tenants open it to reserve.",
    asLandlord: "You are the landlord",
    asTenant: "You are the tenant",
    asMediator: "You mediate",
    deposit: "deposit",
    landlordProfile: "Record as a landlord",
    tenantProfile: "Record as a tenant",
  },

  profile: {
    title: "Reputation",
    explorer: "View on explorer",
    body: "Every number below is recorded by the smart contract itself. Nobody can edit it and there are no subjective reviews. Only leases that actually reached move-in count, weighted by amount and time held, so faking them is expensive.",
    asLandlord: "As a landlord",
    asTenant: "As a tenant",
    asMediator: "As a mediator",
    mediatorLine: (resolved: number, timedOut: number) => `Resolved ${resolved} cases, let ${timedOut} time out.`,
    invalid: "Invalid wallet address.",
  },

  errors: {
    WrongStatus: "The lease has moved to another step. Reload the page to see its new state.",
    NotAllowed: "The active wallet is not allowed to do this.",
    TooEarly: "It is too early for this action.",
    TooLate: "The deadline for this action has passed.",
    BadParams: "Some of the input is not valid.",
    ConditionMismatch: "The condition report does not match the one the landlord sent.",
    ERC20InsufficientBalance: "Not enough USDC in the wallet. Press “Get 500 test USDC” in the wallet menu.",
    BadSignature: "Invalid signature. Please try again.",
    ERC2771ForwarderExpiredRequest: "The request expired. Please try again.",
    ERC2771ForwarderInvalidSigner: "The signature does not match the active wallet.",
    NotDeployed: "The app has no contract address configured.",
    NoRelayer: "The server has no gas wallet configured (RELAYER_PRIVATE_KEY).",
    RelayerEmpty: "Coc's gas wallet is out of testnet AVAX. Top it up at a faucet and try again.",
    FaucetMockOnly: "The faucet only works with the test token.",
    FaucetEnough: "This wallet already has enough test USDC.",
    UnsupportedType: "This file type is not supported.",
    FileTooLarge: "The file is empty or too large.",
    BadJson: "Invalid JSON.",
    UploadFailed: "Upload failed.",
    HashMismatch: "The uploaded file's hash does not match.",
    ImageFailed: "Could not process the photo.",
    NoInjected: "No browser wallet found (Core or MetaMask).",
    NoAddress: "The wallet returned no address.",
    NoWallet: "No wallet selected.",
    UserRejected: "You declined to sign in your wallet.",
    Unknown: "Something went wrong. Please try again.",
  } as Record<string, string>,
};

export type Dict = typeof en;

const vi: Dict = {
  langToggle: "EN",
  langToggleTitle: "Switch to English",
  locale: "vi-VN",

  common: {
    loading: "Đang tải…",
    none: "Chưa có",
    you: "(bạn)",
    viewTx: "Xem giao dịch trên Snowtrace",
    tx: "tx",
  },

  nav: { create: "Tạo link cọc", mine: "Của tôi" },

  banner: {
    notDeployed: "Chưa có địa chỉ contract. Chạy npm run deploy:fuji trong thư mục contracts.",
    testnet: (net: string) => `Bản thử nghiệm trên Avalanche ${net}. Tiền trong app là USDC thử, không có giá trị thật.`,
    fuji: "Fuji testnet",
  },

  units: {
    duration: (d: number, h: number, m: number, s: number) =>
      d > 0 ? `${d} ngày ${h} giờ` : h > 0 ? `${h} giờ ${m} phút` : m > 0 ? `${m} phút ${s} giây` : `${s} giây`,
  },

  wallet: {
    create: "Tạo ví",
    active: "Đang dùng",
    copy: "chép",
    copied: "Đã chép địa chỉ ví.",
    explorer: "explorer",
    balance: "Số dư",
    faucet: "Nhận 500 USDC thử",
    faucetOk: "Đã nhận 500 USDC thử nghiệm.",
    faucetFail: (m: string) => `Không nhận được USDC thử: ${m}`,
    switch: "Đổi ví",
    add: "Thêm ví",
    namePlaceholder: "Tên ví, ví dụ: Chủ trọ",
    createButton: "Tạo",
    created: "Đã tạo ví nhanh. Ví chỉ lưu trong trình duyệt này.",
    quickHint: "Ví nhanh không cần cài gì và không cần AVAX. Phí gas do Cọc trả.",
    connect: "Kết nối Core hoặc MetaMask",
    defaultName: (n: number) => `Ví ${n}`,
    browserWallet: "Ví trình duyệt",
  },

  status: {
    0: "Không tồn tại",
    1: "Chờ người thuê giữ chỗ",
    2: "Đã giữ chỗ, chờ nhận phòng",
    3: "Đang thuê",
    4: "Người thuê xin nhận lại cọc",
    5: "Chủ trọ đề nghị khấu trừ",
    6: "Chủ trọ báo người thuê không đến",
    7: "Đang hòa giải",
    8: "Đã tất toán",
    9: "Đã hủy",
  },

  steps: ["Giữ chỗ", "Nhận phòng", "Đang thuê", "Trả phòng", "Hoàn tất"],

  home: {
    eyebrow: "Giữ tiền cọc phòng trọ trung lập",
    title: "Tiền cọc không nằm trong túi ai cả.",
    lead: "Cọc giữ tiền đặt cọc trong một smart contract trên Avalanche. Chủ trọ ảo không lừa được. Chủ trọ thật không tự ý giữ được. Người thuê đàng hoàng luôn nhận lại tiền.",
    ctaCreate: "Tôi là chủ trọ: tạo link cọc",
    ctaMine: "Xem hợp đồng của tôi",
    problemTitle: "Ai ở đây từng mất cọc?",
    problemBody:
      "Mùa nhập học nào cũng có sinh viên chuyển tiền giữ chỗ cho một phòng trọ không có thật. Hết hợp đồng, chủ trọ tìm cớ giữ cọc và người thuê không biết đòi ở đâu. Ở nhiều nước, luật bắt tiền cọc phải gửi bên thứ ba trung lập. Cọc làm việc đó bằng code.",
    howTitle: "Dùng thế nào",
    step: (n: number) => `Bước ${n}`,
    steps: [
      ["Chủ trọ tạo link cọc", "Nhập tiền cọc và tiền giữ chỗ, chọn người hòa giải, rồi gửi link qua Zalo."],
      ["Người thuê giữ chỗ", "Tiền giữ chỗ vào smart contract. Chủ trọ chưa lấy được đồng nào."],
      ["Cùng ký biên bản nhận phòng", "Ảnh hiện trạng được ghi dấu vân tay lên blockchain. Không ai sửa được về sau."],
      ["Trả phòng", "Không có gì hư hỏng thì một nút bấm là tiền về ví người thuê."],
    ],
    guaranteesTitle: "Contract đảm bảo những gì",
    guarantees: [
      ["Chủ trọ ảo không lấy được tiền", "Chỉ người thuê mới xác nhận được việc đã nhận phòng. Không giao phòng thì tiền tự hoàn lại."],
      ["Không ai ôm cọc", "Chủ trọ im lặng khi bạn xin lại cọc quá hạn thì contract tự hoàn đủ cho bạn."],
      ["Hòa giải viên không chạm được vào tiền", "Họ chỉ chia phần đang tranh chấp cho hai bên. Không có dòng code nào gửi tiền cho họ."],
      ["Phần không tranh chấp trả ngay", "Chủ trọ đòi trừ 400k trên 3 triệu? Bạn nhận ngay 2,6 triệu, chỉ 400k chờ hòa giải."],
      ["Hồ sơ chủ trọ công khai", "Bao nhiêu hợp đồng, trả cọc đúng hẹn bao nhiêu lần, thua tranh chấp bao nhiêu lần. Số liệu thật, không phải lời khen chê."],
      ["Không cần AVAX, không cần cài ví", "Mở link là dùng được. Phí gas do Cọc trả."],
    ],
    notTitle: "Cọc không làm gì",
    notBody:
      "Cọc chỉ giữ tài sản bảo đảm, không thu hộ tiền thuê nhà. Ảnh và nội dung hợp đồng nằm ngoài blockchain, trên chuỗi chỉ lưu dấu vân tay (hash). Đây là bản thử nghiệm cho Team1 UniHack 2026, chạy trên testnet với USDC thử không có giá trị.",
  },

  create: {
    title: "Tạo link cọc",
    lead: "Gửi link này cho người thuê qua Zalo hay Messenger. Tiền cọc sẽ nằm trong contract, không vào ví bạn.",
    room: "Phòng",
    roomName: "Tên phòng",
    roomNamePlaceholder: "Phòng 302, có gác, gần ĐH Bách khoa",
    address: "Địa chỉ",
    addressHint: "Không bắt buộc. Lưu ngoài blockchain, trên chuỗi chỉ có hash.",
    addressPlaceholder: "12 Lý Thường Kiệt, Q.10, TP.HCM",
    rent: "Giá thuê mỗi tháng (VND)",
    rentHint: "Chỉ để ghi vào thỏa thuận. Tiền thuê vẫn trả như bình thường, Cọc không thu hộ.",
    notes: "Ghi chú",
    notesHint: "Ví dụ: điện 3.500đ/số, không nuôi thú cưng.",
    deposit: "Tiền cọc",
    hold: "Tiền giữ chỗ (VND)",
    holdHint: (usdc: string) => `≈ ${usdc} được khóa ngay khi người thuê giữ chỗ`,
    total: "Tổng tiền cọc (VND)",
    totalHint: (usdc: string) => `≈ ${usdc}, đã gồm tiền giữ chỗ`,
    moveIn: "Hạn nhận phòng",
    length: "Thời hạn thuê",
    moveInPresets: ["10 phút (demo)", "1 ngày", "3 ngày", "7 ngày"],
    lengthPresets: ["30 phút (demo)", "6 tháng", "12 tháng"],
    yieldTitle: "Cho tiền cọc sinh lời trong lúc thuê.",
    yieldBody: "Chỉ bật khi người thuê cũng đồng ý. Lãi chia đôi, gốc luôn được trả đủ trước. Bản demo dùng vault mô phỏng.",
    mediator: "Người hòa giải",
    mediatorBody:
      "Chỉ cần đến khi hai bên không thống nhất được. Họ chỉ có quyền chia phần tiền đang tranh chấp cho bạn hoặc người thuê, không bao giờ rút được về ví mình. Ví dụ: phòng công tác sinh viên của trường, hoặc một người cả hai cùng tin.",
    yourWallet: "(ví của bạn)",
    mediatorAddress: "Địa chỉ ví người hòa giải",
    lockSummary: "Chỉ cho một người thuê cụ thể (không bắt buộc)",
    lockAddress: "Địa chỉ ví người thuê",
    lockHint: "Để trống thì ai mở link cũng giữ chỗ được.",
    problems: {
      title: "Nhập tên phòng.",
      hold: "Tiền giữ chỗ phải lớn hơn 0.",
      total: "Tổng tiền cọc phải lớn hơn hoặc bằng tiền giữ chỗ.",
      mediator: "Nhập địa chỉ ví người hòa giải.",
      mediatorSelf: "Người hòa giải không thể là chính bạn.",
      tenant: "Địa chỉ người thuê không hợp lệ.",
      length: "Thời hạn thuê phải dài hơn hạn nhận phòng.",
    },
    submit: "Tạo link cọc",
    needWallet: "Tạo ví ở góc trên trước",
    created: "Đã tạo link cọc.",
  },

  lease: {
    number: (id: string) => `Hợp đồng cọc #${id}`,
    roomFallback: "Phòng trọ",
    notFound: (id: string) => `Không có hợp đồng cọc số ${id}.`,
    invalidId: "Mã hợp đồng không hợp lệ.",
    notConfigured: "Ứng dụng chưa được cấu hình contract.",
    readFail: (m: string) => `Không đọc được dữ liệu từ blockchain: ${m}`,
    landlordEvidence: "Bằng chứng của chủ trọ khi trả phòng",
    tenantResponse: "Phản hồi của người thuê",
    agreement: "Thỏa thuận",
  },

  money: {
    title: "Tiền cọc",
    hold: "Tiền giữ chỗ",
    total: "Tổng tiền cọc",
    locked: "Đang khóa trong contract",
    yield: "Lãi tạm tính (chia đôi)",
    proposed: "Chủ trọ đề nghị trừ",
    disputed: "Phần đang tranh chấp",
    note: (state: string) => `Quy đổi VND chỉ để tham khảo. Sinh lời: ${state}.`,
    yieldOn: "đang bật",
    yieldOffered: "chủ trọ cho phép, người thuê chọn khi nhận phòng",
    yieldOff: "tắt",
  },

  parties: { title: "Các bên", landlord: "Chủ trọ", tenant: "Người thuê", mediator: "Người hòa giải" },

  share: { title: "Gửi link này cho người thuê", copy: "Chép link", copied: "Đã chép link." },

  receipt: {
    title: "Hóa đơn on-chain",
    paidTo: "Chuyển cho",
    note: (net: string) => `Đọc trực tiếp từ sự kiện của contract trên ${net}.`,
  },

  terms: {
    rent: (vnd: string) => `Giá thuê: ${vnd}/tháng`,
    rentNote: "(trả trực tiếp, Cọc không thu hộ)",
  },

  roles: {
    landlord: "Bạn là chủ trọ",
    tenant: "Bạn là người thuê",
    mediator: "Bạn là người hòa giải",
    candidate: "Bạn đang xem link cọc",
    viewer: "Bạn đang xem với tư cách người ngoài",
  },

  act: {
    todo: "Việc cần làm",
    needWallet: "Tạo hoặc chọn ví ở góc trên trước nhé.",
    needFunds: (have: string, need: string) => `Ví của bạn có ${have}, cần ${need}.`,

    offerWaiting: "Link đang chờ người thuê giữ chỗ. Gửi link hoặc mã QR bên cạnh qua Zalo.",
    linkExpiresIn: "Link hết hạn sau",
    linkExpired: "Link đã hết hạn.",
    cancelLink: "Hủy link",
    linkCancelled: "Đã hủy link cọc.",
    reserveBody: (amount: ReactNode, date: string) => (
      <>
        Đặt <b>{amount}</b> để giữ chỗ. Tiền nằm trong contract, chủ trọ chưa lấy được. Nếu chủ trọ không giao phòng trước {date}, tiền tự hoàn lại cho bạn.
      </>
    ),
    reserve: "Đặt cọc giữ chỗ",
    reserved: "Đã giữ chỗ. Tiền đang nằm trong contract.",
    mediatorOffer: "Bạn được chọn làm người hòa giải. Chỉ cần làm gì khi có tranh chấp.",
    lockedOther: "Link này đã khóa cho một người thuê khác.",
    noWalletReserve: "Tạo ví ở góc trên để giữ chỗ.",

    reportSent: "Đã gửi biên bản hiện trạng. Đang chờ người thuê xác nhận nhận phòng và nạp đủ cọc.",
    redoReport: "Làm lại biên bản",
    reportIntro: "Cùng người thuê đi một vòng phòng, chụp ảnh từng hạng mục. Người thuê sẽ xác nhận đúng bộ ảnh này, và nó là bằng chứng khi trả phòng.",
    reportSentToast: "Đã gửi biên bản cho người thuê.",
    moveInIn: "Hạn nhận phòng còn",
    moveInPassed: "Đã quá hạn nhận phòng.",
    claimNoShow: "Báo người thuê không đến",
    noShowToast: "Đã báo người thuê không đến.",
    refundHold: "Hủy và hoàn tiền giữ chỗ cho người thuê",
    holdRefunded: "Đã hoàn tiền giữ chỗ.",
    finalizeRefundHold: "Hoàn tiền giữ chỗ cho người thuê",

    waitReport: "Chờ chủ trọ gửi biên bản hiện trạng phòng. Bạn nên có mặt khi chủ trọ chụp ảnh.",
    checkReport: (topUp: ReactNode) => (
      <>
        Kiểm tra biên bản bên dưới. Khi xác nhận, bạn đồng ý phòng đúng như ảnh và nạp thêm <b>{topUp}</b> cho đủ cọc.
      </>
    ),
    acceptYield: "Đồng ý cho tiền cọc sinh lời, lãi chia đôi với chủ trọ. Gốc luôn được trả trước.",
    confirmMoveIn: "Xác nhận nhận phòng",
    movedIn: "Đã nhận phòng. Tiền cọc đang được giữ an toàn.",
    handOverIn: "Chủ trọ phải giao phòng trong",
    handOverLate: "Chủ trọ đã quá hạn giao phòng.",
    reclaimHold: "Lấy lại tiền giữ chỗ (chủ trọ không giao phòng)",
    reclaimed: "Đã hoàn tiền giữ chỗ cho bạn.",
    backOutConfirm: "Hủy giữ chỗ thì tiền giữ chỗ sẽ thuộc về chủ trọ. Bạn chắc chứ?",
    backOut: "Tôi không thuê nữa (mất tiền giữ chỗ)",
    backedOut: "Đã hủy giữ chỗ.",
    waitingMoveIn: "Đang chờ hai bên làm thủ tục nhận phòng.",

    noShowBody: "Chủ trọ báo người thuê không đến nhận phòng. Nếu người thuê không phản đối, tiền giữ chỗ sẽ thuộc về chủ trọ.",
    tenantHas: "Người thuê còn",
    objectionClosed: "Đã hết thời gian phản đối.",
    noShowPlaceholder: "Ví dụ: tôi đã đến đúng hẹn nhưng phòng không có thật, đây là ảnh chụp tin nhắn.",
    object: "Phản đối, gửi người hòa giải",
    disputeSent: "Đã gửi tranh chấp cho người hòa giải.",
    withdrawNoShow: "Rút lại, hoàn tiền cho người thuê",
    finalizeToLandlord: "Chuyển tiền giữ chỗ cho chủ trọ",
    settled: "Đã tất toán.",

    activeTenant: (minutes: number) =>
      `Bạn đang thuê. Khi trả phòng, bấm nút dưới. Chủ trọ có ${minutes} phút (bản demo) để trả cọc hoặc đề nghị khấu trừ. Im lặng thì cọc tự về bạn.`,
    requestRelease: "Tôi đã trả phòng, xin nhận lại cọc",
    releaseRequested: "Đã gửi yêu cầu nhận lại cọc.",
    activeOther: "Hợp đồng đang chạy. Tiền cọc được giữ trong contract.",

    releaseBody: "Người thuê đã trả phòng và xin nhận lại cọc. Nếu chủ trọ im lặng quá hạn, toàn bộ cọc tự về người thuê.",
    landlordHas: "Chủ trọ còn",
    landlordLate: "Chủ trọ đã quá hạn trả lời.",
    finalizeFullRefund: "Hoàn đủ cọc cho người thuê",
    fullRefunded: "Đã hoàn đủ cọc cho người thuê.",

    proposedBody: (amount: ReactNode) => (
      <>
        Chủ trọ đề nghị trừ <b>{amount}</b>. Người thuê nhận phần còn lại. Nếu người thuê im lặng quá hạn, đề nghị này có hiệu lực.
      </>
    ),
    replyClosed: "Đã hết thời gian trả lời.",
    accept: (amount: string) => `Đồng ý, nhận ${amount}`,
    accepted: "Đã tất toán theo thỏa thuận.",
    reject: "Không đồng ý",
    rejectPlaceholder: "Ví dụ: vết ố này đã có từ lúc nhận phòng, xem ảnh tường trong biên bản.",
    rejectSubmit: "Gửi người hòa giải (phần không tranh chấp về ví ngay)",
    rejected: "Đã nhận phần không tranh chấp. Phần còn lại chờ hòa giải.",
    finalizeAsProposed: "Tất toán theo đề nghị của chủ trọ",

    disputedBody: (amount: ReactNode) => (
      <>
        Phần đang tranh chấp: <b>{amount}</b>. Người hòa giải xem bằng chứng hai bên và chia phần này. Nếu người hòa giải im lặng quá hạn, phần này chia đôi.
      </>
    ),
    mediatorHas: "Người hòa giải còn",
    mediatorLate: "Người hòa giải đã quá hạn.",
    ruling: "Phán quyết",
    toTenant: "Người thuê",
    toLandlord: "Chủ trọ",
    rulingPlaceholder: "Lý do, ví dụ: ảnh nhận phòng cho thấy vết ố đã có sẵn.",
    rule: "Chốt phán quyết",
    ruled: "Đã phân xử và chuyển tiền.",
    mediatorNote: "Bạn chỉ chia được giữa hai bên. Contract không có cách nào chuyển tiền cho người hòa giải.",
    finalizeSplit: "Chia đôi phần tranh chấp",
    split: "Đã chia đôi phần tranh chấp.",

    closedBody: "Hợp đồng đã tất toán. Xem hóa đơn on-chain bên cạnh.",
    cancelledBody: "Link cọc này đã hủy.",
    unknown: "Không tìm thấy hợp đồng.",

    settleIntro: "Phòng không có gì hư hỏng thì trả đủ cọc trong một bước.",
    returnFull: "Trả đủ cọc cho người thuê",
    proposeDeduction: "Đề nghị khấu trừ",
    deductAmount: "Số tiền muốn trừ (USDC)",
    deductPlaceholder: "Ví dụ: 15",
    deductEvidencePlaceholder: "Lý do và ảnh hiện trạng lúc trả phòng, ví dụ: tường bị bẩn, cần sơn lại.",
    sendProposal: "Gửi đề nghị cho người thuê",
    deductInvalid: "Số tiền trừ phải lớn hơn 0 và không vượt tiền cọc.",
    proposalSent: "Đã gửi đề nghị khấu trừ.",
  },

  docs: {
    verified: "✓ Khớp dấu vân tay on-chain",
    mismatch: "Không khớp on-chain",
    missing: "Không tìm thấy bản gốc",
    loadingTerms: "Đang tải thỏa thuận…",
    reportTitle: "Biên bản hiện trạng lúc nhận phòng",
    rulingTitle: "Phán quyết của người hòa giải",
    noDescription: "(không có mô tả)",
    removePhoto: "Bỏ ảnh này",
    addPhoto: "+ Ảnh",
    itemPlaceholder: "Tình trạng, ví dụ: tường có vết ố góc trái",
    addItem: "+ Thêm hạng mục",
    otherItem: "Hạng mục khác",
    needOne: "Thêm ít nhất một ảnh hoặc ghi chú.",
    uploading: "Đang tải ảnh lên…",
    sendReport: (n: number) => `Gửi biên bản (${n} ảnh) cho người thuê xác nhận`,
    writeSomething: "Viết vài dòng giải thích nhé.",
    defaultItems: ["Tường và trần", "Sàn và cửa", "Nhà vệ sinh", "Máy lạnh, quạt, đèn", "Giường, tủ, bàn"],
  },

  rep: {
    noHistory: "Chưa có lịch sử",
    goodLandlord: "Trả cọc đúng hẹn",
    goodTenant: "Thuê đàng hoàng",
    flagged: (n: number) => `Có ${n} lần cần lưu ý`,
    bad: "Nhiều dấu hiệu xấu",
    leases: (n: number) => `${n} hợp đồng`,
    completed: "Hợp đồng hoàn tất",
    amicable: "Tất toán êm đẹp",
    disputes: "Tranh chấp",
    lost: "Thua khi hòa giải",
    timeoutsLandlord: "Im lặng khi người thuê xin cọc",
    timeoutsTenant: "Im lặng khi bị đề nghị khấu trừ",
    ghostLandlord: "Nhận giữ chỗ rồi không giao phòng",
    ghostTenant: "Giữ chỗ rồi không đến",
    volume: "Khối lượng bảo chứng",
    usdcDays: "USDC·ngày",
  },

  me: {
    noWalletTitle: "Chưa có ví",
    noWalletBody: "Bấm “Tạo ví” ở góc trên. Ví nhanh không cần cài gì và không cần AVAX.",
    title: "Của tôi",
    deposits: "Hợp đồng cọc",
    empty: "Chưa có hợp đồng nào. Chủ trọ tạo link cọc, người thuê mở link để giữ chỗ.",
    asLandlord: "Bạn là chủ trọ",
    asTenant: "Bạn là người thuê",
    asMediator: "Bạn hòa giải",
    deposit: "cọc",
    landlordProfile: "Hồ sơ khi làm chủ trọ",
    tenantProfile: "Hồ sơ khi đi thuê",
  },

  profile: {
    title: "Hồ sơ uy tín",
    explorer: "Xem trên explorer",
    body: "Mọi con số dưới đây do smart contract tự ghi lại, không ai sửa được và không có bình luận chủ quan. Chỉ hợp đồng đã thật sự nhận phòng mới được tính, có trọng số theo số tiền và thời gian giữ, nên rất tốn kém nếu muốn làm giả.",
    asLandlord: "Khi làm chủ trọ",
    asTenant: "Khi đi thuê",
    asMediator: "Khi làm người hòa giải",
    mediatorLine: (resolved: number, timedOut: number) => `Đã phân xử ${resolved} vụ, để quá hạn ${timedOut} vụ.`,
    invalid: "Địa chỉ ví không hợp lệ.",
  },

  errors: {
    WrongStatus: "Hợp đồng đã chuyển sang bước khác. Tải lại trang để xem trạng thái mới.",
    NotAllowed: "Ví đang dùng không có quyền làm thao tác này.",
    TooEarly: "Chưa tới hạn để làm thao tác này.",
    TooLate: "Đã quá hạn để làm thao tác này.",
    BadParams: "Thông tin nhập chưa hợp lệ.",
    ConditionMismatch: "Biên bản hiện trạng không khớp với bản chủ trọ đã gửi.",
    ERC20InsufficientBalance: "Ví không đủ USDC. Bấm “Nhận 500 USDC thử” ở menu ví.",
    BadSignature: "Chữ ký không hợp lệ. Thử lại nhé.",
    ERC2771ForwarderExpiredRequest: "Yêu cầu đã hết hạn. Thử lại nhé.",
    ERC2771ForwarderInvalidSigner: "Chữ ký không khớp với ví đang dùng.",
    NotDeployed: "Ứng dụng chưa được cấu hình địa chỉ contract.",
    NoRelayer: "Server chưa cấu hình ví trả phí gas (RELAYER_PRIVATE_KEY).",
    RelayerEmpty: "Ví trả phí gas của Cọc đã hết AVAX testnet. Nạp thêm ở faucet rồi thử lại.",
    FaucetMockOnly: "Faucet chỉ dùng cho USDC thử nghiệm.",
    FaucetEnough: "Ví đã có đủ USDC thử.",
    UnsupportedType: "Định dạng file không hỗ trợ.",
    FileTooLarge: "File rỗng hoặc quá lớn.",
    BadJson: "JSON không hợp lệ.",
    UploadFailed: "Không tải lên được.",
    HashMismatch: "Hash của file tải lên không khớp.",
    ImageFailed: "Không xử lý được ảnh.",
    NoInjected: "Không tìm thấy ví trình duyệt (Core hoặc MetaMask).",
    NoAddress: "Ví không trả về địa chỉ nào.",
    NoWallet: "Chưa chọn ví.",
    UserRejected: "Bạn đã từ chối ký trong ví.",
    Unknown: "Có lỗi xảy ra. Thử lại nhé.",
  },
};

const DICTS: Record<Lang, Dict> = { en, vi };
const KEY = "coc.lang.v1";

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void };
const I18nCtx = createContext<Ctx>({ lang: "en", t: en, setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "en" || saved === "vi") setLangState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);
  return <I18nCtx.Provider value={{ lang, t: DICTS[lang], setLang }}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}

export function useT() {
  return useContext(I18nCtx).t;
}
