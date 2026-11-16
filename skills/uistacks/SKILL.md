---
name: uistacks
description: Build React + Tailwind screens with UI Stacks (uistacks.dev) animated components, blocks and templates. Use when the user asks for UI such as AI chat, agent runs, dashboards, charts, forms, checkout, pricing or settings, or mentions UI Stacks, @uistacks or @uistacks-pro.
---

# UI Stacks

UI Stacks is a library of animated React 19.2+ components for Tailwind CSS v4 and Motion: 280+ components, plus blocks
(page sections) and templates (full app screens). Free components are MIT; Pro items need a license key.

## Before writing UI by hand

1. Search the catalogue first. Use the shadcn MCP tools if they are connected, or run
   `npx shadcn@latest search @uistacks -q "<what you need>"`. The full list with descriptions is at
   https://uistacks.dev/llms.txt, and each item has a Markdown page: `https://uistacks.dev/components/<name>/md`
   (also `/blocks/<name>/md` and `/templates/<name>/md`).
2. Prefer an existing component, block or template over new markup. Compose several when one screen needs them.
3. Only write custom UI for what the catalogue does not cover, and match its look (tokens below).

## Installing

- Free: `npx shadcn add @uistacks/<name>`.
- Pro components, blocks and templates: `npx shadcn add @uistacks-pro/<name>`. This needs the
  `@uistacks-pro` registry in components.json and the license key in the `UISTACKS_LICENSE_KEY` environment variable
  (set up once, see https://uistacks.dev/docs/agents). If a Pro install answers 401, tell the user to set the key; never
  ask them to paste the key into the chat, never print it, never write it into a committed file.
- Never invent or reconstruct Pro source code. If a Pro item can't be installed, say so and suggest the free
  alternative or the setup step.
- Components land in `components/ui/<name>.tsx`; blocks and templates in `components/`. They import components from
  `@/components/ui/<name>`, so keep that folder.

## Keep the look

- Colours, surfaces and shadows come from CSS variables the install adds to globals.css: `--bg`, `--surface`,
  `--subtle`, `--muted`, `--fg`, `--fg-muted`, `--fg-subtle`, `--select`, `--success`, `--warning`, `--danger`,
  `--shadow-card` and others, with Tailwind classes such as `bg-surface`, `text-fg-muted`, `ring-[var(--select)]`.
  Use them instead of raw hex colours or Tailwind's default palette.
- Dark mode follows a `.dark` class on a parent (`@custom-variant dark (&:where(.dark, .dark *))`). Check new screens in
  Light and Dark.
- Calm and mostly monochrome; the select blue is for selected and focused states. Radius 8 and up, cards about 20,
  controls as full pills. Lucide icons at 20 px (16 in small controls), stroke 1.5.
- Motion: use `motion/react`, keep animations short and purposeful, and respect reduced motion.
- Keep accessibility: labels, keyboard support and `focus-visible` rings.

## Wiring

- Components take data and callbacks through props (each Markdown page lists them). Replace sample data with the
  app's real data and connect callbacks to real actions instead of console logs or toasts alone.
- Templates are full screens: render the default export in a full-height container; under 1024 px they switch to a
  one-column layout.
