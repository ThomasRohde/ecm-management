# Frontend Instructions (apps/web)

These instructions apply to all files under `apps/web/`.

## React Component Patterns

### File Structure
```
apps/web/src/
  components/          # Shared/reusable components
    ui/                # Generic UI primitives (Button, Modal, etc.)
    capability/        # Capability-specific components
  pages/               # Route-level page components
  hooks/               # Custom React hooks
  services/            # API client and data fetching
  stores/              # State management
  types/               # Frontend-specific types (import shared types from packages/shared)
  utils/               # Pure utility functions
```

### Component Conventions
- Functional components only - no class components
- One component per file, file name matches component name
- Co-locate component, tests, and styles: `CapabilityTree.tsx`, `CapabilityTree.spec.tsx`, `CapabilityTree.module.css`
- Use named exports, not default exports

```typescript
// CapabilityCard.tsx
export function CapabilityCard({ capability, onSelect }: CapabilityCardProps) {
  // ...
}

// NOT: export default function CapabilityCard
```

### Props
- Define props interfaces in the same file, above the component
- Suffix with `Props`: `CapabilityCardProps`, `StewardBadgeProps`
- Use destructuring in the function signature
- Mark optional props explicitly with `?`

```typescript
interface CapabilityTreeNodeProps {
  capability: CapabilityDto;
  depth: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onSelect?: (id: string) => void;
}
```

### Hooks
- Prefix custom hooks with `use`: `useCapabilities`, `useChangeRequest`
- Extract data fetching into custom hooks
- Extract complex state logic into custom hooks
- Keep hooks focused on a single concern

```typescript
export function useCapability(id: string) {
  // Fetch, cache, error handling
  return { capability, isLoading, error, refetch };
}
```

## State Management

### Approach
- **Server state**: Use React Query (TanStack Query) for all API data fetching, caching, and synchronization
- **Local UI state**: Use React `useState` and `useReducer`
- **Shared UI state**: Use React Context for cross-component UI state (e.g., selected view, sidebar open)
- **Form state**: Use React Hook Form or controlled components
- Avoid global state stores unless complexity demands it

### React Query Conventions
```typescript
// Query keys follow a consistent hierarchy
const capabilityKeys = {
  all: ['capabilities'] as const,
  lists: () => [...capabilityKeys.all, 'list'] as const,
  list: (filters: CapabilityFilters) => [...capabilityKeys.lists(), filters] as const,
  details: () => [...capabilityKeys.all, 'detail'] as const,
  detail: (id: string) => [...capabilityKeys.details(), id] as const,
};
```

## API Client Usage

### Centralized Client
All API calls go through a centralized client. Never use raw `fetch` in components.

```typescript
// services/api-client.ts
class ApiClient {
  private baseUrl: string;

  async get<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> { /* ... */ }
  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> { /* ... */ }
  async put<T>(path: string, body: unknown): Promise<ApiResponse<T>> { /* ... */ }
  async delete(path: string): Promise<void> { /* ... */ }
}

export const apiClient = new ApiClient(import.meta.env.VITE_API_URL);
```

### Service Modules
Group API calls by domain concept:

```typescript
// services/capability.service.ts
export const capabilityService = {
  list: (filters?: CapabilityFilters) => apiClient.get<CapabilityDto[]>('/capabilities', filters),
  getById: (id: string) => apiClient.get<CapabilityDto>(`/capabilities/${id}`),
  create: (data: CreateCapabilityDto) => apiClient.post<CapabilityDto>('/capabilities', data),
  // ...
};
```

## Styling Approach: Sapphire Design System

The frontend uses a lightweight CSS approximation of Danske Bank's Sapphire design system. All tokens and component classes live in `apps/web/src/styles/sapphire.css`.

### Core Rules
- **Never hardcode colors, spacing, or font sizes** - always use Sapphire CSS custom properties
- Apply `sapphire-theme-default` class on `<body>` to activate tokens
- Use semantic tokens (e.g. `--sapphire-semantic-color-foreground-primary`) not global ones
- Buttons use pill-shaped `border-radius` matching their height
- Disabled elements use `opacity: 0.3`
- Focus rings: `2px solid blue-400`, offset by 2px

### Available Component Classes
| Class Prefix | Use For |
|---|---|
| `sapphire-surface` | Root container with theme |
| `sapphire-text--heading-*` / `sapphire-text--body-*` | Typography |
| `sapphire-card` | Content containers |
| `sapphire-button--primary/secondary/tertiary/danger` | Buttons (3 sizes: sm/md/lg) |
| `sapphire-text-field` | Text inputs |
| `sapphire-badge--neutral/accent/positive/warning/negative` | Status badges |
| `sapphire-stack` / `sapphire-row` | Flex layout with gap utilities |
| `sapphire-container` | Max-width centered container |
| `sapphire-separator` | Horizontal/vertical dividers |

### Lifecycle Status Badge Mapping
| Status | Badge Variant |
|---|---|
| DRAFT | `sapphire-badge--neutral` |
| ACTIVE | `sapphire-badge--positive` |
| DEPRECATED | `sapphire-badge--warning` |
| RETIRED | `sapphire-badge--negative` |

### Theme Variants
| Class | Surface | Use |
|---|---|---|
| `sapphire-theme-default` | White | Primary surface |
| `sapphire-theme--secondary` | Sand-50 | Elevated sections |
| `sapphire-theme--tertiary` | Sand-100 | Nested containers |
| `sapphire-theme--contrast` | Gray-900 | Dark mode / hero sections |

### Component-Specific CSS
For component-specific styles beyond Sapphire classes, use CSS Modules:
- Co-locate: `Component.module.css` alongside `Component.tsx`
- Use camelCase class names
- Reference Sapphire tokens in your module CSS:

```css
/* CapabilityTree.module.css */
.treeNode {
  padding: var(--sapphire-semantic-size-spacing-xs);
  border-radius: var(--sapphire-semantic-size-radius-md);
}
.treeNode:hover {
  background: var(--sapphire-semantic-color-state-neutral-ghost-hover);
}
```

## Accessibility Requirements

Accessibility is a baseline requirement, not an enhancement.

### Mandatory Practices
- All interactive elements must be keyboard navigable
- Use semantic HTML (`<button>`, `<nav>`, `<main>`, `<article>`) over generic `<div>` and `<span>`
- All images and icons need descriptive `alt` text or `aria-label`
- Form inputs must have associated `<label>` elements
- Color must not be the sole indicator of state - use icons, text, or patterns alongside color
- Focus management: modals trap focus, closing returns focus to trigger element
- ARIA roles and attributes where semantic HTML is insufficient

### Capability Tree Specifics
- Tree views must implement WAI-ARIA Treeview pattern (`role="tree"`, `role="treeitem"`)
- Arrow key navigation for tree expansion/collapse
- Screen reader announcements for structural changes
- Breadcrumbs must use `<nav aria-label="Breadcrumb">` with `<ol>`

### Testing Accessibility
- Use `@testing-library/jest-dom` matchers (`toBeVisible`, `toHaveAccessibleName`)
- Run axe-core checks in component tests where feasible
- Test keyboard navigation in integration/E2E tests

## Domain Language in UI

- Display "Steward" not "Owner" in all labels, headings, and tooltips
- Capability hierarchy navigation should show breadcrumbs from root
- Clearly distinguish Draft vs Published state in the UI (visual indicators)
- Use lifecycle status badges: Draft, Active, Deprecated, Retired
- Show change request status on affected capabilities
