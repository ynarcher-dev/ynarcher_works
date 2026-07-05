# Icon Implementation Rules

This document defines how Works uses icons in React UI code.

## Default Library

* Use `lucide-react` as the default icon library for Works.
* Do not use emoji for navigation or action icons. Emoji rendering differs across OS and browsers.
* Do not hand-code inline SVG paths for ordinary UI icons.

## Usage Pattern

Import the icon component and render it directly:

```tsx
import { Rocket } from 'lucide-react'

<Rocket aria-hidden className="size-4" />
```

For icon maps, use the `LucideIcon` type:

```tsx
import { Rocket, BriefcaseBusiness } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const sidebarIconByTab: Record<string, LucideIcon> = {
  startups: Rocket,
  experts: BriefcaseBusiness,
}
```

## Size Rules

* Sidebar and inline UI icons: `16px` using `size-4`.
* Icon-only buttons: `20px` using `size-5`.
* Keep lucide's default stroke style unless a component has a specific visual reason to adjust it.

## Accessibility

* Decorative icons must use `aria-hidden`.
* Icon-only buttons must provide `aria-label`.
* Collapsed sidebar items must provide `title` so users can identify each icon on hover.

## Sidebar Collapse

* Expanded sidebar width: `240px`.
* Collapsed sidebar width: `64px`.
* In collapsed mode, hide group labels and menu text. Keep icons visible.
* Add new sidebar icons by mapping the menu `tab` or workspace key to a `LucideIcon` component.
