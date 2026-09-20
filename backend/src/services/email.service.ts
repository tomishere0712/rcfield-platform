import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError, FnbOrderType, isSyntheticGuestEmail } from '../types';
import { AppDataSource } from '../config/database';
import { FnbOrder } from '../models/fnb-order.entity';
import { generateInvoicePdf } from './invoice-pdf.service';
import type { InvoiceParticipant } from './invoice-pdf.service';
import type { BookingSnapshot } from './payment.service';

type SendPasswordResetCodeInput = {
  to: string;
  code: string;
  ttlMinutes: number;
};

type SendStaffInviteInput = {
  to: string;
  fullName: string;
  inviteUrl: string;
};

type SendContestRegistrationPendingPaymentInput = {
  to: string;
  customerName: string;
  contestName: string;
  contestId: string;
  hostBranchName: string | null;
  startsAt: Date;
  entryFeeAmount: number;
  entryFeeDueAt: Date | null;
};

type SendContestRegistrationApprovedInput = {
  to: string;
  customerName: string;
  contestName: string;
  contestId: string;
  hostBranchName: string | null;
  hostBranchAddress: string | null;
  startsAt: Date;
  checkInCode: string | null;
  vehicleLabel: string | null;
};

type SendContestReminderEmailInput = {
  to: string;
  customerName: string;
  contestName: string;
  contestId: string;
  hostBranchName: string | null;
  /** Có địa chỉ thì email kèm được link chỉ đường — thứ cần nhất khi sắp phải đi. */
  hostBranchAddress: string | null;
  startsAt: Date;
  reminderLabel: string;
  checkInCode: string | null;
};

/** Ngày giờ tiếng Việt theo múi giờ Việt Nam — dùng chung cho email giải đấu. */
function formatContestDateTime(value: Date): string {
  return value.toLocaleString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/**
 * Tên giải và tên chi nhánh do provider tự đặt, nên có thể chứa `<`, `&`.
 * Nhét thẳng vào HTML thì nhẹ là vỡ layout, nặng là chèn được thẻ vào email.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Giờ và ngày tách riêng, để email nhắc lịch cho giờ cỡ chữ lớn hơn ngày. */
function formatContestTimeParts(value: Date): { time: string; date: string } {
  return {
    time: value.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
    date: value.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
  };
}

class EmailService {
  /**
   * Chặn cuối: không bao giờ gửi thư vào địa chỉ tổng hợp nội bộ.
   *
   * Tài khoản mềm (khách vãng lai, khách đặt qua Facebook) mang địa chỉ dạng
   * `{số điện thoại}@guest.rcfield.local` — chuỗi này chỉ tồn tại để thoả ràng
   * buộc duy nhất của `users.email`, KHÔNG có hòm thư nào phía sau.
   *
   * Trước khi có chốt này, mọi đơn của khách vãng lai đều kéo theo hai lá thư
   * xác nhận và hoá đơn gửi vào hư không. Thư bị trả về không ai thấy, và tỉ lệ
   * trả về cao làm giảm uy tín tên miền gửi — tức là thư gửi cho KHÁCH THẬT
   * cũng dễ rơi vào hộp rác theo.
   *
   * Đặt ở đây chứ không ở từng nơi gọi: đây là điểm nghẽn duy nhất mọi lá thư
   * đều đi qua, và bất biến "không gửi vào địa chỉ tổng hợp" thuộc về chính
   * việc gửi thư, không thuộc về từng luồng nghiệp vụ.
   */
  private hasOnlySyntheticRecipients(payload: object): boolean {
    const to = (payload as { to?: Array<{ email?: string }> }).to;
    if (!Array.isArray(to) || to.length === 0) return false;
    return to.every((recipient) => isSyntheticGuestEmail(recipient?.email));
  }

  private async brevoSend(payload: object): Promise<void> {
    if (this.hasOnlySyntheticRecipients(payload)) {
      // Mức `info`, không phải `warn`: đây là đường đi bình thường của mọi khách
      // chưa đăng ký, không phải chuyện bất thường cần ai xử lý.
      logger.info('Email', 'bỏ qua gửi thư — địa chỉ tổng hợp nội bộ');
      return;
    }

    if (env.email.provider !== 'Brevo') {
      throw new AppError('Email provider chưa được hỗ trợ', 500, 'EMAIL_PROVIDER_UNSUPPORTED');
    }
    if (!env.email.brevoApiKey) {
      throw new AppError('Brevo API key chưa được cấu hình', 500, 'BREVO_CONFIG_MISSING');
    }

    const response = await fetch(`${env.email.brevoBaseUrl}/smtp/email`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': env.email.brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.error('Brevo', `send failed status=${response.status}`, text);
      if (response.status === 401)
        throw new AppError('Brevo API key không hợp lệ', 502, 'BREVO_API_KEY_INVALID');
      if (response.status === 400 || response.status === 403) {
        throw new AppError(
          'Brevo từ chối gửi email. Vui lòng kiểm tra sender email/domain.',
          502,
          'BREVO_SENDER_NOT_VERIFIED',
        );
      }
      throw new AppError('Không thể gửi email qua Brevo', 502, 'BREVO_SEND_FAILED');
    }
  }

  async sendBookingConfirmation(bookingId: string): Promise<void> {
    const ds = AppDataSource;

    const rows = await ds.query<
      {
        booking_id: string;
        slot_start: Date;
        slot_end: Date;
        play_mode: string;
        cafe_name: string;
        cafe_address: string;
        customer_email: string;
        customer_name: string;
        contact_email: string | null;
      }[]
    >(
      `SELECT b.id AS booking_id, b.slot_start, b.slot_end, b.play_mode,
              c.name AS cafe_name, c.address AS cafe_address,
              u.email AS customer_email, u.full_name AS customer_name,
              b.snapshot->>'contact_email' AS contact_email
         FROM bookings b
         JOIN cafes c ON c.id = b.cafe_id
         JOIN users u ON u.id = b.customer_id
        WHERE b.id = $1`,
      [bookingId],
    );

    if (!rows.length) return;
    const r = rows[0];

    /*
      Địa chỉ nhận: ưu tiên email khách TỰ CHO khi đặt lịch.

      Với tài khoản mềm, `users.email` luôn là chuỗi tổng hợp từ số điện thoại —
      không gửi tới đâu được. Email thật (nếu khách cho) nằm ở ảnh chụp của ĐƠN
      HÀNG chứ không ở tài khoản, vì nó gắn với một lần đặt chứ không phải với
      danh tính.

      Chỉ đọc `users.email` thì mọi khách Facebook đều bị bỏ qua kể cả khi đã cho
      địa chỉ — và kênh email dự phòng của FR-033 không bao giờ chạy được.
    */
    const recipient = r.contact_email ?? r.customer_email;

    // Thoát SỚM, trước khi sinh mã QR và tải lên kho ảnh. Chốt cuối ở
    // `brevoSend` cũng chặn được, nhưng lúc đó đã tốn một lượt tải ảnh lên cho
    // một lá thư không bao giờ gửi.
    if (isSyntheticGuestEmail(recipient)) {
      logger.info('Email', 'bỏ qua thư xác nhận — khách chưa cho email thật', { bookingId });
      return;
    }

    const shortRef = bookingId.substring(0, 8).toUpperCase();
    const slotStart = new Date(r.slot_start);
    const slotEnd = new Date(r.slot_end);

    const QRCode = await import('qrcode');
    const qrBuffer = await QRCode.toBuffer(bookingId, {
      errorCorrectionLevel: 'M',
      width: 220,
      margin: 2,
    });
    const { uploadImage } = await import('./cloudinary.service');
    const { url: qrImageUrl } = await uploadImage({
      buffer: qrBuffer,
      folder: 'qr-checkin',
      publicIdPrefix: `qr-${bookingId.substring(0, 8)}`,
    });

    const slotLabel = slotStart.toLocaleString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const endTime = slotEnd.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const modeLabel = r.play_mode === 'RENTAL' ? 'Thuê xe tại quán' : 'Mang xe cá nhân (BYOC)';

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: recipient, name: r.customer_name }],
      subject: `✅ Đặt sân thành công — #${shortRef} | RCField`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
          <div style="background:#111827;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">RCField</span>
          </div>
          <div style="padding:32px">
            <h2 style="margin:0 0 8px">Đặt sân thành công</h2>
            <p style="color:#6b7280;margin:0 0 24px">Cảm ơn bạn đã đặt sân tại <strong>${r.cafe_name}</strong>.</p>

            <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;width:130px">Chi nhánh</td>
                <td style="padding:8px 0;font-size:13px;font-weight:600">${r.cafe_name}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Thời gian</td>
                <td style="padding:8px 0;font-size:13px">${slotLabel} – ${endTime}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Chế độ</td>
                <td style="padding:8px 0;font-size:13px">${modeLabel}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Địa chỉ</td>
                <td style="padding:8px 0;font-size:13px">${r.cafe_address}</td>
              </tr>
            </table>

            <div style="text-align:center;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111827">Mã check-in của bạn</p>
              <p style="margin:0 0 16px;font-size:12px;color:#6b7280">Xuất trình mã này khi đến quán để nhân viên kích hoạt phiên chơi</p>
              <img src="${qrImageUrl}" width="180" height="180"
                   alt="QR Check-in #${shortRef}"
                   style="display:block;margin:0 auto 12px;border:6px solid #fff;box-shadow:0 0 0 1px #e5e7eb;border-radius:8px" />
              <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.15em;color:#111827">#${shortRef}</p>
            </div>

            <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin:0">
              Hóa đơn chi tiết đã được gửi kèm trong email riêng. Nếu ảnh QR không hiển thị, dùng mã <strong>#${shortRef}</strong> để nhân viên tra cứu thủ công.
            </p>
          </div>
        </div>
      `,
    });

    logger.info('EmailService', 'booking confirmation sent', {
      bookingId,
      email: recipient,
    });
  }

  async sendBookingInvoice(bookingId: string): Promise<void> {
    const ds = AppDataSource;

    const rows = await ds.query<
      {
        slot_start: Date;
        slot_end: Date;
        play_mode: string;
        snapshot: object | null;
        cafe_name: string;
        cafe_address: string;
        cafe_phone: string | null;
        customer_email: string;
        customer_name: string;
        txn_ref: string;
        paid_at: Date;
      }[]
    >(
      `SELECT b.slot_start, b.slot_end, b.play_mode, b.snapshot,
              c.name AS cafe_name, c.address AS cafe_address, c.phone AS cafe_phone,
              u.email AS customer_email, u.full_name AS customer_name,
              pt.txn_ref, pt.created_at AS paid_at
         FROM bookings b
         JOIN cafes c ON c.id = b.cafe_id
         JOIN users u ON u.id = b.customer_id
         JOIN payment_transactions pt ON pt.booking_id = b.id AND pt.type = 'PAYMENT' AND pt.status = 'SUCCESS'
        WHERE b.id = $1
        ORDER BY pt.created_at DESC
        LIMIT 1`,
      [bookingId],
    );

    if (!rows.length) return;
    const r = rows[0];

    // Cùng quy tắc với thư xác nhận: ưu tiên email khách tự cho khi đặt lịch,
    // vì `users.email` của tài khoản mềm là chuỗi tổng hợp không gửi tới đâu.
    const snapshotForEmail = r.snapshot as { contact_email?: string } | null;
    const recipient = snapshotForEmail?.contact_email ?? r.customer_email;

    // Thoát sớm, trước khi dựng PDF hoá đơn — xem chú thích cùng loại ở
    // `sendBookingConfirmation`.
    if (isSyntheticGuestEmail(recipient)) {
      logger.info('Email', 'bỏ qua hoá đơn — khách chưa cho email thật', { bookingId });
      return;
    }

    const snapshot = r.snapshot as (BookingSnapshot & Record<string, unknown>) | null;
    if (!snapshot) return;

    const shortRef = bookingId.substring(0, 8).toUpperCase();
    const slotStart = new Date(r.slot_start);
    const slotEnd = new Date(r.slot_end);

    // Extract creation-time fields preserved in snapshot
    const trackTypeName = snapshot.track_type_name as string | null | undefined;
    const pricingLabel = snapshot.pricing_rule_label as string | null | undefined;
    const slotMultiplier = (snapshot.slot_fee_multiplier as number | undefined) ?? 1;
    const promoApplied = snapshot.promotion_applied as
      | { code: string; discount_type: string; discount_amount: number }
      | undefined;

    // Participants
    type ParticipantRow = {
      participant_type: string;
      is_primary_responsible: boolean;
      guest_name: string | null;
      guest_phone: string | null;
      user_full_name: string | null;
      user_phone: string | null;
    };
    const participantRows = (await ds.query(
      `SELECT bp.participant_type, bp.is_primary_responsible,
              bp.guest_name, bp.guest_phone,
              u.full_name AS user_full_name, u.phone AS user_phone
         FROM booking_participants bp
         LEFT JOIN users u ON u.id = bp.user_id
        WHERE bp.booking_id = $1
        ORDER BY bp.is_primary_responsible DESC, bp.created_at ASC`,
      [bookingId],
    )) as ParticipantRow[];
    const participants: InvoiceParticipant[] = participantRows.map((p) => ({
      name: p.user_full_name ?? p.guest_name ?? 'Khách',
      phone: p.user_phone ?? p.guest_phone ?? null,
      isPrimary: p.is_primary_responsible,
    }));

    // Vehicle catalog names for richer line item descriptions
    type VehicleRow = {
      catalog_name: string | null;
      tier: string | null;
      identifier: string | null;
      color: string | null;
      rental_fee_snapshot: string;
    };
    const vehicleRows = (await ds.query(
      `SELECT vc.name AS catalog_name, vc.tier, v.identifier, v.color,
              bv.rental_fee_snapshot
         FROM booking_vehicles bv
         LEFT JOIN vehicles v ON v.id = bv.vehicle_id
         LEFT JOIN vehicle_catalogs vc ON vc.id = v.catalog_id
        WHERE bv.booking_id = $1
        ORDER BY bv.created_at ASC`,
      [bookingId],
    )) as VehicleRow[];

    // Build line items
    const lineItems: Array<{ description: string; qty: number; unitPrice: number; total: number }> =
      [];

    if (snapshot.slot_fee_total > 0) {
      const hours = Math.round((slotEnd.getTime() - slotStart.getTime()) / 3_600_000);
      const pricingSuffix =
        pricingLabel && slotMultiplier > 1 ? ` · ${pricingLabel} ×${slotMultiplier}` : '';
      lineItems.push({
        description: `Phí sân (${hours}h)${pricingSuffix}`,
        qty: 1,
        unitPrice: snapshot.slot_fee_total,
        total: snapshot.slot_fee_total,
      });
    }

    const vehicleSnapshots = snapshot.vehicles;
    for (let i = 0; i < vehicleSnapshots.length; i++) {
      const v = vehicleSnapshots[i];
      const vr = vehicleRows[i];
      const vehicleName = vr?.catalog_name
        ? `${vr.catalog_name}${vr.identifier ? ` (${vr.identifier})` : ''}${vr.color ? ` · ${vr.color}` : ''}`
        : `Xe #${i + 1}`;
      if (v.rental_fee > 0) {
        lineItems.push({
          description: `Phí thuê — ${vehicleName}`,
          qty: 1,
          unitPrice: v.rental_fee,
          total: v.rental_fee,
        });
      }
    }

    if (snapshot.fnb_total > 0) {
      const fnbOrders = await ds.getRepository(FnbOrder).find({
        where: { bookingId, orderType: FnbOrderType.PRE_ORDER },
      });
      const fnbSum = fnbOrders.length
        ? fnbOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0)
        : snapshot.fnb_total;
      lineItems.push({
        description: 'Đồ ăn/uống đặt trước (F&B)',
        qty: 1,
        unitPrice: fnbSum,
        total: fnbSum,
      });
    }

    const discountAmount = snapshot.discount_amount ?? 0;
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: shortRef,
      issuedAt: new Date(r.paid_at),
      txnRef: r.txn_ref,
      cafeName: r.cafe_name,
      cafeAddress: r.cafe_address,
      cafePhone: r.cafe_phone,
      customerName: r.customer_name,
      // Trên hoá đơn cũng in địa chỉ liên lạc thật, không in chuỗi tổng hợp nội bộ.
      customerEmail: recipient,
      participants,
      slotStart,
      slotEnd,
      playMode: r.play_mode,
      trackTypeName,
      pricingLabel,
      slotMultiplier,
      lineItems,
      discountAmount,
      promoCode: promoApplied?.code ?? null,
      totalAmount: snapshot.total_charged,
    });

    const pdfBase64 = pdfBuffer.toString('base64');

    const slotLabel = slotStart.toLocaleString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const endTime = slotEnd.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const modeLabel = r.play_mode === 'RENTAL' ? 'Thuê xe tại quán' : 'Mang xe cá nhân (BYOC)';

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: recipient, name: r.customer_name }],
      subject: `Hóa đơn đặt sân #${shortRef} — RCField`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
          <div style="background:#111827;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">RCField</span>
          </div>
          <div style="padding:32px">
            <h2 style="margin:0 0 8px">Hóa đơn dịch vụ</h2>
            <p style="color:#6b7280;margin:0 0 24px">
              Hóa đơn <strong>#${shortRef}</strong> đính kèm bên dưới (file PDF).
            </p>

            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;width:130px">Chi nhánh</td>
                <td style="padding:8px 0;font-size:13px;font-weight:600">${r.cafe_name}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Địa chỉ</td>
                <td style="padding:8px 0;font-size:13px">${r.cafe_address}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Thời gian</td>
                <td style="padding:8px 0;font-size:13px">${slotLabel} – ${endTime}</td>
              </tr>
              ${
                trackTypeName
                  ? `<tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Loại sân</td>
                <td style="padding:8px 0;font-size:13px">${trackTypeName}</td>
              </tr>`
                  : ''
              }
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Chế độ</td>
                <td style="padding:8px 0;font-size:13px">${modeLabel}</td>
              </tr>
              ${
                pricingLabel && slotMultiplier > 1
                  ? `<tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Giá áp dụng</td>
                <td style="padding:8px 0;font-size:13px;color:#92400e;font-weight:600">${pricingLabel} ×${slotMultiplier}</td>
              </tr>`
                  : ''
              }
            </table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden">
              ${lineItems
                .map(
                  (item, i) => `
              <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
                <td style="padding:8px 12px;font-size:13px;color:#374151;border-top:1px solid #f3f4f6">${item.description}</td>
                <td style="padding:8px 12px;font-size:13px;text-align:right;white-space:nowrap;border-top:1px solid #f3f4f6">${item.total.toLocaleString('vi-VN')} ₫</td>
              </tr>`,
                )
                .join('')}
              ${
                discountAmount > 0
                  ? `<tr style="border-top:1px solid #d1fae5;background:#f0fdf4">
                <td style="padding:8px 12px;font-size:13px;color:#059669">Mã ưu đãi${promoApplied?.code ? ` (${promoApplied.code})` : ''}</td>
                <td style="padding:8px 12px;font-size:13px;text-align:right;color:#059669;font-weight:600">−${discountAmount.toLocaleString('vi-VN')} ₫</td>
              </tr>`
                  : ''
              }
              <tr style="border-top:2px solid #e5e7eb;background:#f3f4f6">
                <td style="padding:10px 12px;font-size:14px;font-weight:700">Tổng thanh toán</td>
                <td style="padding:10px 12px;font-size:14px;font-weight:700;text-align:right">${snapshot.total_charged.toLocaleString('vi-VN')} ₫</td>
              </tr>
            </table>

            <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin:0">
              Vui lòng lưu hóa đơn này để đối chiếu khi cần. Mọi thắc mắc liên hệ chi nhánh trực tiếp.
            </p>
          </div>
        </div>
      `,
      attachment: [
        {
          content: pdfBase64,
          name: `hoa-don-rcfield-${shortRef.toLowerCase()}.pdf`,
        },
      ],
    });

    logger.info('EmailService', 'invoice email sent', { bookingId, email: recipient });
  }

  /**
   * Đã nhận đăng ký nhưng chưa chắc suất: còn lệ phí phải trả.
   *
   * Cố ý KHÔNG nói "đăng ký thành công" — người nhận chưa trả tiền và chưa được
   * ban tổ chức duyệt, nói thành công ở đây là hứa quá tay. Mã check-in cũng chưa
   * gửi ở bước này vì suất thi đấu chưa chắc chắn.
   */
  async sendContestRegistrationPendingPayment(
    input: SendContestRegistrationPendingPaymentInput,
  ): Promise<void> {
    const startsAtLabel = formatContestDateTime(input.startsAt);
    const dueLabel = input.entryFeeDueAt ? formatContestDateTime(input.entryFeeDueAt) : null;

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: input.to, name: input.customerName }],
      subject: `Đã nhận đăng ký giải ${input.contestName} — cần thanh toán lệ phí | RCField`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
          <div style="background:#111827;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">RCField</span>
          </div>
          <div style="padding:32px">
            <h2 style="margin:0 0 8px">Đã nhận đăng ký của bạn</h2>
            <p style="color:#6b7280;margin:0 0 24px">
              Xin chào <strong>${input.customerName}</strong>, RCField đã nhận đăng ký
              <strong>${input.contestName}</strong>. Suất thi đấu được giữ sau khi bạn thanh toán lệ phí.
            </p>

            <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;width:160px">Giải đấu</td>
                <td style="padding:8px 0;font-size:13px;font-weight:600">${input.contestName}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Chi nhánh</td>
                <td style="padding:8px 0;font-size:13px">${input.hostBranchName ?? 'Đang cập nhật'}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Bắt đầu thi đấu</td>
                <td style="padding:8px 0;font-size:13px">${startsAtLabel}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Lệ phí cần thanh toán</td>
                <td style="padding:8px 0;font-size:13px;font-weight:700">${input.entryFeeAmount.toLocaleString('vi-VN')} ₫</td>
              </tr>
              ${
                dueLabel
                  ? `<tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Hạn thanh toán</td>
                <td style="padding:8px 0;font-size:13px;color:#b45309;font-weight:600">${dueLabel}</td>
              </tr>`
                  : ''
              }
            </table>

            <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:20px">
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#92400e">Bạn cần làm gì tiếp</p>
              <ol style="margin:0;padding-left:18px;color:#92400e;font-size:13px;line-height:1.7">
                <li>Thanh toán lệ phí giải để giữ suất thi đấu.</li>
                <li>Ban tổ chức duyệt danh sách sau khi lệ phí được ghi nhận.</li>
                <li>Khi được duyệt, RCField gửi email kèm <strong>mã check-in</strong> của bạn.</li>
              </ol>
              <a href="${env.frontendUrl}/contests/${input.contestId}"
                 style="display:inline-block;margin-top:16px;padding:12px 24px;background:#b45309;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:700">
                Thanh toán lệ phí
              </a>
            </div>

            <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin:24px 0 0">
              Chưa thanh toán trước hạn thì suất đăng ký sẽ được nhường cho người khác.
            </p>
          </div>
        </div>
      `,
    });
  }

  /**
   * Suất thi đấu đã chắc chắn: lệ phí xong và ban tổ chức đã duyệt.
   *
   * Đây mới là email "thành công", và là email duy nhất mang mã check-in —
   * thứ VĐV thực sự cần cầm theo trong ngày thi.
   */
  async sendContestRegistrationApproved(
    input: SendContestRegistrationApprovedInput,
  ): Promise<void> {
    const startsAtLabel = formatContestDateTime(input.startsAt);

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: input.to, name: input.customerName }],
      subject: `Bạn đã có suất thi đấu ${input.contestName} | RCField`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
          <div style="background:#111827;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">RCField</span>
          </div>
          <div style="padding:32px">
            <h2 style="margin:0 0 8px">Bạn đã có suất thi đấu</h2>
            <p style="color:#6b7280;margin:0 0 24px">
              Xin chào <strong>${input.customerName}</strong>, ban tổ chức đã duyệt đăng ký của bạn tại
              <strong>${input.contestName}</strong>. Hẹn gặp bạn ở vạch xuất phát.
            </p>

            <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;width:160px">Giải đấu</td>
                <td style="padding:8px 0;font-size:13px;font-weight:600">${input.contestName}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Địa điểm</td>
                <td style="padding:8px 0;font-size:13px">
                  <strong>${input.hostBranchName ?? 'Đang cập nhật'}</strong>
                  ${input.hostBranchAddress ? `<br /><span style="color:#6b7280">${input.hostBranchAddress}</span>` : ''}
                </td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Giờ thi đấu</td>
                <td style="padding:8px 0;font-size:13px;font-weight:600">${startsAtLabel}</td>
              </tr>
              ${
                input.vehicleLabel
                  ? `<tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Xe thi đấu</td>
                <td style="padding:8px 0;font-size:13px">${input.vehicleLabel}</td>
              </tr>`
                  : ''
              }
            </table>

            ${
              input.checkInCode
                ? `<div style="text-align:center;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600">Mã check-in của bạn</p>
              <p style="margin:0 0 16px;font-size:12px;color:#6b7280">Đọc mã này cho nhân viên khi tới nơi để được xác nhận có mặt</p>
              <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.2em">${input.checkInCode}</p>
            </div>`
                : ''
            }

            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;background:#f9fafb">
              <p style="margin:0 0 8px;font-size:14px;font-weight:700">Khi tới thi đấu</p>
              <ul style="margin:0;padding-left:18px;color:#4b5563;font-size:13px;line-height:1.7">
                <li>Có mặt trước giờ thi đấu để kịp check-in.</li>
                <li>Đọc mã check-in ở trên cho nhân viên tại quầy.</li>
                <li>Nếu bạn thuê xe của quán, nhân viên giao xe ngay lúc check-in.</li>
                <li>Nếu bạn mang xe cá nhân, nhân viên sẽ kiểm tra xe trước khi vào thi.</li>
              </ul>
              <a href="${env.frontendUrl}/contests/${input.contestId}"
                 style="display:inline-block;margin-top:16px;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:700">
                Xem chi tiết giải đấu
              </a>
            </div>

            <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin:24px 0 0">
              Không tới check-in đúng giờ thi đấu thì bạn có thể bị xử thua vắng mặt.
            </p>
          </div>
        </div>
      `,
    });
  }

  /**
   * Email nhắc lịch trước giờ thi đấu.
   *
   * Thiết kế quanh hoàn cảnh đọc: người ta mở email này trên điện thoại, thường
   * là lúc đang chuẩn bị đi. Nên ba thứ được đẩy lên trên cùng và làm to —
   * CÒN BAO LÂU, MẤY GIỜ, MÃ ĐIỂM DANH — còn phần dặn dò xuống dưới.
   *
   * Bản cũ nhét mã điểm danh vào một ô bảng cỡ 13px lẫn giữa các dòng khác,
   * trong khi đây đúng là email được mở ra ở quầy để đọc mã cho nhân viên.
   */
  async sendContestReminder(input: SendContestReminderEmailInput): Promise<void> {
    const { time, date } = formatContestTimeParts(input.startsAt);
    const contestName = escapeHtml(input.contestName);
    const customerName = escapeHtml(input.customerName);
    const branchName = input.hostBranchName ? escapeHtml(input.hostBranchName) : null;
    const branchAddress = input.hostBranchAddress ? escapeHtml(input.hostBranchAddress) : null;
    const countdown = escapeHtml(input.reminderLabel);
    const contestUrl = `${env.frontendUrl}/contests/${input.contestId}`;
    const mapsUrl = input.hostBranchAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(input.hostBranchAddress)}`
      : null;

    // Dòng xem trước trong hộp thư. Không đặt thì Gmail lấy tạm chữ đầu của
    // phần đầu email, tức là hiện mỗi chữ "RCField".
    const preheader = `${input.reminderLabel} nữa là ${input.contestName} bắt đầu — ${time} ${date}.`;

    const textContent = [
      `Xin chào ${input.customerName},`,
      `${input.reminderLabel} nữa là ${input.contestName} bắt đầu.`,
      `Thời gian: ${time} - ${date}`,
      branchName ? `Địa điểm: ${input.hostBranchName}` : null,
      branchAddress ? `Địa chỉ: ${input.hostBranchAddress}` : null,
      input.checkInCode ? `Mã điểm danh: ${input.checkInCode}` : null,
      `Xem sơ đồ đấu và kết quả: ${contestUrl}`,
      `Không điểm danh đúng giờ thì bạn có thể bị xử thua vắng mặt.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: input.to, name: input.customerName }],
      subject: `${input.reminderLabel} nữa: ${input.contestName} | RCField`,
      textContent,
      htmlContent: `
        <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3f2;padding:24px 12px">
          <tr><td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:'Helvetica Neue',Arial,sans-serif;color:#1c1b1b">

              <tr><td style="background:#1c1b1b;padding:20px 32px">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em">RCField</span>
              </td></tr>

              <tr><td style="padding:32px 32px 8px">
                <span style="display:inline-block;background:#fff1e7;color:#c2410c;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 12px;border-radius:999px">
                  ${countdown} nữa
                </span>
                <h1 style="margin:16px 0 4px;font-size:24px;line-height:1.25;font-weight:800">${contestName}</h1>
                <p style="margin:0;color:#5d5f5f;font-size:14px">Xin chào ${customerName}, sắp tới giờ thi đấu của bạn.</p>
              </td></tr>

              <tr><td style="padding:24px 32px 0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e2e1;border-radius:12px">
                  <tr><td style="padding:20px">
                    <p style="margin:0 0 2px;color:#747878;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Bắt đầu</p>
                    <p style="margin:0;font-size:28px;font-weight:800;line-height:1.1">${time}</p>
                    <p style="margin:2px 0 0;color:#5d5f5f;font-size:14px">${date}</p>
                    ${
                      branchName
                        ? `<p style="margin:14px 0 0;padding-top:14px;border-top:1px solid #f0eded;color:#747878;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Địa điểm</p>
                           <p style="margin:2px 0 0;font-size:15px;font-weight:700">${branchName}</p>
                           ${branchAddress ? `<p style="margin:2px 0 0;color:#5d5f5f;font-size:13px">${branchAddress}</p>` : ''}
                           ${mapsUrl ? `<a href="${mapsUrl}" style="display:inline-block;margin-top:8px;color:#c2410c;font-size:13px;font-weight:700;text-decoration:none">Xem đường đi &rarr;</a>` : ''}`
                        : ''
                    }
                  </td></tr>
                </table>
              </td></tr>

              ${
                input.checkInCode
                  ? `<tr><td style="padding:16px 32px 0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fcf8f8;border:1px solid #e5e2e1;border-radius:12px">
                  <tr><td align="center" style="padding:20px">
                    <p style="margin:0 0 2px;color:#747878;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Mã điểm danh</p>
                    <p style="margin:0;font-size:32px;font-weight:800;letter-spacing:0.18em">${escapeHtml(input.checkInCode)}</p>
                    <p style="margin:6px 0 0;color:#747878;font-size:12px">Đọc mã này cho nhân viên khi tới nơi</p>
                  </td></tr>
                </table>
              </td></tr>`
                  : ''
              }

              <tr><td style="padding:24px 32px 0">
                <a href="${contestUrl}" style="display:block;background:#ea580c;color:#ffffff;text-align:center;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:12px">
                  Xem sơ đồ đấu và kết quả
                </a>
              </td></tr>

              <tr><td style="padding:24px 32px 32px">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700">Trước khi đi, nhớ kiểm tra</p>
                <ul style="margin:0;padding-left:18px;color:#5d5f5f;font-size:13px;line-height:1.8">
                  <li>Đến sớm hơn giờ bắt đầu để kịp điểm danh.</li>
                  <li>Mang theo mã điểm danh ở trên.</li>
                  <li>Mang xe cá nhân thì nhân viên sẽ kiểm tra xe trước khi vào thi.</li>
                </ul>
                <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #f0eded;color:#747878;font-size:12px;line-height:1.6">
                  Không điểm danh đúng giờ thì bạn có thể bị xử thua vắng mặt.
                </p>
              </td></tr>

            </table>
          </td></tr>
        </table>
      `,
    });
  }

  async sendStaffInvite(input: SendStaffInviteInput): Promise<void> {
    const subject = 'Lời mời tham gia RCField — Kích hoạt tài khoản nhân viên';
    const textContent = [
      `Xin chào ${input.fullName},`,
      `Bạn được mời tham gia hệ thống quản lý RCField với tư cách nhân viên.`,
      `Nhấn vào link sau để kích hoạt tài khoản và đặt mật khẩu:`,
      input.inviteUrl,
      `Link có hiệu lực trong 48 giờ.`,
      `Nếu bạn không nhận ra lời mời này, vui lòng bỏ qua email này.`,
    ].join('\n\n');

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: input.to }],
      subject,
      textContent,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2>Lời mời tham gia RCField</h2>
          <p>Xin chào <strong>${input.fullName}</strong>,</p>
          <p>Bạn được mời tham gia hệ thống quản lý RCField với tư cách <strong>nhân viên</strong>.</p>
          <p>Nhấn vào nút bên dưới để kích hoạt tài khoản và đặt mật khẩu:</p>
          <p>
            <a href="${input.inviteUrl}"
               style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              Kích hoạt tài khoản
            </a>
          </p>
          <p style="color:#6b7280;font-size:13px">Link có hiệu lực trong <strong>48 giờ</strong>.</p>
          <p style="color:#6b7280;font-size:13px">Nếu bạn không nhận ra lời mời này, vui lòng bỏ qua email này.</p>
        </div>
      `,
    });
  }

  async sendPasswordResetCode(input: SendPasswordResetCodeInput): Promise<void> {
    const subject = 'Mã xác nhận đặt lại mật khẩu RCField';
    const textContent = [
      `Mã xác nhận đặt lại mật khẩu RCField của bạn là: ${input.code}`,
      `Mã có hiệu lực trong ${input.ttlMinutes} phút.`,
      'Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.',
    ].join('\n\n');

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: input.to }],
      subject,
      textContent,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2>Mã xác nhận đặt lại mật khẩu RCField</h2>
          <p>Mã xác nhận của bạn là:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:8px">${input.code}</p>
          <p>Mã có hiệu lực trong <strong>${input.ttlMinutes} phút</strong>.</p>
          <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
        </div>
      `,
    });
  }

  async sendSubscriptionConfirmed(input: {
    to: string;
    providerName: string;
    planName: string;
    amount: number;
    startDate: Date;
    endDate: Date;
  }): Promise<void> {
    const subject = `✅ Kích hoạt thành công gói hội viên ${input.planName} | RCField`;

    const formattedAmount = Number(input.amount).toLocaleString('vi-VN') + ' ₫';
    const formattedStartDate = input.startDate.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const formattedEndDate = input.endDate.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    const textContent = [
      `Xin chào ${input.providerName},`,
      `Yêu cầu thanh toán cho gói hội viên ${input.planName} của bạn đã được Admin phê duyệt thành công.`,
      `Thông tin gói hội viên của bạn:`,
      `- Gói dịch vụ: ${input.planName}`,
      `- Số tiền thanh toán: ${formattedAmount}`,
      `- Ngày kích hoạt: ${formattedStartDate}`,
      `- Ngày hết hạn: ${formattedEndDate}`,
      `Gói dịch vụ mới của bạn hiện đã có hiệu lực. Bạn có thể đăng nhập vào hệ thống để trải nghiệm ngay.`,
      `Trân trọng,`,
      `Đội ngũ RCField`,
    ].join('\n\n');

    await this.brevoSend({
      sender: { email: env.email.fromEmail, name: env.email.fromName },
      to: [{ email: input.to, name: input.providerName }],
      subject,
      textContent,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
          <div style="background:#111827;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">RCField</span>
          </div>
          <div style="padding:32px">
            <h2 style="margin:0 0 8px;color:#10b981">Xác nhận kích hoạt gói hội viên thành công</h2>
            <p style="color:#6b7280;margin:0 0 24px">
              Xin chào <strong>${input.providerName}</strong>, yêu cầu thanh toán cho gói hội viên của bạn đã được phê duyệt và kích hoạt thành công.
            </p>

            <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;width:160px">Gói dịch vụ</td>
                <td style="padding:8px 0;font-size:13px;font-weight:600;color:#111827">${input.planName}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Số tiền thanh toán</td>
                <td style="padding:8px 0;font-size:13px;font-weight:700;color:#111827">${formattedAmount}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Thời gian bắt đầu</td>
                <td style="padding:8px 0;font-size:13px;color:#111827">${formattedStartDate}</td>
              </tr>
              <tr style="border-top:1px solid #f3f4f6">
                <td style="padding:8px 0;color:#6b7280;font-size:13px">Hạn hết hạn</td>
                <td style="padding:8px 0;font-size:13px;color:#ef4444;font-weight:600">${formattedEndDate}</td>
              </tr>
            </table>

            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;background:#f9fafb;margin-bottom:24px">
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827">Bắt đầu sử dụng</p>
              <p style="margin:0;color:#4b5563;font-size:13px;line-height:1.7">
                Gói dịch vụ của bạn đã chính thức có hiệu lực. Mọi giới hạn về chi nhánh, quota AI message và kết nối kênh bán hàng của bạn đã được nâng cấp theo gói dịch vụ mới.
              </p>
              <a href="${env.frontendUrl}/provider/subscriptions"
                 style="display:inline-block;margin-top:16px;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:700">
                Quản lý gói dịch vụ
              </a>
            </div>

            <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin:0">
              Cảm ơn bạn đã lựa chọn sử dụng dịch vụ của RCField! Mọi thắc mắc vui lòng phản hồi qua email này để được hỗ trợ tốt nhất.
            </p>
          </div>
        </div>
      `,
    });
  }
}

export const emailService = new EmailService();
