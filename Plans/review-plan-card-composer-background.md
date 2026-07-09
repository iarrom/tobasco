# Match the Review Plan Card Background to the Composer

The Cursor-style "Review Plan" card (`NativeChatReviewPlanCard`) docks directly above the chat composer, but its surface fill doesn't match the composer box: the composer uses a translucent input surface in dark mode (`bg-card dark:bg-input/30`) while the card uses a flat `bg-card` with no dark variant. This makes the two stacked surfaces read as different materials in dark mode. This change gives the card the same background treatment as the composer so they look like one continuous surface.

## Current state (verified)

- **Composer box** — `src/renderer/src/components/native-chat/NativeChatComposerField.tsx:181-187`:
  ```tsx
  <div
    className={cn(
      'rounded-xl border border-input bg-card p-1.5 shadow-xs transition-colors',
      'dark:bg-input/30'
    )}
  >
  ```
  So the composer surface = `bg-card` in light mode, `bg-input/30` in dark mode, with `border-input` and `shadow-xs`. The same `border-input` + `bg-card` + `dark:bg-input/30` recipe is used across the native chat for input-like surfaces (user message bubble `NativeChatMessageRow.tsx:232`, editor `NativeChatUserMessageEditor.tsx:42`, send-queue chip `NativeChatSendQueue.tsx:53`).

- **Review Plan card outer box** — `src/renderer/src/components/native-chat/NativeChatReviewPlanCard.tsx:60-61`:
  ```tsx
  <div className="mx-auto w-full max-w-xl px-3 pb-1 sm:px-4">
    <div className="rounded-lg border border-border bg-card p-2 shadow-sm">
  ```
  Differences from the composer: no `dark:bg-input/30` (the visible mismatch — flat card fill in dark mode), `border-border` instead of `border-input`, and `shadow-sm` instead of `shadow-xs`.

The card and the composer share the same `mx-auto w-full max-w-xl … px-3 sm:px-4` column wrapper, so they're already width-aligned and stacked; only the inner box fill/border differ.

## The change

In `NativeChatReviewPlanCard.tsx:61`, update the inner box className so its background matches the composer. The required change (the user's ask — "фон как у компоузера") is adding the dark-mode input fill; align the border and shadow token as well so the two boxes are the same material rather than only the same light-mode color:

```tsx
<div className="rounded-lg border border-input bg-card p-2 shadow-xs transition-colors dark:bg-input/30">
```

- `bg-card` + `dark:bg-input/30` — the actual background parity (this is the visible fix; light mode was already `bg-card`, dark mode now matches).
- `border-border` → `border-input` — matches the composer's border token so the outline reads the same.
- `shadow-sm` → `shadow-xs` — matches the composer's shadow tier.
- Keep `rounded-lg` and `p-2` as-is: the card is intentionally a slightly different shape/padding from the composer (`rounded-xl`, `p-1.5`); only the *background/material* is being matched, not the geometry. (If full geometric parity is later wanted, `rounded-xl` would match — out of scope here.)
- `transition-colors` mirrors the composer so theme/hover transitions are consistent; optional but cheap and matches the sibling.

No new tokens are introduced — all classes (`bg-card`, `dark:bg-input/30`, `border-input`, `shadow-xs`) are the documented input-surface recipe already used by the composer and message bubbles, satisfying the design-system rule in AGENTS.md / STYLEGUIDE.md.

Note: the inner title uses `text-card-foreground` (line 80), which pairs correctly with a `bg-card`/`bg-input/30` surface, so no text-contrast change is needed.

## Verification

- Live check (dev/HMR) in both light and dark themes: trigger Plan mode so the Review Plan card docks above the composer, and confirm the card fill and border now visually match the composer box directly beneath it (especially in dark mode, where the flat card fill previously stood out). Confirm the title/preview text and the amber Build button remain legible against the surface.
- Confirm the dismiss (X) hover (`hover:bg-input/30`) and the Build button styling are unaffected.
- Lint/typecheck only — this is a className-only change; no logic, no new strings, no `max-lines` impact.

## To-do

- [x] Re-read `NativeChatReviewPlanCard.tsx:61` and `NativeChatComposerField.tsx:184-186` to confirm current classNames before editing.
- [x] Update the Review Plan card's inner box className to `rounded-lg border border-input bg-card p-2 shadow-xs transition-colors dark:bg-input/30` (add `dark:bg-input/30`, swap `border-border`→`border-input`, `shadow-sm`→`shadow-xs`).
- [ ] Live-verify in light and dark themes that the card background/material matches the composer box below it. _(HMR-live; className-only change — visual confirm left to the user running the app.)_
- [x] Run lint/typecheck to confirm no regressions (`tsgo -p config/tsconfig.tc.web.json` and `oxlint` on the file — both clean).
