import { Request, Response, NextFunction } from 'express';
import * as payosService from '../services/payos.service';
import * as contestFeeService from '../services/contest-fee.service';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { PaymentRequest } from '../models/payment-request.entity';
import { AppError } from '../types';

export const payosController = {
  /**
   * Xử lý webhook tự động từ PayOS gửi về khi trạng thái giao dịch thay đổi
   */
  async handleWebhook(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const webhookData = await payosService.verifyWebhookData(req.body);
      const orderCode = webhookData.orderCode;
      // Theo tài liệu PayOS, code === "00" là giao dịch thành công.
      const isSuccess = webhookData.code === '00';

      logger.info('PayOS Webhook', 'nhận dữ liệu đã xác thực', {
        orderCode,
        code: webhookData.code,
      });

      // Một mã đơn thuộc về đúng một bảng. Tra gói đăng ký trước vì đó là luồng
      // có sẵn, không tìm thấy mới sang đơn phí tổ chức giải.
      const request = await AppDataSource.getRepository(PaymentRequest).findOne({
        where: { transferReference: String(orderCode) },
      });

      if (request) {
        if (isSuccess) {
          await payosService.handlePayOSPaid(request);
          logger.info('PayOS Webhook', 'gói đăng ký đã trả, chờ admin duyệt', {
            paymentRequestId: request.id,
          });
        } else {
          await payosService.handlePaymentFailed(
            request,
            `PayOS báo giao dịch thất bại. Code: ${webhookData.code}`,
          );
          logger.warn('PayOS Webhook', 'gói đăng ký bị từ chối', { paymentRequestId: request.id });
        }
      } else {
        const feeOrder = await contestFeeService.findContestFeeOrderByPayOSCode(orderCode);
        if (feeOrder) {
          if (isSuccess) {
            // Khác gói đăng ký: đơn phí sang PAID luôn, không chờ admin đối soát.
            await contestFeeService.markContestFeeOrderPaidViaPayOS(feeOrder);
            logger.info('PayOS Webhook', 'phí tổ chức giải đã thanh toán', {
              contestFeeOrderId: feeOrder.id,
            });
          } else {
            await contestFeeService.markContestFeePayOSFailed(
              feeOrder,
              `PayOS báo giao dịch thất bại. Code: ${webhookData.code}`,
            );
            logger.warn('PayOS Webhook', 'phí tổ chức giải trả không thành công', {
              contestFeeOrderId: feeOrder.id,
            });
          }
        } else {
          logger.warn('PayOS Webhook', 'không tìm thấy đơn nào khớp mã', { orderCode });
        }
      }

      // Luôn trả về phản hồi thành công theo đúng đặc tả của PayOS để dừng việc gửi lại webhook
      res.json({
        code: '00',
        desc: 'success',
        data: null,
      });
    } catch (err) {
      logger.error('PayOS Webhook', 'xử lý webhook lỗi', err);
      // Mặc dù lỗi nhưng vẫn trả về code 00 cho PayOS để tránh việc họ retry liên tục làm treo hệ thống
      res.json({
        code: '00',
        desc: 'processed with error',
        data: null,
      });
    }
  },

  /**
   * API cho FE gọi lên kiểm tra nhanh trạng thái thanh toán ngay khi redirect
   * POST /api/v1/payments/payos/verify-payment
   */
  async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderCode } = req.body;
      if (!orderCode) {
        return next(new AppError('Thiếu thông tin mã đơn hàng orderCode', 400, 'VALIDATION_ERROR'));
      }

      const numOrderCode = Number(orderCode);
      if (Number.isNaN(numOrderCode)) {
        return next(new AppError('orderCode phải là một số hợp lệ', 400, 'VALIDATION_ERROR'));
      }

      const request = await payosService.verifyPaymentStatus(numOrderCode);
      res.json({
        success: true,
        data: request,
      });
    } catch (err) {
      next(err);
    }
  },
};
