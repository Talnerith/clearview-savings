# 0005 — Patient web UI is desktop-dedicated

## Context

At the M9 visual review (pause 2 of 3) the user rejected the restyled
patient UI as still reading like "a mobile app": narrow centered columns
(max-w-3xl ≈ 768px) on a wide desktop browser, where the reference bank
sites (TD EasyWeb, Coast Capital) lay out for full PC browser width. The
user's intent, stated at review: the patient *website* is a dedicated PC
desktop experience; phones and tablets will be served later by a
separate, possibly native, app. The patient (the user's father) browses
on a PC.

## Decision

The patient route group (`app/(patient)/...`) is designed for desktop
browsers only. Content containers are desktop-width (max-w-6xl for data
pages, max-w-3xl for focused flows like the deposit wizard), copy uses
desktop verbs ("Click", not "Tap"), and no layout element collapses,
stacks, or hides for small screens. Mobile support, when it comes, is a
separate app — not responsive breakpoints in this codebase.

## Alternatives considered

- **Responsive single codebase (status quo through M9 Step 6)** —
  rejected: the mobile-first compromises (narrow column, collapsing
  table columns, tap vocabulary) are exactly what made the site fail
  the "looks like my bank on my PC" test that is the product's
  therapeutic core.
- **Adaptive serving (separate mobile web view by user-agent)** —
  rejected: maintains two web UIs for a product whose mobile story is
  already earmarked for a dedicated app.

## Consequences

- Patient pages may use the full desktop canvas: wide tables with all
  columns always visible, hero bands with left/right composition,
  desktop-scale chrome.
- Do not re-add `sm:`/`md:` collapse-or-hide patterns to patient
  routes; a phone visitor sees the desktop layout until the dedicated
  app exists. (`flex-wrap` on bands is fine — that is graceful
  overflow, not a mobile layout.)
- The future mobile app is a separate design effort; nothing in the
  patient web UI should be contorted to anticipate it.
- The caregiver route group is untouched by this ADR.

## Date

2026-06-11
