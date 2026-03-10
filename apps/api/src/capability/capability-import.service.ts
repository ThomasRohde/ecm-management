import { randomUUID } from 'node:crypto';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import {
  NameGuardrailService,
  type CapabilityNameGuardrailWarning,
} from './name-guardrail.service';
import { CapabilityService } from './capability.service';
import {
  CapabilityType,
  LifecycleStatus,
  type CreateCapabilityDto,
} from './dto/create-capability.dto';
import { CapabilityImportFormat, type ImportCapabilitiesDto } from './dto/import-capabilities.dto';

type CapabilityImportField =
  | 'uniqueName'
  | 'parentUniqueName'
  | 'description'
  | 'domain'
  | 'type'
  | 'lifecycleStatus'
  | 'aliases'
  | 'tags'
  | 'sourceReferences'
  | 'rationale'
  | 'stewardId'
  | 'stewardDepartment'
  | 'effectiveFrom'
  | 'effectiveTo'
  | 'nameGuardrailOverride'
  | 'nameGuardrailOverrideRationale';

type CapabilityImportErrorCode =
  | 'REQUIRED'
  | 'DUPLICATE_IN_FILE'
  | 'EXISTING_CONFLICT'
  | 'INVALID_PARENT'
  | 'INVALID_ENUM'
  | 'INVALID_BOOLEAN'
  | 'INVALID_DATE'
  | 'ACTIVE_METADATA_REQUIRED'
  | 'GUARDRAIL_OVERRIDE_RATIONALE_REQUIRED'
  | 'INVALID_HIERARCHY_TYPE'
  | 'CYCLIC_PARENT';

interface CapabilityImportColumnDefinition {
  name: CapabilityImportField;
  required: boolean;
  multiValue: boolean;
  description: string;
}

interface CapabilityImportRowPreview {
  rowNumber: number;
  uniqueName: string;
  parentUniqueName: string | null;
  action: 'CREATE';
  type: CapabilityType;
  lifecycleStatus: LifecycleStatus;
}

interface CapabilityImportError {
  rowNumber: number;
  field: CapabilityImportField;
  code: CapabilityImportErrorCode;
  message: string;
}

interface CapabilityImportWarning {
  rowNumber: number;
  field: 'uniqueName';
  code: 'CAPABILITY_NAME_GUARDRAIL';
  message: string;
  matchedTerms: string[];
  overrideApplied: boolean;
  overrideRationale: string | null;
}

interface CapabilityImportSummary {
  totalRows: number;
  readyCount: number;
  invalidRows: number;
  createdCount: number;
}

export interface CapabilityImportDryRunResult {
  format: CapabilityImportFormat;
  supportedColumns: CapabilityImportColumnDefinition[];
  multiValueDelimiter: typeof MULTI_VALUE_DELIMITER;
  canCommit: boolean;
  summary: CapabilityImportSummary;
  rows: CapabilityImportRowPreview[];
  errors: CapabilityImportError[];
  warnings: CapabilityImportWarning[];
}

interface CapabilityImportCreatedCapability {
  rowNumber: number;
  capabilityId: string;
  uniqueName: string;
  parentUniqueName: string | null;
}

export interface CapabilityImportCommitResult extends CapabilityImportDryRunResult {
  importId: string;
  created: CapabilityImportCreatedCapability[];
}

const MULTI_VALUE_DELIMITER = '|';
const IMPORT_SOURCE = 'capability-import';
const SUPPORTED_COLUMNS = [
  {
    name: 'uniqueName',
    required: true,
    multiValue: false,
    description: 'Globally unique capability name.',
  },
  {
    name: 'parentUniqueName',
    required: false,
    multiValue: false,
    description: 'Parent capability unique name for hierarchy construction.',
  },
  {
    name: 'description',
    required: false,
    multiValue: false,
    description: 'Free-text capability description.',
  },
  {
    name: 'domain',
    required: false,
    multiValue: false,
    description: 'Domain or taxonomy classification.',
  },
  {
    name: 'type',
    required: false,
    multiValue: false,
    description: 'Capability type: ABSTRACT or LEAF.',
  },
  {
    name: 'lifecycleStatus',
    required: false,
    multiValue: false,
    description: 'Lifecycle status: DRAFT, ACTIVE, DEPRECATED, or RETIRED.',
  },
  {
    name: 'aliases',
    required: false,
    multiValue: true,
    description: 'Optional pipe-delimited aliases.',
  },
  {
    name: 'tags',
    required: false,
    multiValue: true,
    description: 'Optional pipe-delimited tags.',
  },
  {
    name: 'sourceReferences',
    required: false,
    multiValue: true,
    description: 'Optional pipe-delimited source references.',
  },
  {
    name: 'rationale',
    required: false,
    multiValue: false,
    description: 'Optional rationale for the capability entry.',
  },
  {
    name: 'stewardId',
    required: false,
    multiValue: false,
    description: 'Assigned steward identifier.',
  },
  {
    name: 'stewardDepartment',
    required: false,
    multiValue: false,
    description: 'Assigned steward department.',
  },
  {
    name: 'effectiveFrom',
    required: false,
    multiValue: false,
    description: 'Optional ISO-8601 effective-from timestamp.',
  },
  {
    name: 'effectiveTo',
    required: false,
    multiValue: false,
    description: 'Optional ISO-8601 effective-to timestamp.',
  },
  {
    name: 'nameGuardrailOverride',
    required: false,
    multiValue: false,
    description: 'Optional boolean override for a guardrail warning.',
  },
  {
    name: 'nameGuardrailOverrideRationale',
    required: false,
    multiValue: false,
    description: 'Required when nameGuardrailOverride is true.',
  },
] as const satisfies readonly CapabilityImportColumnDefinition[];

type SupportedColumnName = (typeof SUPPORTED_COLUMNS)[number]['name'];

interface ParsedImportRow {
  rowNumber: number;
  values: Record<SupportedColumnName, string>;
}

interface ValidatedImportRow {
  rowNumber: number;
  uniqueName: string;
  parentUniqueName: string | null;
  createDto: CreateCapabilityDto;
}

interface ValidationContext {
  totalRows: number;
  rows: CapabilityImportRowPreview[];
  warnings: CapabilityImportWarning[];
  errors: CapabilityImportError[];
  existingMainCapabilityIds: Map<string, string>;
  orderedRows: ValidatedImportRow[];
}

@Injectable()
export class CapabilityImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilityService: CapabilityService,
    private readonly nameGuardrailService: NameGuardrailService,
  ) {}

  async dryRun(dto: ImportCapabilitiesDto): Promise<CapabilityImportDryRunResult> {
    const validation = await this.validate(dto);
    return this.buildDryRunResult(dto.format, validation);
  }

  async commit(dto: ImportCapabilitiesDto, actorId: string): Promise<CapabilityImportCommitResult> {
    const validation = await this.validate(dto);
    const dryRun = this.buildDryRunResult(dto.format, validation);

    if (dryRun.errors.length > 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Capability import validation failed',
        ...dryRun,
      });
    }

    const importId = randomUUID();
    const created = await this.prisma.$transaction(async (tx) => {
      const createdCapabilityIdsByName = new Map<string, string>();
      const createdCapabilities: CapabilityImportCreatedCapability[] = [];

      for (const row of validation.orderedRows) {
        const parentId =
          row.parentUniqueName == null
            ? undefined
            : (createdCapabilityIdsByName.get(row.parentUniqueName) ??
              validation.existingMainCapabilityIds.get(row.parentUniqueName));

        const createdCapability = await this.capabilityService.create(
          {
            ...row.createDto,
            parentId,
          },
          {
            tx,
            actorId,
          },
        );

        createdCapabilityIdsByName.set(row.uniqueName, createdCapability.id);

        await tx.auditEntry.create({
          data: {
            entityType: AuditEntityType.CAPABILITY,
            entityId: createdCapability.id,
            action: AuditAction.CREATE,
            actorId,
            before: Prisma.JsonNull,
            after: this.toAuditSnapshot(createdCapability),
            metadata: {
              source: IMPORT_SOURCE,
              importId,
              format: dto.format,
              rowNumber: row.rowNumber,
              uniqueName: row.uniqueName,
              parentUniqueName: row.parentUniqueName,
            } as Prisma.InputJsonValue,
          },
        });

        createdCapabilities.push({
          rowNumber: row.rowNumber,
          capabilityId: createdCapability.id,
          uniqueName: createdCapability.uniqueName,
          parentUniqueName: row.parentUniqueName,
        });
      }

      return createdCapabilities;
    });

    return {
      ...dryRun,
      importId,
      summary: {
        ...dryRun.summary,
        createdCount: created.length,
      },
      created,
    };
  }

  private async validate(dto: ImportCapabilitiesDto): Promise<ValidationContext> {
    if (dto.format !== CapabilityImportFormat.CSV) {
      throw new BadRequestException('Only CSV capability imports are supported');
    }

    const parsedRows = this.parseCsvContent(dto.csvContent);
    const parentNamesInFile = new Set<string>();

    for (const row of parsedRows) {
      const parentUniqueName = this.normalizeOptionalValue(row.values.parentUniqueName);
      if (parentUniqueName) {
        parentNamesInFile.add(parentUniqueName);
      }
    }

    const rows: CapabilityImportRowPreview[] = [];
    const warnings: CapabilityImportWarning[] = [];
    const errors: CapabilityImportError[] = [];
    const validatedRows: ValidatedImportRow[] = [];
    const seenNames = new Map<string, number>();
    const referencedNames = new Set<string>();

    for (const row of parsedRows) {
      const uniqueName = this.normalizeOptionalValue(row.values.uniqueName) ?? '';
      const parentUniqueName = this.normalizeOptionalValue(row.values.parentUniqueName);
      const explicitType = this.parseEnumValue(
        row.values.type,
        CapabilityType,
        row.rowNumber,
        'type',
        errors,
      );
      const lifecycleStatus =
        this.parseEnumValue(
          row.values.lifecycleStatus,
          LifecycleStatus,
          row.rowNumber,
          'lifecycleStatus',
          errors,
        ) ?? LifecycleStatus.DRAFT;
      const nameGuardrailOverride = this.parseBooleanValue(
        row.values.nameGuardrailOverride,
        row.rowNumber,
        'nameGuardrailOverride',
        errors,
      );
      const inferredType =
        uniqueName.length > 0 && parentNamesInFile.has(uniqueName)
          ? CapabilityType.ABSTRACT
          : CapabilityType.LEAF;
      const type = explicitType ?? inferredType;

      if (!uniqueName) {
        errors.push(
          this.createError(row.rowNumber, 'uniqueName', 'REQUIRED', 'uniqueName is required'),
        );
      }

      if (uniqueName && seenNames.has(uniqueName)) {
        errors.push(
          this.createError(
            row.rowNumber,
            'uniqueName',
            'DUPLICATE_IN_FILE',
            `uniqueName "${uniqueName}" is duplicated in the import file (first seen on row ${seenNames.get(uniqueName)})`,
          ),
        );
      } else if (uniqueName) {
        seenNames.set(uniqueName, row.rowNumber);
      }

      if (parentUniqueName === uniqueName && uniqueName) {
        errors.push(
          this.createError(
            row.rowNumber,
            'parentUniqueName',
            'INVALID_PARENT',
            'parentUniqueName cannot reference the same capability as uniqueName',
          ),
        );
      }

      if (explicitType === CapabilityType.LEAF && uniqueName && parentNamesInFile.has(uniqueName)) {
        errors.push(
          this.createError(
            row.rowNumber,
            'type',
            'INVALID_HIERARCHY_TYPE',
            'Capabilities referenced as a parentUniqueName must use type ABSTRACT',
          ),
        );
      }

      const createDto: CreateCapabilityDto = {
        uniqueName,
        description: this.normalizeOptionalValue(row.values.description) ?? undefined,
        domain: this.normalizeOptionalValue(row.values.domain) ?? undefined,
        type,
        lifecycleStatus,
        aliases: this.parseListValue(row.values.aliases),
        tags: this.parseListValue(row.values.tags),
        sourceReferences: this.parseListValue(row.values.sourceReferences),
        rationale: this.normalizeOptionalValue(row.values.rationale) ?? undefined,
        stewardId: this.normalizeOptionalValue(row.values.stewardId) ?? undefined,
        stewardDepartment: this.normalizeOptionalValue(row.values.stewardDepartment) ?? undefined,
        effectiveFrom: this.normalizeOptionalValue(row.values.effectiveFrom) ?? undefined,
        effectiveTo: this.normalizeOptionalValue(row.values.effectiveTo) ?? undefined,
        nameGuardrailOverride: nameGuardrailOverride ?? undefined,
        nameGuardrailOverrideRationale:
          this.normalizeOptionalValue(row.values.nameGuardrailOverrideRationale) ?? undefined,
      };

      this.validateDates(createDto, row.rowNumber, errors);
      this.validateActiveLifecycleMetadata(createDto, row.rowNumber, errors);
      this.validateGuardrailOverride(createDto, row.rowNumber, errors);
      this.collectGuardrailWarnings(createDto, row.rowNumber, warnings);

      rows.push({
        rowNumber: row.rowNumber,
        uniqueName,
        parentUniqueName,
        action: 'CREATE',
        type,
        lifecycleStatus,
      });

      if (!uniqueName) {
        continue;
      }

      validatedRows.push({
        rowNumber: row.rowNumber,
        uniqueName,
        parentUniqueName,
        createDto,
      });
      referencedNames.add(uniqueName);

      if (parentUniqueName) {
        referencedNames.add(parentUniqueName);
      }
    }

    const existingCapabilityConflicts = await this.loadExistingCapabilityConflicts([
      ...seenNames.keys(),
    ]);
    const existingMainCapabilityIds = await this.loadExistingMainCapabilityIds([...referencedNames]);

    for (const row of validatedRows) {
      if (existingCapabilityConflicts.has(row.uniqueName)) {
        errors.push(
          this.createError(
            row.rowNumber,
            'uniqueName',
            'EXISTING_CONFLICT',
            `Capability name "${row.uniqueName}" already exists. This import slice is create-only.`,
          ),
        );
      }

      if (
        row.parentUniqueName &&
        !existingMainCapabilityIds.has(row.parentUniqueName) &&
        !seenNames.has(row.parentUniqueName)
      ) {
        errors.push(
          this.createError(
            row.rowNumber,
            'parentUniqueName',
            'INVALID_PARENT',
            `parentUniqueName "${row.parentUniqueName}" does not match an existing main capability or another import row`,
          ),
        );
      }
    }

    const orderedRows =
      errors.length === 0
        ? this.orderRows(validatedRows, existingMainCapabilityIds, errors)
        : validatedRows;

    return {
      totalRows: parsedRows.length,
      rows,
      warnings,
      errors,
      existingMainCapabilityIds,
      orderedRows: errors.length === 0 ? orderedRows : validatedRows,
    };
  }

  private parseCsvContent(csvContent: string): ParsedImportRow[] {
    const rawRows = this.parseCsv(csvContent);
    const indexedRows = rawRows.map((cells, index) => ({
      cells,
      rowNumber: index + 1,
    }));
    const nonEmptyRows = indexedRows.filter((row) =>
      row.cells.some((value) => value.trim().length > 0),
    );

    if (nonEmptyRows.length === 0) {
      throw new BadRequestException('csvContent must include a header row and at least one data row');
    }

    const header = nonEmptyRows[0]?.cells.map((value) => value.trim());
    if (!header || header.length === 0) {
      throw new BadRequestException('CSV header row is required');
    }

    const unsupportedColumns = header.filter(
      (column): column is string =>
        column.length > 0 && !SUPPORTED_COLUMNS.some((supportedColumn) => supportedColumn.name === column),
    );
    if (unsupportedColumns.length > 0) {
      throw new BadRequestException(
        `Unsupported CSV columns: ${unsupportedColumns.join(', ')}. Supported columns: ${SUPPORTED_COLUMNS.map((column) => column.name).join(', ')}`,
      );
    }

    if (!header.includes('uniqueName')) {
      throw new BadRequestException('CSV header must include the "uniqueName" column');
    }

    return nonEmptyRows.slice(1).map(({ cells, rowNumber }) => {
      const values = Object.fromEntries(
        SUPPORTED_COLUMNS.map((column) => [column.name, '']),
      ) as Record<SupportedColumnName, string>;

      for (let cellIndex = 0; cellIndex < header.length; cellIndex += 1) {
        const columnName = header[cellIndex];
        if (!columnName || !SUPPORTED_COLUMNS.some((column) => column.name === columnName)) {
          continue;
        }

        values[columnName as SupportedColumnName] = cells[cellIndex]?.trim() ?? '';
      }

      return {
        rowNumber,
        values,
      };
    });
  }

  private parseCsv(csvContent: string): string[][] {
    const normalizedCsvContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let index = 0; index < normalizedCsvContent.length; index += 1) {
      const character = normalizedCsvContent[index];
      const nextCharacter = normalizedCsvContent[index + 1];

      if (character === '"') {
        if (inQuotes && nextCharacter === '"') {
          currentField += '"';
          index += 1;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && character === ',') {
        currentRow.push(currentField);
        currentField = '';
        continue;
      }

      if (!inQuotes && character === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        continue;
      }

      currentField += character;
    }

    currentRow.push(currentField);
    rows.push(currentRow);

    if (inQuotes) {
      throw new BadRequestException('CSV contains an unterminated quoted field');
    }

    return rows;
  }

  private async loadExistingCapabilityConflicts(names: string[]): Promise<Map<string, string>> {
    if (names.length === 0) {
      return new Map<string, string>();
    }

    const capabilities = await this.prisma.capability.findMany({
      where: {
        uniqueName: {
          in: names,
        },
      },
      select: {
        id: true,
        uniqueName: true,
      },
    });

    return new Map(capabilities.map((capability) => [capability.uniqueName, capability.id]));
  }

  private async loadExistingMainCapabilityIds(names: string[]): Promise<Map<string, string>> {
    if (names.length === 0) {
      return new Map<string, string>();
    }

    const capabilities = await this.prisma.capability.findMany({
      where: {
        branchOriginId: null,
        uniqueName: {
          in: names,
        },
      },
      select: {
        id: true,
        uniqueName: true,
      },
    });

    return new Map(capabilities.map((capability) => [capability.uniqueName, capability.id]));
  }

  private orderRows(
    rows: ValidatedImportRow[],
    existingMainCapabilityIds: Map<string, string>,
    errors: CapabilityImportError[],
  ): ValidatedImportRow[] {
    const rowsByName = new Map(rows.map((row) => [row.uniqueName, row]));
    const orderedRows: ValidatedImportRow[] = [];
    const remainingNames = new Set(rows.map((row) => row.uniqueName));
    let progressed = true;

    while (remainingNames.size > 0 && progressed) {
      progressed = false;

      for (const uniqueName of [...remainingNames]) {
        const row = rowsByName.get(uniqueName);
        if (!row) {
          continue;
        }

        if (
          row.parentUniqueName == null ||
          existingMainCapabilityIds.has(row.parentUniqueName) ||
          !remainingNames.has(row.parentUniqueName)
        ) {
          orderedRows.push(row);
          remainingNames.delete(uniqueName);
          progressed = true;
        }
      }
    }

    if (remainingNames.size > 0) {
      for (const uniqueName of remainingNames) {
        const row = rowsByName.get(uniqueName);
        if (!row) {
          continue;
        }

        errors.push(
          this.createError(
            row.rowNumber,
            'parentUniqueName',
            'CYCLIC_PARENT',
            `Unable to resolve an import order for "${row.uniqueName}". Check for cyclical parentUniqueName references.`,
          ),
        );
      }
    }

    return orderedRows;
  }

  private buildDryRunResult(
    format: CapabilityImportFormat,
    validation: ValidationContext,
  ): CapabilityImportDryRunResult {
    const invalidRows = this.countInvalidRows(validation.errors);
    const readyCount = Math.max(0, validation.totalRows - invalidRows);

    return {
      format,
      supportedColumns: [...SUPPORTED_COLUMNS],
      multiValueDelimiter: MULTI_VALUE_DELIMITER,
      canCommit: validation.errors.length === 0,
      summary: {
        totalRows: validation.totalRows,
        readyCount,
        invalidRows,
        createdCount: 0,
      },
      rows: validation.rows,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  private parseListValue(value: string): string[] {
    return value
      .split(MULTI_VALUE_DELIMITER)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private parseEnumValue<T extends Record<string, string>>(
    value: string,
    enumType: T,
    rowNumber: number,
    field: CapabilityImportField,
    errors: CapabilityImportError[],
  ): T[keyof T] | null {
    const normalizedValue = this.normalizeOptionalValue(value)?.toUpperCase();
    if (!normalizedValue) {
      return null;
    }

    const allowedValues = Object.values(enumType);
    if (!allowedValues.includes(normalizedValue as T[keyof T])) {
      errors.push(
        this.createError(
          rowNumber,
          field,
          'INVALID_ENUM',
          `${field} must be one of: ${allowedValues.join(', ')}`,
        ),
      );
      return null;
    }

    return normalizedValue as T[keyof T];
  }

  private parseBooleanValue(
    value: string,
    rowNumber: number,
    field: CapabilityImportField,
    errors: CapabilityImportError[],
  ): boolean | null {
    const normalizedValue = this.normalizeOptionalValue(value)?.toLowerCase();
    if (!normalizedValue) {
      return null;
    }

    if (['true', 'yes', '1'].includes(normalizedValue)) {
      return true;
    }

    if (['false', 'no', '0'].includes(normalizedValue)) {
      return false;
    }

    errors.push(
      this.createError(rowNumber, field, 'INVALID_BOOLEAN', `${field} must be a boolean value`),
    );
    return null;
  }

  private validateDates(
    createDto: CreateCapabilityDto,
    rowNumber: number,
    errors: CapabilityImportError[],
  ): void {
    for (const field of ['effectiveFrom', 'effectiveTo'] as const) {
      const value = createDto[field];
      if (!value) {
        continue;
      }

      if (!isISO8601(value, { strict: true, strictSeparator: true })) {
        errors.push(
          this.createError(
            rowNumber,
            field,
            'INVALID_DATE',
            `${field} must be a valid ISO-8601 date string`,
          ),
        );
      }
    }
  }

  private validateActiveLifecycleMetadata(
    createDto: CreateCapabilityDto,
    rowNumber: number,
    errors: CapabilityImportError[],
  ): void {
    if (createDto.lifecycleStatus !== LifecycleStatus.ACTIVE) {
      return;
    }

    for (const field of ['description', 'domain', 'stewardId', 'stewardDepartment'] as const) {
      if (this.normalizeOptionalValue(createDto[field]) == null) {
        errors.push(
          this.createError(
            rowNumber,
            field,
            'ACTIVE_METADATA_REQUIRED',
            `ACTIVE capabilities require a non-empty ${field} value`,
          ),
        );
      }
    }
  }

  private validateGuardrailOverride(
    createDto: CreateCapabilityDto,
    rowNumber: number,
    errors: CapabilityImportError[],
  ): void {
    if (
      createDto.nameGuardrailOverride === true &&
      this.normalizeOptionalValue(createDto.nameGuardrailOverrideRationale) == null
    ) {
      errors.push(
        this.createError(
          rowNumber,
          'nameGuardrailOverrideRationale',
          'GUARDRAIL_OVERRIDE_RATIONALE_REQUIRED',
          'nameGuardrailOverrideRationale is required when nameGuardrailOverride is true',
        ),
      );
    }
  }

  private collectGuardrailWarnings(
    createDto: CreateCapabilityDto,
    rowNumber: number,
    warnings: CapabilityImportWarning[],
  ): void {
    if (!this.normalizeOptionalValue(createDto.uniqueName)) {
      return;
    }

    const evaluation = this.nameGuardrailService.evaluateName(
      createDto.uniqueName,
      createDto.nameGuardrailOverride === true,
      createDto.nameGuardrailOverrideRationale ?? null,
    );

    if (!evaluation.warning) {
      return;
    }

    warnings.push(this.createGuardrailWarning(rowNumber, evaluation.warning));
  }

  private normalizeOptionalValue(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private createError(
    rowNumber: number,
    field: CapabilityImportField,
    code: CapabilityImportErrorCode,
    message: string,
  ): CapabilityImportError {
    return {
      rowNumber,
      field,
      code,
      message,
    };
  }

  private createGuardrailWarning(
    rowNumber: number,
    warning: CapabilityNameGuardrailWarning,
  ): CapabilityImportWarning {
    return {
      rowNumber,
      field: 'uniqueName',
      code: 'CAPABILITY_NAME_GUARDRAIL',
      message: warning.message,
      matchedTerms: warning.matchedTerms,
      overrideApplied: warning.overrideApplied,
      overrideRationale: warning.overrideRationale,
    };
  }

  private toAuditSnapshot(capability: Record<string, unknown>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(capability)) as Prisma.InputJsonValue;
  }

  private countInvalidRows(errors: CapabilityImportError[]): number {
    return new Set(errors.map((error) => error.rowNumber)).size;
  }
}
