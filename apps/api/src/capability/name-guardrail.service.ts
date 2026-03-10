import { Injectable } from '@nestjs/common';
import type { Capability } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_NAME_GUARDRAIL_BLOCKLIST = [
  'aws',
  'azure',
  'confluence',
  'dynamics',
  'github',
  'jira',
  'oracle',
  'salesforce',
  'sap',
  'servicenow',
  'sharepoint',
  'slack',
  'snowflake',
  'tableau',
  'workday',
] as const;

const NAME_GUARDRAIL_BLOCKLIST_ENV = 'CAPABILITY_NAME_GUARDRAIL_BLOCKLIST';

export interface CapabilityNameGuardrailWarning {
  code: 'CAPABILITY_NAME_GUARDRAIL';
  message: string;
  matchedTerms: string[];
  overrideApplied: boolean;
  overrideRationale: string | null;
}

export interface CapabilityNameGuardrailEvaluation {
  flagged: boolean;
  matchedTerms: string[];
  warning: CapabilityNameGuardrailWarning | null;
}

export interface FlaggedCapabilityReviewItem {
  id: string;
  uniqueName: string;
  lifecycleStatus: Capability['lifecycleStatus'];
  domain: string | null;
  stewardId: string | null;
  stewardDepartment: string | null;
  updatedAt: Date;
  nameGuardrailOverride: boolean;
  nameGuardrailOverrideRationale: string | null;
  matchedTerms: string[];
  warningMessage: string;
}

export interface FlaggedCapabilitySearchParams {
  page?: number;
  limit?: number;
}

type GuardrailCapabilityRecord = Pick<
  Capability,
  | 'id'
  | 'uniqueName'
  | 'lifecycleStatus'
  | 'domain'
  | 'stewardId'
  | 'stewardDepartment'
  | 'updatedAt'
  | 'nameGuardrailOverride'
  | 'nameGuardrailOverrideRationale'
>;

@Injectable()
export class NameGuardrailService {
  constructor(private readonly prisma: PrismaService) {}

  evaluateName(
    uniqueName: string,
    overrideApplied = false,
    overrideRationale: string | null = null,
  ): CapabilityNameGuardrailEvaluation {
    return this.evaluateNameWithBlocklist(
      uniqueName,
      this.getConfiguredBlocklist(),
      overrideApplied,
      overrideRationale,
    );
  }

  async findFlaggedCapabilities(
    params: FlaggedCapabilitySearchParams = {},
  ): Promise<{ items: FlaggedCapabilityReviewItem[]; page: number; limit: number; hasMore: boolean }> {
    const page = this.normalizePositiveInteger(params.page, 1);
    const limit = this.normalizePositiveInteger(params.limit, 25);
    const blocklist = this.getConfiguredBlocklist();
    const requiredFlaggedCount = page * limit + 1;
    const batchSize = Math.max(limit * 2, 50);
    const matchedCapabilities: FlaggedCapabilityReviewItem[] = [];
    let skip = 0;

    while (matchedCapabilities.length < requiredFlaggedCount) {
      const capabilities = await this.prisma.capability.findMany({
        where: {
          branchOriginId: null,
          OR: blocklist.map((term) => ({
            uniqueName: { contains: term, mode: 'insensitive' as const },
          })),
        },
        select: {
          id: true,
          uniqueName: true,
          lifecycleStatus: true,
          domain: true,
          stewardId: true,
          stewardDepartment: true,
          updatedAt: true,
          nameGuardrailOverride: true,
          nameGuardrailOverrideRationale: true,
        },
        orderBy: { uniqueName: 'asc' },
        skip,
        take: batchSize,
      });

      if (capabilities.length === 0) {
        break;
      }

      matchedCapabilities.push(
        ...capabilities
          .map((capability) => this.toReviewItem(capability, blocklist))
          .filter((item): item is FlaggedCapabilityReviewItem => item !== null),
      );

      skip += capabilities.length;

      if (capabilities.length < batchSize) {
        break;
      }
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
      items: matchedCapabilities.slice(startIndex, endIndex),
      page,
      limit,
      hasMore: matchedCapabilities.length > endIndex,
    };
  }

  private evaluateNameWithBlocklist(
    uniqueName: string,
    blocklist: string[],
    overrideApplied = false,
    overrideRationale: string | null = null,
  ): CapabilityNameGuardrailEvaluation {
    const normalizedName = this.normalize(uniqueName);

    if (!normalizedName) {
      return {
        flagged: false,
        matchedTerms: [],
        warning: null,
      };
    }

    const matchedTerms = blocklist.filter((term) => this.containsBlockedTerm(normalizedName, term));

    if (matchedTerms.length === 0) {
      return {
        flagged: false,
        matchedTerms: [],
        warning: null,
      };
    }

    return {
      flagged: true,
      matchedTerms,
      warning: {
        code: 'CAPABILITY_NAME_GUARDRAIL',
        message: `Capability name may describe a tool, vendor, or product instead of the intended business capability: ${matchedTerms.join(', ')}`,
        matchedTerms,
        overrideApplied,
        overrideRationale,
      },
    };
  }

  private toReviewItem(
    capability: GuardrailCapabilityRecord,
    blocklist: string[],
  ): FlaggedCapabilityReviewItem | null {
    const evaluation = this.evaluateNameWithBlocklist(
      capability.uniqueName,
      blocklist,
      capability.nameGuardrailOverride,
      capability.nameGuardrailOverrideRationale,
    );

    if (!evaluation.warning) {
      return null;
    }

    return {
      id: capability.id,
      uniqueName: capability.uniqueName,
      lifecycleStatus: capability.lifecycleStatus,
      domain: capability.domain,
      stewardId: capability.stewardId,
      stewardDepartment: capability.stewardDepartment,
      updatedAt: capability.updatedAt,
      nameGuardrailOverride: capability.nameGuardrailOverride,
      nameGuardrailOverrideRationale: capability.nameGuardrailOverrideRationale,
      matchedTerms: evaluation.matchedTerms,
      warningMessage: evaluation.warning.message,
    };
  }

  getConfiguredBlocklist(): string[] {
    const configuredTerms = process.env[NAME_GUARDRAIL_BLOCKLIST_ENV]
      ?.split(',')
      .map((term) => this.normalize(term))
      .filter((term): term is string => term.length > 0);

    const sourceTerms =
      configuredTerms && configuredTerms.length > 0
        ? configuredTerms
        : [...DEFAULT_NAME_GUARDRAIL_BLOCKLIST];

    return [...new Set(sourceTerms)].sort((left, right) => right.length - left.length);
  }

  private containsBlockedTerm(normalizedName: string, blockedTerm: string): boolean {
    return ` ${normalizedName} `.includes(` ${blockedTerm} `);
  }

  private normalize(value: string): string {
    return value
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private normalizePositiveInteger(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 1) {
      return fallback;
    }

    return Math.floor(value);
  }
}
