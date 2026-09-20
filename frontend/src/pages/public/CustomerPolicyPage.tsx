import { useEffect, useState } from "react"
import { Link } from "react-router"
import { routePaths } from "@/app/router/route-paths"

const sections = [
  { id: "booking", label: "1. Đặt lịch & Thanh toán" },
  { id: "cancellation", label: "2. Hủy lịch & Hoàn tiền" },
  { id: "checkin", label: "3. Check-in & Bàn giao xe" },
  { id: "damage", label: "4. Bồi thường hư hại xe thuê" },
  { id: "session", label: "5. Phiên chơi & Gia hạn" },
  { id: "byoc", label: "6. Mang xe cá nhân (BYOC)" },
  { id: "overdue", label: "7. Quá giờ check-in / Vắng mặt" },
  { id: "dispute", label: "8. Khiếu nại & Hỗ trợ" },
]

export function CustomerPolicyPage() {
  const [active, setActive] = useState("booking")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    )
    for (const { id } of sections) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="border-b border-slate-100 bg-slate-950 px-4 py-16 text-center">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-500">
          Điều khoản dịch vụ
        </p>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
          Chính sách dành cho Khách hàng
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-6 text-slate-400">
          Vui lòng đọc kỹ các điều khoản dưới đây trước khi đặt lịch. Bằng cách
          hoàn tất đặt lịch trên ứng dụng, website hoặc kênh Facebook AI, bạn đồng ý với toàn bộ chính sách này.
        </p>
        <p className="mt-6 text-xs text-slate-500">
          Cập nhật lần cuối: 03/09/2026
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:flex lg:gap-12">
        {/* Sidebar TOC */}
        <aside className="mb-8 shrink-0 lg:mb-0 lg:w-64 lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Mục lục chính sách
          </p>
          <nav className="flex flex-col gap-0.5">
            {sections.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  active === id
                    ? "bg-orange-50 text-orange-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <article className="min-w-0 flex-1 space-y-14 text-slate-700">
          {/* 1. Đặt lịch & Thanh toán */}
          <section id="booking" className="scroll-mt-24">
            <SectionTitle>1. Đặt lịch & Thanh toán</SectionTitle>
            <Prose>
              <p>
                RCField cung cấp nền tảng kết nối người chơi xe điều khiển từ xa (RC) với các cơ sở RC Cafe trên toàn quốc. Hệ thống hỗ trợ hai hình thức tham gia: <strong>Thuê xe của quán (RENTAL)</strong> và <strong>Mang xe cá nhân (BYOC)</strong>.
              </p>

              <h4>Chi phí thanh toán ban đầu & phát sinh trong ca</h4>
              <p>
                Khi xác nhận đặt lịch trước, bạn thanh toán chi phí dịch vụ qua cổng thanh toán trực tuyến. Hệ thống <strong>không yêu cầu đóng tiền đặt cọc trước</strong>:
              </p>
              <ul>
                <li>
                  <strong>Phí slot sân</strong> — Phí sử dụng mặt sân đua, tính theo số lượng người chơi và số khung giờ đã chọn.
                </li>
                <li>
                  <strong>Phí thuê xe</strong> — Tính theo số lượng xe thuê và thời lượng các slot đặt (chỉ áp dụng khi chọn hình thức RENTAL).
                </li>
                <li>
                  <strong>Đồ ăn & thức uống đặt trước (F&B Pre-order)</strong> — Tùy chọn gọi món trước để cơ sở chuẩn bị sẵn khi bạn đến.
                </li>
                <li>
                  <strong>Đồ ăn & thức uống gọi thêm tại quầy (On-site F&B)</strong> — Trong suốt ca chơi, khách hàng có thể gọi thêm các món F&B tại quầy. Khoản phát sinh này sẽ thanh toán gộp vào bảng quyết toán khi kết thúc phiên.
                </li>
              </ul>

              <h4>Phương thức thanh toán</h4>
              <ul>
                <li>
                  <strong>Chuyển khoản VietQR / PayOS</strong> — Quét mã QR chuyển khoản tự động xác nhận tức thì (hỗ trợ cả thanh toán trước trên web/app và thanh toán phát sinh tại quầy).
                </li>
                <li>
                  <strong>Cổng thanh toán VNPay</strong> — Hỗ trợ thẻ ATM nội địa, thẻ quốc tế (Visa/Mastercard) và ví điện tử.
                </li>
                <li>
                  <strong>Gói lượt thành viên (Slot Packages)</strong> — Trừ trực tiếp số lượt có sẵn trong tài khoản gói thành viên của bạn.
                </li>
                <li>
                  <strong>Thanh toán tại quầy</strong> — Áp dụng cho khách vãng lai (Walk-in) hoặc thanh toán các khoản phát sinh bằng Tiền mặt hoặc VietQR trực tiếp tại quầy thu ngân.
                </li>
              </ul>

              <h4>Thời hạn thanh toán giữ chỗ (Payment TTL)</h4>
              <p>
                Sau khi tạo yêu cầu đặt lịch, bạn có <strong>15 phút</strong> để hoàn tất thanh toán chuyển khoản. Nếu quá 15 phút chưa nhận được thanh toán, hệ thống sẽ tự động hủy đơn và giải phóng khung giờ để phục vụ khách hàng khác.
              </p>

              <h4>Đặt lịch qua kênh AI Chatbot (Facebook Messenger)</h4>
              <p>
                Khách hàng nhắn tin đặt lịch qua Fanpage Facebook của cơ sở sẽ được trợ lý AI hướng dẫn chọn sân, chọn xe và gửi mã VietQR thanh toán. Sau khi thanh toán thành công, mã đơn đặt chỗ (<code>RCF-XXXX</code>) và mã QR nhận xe sẽ được gửi trực tiếp trong tin nhắn Messenger để bạn xuất trình khi đến quán.
              </p>
            </Prose>
          </section>

          {/* 2. Hủy lịch & Hoàn tiền */}
          <section id="cancellation" className="scroll-mt-24">
            <SectionTitle>2. Hủy lịch & Hoàn tiền</SectionTitle>
            <Prose>
              <p>
                Chính sách hoàn tiền khi <strong>khách hàng chủ động hủy lịch trước giờ chơi</strong> được áp dụng tự động theo các mốc thời gian sau:
              </p>
            </Prose>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-black uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Thời điểm hủy trước giờ bắt đầu</th>
                    <th className="px-4 py-3">Phí slot sân</th>
                    <th className="px-4 py-3">Phí thuê xe & F&B chưa chế biến</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      Trước &gt; 24 giờ
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold">
                      Hoàn 100%
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold">
                      Hoàn 100%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-amber-700">
                      Từ 12 đến 24 giờ
                    </td>
                    <td className="px-4 py-3 text-amber-600 font-semibold">
                      Phạt 50% (Hoàn 50%)
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold">
                      Hoàn 100%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-red-700">
                      Dưới 12 giờ
                    </td>
                    <td className="px-4 py-3 text-red-600 font-semibold">
                      Không hoàn tiền (0%)
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold">
                      Hoàn 100%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      Sau khi đã check-in vào sân
                    </td>
                    <td className="px-4 py-3 text-slate-600" colSpan={2}>
                      Không thể hủy trên ứng dụng — Nhân viên hỗ trợ xử lý tại quầy
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Prose>
              <p className="mt-4">
                <strong>Trường hợp cơ sở (RC Cafe) hủy lịch</strong>: Nếu cơ sở phải hủy đơn do sự cố kỹ thuật, bảo trì đường đua đột xuất hoặc thời tiết, khách hàng sẽ được <strong>hoàn tiền 100%</strong> toàn bộ các khoản đã thanh toán mà không phải chịu bất kỳ khoản phí nào.
              </p>
              <p>
                <strong>Đơn đặt bằng Gói lượt (Slot Package)</strong>: Số lượt chơi sẽ được hoàn lại theo tỷ lệ tương ứng (hoàn 100% lượt trước &gt; 24h, hoàn 50% lượt từ 12-24h và không hoàn lượt trong vòng 12h trước giờ chơi).
              </p>
              <p>
                <strong>Quy định về F&B</strong>: Đồ ăn và thức uống đã được bếp/pha chế phục vụ sẽ không được hoàn tiền.
              </p>
            </Prose>
          </section>

          {/* 3. Check-in & Bàn giao xe */}
          <section id="checkin" className="scroll-mt-24">
            <SectionTitle>3. Check-in & Bàn giao xe</SectionTitle>
            <Prose>
              <h4>Thời gian có mặt làm thủ tục</h4>
              <p>
                Quý khách vui lòng có mặt tại cơ sở và làm thủ tục check-in trong vòng <strong>30 phút kể từ giờ bắt đầu slot đã đặt</strong>. Quá 30 phút, đơn đặt sẽ được xử lý theo quy định vắng mặt (xem mục 7).
              </p>

              <h4>Quy trình bàn giao và kiểm tra hiện trạng xe thuê (RENTAL)</h4>
              <p>
                Nhằm đảm bảo tính minh bạch và bảo vệ tối đa quyền lợi của khách hàng, quy trình bàn giao xe được thực hiện trực tiếp tại quầy kỹ thuật (Pit-stop):
              </p>
              <ul>
                <li>
                  Nhân viên xuất trình xe đúng theo loại xe bạn đã chọn khi đặt lịch.
                </li>
                <li>
                  Nhân viên chụp <strong>ảnh 4 góc xe</strong> (trước, sau, trái, phải) và kiểm tra mức pin, chức năng tay điều khiển và các vết trầy xước có sẵn.
                </li>
                <li>
                  Khách hàng và nhân viên cùng đối chiếu hiện trạng thực tế tại quầy trước khi bắt đầu phiên chơi.
                </li>
                <li>
                  <strong>Bảo vệ khách hàng:</strong> Mọi vết trầy xước hoặc hư hại sẵn có (pre-existing condition) đã được ghi nhận trong biên bản check-in sẽ <strong>hoàn toàn không bị tính phí</strong> khi trả xe.
                </li>
              </ul>

              <h4>Quy trình check-in dành cho khách mang xe cá nhân (BYOC)</h4>
              <p>
                Đối với hình thức mang xe cá nhân, thủ tục vào sân diễn ra nhanh gọn và an toàn:
              </p>
              <ul>
                <li>
                  Khách hàng xuất trình mã đơn đặt lịch hoặc mã QR check-in tại quầy để nhân viên xác nhận mở phiên vào sân.
                </li>
                <li>
                  <strong>Chụp ảnh xe cá nhân khi check-in:</strong> Nhân viên chụp ảnh ghi nhận xe của từng người chơi lúc vào sân nhằm xác thực xe tham gia phiên và kiểm tra sơ bộ tiêu chuẩn an toàn (cố định pin, không có chi tiết kim loại sắc nhọn gây rách mặt thảm đường đua).
                </li>
                <li>
                  <strong>Không yêu cầu biên bản bàn giao xe quán:</strong> Vì khách sử dụng xe riêng của mình nên không phải ký nhận bàn giao trang thiết bị xe của cơ sở.
                </li>
                <li>
                  Nhân viên sẽ hướng dẫn khu vực bàn kỹ thuật (Pit-stop), trạm sạc pin an toàn và hỗ trợ kỹ thuật ban đầu nếu khách hàng có nhu cầu.
                </li>
              </ul>
            </Prose>
          </section>

          {/* 4. Bồi thường hư hại xe thuê */}
          <section id="damage" className="scroll-mt-24">
            <SectionTitle>4. Bồi thường hư hại xe thuê</SectionTitle>
            <Prose>
              <h4>Trách nhiệm bảo quản</h4>
              <p>
                Khách hàng có trách nhiệm điều khiển xe cẩn thận theo hướng dẫn của nhân viên và tuân thủ các quy tắc an toàn của đường đua.
              </p>

              <h4>Quy chế hao mòn & bồi thường</h4>
              <ul>
                <li>
                  <strong>Hao mòn tự nhiên (Miễn phí 0đ)</strong> — Các vết xước dăm nhẹ dưới gầm xe, mòn gai lốp xe trong quá trình chạy bình thường không bị tính phí.
                </li>
                <li>
                  <strong>Hư hỏng do va chạm mạnh</strong> — Trường hợp xe bị gãy cánh gió, nứt vỡ mâm bánh, hỏng servo lái, đứt láp hoặc vỡ vỏ xe do va đập mạnh hoặc sử dụng sai kỹ thuật, khách hàng có trách nhiệm bồi thường chi phí sửa chữa / thay thế linh kiện.
                </li>
              </ul>

              <h4>Quy trình xử lý bồi thường trực tiếp tại quầy</h4>
              <p>
                Mọi quy trình kiểm tra và xử lý bồi thường đều diễn ra <strong>trực tiếp tại quầy ngay lúc trả xe</strong> giữa nhân viên và khách hàng:
              </p>
              <ul>
                <li>
                  Khi khách trả xe, nhân viên cùng khách hàng kiểm tra lại xe và đối chiếu với ảnh chụp ban đầu.
                </li>
                <li>
                  Nếu phát sinh hư hại, nhân viên lập biên bản trực tiếp và nhập chi phí sửa chữa / thay thế phụ tùng theo bảng giá và quy định riêng của từng chi nhánh cụ thể.
                </li>
                <li>
                  Hai bên thống nhất biên bản kiểm tra tại chỗ.
                </li>
                <li>
                  Khách hàng thanh toán khoản phí bồi thường này cho chi nhánh bằng <strong>Tiền mặt</strong> hoặc <strong>Quét mã VietQR</strong> tại quầy để hoàn tất thủ tục trả xe.
                </li>
              </ul>
            </Prose>
          </section>

          {/* 5. Phiên chơi & Gia hạn */}
          <section id="session" className="scroll-mt-24">
            <SectionTitle>5. Phiên chơi & Gia hạn</SectionTitle>
            <Prose>
              <p>
                Phiên chơi chính thức bắt đầu sau khi hoàn tất thủ tục check-in tại quầy. Thời gian chơi được tính theo tổng các slot liên tiếp mà bạn đã đặt và được hiển thị đếm ngược thời gian thực trên ứng dụng.
              </p>

              <h4>Yêu cầu gia hạn thêm giờ (Extension)</h4>
              <p>
                Nếu muốn chơi thêm, bạn có thể thực hiện yêu cầu gia hạn (15 phút hoặc 30 phút) ngay trên ứng dụng hoặc thông báo trực tiếp cho nhân viên tại quầy:
              </p>
              <ul>
                <li>
                  Hệ thống và nhân viên sẽ kiểm tra khung giờ tiếp theo của sân đua có còn trống hay không để chấp thuận gia hạn.
                </li>
                <li>
                  Chi phí gia hạn được tính theo biểu phí của cơ sở và có thể thanh toán ngay hoặc thanh toán gộp vào bảng quyết toán cuối ca.
                </li>
              </ul>

              <h4>Chính sách khi phiên quá giờ (Overdue)</h4>
              <p>
                Khi phiên chơi vượt quá giờ kết thúc dự kiến:
              </p>
              <ul>
                <li>
                  Tính năng xin gia hạn tự động được khóa để tránh phát sinh chi phí hồi tố ngoài ý muốn.
                </li>
                <li>
                  <strong>Hệ thống không tự động phạt tiền quá giờ theo phút trễ thực tế:</strong> Quy định này nhằm bảo vệ quyền lợi của khách hàng (tránh trường hợp bạn đã kết thúc chơi đúng giờ nhưng nhân viên bận chưa kịp thao tác chốt ca trên hệ thống).
                </li>
                <li>
                  Khách hàng vui lòng chủ động liên hệ quầy thu ngân để hoàn tất các khoản thanh toán phát sinh (nếu có) và đóng phiên chơi kịp thời.
                </li>
              </ul>

              <h4>Kết thúc phiên chơi & Quyết toán</h4>
              <p>
                Khi hết thời gian ca chơi:
              </p>
              <ul>
                <li>
                  <strong>Với xe thuê (RENTAL):</strong> Quý khách đưa xe về khu vực quầy kỹ thuật (Pit-stop) để nhân viên nghiệm thu trả xe và chốt chi phí phát sinh (nếu có).
                </li>
                <li>
                  <strong>Với xe cá nhân (BYOC):</strong> Quý khách thu dọn xe và trang thiết bị cá nhân tại bàn kỹ thuật. Phiên chơi sẵn sàng kết thúc ngay mà không cần qua bước nghiệm thu xe.
                </li>
                <li>
                  <strong>Quyết toán cuối phiên:</strong> Nếu trong ca có phát sinh thêm F&B, phí gia hạn hoặc chi phí bồi thường xe thuê (nếu có), khách hàng thanh toán tại quầy bằng <strong>VietQR, VNPay hoặc Tiền mặt</strong> để nhân viên hoàn tất đóng đơn hàng.
                </li>
              </ul>
            </Prose>
          </section>

          {/* 6. Mang xe cá nhân (BYOC) */}
          <section id="byoc" className="scroll-mt-24">
            <SectionTitle>6. Mang xe cá nhân (BYOC)</SectionTitle>
            <Prose>
              <p>
                Chế độ <strong>Mang xe cá nhân (Bring Your Own Car - BYOC)</strong> cho phép người chơi mang các dòng xe RC riêng của mình đến luyện tập và thi đấu tại sân.
              </p>

              <h4>Chi phí áp dụng</h4>
              <p>
                Khách hàng mang xe riêng chỉ cần thanh toán <strong>Phí slot sân</strong>, hoàn toàn không phải trả phí thuê xe.
              </p>

              <h4>Tiêu chuẩn an toàn kỹ thuật</h4>
              <p>Xe mang vào sân phải đáp ứng các tiêu chuẩn an toàn của cơ sở:</p>
              <ul>
                <li>
                  <strong>An toàn pin</strong>: Pin xe phải được cố định chắc chắn. Chỉ sử dụng pin LiPo đạt chuẩn và bắt buộc sạc pin tại khu vực trạm sạc an toàn (Lipo Safe Bag) của quán.
                </li>
                <li>
                  <strong>Bảo vệ mặt sân</strong>: Không gắn các phụ kiện kim loại sắc nhọn nhô ra ngoài gây xước hoặc rách mặt thảm/gạch P-Tile của đường đua.
                </li>
                <li>
                  <strong>Tần số điều khiển</strong>: Tay cầm điều khiển phải sử dụng sóng 2.4GHz chuẩn để tránh hiện tượng trùng kênh hoặc nhiễu sóng với các tay đua khác.
                </li>
              </ul>

              <h4>Trách nhiệm đối với xe cá nhân</h4>
              <p>
                Người chơi tự chịu trách nhiệm bảo quản, vận hành và sửa chữa xe cá nhân của mình. Cơ sở không chịu trách nhiệm đối với các hư hỏng hoặc va chạm giữa các xe cá nhân trên sân đua trong quá trình vận hành.
              </p>

              <h4>Quy trình kết thúc phiên nhanh gọn</h4>
              <p>
                Khách hàng chơi xe cá nhân <strong>hoàn toàn không phải trải qua thủ tục trả xe (Check-out inspection)</strong>. Khi hết giờ, sau khi hoàn tất các khoản thanh toán phát sinh nếu có (món gọi thêm, gia hạn), nhân viên sẽ trực tiếp đóng phiên chơi trên hệ thống.
              </p>
            </Prose>
          </section>

          {/* 7. Quá giờ check-in / Vắng mặt */}
          <section id="overdue" className="scroll-mt-24">
            <SectionTitle>7. Quá giờ check-in / Vắng mặt</SectionTitle>
            <Prose>
              <p>
                Đơn đặt lịch được xác định là <strong>Quá giờ check-in (Vắng mặt / No-show)</strong> khi khách hàng không có mặt check-in tại cơ sở trong vòng <strong>30 phút kể từ giờ bắt đầu khung giờ đã đặt</strong> và không thực hiện hủy lịch trước theo quy định.
              </p>

              <h4>Chính sách xử lý khi quá giờ check-in</h4>
              <ul>
                <li>
                  <strong>Phí slot sân</strong>: Thu 100% (không hoàn tiền) — khoản phí này nhằm bù đắp chi phí giữ chỗ của cơ sở do khung giờ đó đã bị khóa và từ chối các lượt khách khác.
                </li>
                <li>
                  <strong>Phí thuê xe (áp dụng đơn RENTAL)</strong>: Hoàn trả 100% cho khách hàng.
                </li>
                <li>
                  <strong>Đồ ăn & thức uống đặt trước chưa chế biến</strong>: Hoàn trả 100% cho khách hàng.
                </li>
              </ul>

              <p>
                Nếu có việc đột xuất không thể đến đúng giờ, quý khách vui lòng chủ động <strong>hủy lịch trước trên ứng dụng</strong> hoặc liên hệ sớm với cơ sở để được hỗ trợ bảo lưu quyền lợi hoàn tiền theo chính sách hủy lịch.
              </p>
            </Prose>
          </section>

          {/* 8. Khiếu nại & Hỗ trợ */}
          <section id="dispute" className="scroll-mt-24">
            <SectionTitle>8. Khiếu nại & Hỗ trợ</SectionTitle>
            <Prose>
              <p>
                RCField luôn nỗ lực đem lại trải nghiệm công bằng, minh bạch và chuyên nghiệp nhất cho cộng đồng đam mê xe điều khiển từ xa.
              </p>

              <h4>Quy trình tiếp nhận và giải quyết phản hồi</h4>
              <ul>
                <li>
                  <strong>Tại cơ sở</strong>: Mọi thắc mắc về biên bản kiểm tra xe hoặc chất lượng phục vụ, quý khách vui lòng trao đổi trực tiếp với Quản lý chi nhánh tại quầy để được hỗ trợ giải quyết ngay tại chỗ.
                </li>
                <li>
                  <strong>Kênh hỗ trợ RCField</strong>: Nếu cần khiếu nại về giao dịch thanh toán hoặc thái độ phục vụ, bạn có thể gửi phản hồi qua tính năng hỗ trợ trên ứng dụng, website hoặc gửi email tới ban quản trị hệ thống. Đội ngũ hỗ trợ sẽ kiểm tra lịch sử giao dịch, dữ liệu hình ảnh và phản hồi trong vòng 24–48 giờ làm việc.
                </li>
              </ul>

              <h4>Bảo mật thông tin khách hàng</h4>
              <p>
                Mọi thông tin cá nhân của bạn (Số điện thoại, Họ tên, lịch sử đặt sân và hình ảnh kiểm tra xe) được RCField bảo mật tuyệt đối và chỉ được sử dụng cho mục đích vận hành dịch vụ tại các cơ sở.
              </p>
            </Prose>
          </section>

          {/* Footer note */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
            <p className="font-semibold text-slate-700">Lưu ý quan trọng</p>
            <p className="mt-2 leading-relaxed">
              Chính sách này áp dụng cho toàn bộ khách hàng sử dụng dịch vụ trên hệ thống RCField. Chính sách dành cho các chủ cơ sở đối tác được quy định riêng tại trang{" "}
              <Link
                to={routePaths.partnerLanding}
                className="font-semibold text-orange-600 underline underline-offset-2 hover:text-orange-700"
              >
                Hợp tác đối tác RC Cafe
              </Link>
              . RCField có quyền cập nhật các điều khoản để phù hợp với thực tế vận hành và sẽ thông báo công khai trên nền tảng khi có thay đổi.
            </p>
          </div>
        </article>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-5 text-xl font-black tracking-tight text-slate-900 md:text-2xl">
      {children}
    </h2>
  )
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 text-sm leading-7 text-slate-600 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:text-sm [&_h4]:font-black [&_h4]:text-slate-800 [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul>li]:list-disc [&_ul>li]:marker:text-orange-400">
      {children}
    </div>
  )
}
