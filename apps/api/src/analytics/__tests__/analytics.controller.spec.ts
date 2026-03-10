import type { AnalyticsService } from '../analytics.service';
import { AnalyticsController } from '../analytics.controller';

describe('AnalyticsController', () => {
  const analyticsService = {
    getModelHealthSummary: jest.fn(),
    getStewardshipCoverage: jest.fn(),
    getMappingCoverage: jest.fn(),
    getHeatmap: jest.fn(),
    getGapAnalysis: jest.fn(),
    getRecentActivity: jest.fn(),
  } as unknown as AnalyticsService;

  const controller = new AnalyticsController(analyticsService);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('wraps model health data in an analytics envelope', async () => {
    const payload = { totalCapabilities: 3 };
    (analyticsService.getModelHealthSummary as jest.Mock).mockResolvedValue(payload);

    await expect(controller.getModelHealth()).resolves.toEqual({
      data: payload,
      meta: {
        generatedAt: '2026-03-10T12:00:00.000Z',
      },
    });
  });

  it('forwards gap analysis query params and wraps the response', async () => {
    const payload = {
      summary: {
        unmappedActiveLeafCapabilityCount: 1,
        deprecatedCapabilitiesWithActiveMappingsCount: 0,
      },
      appliedFilters: {
        domain: 'Finance',
        limit: 25,
      },
      unmappedActiveLeafCapabilities: [],
      deprecatedCapabilitiesWithActiveMappings: [],
    };
    (analyticsService.getGapAnalysis as jest.Mock).mockResolvedValue(payload);

    await expect(
      controller.getGapAnalysis({ domain: 'Finance', limit: 25 }),
    ).resolves.toEqual({
      data: payload,
      meta: {
        generatedAt: '2026-03-10T12:00:00.000Z',
      },
    });
    expect(analyticsService.getGapAnalysis).toHaveBeenCalledWith({
      domain: 'Finance',
      limit: 25,
    });
  });

  it('forwards recent activity query params and wraps the response', async () => {
    const payload = {
      items: [],
      totalReturned: 0,
    };
    (analyticsService.getRecentActivity as jest.Mock).mockResolvedValue(payload);

    await expect(controller.getRecentActivity({ limit: 5 })).resolves.toEqual({
      data: payload,
      meta: {
        generatedAt: '2026-03-10T12:00:00.000Z',
      },
    });
    expect(analyticsService.getRecentActivity).toHaveBeenCalledWith({ limit: 5 });
  });
});
