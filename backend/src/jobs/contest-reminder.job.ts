import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { ContestRegistration } from '../models/contest-registration.entity';
import { Contest } from '../models/contest.entity';
import { writeContestAudit } from '../services/contest.helpers';
import { emailService } from '../services/email.service';
import { createNotification } from '../services/notification.service';
import { ContestRegistrationStatus, ContestStatus, NotificationType } from '../types';

type ReminderCandidate = {
  registration_id: string;
  user_id: string;
  check_in_code: string | null;
  metadata: Record<string, unknown> | null;
  contest_id: string;
  contest_name: string;
  contest_starts_at: string;
  contest_status: ContestStatus;
  host_branch_name: string | null;
  host_branch_address: string | null;
  customer_email: string;
  customer_name: string | null;
};

function getReminderState(metadata: Record<string, unknown> | null | undefined) {
  const reminders = (metadata?.contest_reminders ?? {}) as Record<string, unknown>;
  return {
    reminder24hSentAt:
      typeof reminders.reminder_24h_sent_at === 'string' ? reminders.reminder_24h_sent_at : null,
    reminder2hSentAt:
      typeof reminders.reminder_2h_sent_at === 'string' ? reminders.reminder_2h_sent_at : null,
  };
}

export async function processContestReminders() {
  const rows = await AppDataSource.query<ReminderCandidate[]>(
    `SELECT cr.id AS registration_id,
            cr.user_id,
            cr.check_in_code,
            cr.metadata,
            c.id AS contest_id,
            c.name AS contest_name,
            c.starts_at AS contest_starts_at,
            c.status AS contest_status,
            host.name AS host_branch_name,
            host.address AS host_branch_address,
            u.email AS customer_email,
            u.full_name AS customer_name
       FROM contest_registrations cr
       JOIN contests c ON c.id = cr.contest_id
       JOIN users u ON u.id = cr.user_id
       LEFT JOIN cafes host ON host.id = c.cafe_id
      WHERE cr.status IN ($1, $2)
        AND c.status IN ($3, $4, $5)
        AND c.starts_at >= NOW()
        AND c.starts_at <= NOW() + INTERVAL '24 hours'`,
    [
      ContestRegistrationStatus.PENDING,
      ContestRegistrationStatus.CONFIRMED,
      ContestStatus.OPEN,
      ContestStatus.CLOSED,
      ContestStatus.RUNNING,
    ],
  );

  const repo = AppDataSource.getRepository(ContestRegistration);

  for (const row of rows) {
    try {
      const startsAt = new Date(row.contest_starts_at);
      const diffMs = startsAt.getTime() - Date.now();
      if (diffMs <= 0) continue;

      const diffHours = diffMs / (1000 * 60 * 60);
      const reminderState = getReminderState(row.metadata);
      let reminderKey: 'reminder_24h_sent_at' | 'reminder_2h_sent_at' | null = null;
      let reminderLabel: string | null = null;

      if (diffHours <= 2.25 && diffHours > 0 && !reminderState.reminder2hSentAt) {
        reminderKey = 'reminder_2h_sent_at';
        reminderLabel = 'Còn 2 giờ';
      } else if (diffHours <= 24.25 && diffHours > 2.25 && !reminderState.reminder24hSentAt) {
        reminderKey = 'reminder_24h_sent_at';
        reminderLabel = 'Còn 24 giờ';
      }

      if (!reminderKey || !reminderLabel) continue;

      await createNotification(
        row.user_id,
        NotificationType.CONTEST_REMINDER,
        `Nhắc lịch: ${row.contest_name}`,
        `${reminderLabel} nữa là ${row.contest_name} bắt đầu. Nhớ mang mã điểm danh và có mặt đúng giờ.`,
        {
          contest_id: row.contest_id,
          registration_id: row.registration_id,
          reminder_key: reminderKey,
        },
      );

      try {
        await emailService.sendContestReminder({
          to: row.customer_email,
          customerName: row.customer_name ?? 'Racer',
          contestName: row.contest_name,
          contestId: row.contest_id,
          hostBranchName: row.host_branch_name,
          hostBranchAddress: row.host_branch_address,
          startsAt,
          reminderLabel,
          checkInCode: row.check_in_code,
        });
      } catch (error) {
        logger.error('ContestReminder', 'failed to send reminder email', error);
      }

      const registration = await repo.findOne({ where: { id: row.registration_id } });
      if (!registration) continue;
      const nextMetadata = {
        ...(registration.metadata ?? {}),
        contest_reminders: {
          ...(((registration.metadata ?? {}).contest_reminders as
            | Record<string, unknown>
            | undefined) ?? {}),
          [reminderKey]: new Date().toISOString(),
        },
      };
      registration.metadata = nextMetadata;
      await repo.save(registration);
    } catch (error) {
      logger.error('ContestReminder', 'failed to process reminder', error);
    }
  }
}

export async function processContestAutoClose() {
  const repo = AppDataSource.getRepository(Contest);
  const openContests = await repo.find({
    where: { status: ContestStatus.OPEN },
  });

  for (const contest of openContests) {
    try {
      if (!contest.registrationClosesAt) continue;
      if (contest.registrationClosesAt.getTime() > Date.now()) continue;

      contest.status = ContestStatus.CLOSED;
      await repo.save(contest);
      await writeContestAudit({
        contestId: contest.id,
        actorId: null,
        actorRole: 'SYSTEM',
        eventType: 'contest.auto_closed',
        afterJson: { status: ContestStatus.CLOSED },
      });
      logger.info('ContestAutoClose', `contest ${contest.id} auto-closed`, {
        contestId: contest.id,
      });
    } catch (error) {
      logger.error('ContestAutoClose', 'failed to auto-close contest', error);
    }
  }
}

export function startContestReminderJob() {
  cron.schedule('*/15 * * * *', async () => {
    await processContestReminders();
    await processContestAutoClose();
  });

  logger.info('ContestReminder', 'Cron scheduled - runs every 15 minutes');
}
