import { BadRequestException, Injectable } from '@nestjs/common';
import type { ModelVersion } from '@prisma/client';
import { CapabilityService } from '../capability/capability.service';
import { PublishedModelService, type PublishedCapability } from '../integration/published-model.service';
import type {
  CapabilityCsvExportFile,
  CapabilityExportQuery,
  CapabilityExportResponse,
  CapabilityFullModelExportData,
  CapabilitySubtreeExportData,
  ExportedCapability,
  ExportedModelVersion,
} from './export.types';
import { CapabilityExportScope, ExportFormat } from './export.types';

const MAX_CAPABILITY_EXPORT_ROWS = 10_000;
const CSV_NEWLINE = '\r\n';
const CAPABILITY_EXPORT_FILENAME = 'capabilities-export.csv';
const FULL_MODEL_EXPORT_FILENAME = 'published-capability-model-export.json';

type CapabilityListResult = Awaited<ReturnType<CapabilityService['findAll']>>;
type CapabilityListItem = CapabilityListResult['items'][number];

@Injectable()
export class ExportService {
  constructor(
    private readonly capabilityService: CapabilityService,
    private readonly publishedModelService: PublishedModelService,
  ) {}

  async exportCapabilitiesCsv(query: CapabilityExportQuery): Promise<CapabilityCsvExportFile> {
    const generatedAt = new Date().toISOString();
    const result = await this.capabilityService.findAll({
      ...query,
      page: 1,
      limit: MAX_CAPABILITY_EXPORT_ROWS,
    });

    if (result.total > result.items.length) {
      throw new BadRequestException(
        'Capability export exceeded the supported row limit. Narrow the filters and try again.',
      );
    }

    return {
      filename: CAPABILITY_EXPORT_FILENAME,
      content: this.buildCapabilityCsv(result.items),
      generatedAt,
      total: result.total,
    };
  }

  async exportPublishedModel(): Promise<
    CapabilityExportResponse<CapabilityFullModelExportData>
  > {
    const generatedAt = new Date().toISOString();
    const modelExport = await this.publishedModelService.listCapabilities();

    return {
      data: {
        release: this.serializeModelVersion(modelExport.release),
        items: modelExport.items.map((item) => this.serializePublishedCapability(item)),
        total: modelExport.total,
      },
      meta: {
        generatedAt,
        format: ExportFormat.JSON,
        scope: CapabilityExportScope.FULL_MODEL,
        filename: FULL_MODEL_EXPORT_FILENAME,
      },
    };
  }

  async exportPublishedSubtree(
    capabilityId: string,
  ): Promise<CapabilityExportResponse<CapabilitySubtreeExportData>> {
    const generatedAt = new Date().toISOString();
    const subtreeExport = await this.publishedModelService.getCapabilitySubtree(capabilityId);

    return {
      data: {
        release: this.serializeModelVersion(subtreeExport.release),
        rootCapabilityId: subtreeExport.rootCapabilityId,
        items: subtreeExport.items.map((item) => this.serializePublishedCapability(item)),
        total: subtreeExport.total,
      },
      meta: {
        generatedAt,
        format: ExportFormat.JSON,
        scope: CapabilityExportScope.SUBTREE,
        filename: `published-capability-subtree-${capabilityId}.json`,
      },
    };
  }

  private buildCapabilityCsv(items: CapabilityListItem[]): string {
    const headerRow = [
      'id',
      'uniqueName',
      'description',
      'domain',
      'type',
      'parentId',
      'lifecycleStatus',
      'aliases',
      'sourceReferences',
      'tags',
      'stewardId',
      'stewardDepartment',
      'effectiveFrom',
      'effectiveTo',
      'rationale',
      'nameGuardrailOverride',
      'nameGuardrailOverrideRationale',
      'isErroneous',
      'erroneousReason',
      'childCount',
      'createdAt',
      'updatedAt',
    ];

    const rows = items.map((item) =>
      [
        item.id,
        item.uniqueName,
        item.description,
        item.domain,
        item.type,
        item.parentId,
        item.lifecycleStatus,
        item.aliases.join('; '),
        item.sourceReferences.join('; '),
        item.tags.join('; '),
        item.stewardId,
        item.stewardDepartment,
        this.serializeDate(item.effectiveFrom),
        this.serializeDate(item.effectiveTo),
        item.rationale,
        item.nameGuardrailOverride,
        item.nameGuardrailOverrideRationale,
        item.isErroneous,
        item.erroneousReason,
        item.children.length,
        this.serializeDate(item.createdAt),
        this.serializeDate(item.updatedAt),
      ]
        .map((value) => this.escapeCsvValue(value))
        .join(','),
    );

    return [headerRow.join(','), ...rows].join(CSV_NEWLINE);
  }

  private escapeCsvValue(value: Date | boolean | number | string | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }

    const normalized =
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'boolean'
          ? String(value)
          : String(value);

    if (!/[",\r\n]/.test(normalized)) {
      return normalized;
    }

    return `"${normalized.replace(/"/g, '""')}"`;
  }

  private serializeDate(value: Date | string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    return value instanceof Date ? value.toISOString() : value;
  }

  private serializeModelVersion(release: ModelVersion): ExportedModelVersion {
    return {
      id: release.id,
      versionLabel: release.versionLabel,
      state: release.state,
      baseVersionId: release.baseVersionId,
      branchType: release.branchType,
      branchName: release.branchName,
      description: release.description,
      notes: release.notes,
      createdBy: release.createdBy,
      approvedBy: release.approvedBy,
      publishedAt: this.serializeDate(release.publishedAt),
      rollbackOfVersionId: release.rollbackOfVersionId,
      createdAt: release.createdAt.toISOString(),
      updatedAt: release.updatedAt.toISOString(),
    };
  }

  private serializePublishedCapability(capability: PublishedCapability): ExportedCapability {
    return {
      id: capability.id,
      uniqueName: capability.uniqueName,
      aliases: capability.aliases,
      description: capability.description,
      domain: capability.domain,
      type: capability.type,
      parentId: capability.parentId,
      lifecycleStatus: capability.lifecycleStatus,
      effectiveFrom: capability.effectiveFrom,
      effectiveTo: capability.effectiveTo,
      rationale: capability.rationale,
      sourceReferences: capability.sourceReferences,
      tags: capability.tags,
      stewardId: capability.stewardId,
      stewardDepartment: capability.stewardDepartment,
      nameGuardrailOverride: capability.nameGuardrailOverride,
      nameGuardrailOverrideRationale: capability.nameGuardrailOverrideRationale,
      isErroneous: capability.isErroneous,
      erroneousReason: capability.erroneousReason,
      createdAt: capability.createdAt,
      updatedAt: capability.updatedAt,
    };
  }
}
