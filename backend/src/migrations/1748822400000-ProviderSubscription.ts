import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderSubscription1748822400000 implements MigrationInterface {
  name = 'ProviderSubscription1748822400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "provider_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED')
    `);
    // Named "provider_subscription_status_enum" to avoid collision with the
    // legacy "subscription_status_enum" created in Phase1Completion migration.
    await queryRunner.query(`
      CREATE TYPE "provider_subscription_status_enum" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED')
    `);
    await queryRunner.query(`
      CREATE TYPE "plan_name_enum" AS ENUM ('TRIAL', 'STARTER', 'GROWTH', 'PRO')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_request_status_enum" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED')
    `);
    await queryRunner.query(`
      CREATE TYPE "notification_type_enum" AS ENUM (
        'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_UNSUSPENDED',
        'TRIAL_EXPIRING_SOON', 'GRACE_PERIOD_STARTED', 'SUBSCRIPTION_EXPIRED',
        'SUBSCRIPTION_ACTIVATED', 'PAYMENT_REQUEST_CONFIRMED', 'PAYMENT_REQUEST_REJECTED'
      )
    `);

    // ── provider_profiles ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "provider_profiles" (
        "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"               UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "business_name"         VARCHAR(255) NOT NULL,
        "business_description"  TEXT,
        "registration_status"   "provider_status_enum" NOT NULL DEFAULT 'PENDING',
        "rejection_reason"      TEXT,
        "suspended_at"          TIMESTAMPTZ,
        "suspended_reason"      TEXT,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"            TIMESTAMPTZ
      )
    `);

    // ── subscription_plans ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "subscription_plans" (
        "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"                "plan_name_enum" NOT NULL UNIQUE,
        "branch_limit"        INT NOT NULL,
        "ai_quota_per_month"  INT NOT NULL,
        "channel_limit"       INT NOT NULL,
        "price_per_month"     DECIMAL(12,2) NOT NULL,
        "is_trial"            BOOLEAN NOT NULL DEFAULT false,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // ── provider_subscriptions ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "provider_subscriptions" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "plan_id"           UUID NOT NULL REFERENCES "subscription_plans"("id"),
        "status"            "provider_subscription_status_enum" NOT NULL,
        "started_at"        TIMESTAMPTZ NOT NULL,
        "expires_at"        TIMESTAMPTZ NOT NULL,
        "grace_ends_at"     TIMESTAMPTZ,
        "ai_messages_used"  INT NOT NULL DEFAULT 0,
        "ai_quota_reset_at" TIMESTAMPTZ NOT NULL,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"        TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_provider_subscriptions_provider_status"
        ON "provider_subscriptions" ("provider_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_provider_subscriptions_expires_status"
        ON "provider_subscriptions" ("expires_at", "status")
    `);

    // ── payment_requests ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payment_requests" (
        "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"        UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "plan_id"            UUID NOT NULL REFERENCES "subscription_plans"("id"),
        "status"             "payment_request_status_enum" NOT NULL DEFAULT 'PENDING',
        "transfer_reference" VARCHAR(255) NOT NULL,
        "transfer_date"      DATE NOT NULL,
        "transfer_amount"    DECIMAL(12,2) NOT NULL,
        "admin_notes"        TEXT,
        "reviewed_by"        UUID REFERENCES "users"("id"),
        "reviewed_at"        TIMESTAMPTZ,
        "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"         TIMESTAMPTZ
      )
    `);

    // ── notifications ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type"       "notification_type_enum" NOT NULL,
        "title"      VARCHAR(255) NOT NULL,
        "message"    TEXT NOT NULL,
        "read_at"    TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notifications_user_read_at"
        ON "notifications" ("user_id", "read_at")
    `);

    // ── Seed subscription_plans ────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "subscription_plans"
        ("name", "branch_limit", "ai_quota_per_month", "channel_limit", "price_per_month", "is_trial")
      VALUES
        ('TRIAL',   1,  500,   1, 0.00,        true),
        ('STARTER', 1,  1000,  1, 299000.00,   false),
        ('GROWTH',  3,  5000,  3, 699000.00,   false),
        ('PRO',    -1,  -1,   -1, 1499000.00,  false)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_profiles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_request_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plan_name_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "provider_subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "provider_status_enum"`);
  }
}
