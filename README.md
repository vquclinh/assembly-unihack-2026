# Cọc

**Nơi giữ tiền cọc phòng trọ trung lập cho sinh viên, chạy trên Avalanche.**
Team Assembly, Team1 Vietnam UniHack 2026.

Tiền cọc nằm trong smart contract thay vì trong túi chủ trọ. Không ai, kể cả hòa giải viên và chính team phát triển, có thể chuyển tiền đi đâu khác ngoài người thuê hoặc chủ trọ.

## Vấn đề

- Mùa nhập học nào cũng có sinh viên mất tiền cọc giữ chỗ cho "phòng trọ ảo".
- Hết hợp đồng, chủ trọ tìm cớ giữ cọc và sinh viên không có cách nào đòi.
- Việt Nam chưa có bên thứ ba trung lập giữ tiền cọc như cơ chế bảo vệ tiền cọc ở Anh.

## Cọc hoạt động thế nào

| Bước | Ai làm | Điều gì xảy ra on-chain |
|---|---|---|
| 1. Tạo link cọc | Chủ trọ | `createOffer`: số tiền giữ chỗ, tổng cọc, hạn nhận phòng, hòa giải viên |
| 2. Giữ chỗ | Người thuê | `reserve`: tiền giữ chỗ vào contract, chủ trọ chưa chạm được |
| 3. Nhận phòng | Cả hai | Chủ trọ `proposeCondition` (hash bộ ảnh hiện trạng), người thuê `confirmMoveIn` và nạp đủ cọc |
| 4. Trả phòng | Chủ trọ | `proposeSettlement(0)`: trả đủ cọc trong một giao dịch |
| 4b. Có khấu trừ | Cả hai | Chủ trọ đề nghị trừ kèm bằng chứng, người thuê `acceptSettlement` hoặc `dispute` |
| 5. Tranh chấp | Hòa giải viên | `resolve`: chỉ được chia phần đang tranh chấp cho hai bên |

Mọi trạng thái chờ đều có hạn chót. Quá hạn thì ai cũng gọi được `finalize`, nên tiền không bao giờ bị kẹt:

- Chủ trọ biến mất sau khi nhận giữ chỗ: người thuê nhận lại tiền.
- Người thuê không đến: chủ trọ nhận tiền giữ chỗ (đúng tinh thần Điều 328 Bộ luật Dân sự).
- Chủ trọ im lặng khi người thuê xin trả cọc: hoàn đủ cho người thuê.
- Người thuê im lặng trước đề nghị khấu trừ: khấu trừ có hiệu lực.
- Hòa giải viên im lặng: phần tranh chấp chia đôi.

### Điểm đáng chú ý

- **Chủ trọ ảo không lấy được tiền.** Chỉ người thuê mới xác nhận được việc đã nhận phòng.
- **Hòa giải viên không thể chiếm tiền.** Không có đường nào trong code chuyển tiền cho hòa giải viên.
- **Phần không tranh chấp trả ngay.** Khi có tranh chấp, người thuê nhận ngay phần chủ trọ không đòi.
- **Không cần AVAX.** Người dùng ký, relayer trả gas (ERC-2771), tiền cọc chuyển bằng chữ ký USDC (EIP-3009).
- **Hồ sơ uy tín on-chain.** Số hợp đồng hoàn tất, số lần trả cọc êm đẹp, số lần tranh chấp và thua, số lần im lặng. Có trọng số theo giá trị và thời gian nên khó làm giả.
- **Sinh lời là tùy chọn.** Chỉ bật khi cả hai bên đồng ý, lãi chia đôi. Bản demo dùng vault mô phỏng.

## Cấu trúc repo

```
contracts/            Hardhat project
  contracts/CocEscrow.sol        Contract chính
  contracts/CocForwarder.sol     Forwarder cho giao dịch không cần gas
  contracts/mocks/               USDC thử nghiệm và vault mô phỏng
  test/CocEscrow.test.js         29 test
  scripts/deploy.js              Deploy lên Fuji
docs/
  IDEA.md             Ý tưởng, đối chiếu barem, câu hỏi phản biện
```

Giao diện web sẽ có ở phiên bản tiếp theo.

## Chạy thử

Cần Node.js 20 trở lên.

```bash
cd contracts
npm install
npm test
```

## Deploy lên Avalanche Fuji

```bash
cd contracts
cp .env.example .env      # điền PRIVATE_KEY của ví testnet
npm run deploy:fuji
```

Lấy AVAX testnet tại faucet của ban tổ chức (https://team1vn.xyz/faucet.html) hoặc https://core.app/tools/testnet-faucet. Địa chỉ contract được ghi vào `contracts/deployments/fuji.json`, script cũng in sẵn lệnh verify trên Snowtrace.

Để `USDC_ADDRESS` trống thì script deploy một USDC thử nghiệm có faucet công khai. Muốn dùng USDC testnet của Circle thì điền `0x5425890298aed601595a70AB815c96711a31Bc65`.

## Lưu ý

Đây là bản prototype trên testnet cho mục đích hackathon, chưa được audit và không phải tư vấn pháp lý. Contract không phụ thuộc vào một token cụ thể. Cọc chỉ giữ tài sản bảo đảm, không xử lý tiền thuê nhà.
