import { expect, test } from '@playwright/test';
import {
  createCapabilityViaApi,
  createUniqueCapabilityName,
  deleteCapabilityViaApi,
} from './capability-test-helpers';

test.describe('Phase 2A breadcrumb navigation', () => {
  test('renders collapsed breadcrumbs and navigates through breadcrumb links', async ({
    page,
    request,
  }) => {
    const breadcrumbRoot = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Breadcrumb Root'),
      type: 'ABSTRACT',
      lifecycleStatus: 'DRAFT',
    });
    const breadcrumbBranch = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Breadcrumb Branch'),
      parentId: breadcrumbRoot.id,
      type: 'ABSTRACT',
      lifecycleStatus: 'DRAFT',
    });
    const breadcrumbParent = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Breadcrumb Parent'),
      parentId: breadcrumbBranch.id,
      type: 'ABSTRACT',
      lifecycleStatus: 'DRAFT',
    });
    const breadcrumbLeaf = await createCapabilityViaApi(request, {
      uniqueName: createUniqueCapabilityName('Breadcrumb Leaf'),
      parentId: breadcrumbParent.id,
      type: 'LEAF',
      lifecycleStatus: 'DRAFT',
    });

    try {
      await page.goto(`/capabilities/${breadcrumbLeaf.id}`);

      const breadcrumbNav = page.getByRole('navigation', { name: /breadcrumb/i });
      await expect(breadcrumbNav).toBeVisible();
      await expect(breadcrumbNav).toContainText(breadcrumbRoot.uniqueName);

      await page
        .getByRole('button', { name: /show 2 hidden breadcrumb items/i })
        .click();

      await expect(breadcrumbNav).toContainText(breadcrumbBranch.uniqueName);
      await expect(breadcrumbNav).toContainText(breadcrumbParent.uniqueName);

      await page.getByRole('link', { name: breadcrumbBranch.uniqueName }).click();

      await expect(page).toHaveURL(new RegExp(`/capabilities/${breadcrumbBranch.id}$`));
      await expect(
        page.getByRole('heading', { name: breadcrumbBranch.uniqueName, exact: true }),
      ).toBeVisible();
    } finally {
      await deleteCapabilityViaApi(request, breadcrumbLeaf.id);
      await deleteCapabilityViaApi(request, breadcrumbParent.id);
      await deleteCapabilityViaApi(request, breadcrumbBranch.id);
      await deleteCapabilityViaApi(request, breadcrumbRoot.id);
    }
  });
});
