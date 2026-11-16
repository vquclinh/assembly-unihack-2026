# Cọc: ý tưởng và phản biện

## Một câu

Cọc giữ tiền cọc phòng trọ trong smart contract trên Avalanche, để chủ trọ ảo không lừa được và chủ trọ thật không tự ý giữ cọc.

## Đối tượng

- **Người thuê:** sinh viên, người mới lên thành phố.
- **Chủ trọ:** người cho thuê đàng hoàng, muốn chứng minh mình uy tín và muốn có bằng chứng khi người thuê làm hỏng phòng.
- **Hòa giải viên:** bên thứ ba hai bên cùng chọn, ví dụ trung tâm hỗ trợ sinh viên của trường.

## Đối chiếu barem (100 điểm)

| Tiêu chí | Điểm | Cọc lấy điểm bằng gì |
|---|---|---|
| Technical Implementation | 25 | Máy trạng thái escrow 9 trạng thái, hạn chót tự động, trả ngay phần không tranh chấp, vault ERC-4626, 29 test |
| Avalanche Integration | 25 | Toàn bộ tiền và luật nằm trên Fuji, USDC, không cần gas (ERC-2771 và EIP-3009), contract verify công khai |
| Creativity & Innovation | 15 | Không nằm trong 20 chủ đề gợi ý. Ghép cơ chế của #3, #8, #9 vào một bài toán mới |
| Impact & Use Case | 15 | Ai thuê trọ cũng từng lo mất cọc |
| Presentation & Pitching | 10 | Mở đầu: "Ai ở đây từng mất cọc?" |
| UI/UX & Demo | 10 | Demo hai vai trên điện thoại, mỗi bước một nút |

## Câu hỏi phản biện và cách trả lời

**Đặt cọc bằng USDC có hợp pháp ở Việt Nam không?**
Đây là vùng xám và team nói thẳng điều đó. Từ 1/1/2026 tài sản số được công nhận là tài sản. Khung thí điểm theo Nghị quyết 05/2025/NQ-CP yêu cầu giao dịch qua đơn vị được cấp phép. Cọc chỉ giữ tài sản bảo đảm, không xử lý tiền thuê, nên không dùng crypto làm phương tiện thanh toán. Contract không phụ thuộc token: bản demo dùng USDC testnet, bản thật sẽ dùng tài sản được cấp phép. Nền tảng không giữ tiền của ai.

**Chủ trọ đang có lợi thế, sao họ chịu dùng?**
Ba lý do: contract bảo vệ cả chủ trọ khi người thuê bỏ đi hoặc làm hỏng phòng; hồ sơ uy tín giúp họ có khách; và các trường có thể yêu cầu dùng Cọc để vào danh sách nhà trọ an toàn.

**Chủ trọ ảo vẫn lừa được không?**
Không. Chỉ người thuê mới xác nhận được việc nhận phòng. Chủ trọ khai người thuê không đến thì người thuê có quyền phản đối, và hòa giải viên quyết định.

**Hòa giải viên thông đồng thì sao?**
Hai bên cùng chọn hòa giải viên từ đầu. Hòa giải viên chỉ chia được phần tranh chấp, không rút được về ví mình, và lịch sử phân xử của họ công khai.

**Điểm uy tín có làm giả được không?**
Chỉ hợp đồng đã hoàn tất mới được tính, có trọng số theo số tiền nhân thời gian giữ. Muốn làm giả phải khóa tiền thật trong thời gian dài.

**Vault sinh lời mất tiền thì sao?**
Sinh lời là tùy chọn, hai bên cùng bật mới chạy. Nếu vault lỗ, contract vẫn chi trả theo số còn lại và không bị kẹt. Bản demo dùng vault mô phỏng.

**Quyền riêng tư?**
Ảnh và hợp đồng nằm ngoài chuỗi, on-chain chỉ lưu hash. Hồ sơ uy tín chỉ gồm số liệu khách quan, không có bình luận.

## Lộ trình

- v0.1: contract và test.
- v0.2: giao diện web cho người thuê và chủ trọ.
- v0.3: relayer không cần gas, trang hồ sơ uy tín, trang hòa giải.
- v0.4: AI so ảnh nhận phòng và trả phòng (nếu kịp, trả phí từng lần qua x402).
