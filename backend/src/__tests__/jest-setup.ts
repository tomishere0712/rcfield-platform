import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { redis } from '../config/redis';

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      close: jest.fn(),
      on: jest.fn(),
    })),
  };
});

jest.mock('../services/email.service', () => ({
  emailService: {
    sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
    sendBookingInvoice: jest.fn().mockResolvedValue(undefined),
    sendContestRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
    sendContestReminder: jest.fn().mockResolvedValue(undefined),
    sendStaffInvite: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
    sendSubscriptionConfirmed: jest.fn().mockResolvedValue(undefined),
    sendContestRegistrationPendingPayment: jest.fn().mockResolvedValue(undefined),
    sendContestRegistrationApproved: jest.fn().mockResolvedValue(undefined),
  },
}));

// Kết nối DB trước khi test file chạy
beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
});

// Xóa sạch data sau mỗi test — CASCADE tự xử lý FK
beforeEach(async () => {
  await AppDataSource.query(`
    TRUNCATE TABLE
      featured_popups,
      contest_fee_orders,
      race_records,
      achievement_definitions,
      contest_bans,
      contest_audit_logs,
      contest_staff_assignments,
      contest_match_participants,
      contest_matches,
      contest_ledger_entries,
      contest_registrations,
      contest_cafes,
      contests,
      reviews,
      vehicle_maintenance_logs,
      fnb_order_items,
      fnb_orders,
      extension_proposals,
      inspection_checklists,
      inspection_photos,
      inspections,
      bank_transactions,
      payment_transactions,
      payment_components,
      bookings,
      menu_items,
      promotions,
      vehicle_catalog_images,
      vehicles,
      staff_cafe_assignments,
      cafe_payment_settings,
      cafe_images,
      kb_chunks,
      kb_documents,
      feature_flags,
      cafes,
      password_reset_tokens,
      refresh_tokens,
      users
    RESTART IDENTITY CASCADE
  `);
});

// Đóng connection sau khi test file xong
afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  try {
    await redis.quit();
  } catch {
    // ignore
  }
});
