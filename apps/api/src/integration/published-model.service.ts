import { Injectable, NotFoundException } from '@nestjs/common';
import { BranchType, ModelVersionState, type ModelVersion } from '@prisma/client';
import type { ExportedCapability } from '../export/export.types';
import { PrismaService } from '../prisma/prisma.service';
import { ModelVersionService } from '../versioning/model-version.service';

const publishedCapabilityTypes = ['ABSTRACT', 'LEAF'] as const;
const publishedLifecycleStatuses = ['DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED'] as const;

export interface PublishedCapability {
  id: string;
  uniqueName: string;
  aliases: string[];
  description: string | null;
  domain: string | null;
  type: ExportedCapability['type'];
  parentId: string | null;
  lifecycleStatus: ExportedCapability['lifecycleStatus'];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  rationale: string | null;
  sourceReferences: string[];
  tags: string[];
  stewardId: string | null;
  stewardDepartment: string | null;
  nameGuardrailOverride: boolean;
  nameGuardrailOverrideRationale: string | null;
  isErroneous: boolean;
  erroneousReason: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PublishedModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modelVersionService: ModelVersionService,
  ) {}

  async listCapabilities() {
    const release = await this.findLatestPublishedRelease();
    const items = await this.buildPublishedCapabilities(release.id);

    return {
      release,
      items,
      total: items.length,
    };
  }

  async getCapabilitySubtree(capabilityId: string) {
    const release = await this.findLatestPublishedRelease();
    const items = await this.buildPublishedCapabilities(release.id);
    const orderedItems = this.selectSubtree(items, capabilityId);

    return {
      release,
      rootCapabilityId: capabilityId,
      items: orderedItems,
      total: orderedItems.length,
    };
  }

  async listReleases() {
    const items = await this.prisma.modelVersion.findMany({
      where: {
        branchType: BranchType.MAIN,
        state: {
          in: [ModelVersionState.PUBLISHED, ModelVersionState.ROLLED_BACK],
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items,
      total: items.length,
    };
  }

  async getReleaseDiff(releaseId: string) {
    const release = await this.prisma.modelVersion.findFirst({
      where: {
        id: releaseId,
        branchType: BranchType.MAIN,
        state: {
          in: [ModelVersionState.PUBLISHED, ModelVersionState.ROLLED_BACK],
        },
      },
    });

    if (!release) {
      throw new NotFoundException(`Published release with ID "${releaseId}" not found`);
    }

    return this.modelVersionService.computeDiff(release.baseVersionId ?? release.id, release.id);
  }

  private async findLatestPublishedRelease(): Promise<ModelVersion> {
    const release = await this.prisma.modelVersion.findFirst({
      where: {
        branchType: BranchType.MAIN,
        state: ModelVersionState.PUBLISHED,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!release) {
      throw new NotFoundException('No published MAIN release is available yet');
    }

    return release;
  }

  private async buildPublishedCapabilities(versionId: string): Promise<PublishedCapability[]> {
    const capabilityState = await this.modelVersionService.getCapabilityStateAtVersion(versionId);
    const items: PublishedCapability[] = [];

    for (const [capabilityId, snapshot] of capabilityState) {
      if (!snapshot) {
        continue;
      }

      items.push(this.normalizeCapabilitySnapshot(capabilityId, snapshot));
    }

    return items.sort((left, right) => left.uniqueName.localeCompare(right.uniqueName));
  }

  private selectSubtree(
    items: PublishedCapability[],
    rootCapabilityId: string,
  ): PublishedCapability[] {
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const root = itemsById.get(rootCapabilityId);

    if (!root) {
      throw new NotFoundException(
        `Published capability subtree root "${rootCapabilityId}" was not found in the latest release`,
      );
    }

    const childrenByParent = new Map<string | null, PublishedCapability[]>();

    for (const item of items) {
      const bucket = childrenByParent.get(item.parentId) ?? [];
      bucket.push(item);
      childrenByParent.set(item.parentId, bucket);
    }

    for (const bucket of childrenByParent.values()) {
      bucket.sort((left, right) => left.uniqueName.localeCompare(right.uniqueName));
    }

    const orderedItems: PublishedCapability[] = [];
    const stack: PublishedCapability[] = [root];

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      orderedItems.push(current);

      const children = childrenByParent.get(current.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }

    return orderedItems;
  }

  private normalizeCapabilitySnapshot(
    capabilityId: string,
    snapshot: Record<string, unknown>,
  ): PublishedCapability {
    return {
      id: capabilityId,
      uniqueName: this.requireString(snapshot, 'uniqueName'),
      aliases: this.optionalStringArray(snapshot, 'aliases'),
      description: this.optionalString(snapshot, 'description'),
      domain: this.optionalString(snapshot, 'domain'),
      type: this.requireStringUnion(snapshot, 'type', publishedCapabilityTypes),
      parentId: this.optionalString(snapshot, 'parentId'),
      lifecycleStatus: this.requireStringUnion(
        snapshot,
        'lifecycleStatus',
        publishedLifecycleStatuses,
      ),
      effectiveFrom: this.optionalDate(snapshot, 'effectiveFrom'),
      effectiveTo: this.optionalDate(snapshot, 'effectiveTo'),
      rationale: this.optionalString(snapshot, 'rationale'),
      sourceReferences: this.optionalStringArray(snapshot, 'sourceReferences'),
      tags: this.optionalStringArray(snapshot, 'tags'),
      stewardId: this.optionalString(snapshot, 'stewardId'),
      stewardDepartment: this.optionalString(snapshot, 'stewardDepartment'),
      nameGuardrailOverride: this.optionalBoolean(snapshot, 'nameGuardrailOverride'),
      nameGuardrailOverrideRationale: this.optionalString(
        snapshot,
        'nameGuardrailOverrideRationale',
      ),
      isErroneous: this.optionalBoolean(snapshot, 'isErroneous'),
      erroneousReason: this.optionalString(snapshot, 'erroneousReason'),
      createdAt: this.requireDate(snapshot, 'createdAt'),
      updatedAt: this.requireDate(snapshot, 'updatedAt'),
    };
  }

  private requireString(snapshot: Record<string, unknown>, key: string): string {
    const value = snapshot[key];
    if (typeof value !== 'string') {
      throw new Error(`Published capability snapshot is missing a string "${key}" field`);
    }

    return value;
  }

  private requireStringUnion<T extends readonly string[]>(
    snapshot: Record<string, unknown>,
    key: string,
    allowedValues: T,
  ): T[number] {
    const value = this.requireString(snapshot, key);
    if (!allowedValues.includes(value)) {
      throw new Error(
        `Published capability snapshot has invalid "${key}" value "${value}"`,
      );
    }

    return value as T[number];
  }

  private optionalString(snapshot: Record<string, unknown>, key: string): string | null {
    const value = snapshot[key];
    return typeof value === 'string' ? value : null;
  }

  private optionalBoolean(snapshot: Record<string, unknown>, key: string): boolean {
    return snapshot[key] === true;
  }

  private optionalStringArray(snapshot: Record<string, unknown>, key: string): string[] {
    const value = snapshot[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private requireDate(snapshot: Record<string, unknown>, key: string): string {
    const value = snapshot[key];
    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    throw new Error(`Published capability snapshot is missing a date "${key}" field`);
  }

  private optionalDate(snapshot: Record<string, unknown>, key: string): string | null {
    const value = snapshot[key];
    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return null;
  }
}
