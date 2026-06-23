# Screenshots

This folder holds the images embedded in the root `README.md`. It lives
under `docs/` (not `public/`) on purpose: `public/` is served live at the
deployed domain, and caregiver/admin screenshots carry vocabulary that
must never be reachable on the patient-facing host. Keeping them here puts
them in the repo for the README without serving them to visitors.

## How to add or refresh a screenshot

1. Run the app locally: `pnpm dev`, then open http://localhost:3000.
   Seed demo data first with `pnpm seed` so the views aren't empty.
2. Capture each view at a desktop width (~1280px wide; the patient UI is
   desktop-dedicated — see ADR 0005). Use your OS screenshot tool or the
   browser devtools device toolbar.
3. Save each as a **PNG** in this folder using the exact filename the
   README expects (table below). Overwrite to refresh.
4. Keep files reasonably small (< ~500 KB each); compress if needed.
5. Commit the PNGs. The README references them by relative path, so they
   render on GitHub and in any Markdown viewer with no extra config.

## Expected files

| Filename                  | View to capture                                   |
| ------------------------- | ------------------------------------------------- |
| `marketing-landing.png`   | Public landing page (`/`)                         |
| `patient-home.png`        | Patient home — greeting band + account rows       |
| `patient-account.png`     | Patient account — hero balance band + tx table    |
| `patient-deposit.png`     | "Deposit a Check" wizard (any step)               |
| `caregiver-dashboard.png` | Caregiver dashboard (after sign-in)               |

> **Privacy:** the patient views must use demo/seed data only — never a
> real person's name or balances. Crop out anything that isn't the app.
