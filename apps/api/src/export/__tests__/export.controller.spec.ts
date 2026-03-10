import { text } from 'node:stream/consumers';
import { StreamableFile } from '@nestjs/common';
import type { ExportService } from '../export.service';
import { ExportController } from '../export.controller';
import { CapabilityExportScope, ExportFormat } from '../export.types';

describe('ExportController', () => {
  const exportService = {
    exportCapabilitiesCsv: jest.fn(),
    exportPublishedModel: jest.fn(),
    exportPublishedSubtree: jest.fn(),
  } as unknown as ExportService;

  const controller = new ExportController(exportService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns capability CSV exports as a streamable file download', async () => {
    const csvContent = 'id,uniqueName\r\ncap-1,Payments';
    (exportService.exportCapabilitiesCsv as jest.Mock).mockResolvedValue({
      filename: 'capabilities-export.csv',
      content: csvContent,
      generatedAt: '2026-03-10T12:00:00.000Z',
      total: 1,
    });

    const result = await controller.exportCapabilitiesCsv({ search: 'Payments' });

    expect(exportService.exportCapabilitiesCsv).toHaveBeenCalledWith({
      search: 'Payments',
    });
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toMatchObject({
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="capabilities-export.csv"',
      length: Buffer.byteLength(csvContent),
    });
    await expect(text(result.getStream())).resolves.toBe(csvContent);
  });

  it('returns the published model export envelope unchanged', async () => {
    const payload = {
      data: {
        release: {
          id: 'release-1',
          versionLabel: 'release-1',
          state: 'PUBLISHED',
          baseVersionId: null,
          branchType: 'MAIN',
          branchName: null,
          description: null,
          notes: null,
          createdBy: 'tester',
          approvedBy: 'approver',
          publishedAt: '2026-03-01T00:00:00.000Z',
          rollbackOfVersionId: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
        items: [],
        total: 0,
      },
      meta: {
        generatedAt: '2026-03-10T12:00:00.000Z',
        format: ExportFormat.JSON,
        scope: CapabilityExportScope.FULL_MODEL,
        filename: 'published-capability-model-export.json',
      },
    };
    (exportService.exportPublishedModel as jest.Mock).mockResolvedValue(payload);

    await expect(controller.exportPublishedModel()).resolves.toEqual(payload);
  });

  it('returns the published subtree export envelope unchanged', async () => {
    const payload = {
      data: {
        release: {
          id: 'release-1',
          versionLabel: 'release-1',
          state: 'PUBLISHED',
          baseVersionId: null,
          branchType: 'MAIN',
          branchName: null,
          description: null,
          notes: null,
          createdBy: 'tester',
          approvedBy: 'approver',
          publishedAt: '2026-03-01T00:00:00.000Z',
          rollbackOfVersionId: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
        rootCapabilityId: '00000000-0000-0000-0000-000000000010',
        items: [],
        total: 0,
      },
      meta: {
        generatedAt: '2026-03-10T12:00:00.000Z',
        format: ExportFormat.JSON,
        scope: CapabilityExportScope.SUBTREE,
        filename: 'published-capability-subtree-00000000-0000-0000-0000-000000000010.json',
      },
    };
    (exportService.exportPublishedSubtree as jest.Mock).mockResolvedValue(payload);

    await expect(
      controller.exportPublishedSubtree('00000000-0000-0000-0000-000000000010'),
    ).resolves.toEqual(payload);
    expect(exportService.exportPublishedSubtree).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
    );
  });
});
