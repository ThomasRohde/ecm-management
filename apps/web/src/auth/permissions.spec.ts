/**
 * Tests for the centralized RBAC permissions helper.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRole } from '@ecm/shared';
import * as identity from '../api/identity';
import {
  getCurrentUserRole,
  canCreateCapability,
  canImportCapabilities,
  canEditCapabilityMetadata,
  canPerformStructuralOperations,
  canDeleteCapability,
  canManageChangeRequests,
  canApproveChangeRequests,
  canManageMappings,
  canManageWhatIfBranches,
  canManageReleases,
  canViewAudit,
  getPermissionDeniedMessage,
} from './permissions';

vi.mock('../api/identity');

describe('permissions helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUserRole', () => {
    it('should return null when no role is set', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('');
      expect(getCurrentUserRole()).toBeNull();
    });

    it('should normalize legacy "curator" to UserRole.CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(getCurrentUserRole()).toBe(UserRole.CURATOR);
    });

    it('should normalize legacy "governance-board" to UserRole.GOVERNANCE_APPROVER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('governance-board');
      expect(getCurrentUserRole()).toBe(UserRole.GOVERNANCE_APPROVER);
    });

    it('should handle uppercase enum values directly', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('CONTRIBUTOR');
      expect(getCurrentUserRole()).toBe(UserRole.CONTRIBUTOR);
    });

    it('should handle integration-engineer role', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('integration-engineer');
      expect(getCurrentUserRole()).toBe(UserRole.INTEGRATION_ENGINEER);
    });

    it('should handle admin role', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(getCurrentUserRole()).toBe(UserRole.ADMIN);
    });

    it('should return null for unrecognized roles', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('unknown-role');
      expect(getCurrentUserRole()).toBeNull();
    });
  });

  describe('canCreateCapability', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canCreateCapability()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canCreateCapability()).toBe(true);
    });

    it('should deny VIEWER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('viewer');
      expect(canCreateCapability()).toBe(false);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canCreateCapability()).toBe(false);
    });

    it('should deny STEWARD', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('steward');
      expect(canCreateCapability()).toBe(false);
    });

    it('should deny GOVERNANCE_APPROVER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('governance-board');
      expect(canCreateCapability()).toBe(false);
    });
  });

  describe('canImportCapabilities', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canImportCapabilities()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canImportCapabilities()).toBe(true);
    });

    it('should deny INTEGRATION_ENGINEER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('integration-engineer');
      expect(canImportCapabilities()).toBe(false);
    });
  });

  describe('canEditCapabilityMetadata', () => {
    it('should allow CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canEditCapabilityMetadata()).toBe(true);
    });

    it('should deny VIEWER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('viewer');
      expect(canEditCapabilityMetadata()).toBe(false);
    });
  });

  describe('canPerformStructuralOperations', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canPerformStructuralOperations()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canPerformStructuralOperations()).toBe(true);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canPerformStructuralOperations()).toBe(false);
    });

    it('should deny STEWARD', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('steward');
      expect(canPerformStructuralOperations()).toBe(false);
    });
  });

  describe('canDeleteCapability', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canDeleteCapability()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canDeleteCapability()).toBe(true);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canDeleteCapability()).toBe(false);
    });
  });

  describe('canManageChangeRequests', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canManageChangeRequests()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canManageChangeRequests()).toBe(true);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canManageChangeRequests()).toBe(false);
    });

    it('should deny STEWARD', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('steward');
      expect(canManageChangeRequests()).toBe(false);
    });

    it('should deny VIEWER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('viewer');
      expect(canManageChangeRequests()).toBe(false);
    });
  });

  describe('canApproveChangeRequests', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canApproveChangeRequests()).toBe(true);
    });

    it('should allow GOVERNANCE_APPROVER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('governance-board');
      expect(canApproveChangeRequests()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canApproveChangeRequests()).toBe(true);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canApproveChangeRequests()).toBe(false);
    });
  });

  describe('canManageMappings', () => {
    it('should allow INTEGRATION_ENGINEER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('integration-engineer');
      expect(canManageMappings()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canManageMappings()).toBe(true);
    });

    it('should deny CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canManageMappings()).toBe(false);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canManageMappings()).toBe(false);
    });
  });

  describe('canManageWhatIfBranches', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canManageWhatIfBranches()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canManageWhatIfBranches()).toBe(true);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canManageWhatIfBranches()).toBe(false);
    });
  });

  describe('canManageReleases', () => {
    it('should allow CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canManageReleases()).toBe(true);
    });

    it('should allow GOVERNANCE_APPROVER', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('governance-board');
      expect(canManageReleases()).toBe(true);
    });

    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canManageReleases()).toBe(true);
    });

    it('should deny CONTRIBUTOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('contributor');
      expect(canManageReleases()).toBe(false);
    });
  });

  describe('canViewAudit', () => {
    it('should allow ADMIN', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('admin');
      expect(canViewAudit()).toBe(true);
    });

    it('should deny CURATOR', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('curator');
      expect(canViewAudit()).toBe(false);
    });
  });

  describe('getPermissionDeniedMessage', () => {
    it('should return login message when no role is set', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('');
      expect(getPermissionDeniedMessage('create capabilities')).toBe(
        'You must be logged in to create capabilities.'
      );
    });

    it('should return role-specific message when role is set', () => {
      vi.mocked(identity.getUserRole).mockReturnValue('viewer');
      expect(getPermissionDeniedMessage('create capabilities')).toBe(
        'Your current role (VIEWER) does not have permission to create capabilities.'
      );
    });
  });
});
