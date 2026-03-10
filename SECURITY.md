# Security - ECM Management Platform

## Overview

The ECM Management Platform is the operational system of record for the enterprise capability model. It handles governance workflows, audit trails, and downstream publishing. Security is a first-class concern because the platform manages authoritative enterprise architecture data and controls who can make structural changes to the model.

## Authentication

### Enterprise SSO (NFR-1)

The platform must support enterprise Single Sign-On for all interactive users.

The production identity provider and protocol are deployment decisions that must
be captured in an ADR before production rollout. Local username/password auth in
this repository is a development and evaluation convenience only.

**Requirements**:
- All interactive users must authenticate via enterprise SSO before accessing the platform.
- Service-to-service communication (API consumers, downstream integrations) must use API keys or OAuth2 client credentials.
- Session tokens must have a configurable expiry with refresh capability.
- Failed authentication attempts must be logged for security monitoring.

**Local development mode**:
- For local development and evaluation, the platform must support a simplified authentication mode (e.g., local user database or mock SSO).
- Local auth must use the same RBAC role model so that authorization logic is testable without enterprise SSO infrastructure.

## Authorization - Role-Based Access Control (NFR-2)

### Role definitions

The platform implements RBAC with the following roles, derived from the PRD user personas and NFR-2:

| Role | Description | Typical user |
|------|-------------|--------------|
| **viewer** | Read-only access to published model states, releases, and reports. Cannot see draft content. | P5 - Consumers, executives, analysts |
| **contributor** | Can view draft content and submit metadata edits. Cannot perform structural changes or approve requests. | P3 - Business Stewards (if active users in v1) |
| **steward** | Can edit metadata for assigned capabilities and subtrees. Can respond to tasks and notifications. Cannot perform structural changes unilaterally. | P3 - Business Stewards / Coordinators |
| **curator** | Full capability management: create, edit, structural operations, create what-if branches, prepare releases. Can submit change requests and execute approved changes. | P1 - EA Curator |
| **governance_approver** | Can review and approve/reject structural change requests and release publications. May also hold curator permissions. | P2 - Architecture Governance Board |
| **integration_engineer** | Can manage downstream consumer configurations, view sync status, configure transformation profiles, and manage API keys. | P4 - Integration / Platform Engineer |
| **admin** | Full system access including user management, role assignment, system configuration, and audit log access. | Platform administrators |

### Permission matrix

| Action | viewer | contributor | steward | curator | governance_approver | integration_engineer | admin |
|--------|--------|-------------|---------|---------|---------------------|----------------------|-------|
| View published model | Y | Y | Y | Y | Y | Y | Y |
| View draft content | - | Y | Y | Y | Y | Y | Y |
| Search capabilities | Y | Y | Y | Y | Y | Y | Y |
| View version diffs | Y | Y | Y | Y | Y | Y | Y |
| Edit metadata (assigned) | - | Y | Y | Y | Y | - | Y |
| Edit metadata (any) | - | - | - | Y | - | - | Y |
| Create capability (draft) | - | - | - | Y | - | - | Y |
| Submit structural change request | - | - | - | Y | - | - | Y |
| Approve structural change | - | - | - | - | Y | - | Y |
| Execute approved structural change | - | - | - | Y | - | - | Y |
| Create what-if branch | - | - | - | Y | - | - | Y |
| Prepare release | - | - | - | Y | - | - | Y |
| Approve release publication | - | - | - | - | Y | - | Y |
| Publish release | - | - | - | Y | - | - | Y |
| Manage downstream consumers | - | - | - | - | - | Y | Y |
| View sync status | - | - | - | Y | Y | Y | Y |
| Manage API keys | - | - | - | - | - | Y | Y |
| Manage users and roles | - | - | - | - | - | - | Y |
| View audit logs | - | - | - | Y | Y | Y | Y |
| Hard delete (draft/erroneous) | - | - | - | Y | - | - | Y |

### Subtree-scoped permissions

Per FR-20, stewardship assignment works at the subtree level:

- A steward assigned to a capability subtree can edit metadata for all capabilities in that subtree.
- Explicit exceptions can override inherited stewardship (e.g., a subtree steward does not automatically steward a child that has been explicitly assigned to another steward).
- The implemented resolution order is "most specific assignment wins": a direct assignment overrides inherited stewardship, and otherwise the nearest explicitly assigned ancestor determines effective stewardship.
- The permission system must enforce these scoping rules at the API level, not just in the UI.

## Data protection

### Audit trail integrity (NFR-5)

- All change, approval, publish, and rollback actions must produce immutable audit records.
- Audit records must not be editable or deletable through the application, even by admins.
- Audit records must include: who, what, when, why (rationale), and the before/after state for data changes.

### Sensitive data handling

- The platform does not store personal data beyond user identifiers (names, email addresses) obtained from SSO.
- API keys and service credentials must be stored encrypted at rest.
- Database connection strings and secrets must not appear in application logs or error responses.
- Environment-specific secrets must be managed via environment variables or a secrets manager, never committed to the repository.

### Data classification

| Data type | Classification | Protection |
|-----------|---------------|------------|
| Capability model (published) | Internal | Access controlled by viewer+ role |
| Capability model (draft) | Confidential | Access controlled by contributor+ role |
| Audit trail | Confidential | Append-only, no application-level delete |
| User identifiers | Internal/PII | Obtained from SSO, minimal local storage |
| API keys | Secret | Encrypted at rest, masked in logs |
| Change request rationale | Confidential | Access controlled by contributor+ role |

## Infrastructure security

### Local development

- Docker Compose services must not expose database ports to external networks by default.
- Default credentials in docker-compose.yml must be clearly marked as development-only.
- The pre-seeded local admin account exists only to simplify laptop-based evaluation and must never be reused outside local development/demo environments.
- `.env` files must be in `.gitignore`.

### AWS deployment

**Minimum requirements for production**:
- TLS for all communication (API, frontend, database connections).
- Database encryption at rest.
- VPC isolation for backend and database services.
- IAM roles with least-privilege policies for ECS tasks.
- Secrets managed via AWS Secrets Manager or Parameter Store, not environment variables in task definitions.

**Current deployment baseline**:
- `infrastructure/aws/ecs-api-task-definition.json` defines a Fargate-ready API task with:
  - task and execution roles separated for least privilege
  - Secrets Manager references for `DATABASE_URL` and `JWT_SECRET`
  - health checks against `/api/v1/health/live`
  - CloudWatch log shipping
  - production rate limiting enabled by environment
- `infrastructure/aws/rds-postgres-config.json` defines the expected RDS posture:
  - PostgreSQL 16 on private subnets only
  - storage encryption enabled
  - Multi-AZ enabled
  - deletion protection enabled
  - managed master password storage
  - Performance Insights enabled

**Network controls**:
- Place the load balancer in public subnets with TLS termination.
- Keep the ECS service and RDS instance in private subnets.
- Restrict the database security group to the ECS task security group only.
- Do not expose PostgreSQL directly to the public internet.

## API security

- All API endpoints must require authentication (except health check).
- Authorization must be enforced at the controller level using guards/middleware.
- Input validation must reject malformed or oversized payloads.
- Rate limiting must be applied to prevent abuse.
- CORS must be configured to allow only the frontend origin.
- API responses must not leak internal implementation details (stack traces, database errors).
- The API now applies baseline hardening headers on every response:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), geolocation=(), microphone=()`
- The Express `x-powered-by` header is disabled at bootstrap.

## Frontend security

- The web shell now sends a baseline Content Security Policy via `apps/web/index.html`.
- The browser referrer policy is set to `no-referrer`.
- External source-reference links use `rel="noopener noreferrer"` when opened in a new tab.
- React UI surfaces continue to avoid `dangerouslySetInnerHTML`; content is rendered through typed component state instead of raw HTML injection.

This repository does not yet automate downstream consumer API key lifecycle
management. Until that is added, provision integration credentials out of band
and store them in a secrets manager rather than in source control or task
definitions.

## Responsible disclosure

If you discover a security vulnerability in the ECM Management Platform, please report it responsibly:

1. **Do not** open a public issue.
2. Prefer GitHub private vulnerability reporting at `https://github.com/ThomasRohde/ecm-management/security/advisories/new` when it is enabled.
3. If private vulnerability reporting is not available, email Thomas Klok Rohde at `rohde.thomas@gmail.com`.
4. Include:
   - Description of the vulnerability.
   - Steps to reproduce.
   - Potential impact.
   - Suggested fix (if any).
5. Repository maintainers should acknowledge valid reports within **3 business days**.
6. The team will work with you to understand and resolve the issue before any public disclosure.

## Security testing

- Authentication and authorization must be covered by integration tests.
- Each role in the permission matrix must have at least one positive and one negative test case.
- Structural change operations must verify that locking and approval checks cannot be bypassed.
- API endpoints must be tested for unauthenticated access (expect 401) and unauthorized access (expect 403).

## References

- PRD NFR-1: Security and access control (enterprise SSO with RBAC).
- PRD NFR-2: Roles (viewer, contributor, steward, curator, governance approver, integration engineer, admin).
- PRD NFR-5: Auditability (immutable evidence of change, approval, publish, and rollback actions).
- PRD FR-6 through FR-11: Workflow and governance requirements.
- PRD FR-19 through FR-22: Stewardship and metadata requirements.
