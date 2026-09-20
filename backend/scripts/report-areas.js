'use strict';

/**
 * Gom bộ kiểm thử theo MIỀN NGHIỆP VỤ, không theo đường dẫn tệp.
 *
 * Người đọc báo cáo là hội đồng khảo thí, không phải lập trình viên. Dòng
 * `src/__tests__/routes/bank-checkout.test.ts — 9 ca đạt` không cho họ biết gì;
 * "Thanh toán & hoàn tiền — 118 ca — đảm bảo tiền vào đúng, hoàn đúng mốc" thì có.
 *
 * `guarantee` là phần quan trọng nhất: nói bằng ngôn ngữ nghiệp vụ rằng nếu
 * nhóm ca này xanh thì điều gì được bảo đảm.
 */
const AREAS = [
  {
    key: 'auth',
    name: 'Xác thực & phân quyền',
    match: [/routes\/auth/, /lib\/vietnam-phone/],
    guarantee:
      'Đăng ký, đăng nhập, làm mới phiên và đặt lại mật khẩu hoạt động đúng; mỗi vai trò chỉ vào được phần của mình; số điện thoại Việt Nam nhận đúng đầu số di động và cố định, chặn số sai định dạng.',
  },
  {
    key: 'booking',
    name: 'Đặt lịch & huỷ lịch',
    match: [
      /routes\/bookings/,
      /routes\/walk-in-booking/,
      /services\/booking\.service/,
      /services\/booking-timeout-job/,
      /services\/subscription-booking-cutoff/,
      /lib\/cafe-day-availability/,
      /lib\/provider-occupancy/,
      /lib\/session-operational-timing/,
      /lib\/vietnam-time/,
    ],
    guarantee:
      'Không đặt trùng khung giờ hay trùng xe; đơn quá hạn thanh toán tự huỷ và trả lại chỗ; giờ vận hành tính đúng theo múi giờ Việt Nam kể cả ca qua nửa đêm.',
  },
  {
    key: 'payment',
    name: 'Thanh toán, hoàn tiền & đối soát',
    match: [
      /routes\/admin-payments/,
      /services\/payos-subscription/,
      /services\/payment\.service/,
      /services\/pricing\.service/,
      /routes\/bank-checkout/,
      /routes\/bank-payment/,
      /services\/bank-webhook/,
      /routes\/checkout-additional-payment/,
      /routes\/sandbox-bank/,
      /services\/sandbox-bank-isolation/,
      /services\/vietqr/,
      /lib\/booking-financial-summary/,
      /routes\/promotions/,
    ],
    guarantee:
      'Sổ thu tiền của nền tảng chỉ gồm tiền đối tác trả, không lẫn tiền khách trả cho quán; cổng báo nhận tiền gói thuê bao thì kích hoạt ngay, không chờ duyệt tay. Số tiền khách trả khớp bảng giá đã chốt lúc đặt; hoàn tiền đúng mốc 24 giờ và 12 giờ; mã VietQR sinh đúng chuẩn và webhook ngân hàng không xác nhận nhầm đơn.',
  },
  {
    key: 'handover',
    name: 'Bàn giao xe & hư hỏng',
    match: [/routes\/inspection-confirm/, /damage-charge/],
    guarantee:
      'Biên bản bàn giao đầu và cuối phiên được ghi kèm bằng chứng; tiền hư hỏng cộng đúng từ hạng mục staff nhập, không tính lên hư hỏng đã có sẵn.',
  },
  {
    key: 'contest',
    name: 'Giải đấu',
    match: [/contest/],
    guarantee:
      'Vòng đời giải chạy đúng từ tạo, mở đăng ký, khoá sổ tới công bố kết quả; sơ đồ đấu loại và vòng loại–chung kết sinh đúng; lệ phí và sổ thu chi khớp nhau.',
  },
  {
    key: 'catalog',
    name: 'Chi nhánh, đội xe & thực đơn',
    match: [
      /routes\/cafes/,
      /routes\/cafe-images/,
      /routes\/vehicle-catalog/,
      /routes\/vehicle-unit-lifecycle/,
      /routes\/menu/,
    ],
    guarantee:
      'Chi nhánh chỉ hiển thị với khách khi đã được duyệt; danh mục xe, ảnh và thực đơn chỉ chủ sở hữu sửa được; không xoá hay thu hồi được chiếc xe đang trong phiên chơi.',
  },
  {
    key: 'provider',
    name: 'Đối tác & nhân sự',
    match: [
      /routes\/provider-business-profile/,
      /routes\/provider-staff/,
      /routes\/provider-review/,
      /services\/tax-lookup/,
      /services\/channel-quota/,
    ],
    guarantee:
      'Hồ sơ doanh nghiệp và mã số thuế lưu đúng; nhân viên chỉ thao tác được trên chi nhánh được phân công; số kênh chat nối được không vượt hạn mức của gói thuê bao.',
  },
  {
    key: 'assistant',
    name: 'Trợ lý ảo',
    match: [/routes\/chat/, /chat-tools/, /contest-lab-page/],
    guarantee:
      'Trợ lý trả lời dựa trên dữ liệu thật của chi nhánh: giá sân đọc qua đúng hàm mà đặt lịch dùng để tính tiền, nên không bao giờ báo một con số khác con số khách phải trả.',
  },
  {
    key: 'platform',
    name: 'Nền tảng & tài liệu API',
    match: [
      /routes\/health/,
      /routes\/swagger/,
      /routes\/racing-network/,
      /routes\/admin-feature-flags/,
    ],
    guarantee:
      'Máy chủ báo đúng tình trạng sống; tài liệu API sinh tự động khớp với mã thật; bảng xếp hạng phản hồi đúng; bật tắt cờ tính năng chỉ ảnh hưởng đúng dòng được chọn, không đụng chi nhánh khác.',
  },
];

/** Trả về miền nghiệp vụ của một tệp kiểm thử; không khớp thì gom vào "Khác". */
function areaOf(suiteName) {
  for (const area of AREAS) {
    if (area.match.some((re) => re.test(suiteName))) return area;
  }
  return { key: 'other', name: 'Khác', guarantee: 'Các kiểm thử chưa phân loại.' };
}

module.exports = { AREAS, areaOf };
