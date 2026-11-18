/**
 * Text of the printable deposit agreement. Both languages are printed side by side on the
 * same page, so a Vietnamese landlord and an international student read the same clauses.
 * Every clause describes what the escrow contract enforces; nothing here is extra promise.
 */
export type AgreementVars = {
  hold: string;
  deposit: string;
  moveIn: string;
  leaseEnd: string;
  response: string;
  mediation: string;
  /** "on": both sides agreed; "offered": the landlord offers it, the tenant decides at move-in. */
  yieldMode: "on" | "offered" | "off";
};

type Lang = "en" | "vi";

export function duration(seconds: number, lang: Lang) {
  const unit = (n: number, en: string, vi: string) => (lang === "en" ? `${n} ${en}${n === 1 ? "" : "s"}` : `${n} ${vi}`);
  if (seconds % 86400 === 0) return unit(seconds / 86400, "day", "ngày");
  if (seconds % 3600 === 0) return unit(seconds / 3600, "hour", "giờ");
  if (seconds % 60 === 0) return unit(seconds / 60, "minute", "phút");
  return unit(seconds, "second", "giây");
}

/** Dates in Vietnam time, because that is where the room is. */
export function vnDate(unix: number | bigint, lang: Lang) {
  const s = new Date(Number(unix) * 1000).toLocaleString(lang === "en" ? "en-GB" : "vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${s} (GMT+7)`;
}

export const AGREEMENT: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    parties: string;
    landlord: string;
    tenant: string;
    mediator: string;
    open: string;
    room: string;
    rent: string;
    perMonth: string;
    money: string;
    hold: string;
    deposit: string;
    dates: string;
    moveIn: string;
    leaseEnd: string;
    rulesTitle: string;
    rules: (v: AgreementVars) => string[];
    notes: string;
    proof: string;
    proofBody: string;
    termsHash: string;
    conditionHash: string;
    notYet: string;
    contract: string;
    network: string;
    scan: string;
    status: string;
  }
> = {
  en: {
    title: "Rental deposit agreement",
    subtitle: "Deposit held by a smart contract on Avalanche",
    parties: "Parties",
    landlord: "Landlord",
    tenant: "Tenant",
    mediator: "Mediator",
    open: "Open to the first tenant who reserves",
    room: "Room",
    rent: "Rent",
    perMonth: "per month, paid directly to the landlord",
    money: "Money held by the contract",
    hold: "Holding deposit (to reserve)",
    deposit: "Full deposit (holding deposit included)",
    dates: "Dates",
    moveIn: "Hand over the room by",
    leaseEnd: "Lease ends",
    rulesTitle: "Rules enforced by the contract",
    rules: (v) => [
      `The tenant reserves the room by locking the holding deposit of ${v.hold} in the Tinco escrow contract. The landlord cannot withdraw it. The landlord may cancel and refund it at any time before move-in.`,
      `If the landlord neither hands over the room nor reports a no-show within ${v.response} after ${v.moveIn}, anyone can trigger a full refund of the holding deposit to the tenant.`,
      `If the tenant does not show up, the landlord may report a no-show after that date. The tenant then has ${v.response} to dispute it; otherwise the holding deposit goes to the landlord.`,
      `At move-in the landlord posts a photo condition report and the tenant confirms the very same report. Its fingerprint is stored on-chain and is the baseline at move-out. The tenant then tops up to the full deposit of ${v.deposit}.`,
      v.yieldMode === "on"
        ? "Both sides agreed to put the deposit in a yield vault while the lease runs. The deposit is returned in full and the yield is split 50/50."
        : v.yieldMode === "offered"
          ? "The landlord offers to put the deposit in a yield vault while the lease runs, and the tenant decides at move-in. If both agree, the deposit is returned in full and the yield is split 50/50."
          : "The deposit is not invested. It stays in the contract until the lease is settled.",
      `At move-out the tenant asks for the deposit back. The landlord has ${v.response} to return it in full or to propose a deduction with photo evidence. If the landlord stays silent, the whole deposit goes back to the tenant.`,
      `The tenant may accept a proposed deduction or dispute it within ${v.response}. If the tenant stays silent, the deduction takes effect. The undisputed part is paid out at once.`,
      `Only the disputed amount goes to the mediator named above, who must decide within ${v.mediation}. If the mediator stays silent, that amount is split 50/50.`,
      "Every deadline is enforced by the contract, and anyone can trigger it. No party, not even the Tinco team, can move the money in any other way.",
      "Rent, utilities and house rules are agreed between the parties and are not handled by the contract.",
    ],
    notes: "Other terms from the landlord",
    proof: "How to check this document",
    proofBody:
      "The terms below were saved as a file whose keccak256 fingerprint is recorded on-chain when the deposit link was created. If one character changes, the fingerprint no longer matches. Scan the code to open the live deposit page.",
    termsHash: "Terms fingerprint",
    conditionHash: "Move-in report fingerprint",
    notYet: "Not yet recorded",
    contract: "Escrow contract",
    network: "Network",
    scan: "Scan to check the live status",
    status: "Status when printed",
  },
  vi: {
    title: "Thỏa thuận tiền cọc thuê nhà",
    subtitle: "Tiền cọc do hợp đồng thông minh trên Avalanche giữ",
    parties: "Các bên",
    landlord: "Chủ nhà",
    tenant: "Người thuê",
    mediator: "Người hòa giải",
    open: "Dành cho người thuê đầu tiên đặt giữ chỗ",
    room: "Phòng",
    rent: "Tiền thuê",
    perMonth: "mỗi tháng, trả trực tiếp cho chủ nhà",
    money: "Số tiền hợp đồng giữ",
    hold: "Tiền giữ chỗ (để đặt phòng)",
    deposit: "Tiền cọc đầy đủ (đã gồm tiền giữ chỗ)",
    dates: "Thời hạn",
    moveIn: "Giao phòng trước",
    leaseEnd: "Hết hạn thuê",
    rulesTitle: "Quy tắc do hợp đồng thông minh thực thi",
    rules: (v) => [
      `Người thuê đặt phòng bằng cách khóa tiền giữ chỗ ${v.hold} vào hợp đồng ký quỹ Tinco. Chủ nhà không thể rút số tiền này. Chủ nhà có thể hủy và hoàn tiền bất cứ lúc nào trước khi dọn vào.`,
      `Nếu chủ nhà không giao phòng và cũng không báo người thuê vắng mặt trong vòng ${v.response} sau ${v.moveIn}, bất kỳ ai cũng có thể kích hoạt hoàn toàn bộ tiền giữ chỗ cho người thuê.`,
      `Nếu người thuê không đến, sau thời điểm đó chủ nhà có thể báo vắng mặt. Người thuê có ${v.response} để phản đối; nếu không, tiền giữ chỗ thuộc về chủ nhà.`,
      `Khi dọn vào, chủ nhà đăng biên bản hiện trạng có ảnh và người thuê xác nhận đúng biên bản đó. Dấu vân tay của biên bản được lưu on-chain và là mốc so sánh khi trả phòng. Sau đó người thuê nộp thêm cho đủ tiền cọc ${v.deposit}.`,
      v.yieldMode === "on"
        ? "Hai bên đồng ý gửi tiền cọc vào kho sinh lời trong thời gian thuê. Tiền cọc được trả lại đầy đủ, phần lãi chia đôi 50/50."
        : v.yieldMode === "offered"
          ? "Chủ nhà đề nghị gửi tiền cọc vào kho sinh lời trong thời gian thuê, người thuê quyết định khi dọn vào. Nếu cả hai đồng ý, tiền cọc được trả lại đầy đủ, phần lãi chia đôi 50/50."
          : "Tiền cọc không được đem đầu tư. Tiền nằm trong hợp đồng cho đến khi tất toán.",
      `Khi trả phòng, người thuê yêu cầu nhận lại cọc. Chủ nhà có ${v.response} để trả đủ hoặc đề xuất khấu trừ kèm ảnh bằng chứng. Nếu chủ nhà im lặng, toàn bộ tiền cọc về lại người thuê.`,
      `Người thuê có thể đồng ý hoặc phản đối khoản khấu trừ trong vòng ${v.response}. Nếu người thuê im lặng, khoản khấu trừ có hiệu lực. Phần không tranh chấp được trả ngay.`,
      `Chỉ phần tiền đang tranh chấp được chuyển cho người hòa giải có tên ở trên, người này phải quyết định trong vòng ${v.mediation}. Nếu người hòa giải im lặng, phần tiền đó được chia đôi 50/50.`,
      "Mọi thời hạn đều do hợp đồng thực thi và bất kỳ ai cũng có thể kích hoạt. Không bên nào, kể cả đội ngũ Tinco, có thể chuyển tiền theo cách khác.",
      "Tiền thuê, điện nước và nội quy do hai bên tự thỏa thuận, hợp đồng thông minh không xử lý các khoản này.",
    ],
    notes: "Điều khoản khác của chủ nhà",
    proof: "Cách kiểm tra văn bản này",
    proofBody:
      "Các điều khoản được lưu thành một tệp có dấu vân tay keccak256 ghi trên blockchain lúc tạo link đặt cọc. Chỉ cần đổi một ký tự, dấu vân tay sẽ không còn khớp. Quét mã để mở trang đặt cọc trực tiếp.",
    termsHash: "Dấu vân tay điều khoản",
    conditionHash: "Dấu vân tay biên bản dọn vào",
    notYet: "Chưa ghi nhận",
    contract: "Hợp đồng ký quỹ",
    network: "Mạng",
    scan: "Quét để xem trạng thái hiện tại",
    status: "Trạng thái lúc in",
  },
};
