import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Before the non-blocking handover policy, a rental session with a completed
 * staff check-in inspection remained CHECKED_IN until the customer opened the
 * app and confirmed. Those records now represent a completed physical handover
 * and must be operationally active like newly created records.
 */
export class ActivateCompletedHandoverSessions1785800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH completed_checkins AS (
        SELECT session_id, MAX(created_at) AS completed_at
        FROM inspections
        WHERE type = 'CHECK_IN'
        GROUP BY session_id
      ),
      activated_sessions AS (
        UPDATE sessions session
        SET
          status = 'ACTIVE',
          actual_start_at = COALESCE(session.actual_start_at, completed_checkins.completed_at),
          updated_at = NOW()
        FROM completed_checkins
        WHERE session.id = completed_checkins.session_id
          AND session.status = 'CHECKED_IN'
        RETURNING session.id, session.actual_start_at
      ),
      activated_rental_vehicles AS (
        UPDATE session_vehicles session_vehicle
        SET
          status = 'IN_USE',
          started_at = COALESCE(session_vehicle.started_at, activated_sessions.actual_start_at),
          updated_at = NOW()
        FROM activated_sessions
        WHERE session_vehicle.session_id = activated_sessions.id
          AND session_vehicle.vehicle_source = 'RENTAL'
          AND session_vehicle.status = 'ASSIGNED'
        RETURNING session_vehicle.vehicle_id
      )
      UPDATE vehicles vehicle
      SET status = 'IN_USE', updated_at = NOW()
      WHERE vehicle.id IN (
        SELECT vehicle_id
        FROM activated_rental_vehicles
        WHERE vehicle_id IS NOT NULL
      );
    `);
  }

  // This policy/data correction cannot be safely reversed without knowing
  // whether a customer has already received the vehicle.
  public async down(): Promise<void> {}
}
