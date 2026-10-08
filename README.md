# ClearFrame — website xoá watermark

Website HTML/CSS/JavaScript chạy trên GitHub Pages. Không cần Python, backend, API key hoặc tải file người dùng lên server. Ảnh/video được xử lý ngay trong trình duyệt.

## Cách dùng

1. Chọn nhiều ảnh hoặc video, hoặc bấm **Thử bằng ảnh & video mẫu** để tạo mẫu mô phỏng trên máy.
2. Với logo Gemini/Veo, giữ chế độ **giải ngược alpha tự động**, bấm **Xem thử kết quả**. Công cụ dò mẫu logo đã biết thay vì bôi mờ.
3. Với watermark khác, chọn **kéo vùng và ghép nền**, khoanh từng vùng bằng chuột. Mỗi file có vùng chọn riêng; có thể kéo chọn nền thay thế thủ công.
4. Bấm **Xử lý hàng loạt**, tải từng kết quả. Ảnh xuất PNG; video xuất MP4 H.264/AAC nếu trình duyệt hỗ trợ, nếu không sẽ dùng WebM.
5. Video dài: bật **Lưu video thẳng vào thư mục đã chọn** trên Chrome/Edge qua HTTPS hoặc localhost. File có tên trùng được đổi tên, không ghi đè file có sẵn.

## Đưa lên GitHub Pages

Repo: https://github.com/Yanfeii9999/tool

Đã có workflow `.github/workflows/pages.yml`. Trong repo mở **Settings → Pages → Build and deployment → Source → GitHub Actions**. Khi push vào nhánh `main`, workflow chạy kiểm tra JavaScript rồi triển khai website. Chỉ `index.html`, CSS và thư mục `web/` được đưa vào artifact; không bao gồm video mẫu cá nhân hay backend Python cũ.

URL dự kiến khi Pages đã triển khai thành công: https://yanfeii9999.github.io/tool/

Không mở bằng cách nhấp đúp file HTML: ES modules và Worker cần máy chủ HTTP/HTTPS. Để xem thử trên máy có Node.js:

```sh
npm start
```

Mở http://127.0.0.1:8080. Không cần `npm install` vì các module cần dùng đã kèm trong repo.

## Thuật toán và ghi nguồn

Chế độ Gemini dùng mã nguồn và alpha map từ [GargantuaX/gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover), phiên bản 1.0.46, commit `dcf688f34f4d05cc1c33236d104b4624314748ed`. Các module upstream được giữ nguyên trong `web/vendor/gemini/`, kèm giấy phép MIT và thông tin nguồn. Copyright (c) 2025 Jad; Copyright (c) 2024 AllenK (Kwyshell).

Ảnh sử dụng pipeline SDK upstream. Video lấy mẫu 5 thời điểm để nhận diện logo Gemini hoặc chữ Veo, rồi áp dụng reverse alpha lên ROI từng khung hình trong luồng ghi video. Worker chạy phần phân tích, giao diện không phải chờ đồng bộ trên main thread. Không tích hợp backend video WebCodecs/MediaBunny hoặc mô hình ONNX khử nhiễu của upstream; không tuyên bố chất lượng video giống toàn bộ sản phẩm upstream.

Công thức với logo trắng: `original = (watermarked - alpha × 255) / (1 - alpha)`.

## Giới hạn

- Reverse alpha chỉ phù hợp lớp watermark đúng mẫu, vị trí và alpha. File đã nén, đổi kích thước, chỉnh sửa hoặc bôi mờ trước có thể còn viền. Không bảo đảm xoá sạch mọi video, không xoá SynthID ẩn.
- Với logo đặc, nội dung phía sau đã mất; chế độ ghép nền chỉ thay bằng vùng lân cận và có thể sai chi tiết/đường nối. Không tự động theo dõi watermark di chuyển.
- Video được ghi theo thời gian thực, không cam kết giữ từng khung hình hoặc FPS gốc. Giữ tab hiển thị và máy không ngủ. Định dạng đọc được phụ thuộc trình duyệt; MKV/AVI/MOV không phải lúc nào cũng giải mã được.
- Ghi lại âm thanh qua Web Audio; không giữ nguyên codec/metadata/phụ đề/HDR. Nhiều track âm thanh được trộn theo cách trình duyệt phát.
- Không dùng chế độ lưu trực tiếp thì video kết quả nằm trong RAM. Không có giới hạn độ dài cố định, nhưng RAM, ổ đĩa, trình duyệt và thời gian phát là giới hạn thực tế.
- Ảnh không nhận diện được mẫu được báo rõ; không gắn nhãn đã xoá cho ảnh chưa xử lý. Video cho biết số lượt khung hình đã giải alpha và cảnh báo nhận diện chưa chắc chắn.

## Kiểm tra

```sh
npm test
```

Bao gồm ánh xạ vùng kéo, chọn nền không chồng watermark, ảnh mô phỏng dùng alpha upstream, nhận diện vị trí video và giải ngược alpha. Kiểm thử mẫu mô phỏng không thay thế đánh giá trực quan trên video thật.
