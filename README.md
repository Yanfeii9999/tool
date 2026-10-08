# Website xoá watermark

Website HTML/CSS/JavaScript chạy trên GitHub Pages. Không cần Python, backend, API key hoặc tải file người dùng lên server. Ảnh/video được xử lý ngay trong trình duyệt.

## Cách dùng

1. Chọn nhiều ảnh hoặc video, hoặc bấm **Thử bằng ảnh & video mẫu** để tạo mẫu mô phỏng trên máy.
2. Kéo chuột khoanh watermark ngay trong chế độ **Gemini / Veo**, rồi bấm **Xem thử kết quả**. Chỉ vùng khoanh được xử lý. Không khoanh thì công cụ tự dò toàn ảnh.
3. Với watermark khác, chọn **kéo vùng và ghép nền**, khoanh từng vùng bằng chuột. Mỗi file có vùng chọn riêng; có thể kéo chọn nền thay thế thủ công.
4. Với logo video chồng lớp, giữ bật **Video có logo chồng: tự dò thêm lớp alpha** và khoanh bao cả hai logo. Bấm **Xử lý hàng loạt**, tải từng kết quả. Ảnh xuất PNG; video xuất MP4 H.264 qua WebCodecs trên Chrome/Edge.
5. Video dài: bật **Lưu video thẳng vào thư mục đã chọn** trên Chrome/Edge qua HTTPS hoặc localhost. File có tên trùng được đổi tên, không ghi đè file có sẵn.

## Đưa lên GitHub Pages

Repo: https://github.com/Yanfeii9999/tool

Đã có workflow `.github/workflows/pages.yml`. Trong repo mở **Settings → Pages → Build and deployment → Source → GitHub Actions**. Khi push vào nhánh `main`, workflow chạy kiểm tra JavaScript rồi triển khai website. Chỉ `index.html`, CSS và thư mục `web/` được đưa vào artifact; không bao gồm video mẫu cá nhân hay backend Python cũ.

Website: https://yanfeii9999.github.io/tool/

Không mở bằng cách nhấp đúp file HTML: ES modules và Worker cần máy chủ HTTP/HTTPS. Để xem thử trên máy có Node.js:

```sh
npm start
```

Mở http://127.0.0.1:8080. Không cần `npm install` vì các module cần dùng đã kèm trong repo.

## Thuật toán và ghi nguồn

Chế độ Gemini dùng mã nguồn và alpha map từ [GargantuaX/gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover), phiên bản 1.0.46, commit `dcf688f34f4d05cc1c33236d104b4624314748ed`. Các module upstream được giữ nguyên trong `web/vendor/gemini/`, kèm giấy phép MIT và thông tin nguồn. Copyright (c) 2025 Jad; Copyright (c) 2024 AllenK (Kwyshell).

Ảnh sử dụng pipeline SDK upstream. Video lấy mẫu 5 thời điểm để nhận diện logo Gemini hoặc chữ Veo, rồi giải alpha và dọn viền theo footprint trên từng khung hình. Mỗi vị trí logo có bằng chứng phù hợp đều được xử lý. Bộ fit lớp chồng của dự án nhận thêm lớp cùng mẫu hoặc mẫu lồng nhỏ hơn khi nền và alpha khớp rõ; không trừ alpha nhiều lần một cách cố định. Worker chạy phần phân tích. Không tích hợp mô hình ONNX; không tuyên bố chất lượng giống toàn bộ sản phẩm upstream.

Xuất video dùng [MediaBunny 1.46.0](https://github.com/Vanilagy/mediabunny), bundle giữ nguyên kèm giấy phép MPL 2.0. Adapter `web/offline-video.js` giải mã, chờ xử lý xong từng khung rồi mã hoá H.264 theo timestamp. Các luồng âm thanh tương thích MP4 được sao chép ở mức packet; codec không tương thích được báo lỗi thay vì âm thầm bỏ âm thanh.

Công thức với logo trắng: `original = (watermarked - alpha × 255) / (1 - alpha)`.

## Giới hạn

- Reverse alpha chỉ phù hợp lớp watermark đúng mẫu, vị trí và alpha. File đã nén, đổi kích thước, chỉnh sửa hoặc bôi mờ trước có thể còn viền. Không bảo đảm xoá sạch mọi video, không xoá SynthID ẩn.
- Với logo đặc, nội dung phía sau đã mất; chế độ ghép nền chỉ thay bằng vùng lân cận và có thể sai chi tiết/đường nối. Không tự động theo dõi watermark di chuyển.
- Bộ dò dùng các vị trí Gemini/Veo trong catalog; khoanh vùng giới hạn nơi được sửa, không tạo mẫu alpha mới cho logo bất kỳ. Logo chồng khác hình, đổi kích thước nhiều hoặc nền phức tạp có thể còn dấu hoặc bị sai chi tiết. Dọn viền có thể làm mềm chi tiết trong footprint.
- Giữ tab hiển thị và máy không ngủ. Không có cam kết xử lý mọi codec: WebCodecs và bộ giải mã của trình duyệt quyết định định dạng được hỗ trợ. Nếu thiếu hỗ trợ, công cụ báo lỗi.
- Không giữ metadata/phụ đề/HDR. Các AAC packet có timestamp âm dùng làm priming có thể bị bỏ ở đầu; cần nghe kiểm tra đồng bộ âm thanh trước khi dùng kết quả.
- Không dùng chế độ lưu trực tiếp thì video kết quả nằm trong RAM. Không có giới hạn độ dài cố định, nhưng RAM, ổ đĩa, trình duyệt và thời gian xử lý là giới hạn thực tế. Video dài và ghi thẳng ra ổ đĩa chưa được kiểm thử đầy đủ.
- Ảnh không nhận diện được mẫu được báo rõ; không gắn nhãn đã xoá cho ảnh chưa xử lý. Video cho biết số lượt khung hình đã giải alpha và cảnh báo nhận diện chưa chắc chắn.

## Kiểm tra

```sh
npm test
npm run check
npm run build
npm run check:build
```

Bao gồm ánh xạ vùng kéo, bảo toàn pixel ngoài vùng chọn, chọn nền không chồng watermark, alpha upstream, nhận diện video, giải alpha và logo chồng cùng kích thước/lồng nhỏ. Kiểm thử mẫu mô phỏng không thay thế đánh giá trực quan trên video thật. Xem `AUDIT_REPORT.md` để biết phạm vi đã xác minh và giới hạn.
