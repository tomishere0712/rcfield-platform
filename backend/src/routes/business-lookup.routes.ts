import { Router } from 'express';
import { providerOnboardingController } from '../controllers/provider-onboarding.controller';

/**
 * Tra mã số thuế trên dữ liệu Cục Thuế.
 *
 * Router riêng thay vì gắn nhờ vào `providerOnboardingRouter`: router đó nằm
 * dưới tiền tố `/auth`, mà tra mã số thuế không phải việc của xác thực. Gắn nhờ
 * thì đường dẫn thật thành `/api/v1/auth/business-lookup/...` — lệch hẳn với
 * tên gọi và là nguyên nhân của một lần 404.
 *
 * Để công khai vì người đăng ký chưa có tài khoản, và dữ liệu này vốn đã công
 * khai trên cổng Cục Thuế.
 */
export const businessLookupRouter = Router();

businessLookupRouter.get('/:taxCode', providerOnboardingController.lookupBusiness);
