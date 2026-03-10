# ADR-0002: Sapphire Design System (Lightweight CSS Approximation)

**Status:** Accepted

**Date:** 2026-03-09

---

## Context

The ECM Management Platform frontend needs a consistent, professional design language. Options considered:

1. **Tailwind CSS** - Utility-first, fast development, but requires learning utility classes and produces verbose markup.
2. **CSS Modules (custom)** - Full control, but requires designing every component from scratch.
3. **Material UI / Ant Design** - Rich component libraries, but heavy bundle size and opinionated theming.
4. **Sapphire Design System (lightweight CSS)** - CSS-only approximation of Danske Bank's Sapphire system using design tokens and component patterns. No npm dependencies for the design system itself.

## Decision

Adopt the Sapphire design system as a lightweight CSS approximation. All design tokens (colors, spacing, typography, radii, shadows, control sizes) and component classes (surface, text, card, button, badge, form fields, layout) are defined in a single CSS file: `apps/web/src/styles/sapphire.css`.

### Key characteristics:
- **Token-driven**: All styling references CSS custom properties — no hardcoded values
- **Framework-agnostic**: Pure CSS classes work with React or any future framework
- **Theme-capable**: Multiple surface levels (default, secondary, tertiary, contrast) via theme classes
- **Accessible**: Built-in focus rings, disabled opacity, reduced-motion support
- **Lightweight**: No runtime JavaScript, no npm dependency, just CSS

### Component classes provided:
- Typography: `sapphire-text--heading-*`, `sapphire-text--body-*`, modifiers
- Layout: `sapphire-stack`, `sapphire-row`, `sapphire-container`
- Cards: `sapphire-card`, `sapphire-card--elevated`
- Buttons: 7 variants (primary, secondary, tertiary, danger, danger-secondary, danger-tertiary, text) × 3 sizes
- Badges: 5 semantic variants (neutral, accent, positive, warning, negative)
- Form fields: `sapphire-text-field`, `sapphire-field-label`
- Utilities: `sapphire-separator`, `sapphire-surface`

## Consequences

### Positive
- Zero design system dependencies to maintain or update
- Consistent visual language from day one
- Easy to extend with additional component classes as needed
- CSS custom properties enable future theming/dark mode
- No build step for the design system itself

### Negative
- Manual effort to add new component patterns not yet in the CSS file
- No component-level JavaScript behavior (modals, dropdowns need React logic)
- Not the "real" Sapphire — if the official package becomes available, migration would be needed

### Provisional
- Component-specific styles beyond Sapphire classes use CSS Modules (co-located `.module.css` files)
- If the project needs more complex components (data tables, tree views), consider adding a headless UI library (e.g., Radix UI) with Sapphire styling on top
