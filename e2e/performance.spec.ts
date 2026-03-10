import { expect, test, type Page } from '@playwright/test';

interface PerformanceCapability {
  id: string;
  uniqueName: string;
  description: string | null;
  type: 'ABSTRACT' | 'LEAF';
  lifecycleStatus: 'ACTIVE';
  parentId: string | null;
}

function buildCapabilityDataset(): PerformanceCapability[] {
  const capabilities: PerformanceCapability[] = [];

  for (let rootIndex = 1; rootIndex <= 100; rootIndex += 1) {
    const rootId = `root-${rootIndex}`;
    capabilities.push({
      id: rootId,
      uniqueName: `Capability Domain ${String(rootIndex).padStart(4, '0')}`,
      description: `Domain ${rootIndex} root capability.`,
      type: 'ABSTRACT',
      lifecycleStatus: 'ACTIVE',
      parentId: null,
    });

    for (let childIndex = 1; childIndex <= 29; childIndex += 1) {
      const sequence = (rootIndex - 1) * 29 + childIndex;
      capabilities.push({
        id: `capability-${sequence}`,
        uniqueName: `Capability ${String(sequence).padStart(4, '0')}`,
        description: `Capability number ${sequence}.`,
        type: 'LEAF',
        lifecycleStatus: 'ACTIVE',
        parentId: rootId,
      });
    }
  }

  return capabilities;
}

const performanceCapabilities = buildCapabilityDataset();

function filterPerformanceCapabilities(requestUrl: URL): PerformanceCapability[] {
  const search = requestUrl.searchParams.get('search')?.trim().toLowerCase();

  if (!search) {
    return performanceCapabilities;
  }

  return performanceCapabilities.filter((capability) =>
    capability.uniqueName.toLowerCase().includes(search),
  );
}

async function mockPerformanceDataset(page: Page): Promise<void> {
  await page.route('**/api/v1/capabilities*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const items = filterPerformanceCapabilities(requestUrl);
    const limit = Number(requestUrl.searchParams.get('limit') ?? Math.max(items.length, 1));
    const pageNumber = Number(requestUrl.searchParams.get('page') ?? 1);
    const startIndex = Math.max(0, (pageNumber - 1) * limit);

    await route.fulfill({
      json: {
        items: items.slice(startIndex, startIndex + limit),
        total: items.length,
        page: pageNumber,
        limit,
        totalPages: Math.max(1, Math.ceil(items.length / limit)),
      },
    });
  });

  await page.route('**/api/v1/change-requests*', async (route) => {
    await route.fulfill({
      json: {
        items: [],
        total: 0,
      },
    });
  });
}

test.describe('Capability browser performance', () => {
  test('renders and navigates a 3000-capability tree within the benchmark budget', async ({
    page,
  }) => {
    await mockPerformanceDataset(page);

    const renderStartedAt = Date.now();
    await page.goto('/capabilities');
    await expect(
      page.getByText('3000 capabilities found', { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    const renderDurationMs = Date.now() - renderStartedAt;

    const tree = page.getByRole('tree', { name: /capability hierarchy/i });
    const firstTreeItem = tree.getByRole('treeitem', {
      name: 'Capability Domain 0001',
    });
    const lastTreeItem = tree.getByRole('treeitem', {
      name: 'Capability 2900',
    });

    await firstTreeItem.focus();
    const navigationStartedAt = Date.now();
    await page.keyboard.press('End');
    await expect(lastTreeItem).toBeFocused();
    const navigationDurationMs = Date.now() - navigationStartedAt;

    expect(renderDurationMs).toBeLessThan(20000);
    expect(navigationDurationMs).toBeLessThan(5000);
  });

  test('filters a 3000-capability dataset within the benchmark budget', async ({ page }) => {
    await mockPerformanceDataset(page);
    await page.goto('/capabilities');

    const searchStartedAt = Date.now();
    await page.getByLabel(/search capabilities/i).fill('Capability 2900');
    await expect(
      page.getByRole('treeitem', { name: 'Capability 2900' }),
    ).toBeVisible();
    await expect(page.getByText('1 capability found', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    const searchDurationMs = Date.now() - searchStartedAt;

    expect(searchDurationMs).toBeLessThan(20000);
  });
});
