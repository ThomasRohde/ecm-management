import { expect, test, type Page, type Route } from '@playwright/test';

interface MockCapability {
  id: string;
  uniqueName: string;
  description: string | null;
  type: 'ABSTRACT' | 'LEAF';
  lifecycleStatus: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'RETIRED';
  parentId: string | null;
}

const mockedCapabilities: MockCapability[] = [
  {
    id: 'payments-root',
    uniqueName: 'Payments',
    description: 'Root capability for payment services.',
    type: 'ABSTRACT',
    lifecycleStatus: 'ACTIVE',
    parentId: null,
  },
  {
    id: 'payments-processing',
    uniqueName: 'Payment Processing',
    description: 'Manage payment execution.',
    type: 'LEAF',
    lifecycleStatus: 'ACTIVE',
    parentId: 'payments-root',
  },
  {
    id: 'payments-reconciliation',
    uniqueName: 'Payment Reconciliation',
    description: 'Reconcile settlement activity.',
    type: 'LEAF',
    lifecycleStatus: 'DRAFT',
    parentId: 'payments-root',
  },
  {
    id: 'risk-root',
    uniqueName: 'Risk',
    description: 'Root capability for risk services.',
    type: 'ABSTRACT',
    lifecycleStatus: 'ACTIVE',
    parentId: null,
  },
  {
    id: 'risk-assessment',
    uniqueName: 'Risk Assessment',
    description: 'Evaluate model and operational risk.',
    type: 'LEAF',
    lifecycleStatus: 'ACTIVE',
    parentId: 'risk-root',
  },
];

function filterCapabilities(route: Route): MockCapability[] {
  const requestUrl = new URL(route.request().url());
  const search = requestUrl.searchParams.get('search')?.trim().toLowerCase();
  const type = requestUrl.searchParams.get('type');
  const lifecycleStatus = requestUrl.searchParams.get('lifecycleStatus');

  return mockedCapabilities.filter((capability) => {
    if (type && capability.type !== type) {
      return false;
    }

    if (lifecycleStatus && capability.lifecycleStatus !== lifecycleStatus) {
      return false;
    }

    if (!search) {
      return true;
    }

    return (
      capability.uniqueName.toLowerCase().includes(search) ||
      capability.description?.toLowerCase().includes(search)
    );
  });
}

async function mockCapabilityBrowser(page: Page, delayedSearchMs = 0): Promise<void> {
  await page.route('**/api/v1/capabilities*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const items = filterCapabilities(route);
    const limit = Number(requestUrl.searchParams.get('limit') ?? Math.max(items.length, 1));
    const pageNumber = Number(requestUrl.searchParams.get('page') ?? 1);
    const startIndex = Math.max(0, (pageNumber - 1) * limit);
    const pagedItems = items.slice(startIndex, startIndex + limit);

    if (delayedSearchMs > 0 && requestUrl.searchParams.has('search')) {
      await new Promise((resolve) => setTimeout(resolve, delayedSearchMs));
    }

    await route.fulfill({
      json: {
        items: pagedItems,
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

test.describe('Accessibility hardening', () => {
  test('exposes a working skip link and labelled capability tree landmarks', async ({
    page,
  }) => {
    await mockCapabilityBrowser(page);
    await page.goto('/capabilities');

    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    const mainContent = page.locator('#ecm-main-content');

    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await skipLink.press('Enter');
    await expect(mainContent).toBeFocused();
    await expect(page.getByRole('tree', { name: /capability hierarchy/i })).toBeVisible();
    await expect(page.getByRole('group', { name: /capability navigation view/i })).toBeVisible();
  });

  test('supports keyboard navigation for the capability tree', async ({ page }) => {
    await mockCapabilityBrowser(page);
    await page.goto('/capabilities');

    const tree = page.getByRole('tree', { name: /capability hierarchy/i });
    const paymentsRoot = tree.getByRole('treeitem', { name: 'Payments' });
    const paymentProcessing = tree.getByRole('treeitem', {
      name: 'Payment Processing',
    });

    await paymentsRoot.focus();
    await expect(paymentsRoot).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(paymentProcessing).toBeFocused();

    await page.keyboard.press('ArrowUp');
    await expect(paymentsRoot).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(paymentsRoot).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowRight');
    await expect(paymentsRoot).toHaveAttribute('aria-expanded', 'true');
  });

  test('announces live search progress for screen reader users', async ({ page }) => {
    await mockCapabilityBrowser(page, 1500);
    await page.goto('/capabilities');

    await page.getByLabel(/search capabilities/i).fill('risk');

    const searchRegion = page.getByRole('search', {
      name: /search and filter capabilities/i,
    });

    await expect(searchRegion).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Searching capabilities…')).toBeVisible();
    await expect(
      page.getByText('2 capabilities found', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('treeitem', { name: 'Risk Assessment' }),
    ).toBeVisible();
    await expect(
      page.getByRole('treeitem', { name: 'Payments' }),
    ).toHaveCount(0);
  });
});
