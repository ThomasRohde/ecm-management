import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MappingState } from './dto/create-mapping.dto';
import type { CreateMappingDto } from './dto/create-mapping.dto';
import type { UpdateMappingDto } from './dto/update-mapping.dto';
import type { ListMappingsDto } from './dto/list-mappings.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;

export interface MappingListResult {
  items: Prisma.MappingGetPayload<{ include: { capability: true } }>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class MappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ── List ──────────────────────────────────────────────────────────────────

  async findAll(params: ListMappingsDto): Promise<MappingListResult> {
    const page = Math.max(1, params.page ?? DEFAULT_PAGE);
    const limit = Math.min(100, Math.max(1, params.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.MappingWhereInput = {
      ...(params.state != null && { state: params.state }),
      ...(params.mappingType != null && { mappingType: params.mappingType }),
      ...(params.systemId != null && { systemId: params.systemId }),
      ...(params.capabilityId != null && { capabilityId: params.capabilityId }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.mapping.findMany({
        where,
        include: { capability: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.mapping.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Read one ──────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const mapping = await this.prisma.mapping.findUnique({
      where: { id },
      include: { capability: true },
    });
    if (!mapping) {
      throw new NotFoundException(`Mapping with id "${id}" not found`);
    }
    return mapping;
  }

  // ── By capability ─────────────────────────────────────────────────────────

  async findByCapability(capabilityId: string) {
    // Verify the capability exists first so we return 404, not an empty list,
    // when the caller references a non-existent capability.
    const capability = await this.prisma.capability.findUnique({
      where: { id: capabilityId },
      select: { id: true },
    });
    if (!capability) {
      throw new NotFoundException(`Capability with id "${capabilityId}" not found`);
    }

    return this.prisma.mapping.findMany({
      where: { capabilityId },
      include: { capability: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── By system ─────────────────────────────────────────────────────────────

  async findBySystem(systemId: string) {
    return this.prisma.mapping.findMany({
      where: { systemId },
      include: { capability: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateMappingDto) {
    // Validate the target capability exists and is not RETIRED.
    const capability = await this.prisma.capability.findUnique({
      where: { id: dto.capabilityId },
      select: { id: true, lifecycleStatus: true },
    });
    if (!capability) {
      throw new NotFoundException(`Capability with id "${dto.capabilityId}" not found`);
    }
    if (capability.lifecycleStatus === 'RETIRED') {
      throw new BadRequestException(
        `Cannot map to capability "${dto.capabilityId}": capability is RETIRED`,
      );
    }

    const mapping = await this.prisma.mapping.create({
      data: {
        mappingType: dto.mappingType,
        systemId: dto.systemId,
        capabilityId: dto.capabilityId,
        state: dto.state ?? MappingState.ACTIVE,
        attributes:
        dto.attributes != null ? (dto.attributes as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      include: { capability: true },
    });

    void this.auditService.record({
      entityType: AuditEntityType.MAPPING,
      entityId: mapping.id,
      action: AuditAction.CREATE,
      actorId: 'system',
      after: { systemId: mapping.systemId, capabilityId: mapping.capabilityId, state: mapping.state },
    });

    return mapping;
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateMappingDto) {
    const data: Prisma.MappingUpdateInput = {};
    if (dto.mappingType !== undefined) data.mappingType = dto.mappingType;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.attributes !== undefined) {
      data.attributes = dto.attributes as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }

    try {
      const mapping = await this.prisma.mapping.update({
        where: { id },
        data,
        include: { capability: true },
      });

      void this.auditService.record({
        entityType: AuditEntityType.MAPPING,
        entityId: id,
        action: AuditAction.UPDATE,
        actorId: 'system',
        after: data as Record<string, unknown>,
      });

      return mapping;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Mapping with id "${id}" not found`);
      }
      throw error;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.mapping.delete({ where: { id } });

      void this.auditService.record({
        entityType: AuditEntityType.MAPPING,
        entityId: id,
        action: AuditAction.DELETE,
        actorId: 'system',
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Mapping with id "${id}" not found`);
      }
      throw error;
    }
  }
}
