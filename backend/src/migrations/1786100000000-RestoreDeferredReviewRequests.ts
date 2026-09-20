import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Before review snoozing existed, the only “Để sau” action wrote
 * review_dismissed_at permanently. There was no separate “do not remind”
 * choice, so restore those legacy requests to the current defer-only policy.
 * Expired or already reviewed bookings remain ineligible through the existing
 * pending-review rules.
 */
export class RestoreDeferredReviewRequests1786100000000 implements MigrationInterface {
  name = 'RestoreDeferredReviewRequests1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE bookings b
      SET review_dismissed_at = NULL
      WHERE b.review_dismissed_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM reviews r WHERE r.booking_id = b.id
        )
    `);
  }

  public async down(): Promise<void> {
    // The old timestamp was not a durable business decision and cannot be
    // reconstructed safely. Keeping it cleared is the safe rollback state.
  }
}
