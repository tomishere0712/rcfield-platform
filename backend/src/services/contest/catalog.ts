import { AppDataSource } from '../../config/database';
import { ContestFormat } from '../../models/contest-format.entity';
import { ContestTemplate } from '../../models/contest-template.entity';
import { ContestType } from '../../models/contest-type.entity';

export async function listContestTypes() {
  return AppDataSource.getRepository(ContestType).find({
    where: { isActive: true },
    order: { sortOrder: 'ASC', name: 'ASC' },
  });
}

export async function listContestFormats() {
  return AppDataSource.getRepository(ContestFormat).find({
    where: { isActive: true },
    order: { sortOrder: 'ASC', name: 'ASC' },
  });
}

export async function listContestTemplates(query: {
  contest_type_id?: string;
  contest_format_id?: string;
  active_only?: boolean;
}) {
  const repo = AppDataSource.getRepository(ContestTemplate);
  const where: Record<string, unknown> = {};
  if (query.contest_type_id) where.contestTypeId = query.contest_type_id;
  if (query.contest_format_id) where.contestFormatId = query.contest_format_id;
  if (query.active_only ?? true) where.isActive = true;

  const templates = await repo.find({
    where,
    order: { sortOrder: 'ASC', name: 'ASC' },
  });
  return templates;
}
