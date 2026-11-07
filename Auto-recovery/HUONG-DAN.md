# Khôi phục Auto từ nhánh File-2026-11-07

## Cách tải và ghép

1. Trên nhánh **File-2026-11-07**, chọn **Code → Download ZIP**, rồi giải nén ZIP của repository.
2. Mở thư mục **Auto-recovery**. Giữ đủ 66 phần `Auto-recovery-20261107T052553Z.zip.001` đến `.066` cùng manifest và hai script khôi phục.
3. Trên Windows, chạy `restore_auto_zip.cmd`. Nếu đã có Python 3.11 trở lên, có thể chạy `python restore_auto_zip.py` hoặc `python3 restore_auto_zip.py`.
4. Khi hiện **PASS**, giải nén ZIP vừa ghép vào một thư mục trống mới. Đọc `PACKAGE-README` trong Auto; công cụ `verify_recovery` đi kèm kiểm lại danh sách và SHA-256 của các file.

66 phần này không phải ZIP độc lập. Đừng trộn chúng với bộ 35 phần gửi qua chat: hai bộ có cách chia khác nhau nhưng ghép ra cùng một ZIP. Công cụ không tải mạng, cài phần mềm, đổi cấu hình hoặc xóa file; không ghi đè ZIP có sẵn.

Tổng ZIP: **682.633.479 byte**. Mỗi phần tối đa 10 MiB. Nên có khoảng **4 GB trống** cho các phần, ZIP ghép và thư mục giải nén.

SHA-256 ZIP sau ghép:

`0001e3d6ca2e14dbeefa3b35473bf65c3982562be6029a83c15b14903e2a070f`

## Phạm vi

Đây là gói khôi phục gồm **102.400 file gốc**, được xác minh tới **05:30:13 UTC ngày 07/11/2026**, không phải phần mềm Windows hoàn tất hay bản sao nguyên vẹn mọi byte của thư mục Auto. Công việc phát sinh sau thời điểm chụp không nằm trong gói.

Giữ nguyên source, kế hoạch, checkpoints, lịch sử Git và bằng chứng đã đóng gói. Tám loại trừ ban đầu:

- `source/desktop/node_modules`
- `source/foundation/node_modules`
- `source/desktop/build`
- `source/desktop/demo-build`
- `source/desktop/.test-output`
- `source/foundation/.test-output`
- `handoff/archives`
- `checks/portable-handoff`

Chia nhỏ không loại thêm dữ liệu. `main` và lịch sử repository không bị sửa hay ghi đè.

Hash từng phần và hash ghép đã được kiểm; ZIP gốc đã qua CRC và SHA-256 của mọi member. Python restorer đã qua thử nghiệm thành công/thiếu phần/hỏng phần. Bản `.cmd` đã đọc review nhưng chưa chạy trên Windows tại bước đóng gói. Kiểm byte không đồng nghĩa nghiệm thu ứng dụng. Xem [chi tiết và giới hạn kiểm tra](README.md).
