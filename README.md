# YouTube Peach Clone

Bản dựng lại giao diện theo trang tham chiếu https://youtube-peach-beta.vercel.app/ . Đây là dự án độc lập, không phải mã nguồn gốc của website tham chiếu.

## Chạy trên Windows

1. Cài **Node.js LTS** từ https://nodejs.org/ (nếu máy chưa có).
2. Giải nén thư mục dự án.
3. Nhấp đúp `RUN-WINDOWS.bat`.
4. Chờ cài thư viện lần đầu. Trình duyệt sẽ mở tại http://localhost:5173 . Nếu không tự mở, hãy truy cập địa chỉ đó.

Lần đầu cần Internet để tải thư viện npm và tải trình phát YouTube. Các lần sau chỉ cần chạy lại file BAT.

## Chức năng hiện có

- Bố cục YouTube: header, tìm kiếm, sidebar và khu vực phát video.
- Thêm video bằng URL YouTube hoặc mã video.
- Phát video nhúng, điều khiển phát/tạm dừng, tua, âm lượng và toàn màn hình.
- Lưu danh sách video trên trình duyệt bằng LocalStorage.
- Tìm trong danh sách video đã lưu và xóa video.
- Giao diện co giãn cho màn hình nhỏ.

## Lưu ý

- Một số video bị chủ sở hữu chặn nhúng, giới hạn độ tuổi/khu vực hoặc yêu cầu đăng nhập sẽ không phát được trong iframe.
- Tìm kiếm hiện tại lọc danh sách video đã thêm. Tìm kiếm toàn bộ YouTube cần cấu hình YouTube Data API key.
- Dự án dùng YouTube IFrame Player API; việc phát video tuân theo điều khoản và giới hạn của YouTube.
