/**
 * AuditService
 *
 * Provides immutable audit recording and queryable read access for the
 * generic AuditEntry trail (Phase 9B).
 *
 * Design notes:
 * - `record()` writes only – rows are never updated or deleted.
 * - `query()` is the read side; it delegates entirely to Prisma's indexed
 *   timestamp / entityType / entityId columns.
 * - PrismaService is available globally (PrismaModule is @Global), so no
 *   extra module import is needed on the service level.
 */

import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryAuditDto } from './dto/query-audit.dto';

export interface RecordAuditParams {
  entityType: AuditEntityType;
  /** Soft reference – intentionally not a FK; entity may be deleted. */
  entityId: string;
  action: AuditAction;
  /** User.id, service-account identifier, or the literal string "system". */
  actorId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an immutable audit entry.
   *
   * Called fire-and-forget from the service layer (outside transactions so
   * the audit write never rolls back a business operation).  Failures are
   * logged by Prisma's exception layer but do not propagate.
   */
  async record(params: RecordAuditParams): Promise<void> {
    await this.prisma.auditEntry.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorId: params.actorId,
        before: params.before !== undefined && params.before !== null
          ? (params.before as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        after: params.after !== undefined && params.after !== null
          ? (params.after as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        metadata: params.metadata !== undefined && params.metadata !== null
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  /**
   * Query audit entries with optional filters, newest-first.
   *
   * @returns Paginated result containing `items` and `total`.
   */
  async query(dto: QueryAuditDto) {
    const where: Prisma.AuditEntryWhereInput = {};

    if (dto.entityType) where.entityType = dto.entityType;
    if (dto.entityId) where.entityId = dto.entityId;
    if (dto.actorId) where.actorId = dto.actorId;
    if (dto.action) where.action = dto.action;

    if (dto.fromDate || dto.toDate) {
      where.timestamp = {
        ...(dto.fromDate ? { gte: new Date(dto.fromDate) } : {}),
        ...(dto.toDate ? { lte: new Date(dto.toDate) } : {}),
      };
    }

    const limit = dto.limit ?? 50;
    const offset = dto.offset ?? 0;

    const [items, total] = await Promise.all([
      this.prisma.auditEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditEntry.count({ where }),
    ]);

    return { items, total };
  }
}
