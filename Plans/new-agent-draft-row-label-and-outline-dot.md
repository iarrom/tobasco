# New "New Agent" Draft Row: Label + Outline-Only Status Dot

Make a freshly-created blank agent in the Cursor-style agents sidebar read as **"New Agent"** and render its status indicator as a **gray outline-only circle** (a ring with no fill), matching the Cursor reference screenshot. Both the label fallback and the dot styling live in a single component, `src/renderer/src/components/sidebar/worktree-card-compact-agent-row.tsx`, so this is a tightly-scoped, two-line-region change plus reuse of an existing i18n key.

## Background / current behavior

The compact agent row (`CompactAgentRow`) drives every row in the agents-view sidebar (`AgentsSidebarView` → `AgentsViewRows` → `CompactAgentRow`). Two pieces of its logic are relevant, both in `worktree-card-compact-agent-row.tsx`:

- **Title** — `getCompactAgentPrimary()` (lines 42–57). For a blank agent (no custom title, no prompt) it falls through to `agent.tab.generatedTitle ?? agent.tab.title`, and only then to `agentStateLabel(...)`. So a new blank agent currently shows whatever the tab's title happens to be (e.g. a state word or a stale tab label), not a clean "New Agent".
- **Status dot** — the `rowIndicator === 'draft'` branch (line 242) renders a *filled* dim dot: `<span className="size-1.5 rounded-full bg-muted-foreground/40" />`. The user wants this to be an outline-only ring (border, transparent fill) like Cursor.

The `'draft'` indicator and the empty-prompt title fallback are gated by the same signal — `getAgentRowPrimaryText(agent.entry).length > 0` (`chatStarted` at line 151) — so "draft dot" and "New Agent label" always coincide for a blank agent. This keeps the two edits consistent without a new condition.

An i18n key for the exact string already exists and is used by the sidebar's "New Agent" command button:
`translate('auto.components.sidebar.agentsView.newAgent', 'New Agent')` (see `AgentsSidebarView.tsx:68`). Reuse it — no new translation entry needed. `translate` is already imported at the top of `worktree-card-compact-agent-row.tsx` (line 9).

## Change 1 — Draft rows show "New Agent"

In `getCompactAgentPrimary()` (lines 42–57), change the empty-prompt fallback so a blank draft reads "New Agent" instead of the tab label / state word. Preserve the earlier precedence (custom title → prompt text) and still honor a real generated title if one exists (a generated title only appears after the chat has produced content, so it should win over the generic label).

Proposed final line region (replacing the current `const tabLabel = ...` + `return ...`):

```ts
// [FORK] Пустой черновик читается как «New Agent» (в стиле Cursor), а не
// именем таба или словом состояния. Сгенерированный заголовок, если он уже
// есть, важнее — значит в чате уже что-то появилось.
const generated = agent.tab.generatedTitle?.trim()
if (generated) {
  return generated
}
return translate('auto.components.sidebar.agentsView.newAgent', 'New Agent')
```

Notes:
- This drops the previous reliance on `agent.tab.title` and `agentStateLabel(getAgentDotState(agent))` for the blank case. `agentStateLabel` / `getAgentDotState` may become unused imports **only if** they aren't referenced elsewhere in the file — verify before removing (`getAgentDotState` is still used at line 150 for `dotState`, so it stays; `agentStateLabel` is imported at line 3 and, after this change, likely unused — remove that import if so to satisfy lint).
- Keep the existing `custom` (rename) and `prompt` branches untouched so renamed rows and started chats are unaffected.

## Change 2 — Draft dot becomes an outline-only ring

In the indicator JSX (line 242), swap the filled draft dot for a bordered, transparent one. Use a border token consistent with the current dim tone; bump the size slightly so the ring is legible at a 1px border (a filled `size-1.5` dot and a `size-1.5` ring read very differently — the ring needs a touch more diameter to match the screenshot).

Replace:

```tsx
) : rowIndicator === 'draft' ? (
  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
```

with:

```tsx
) : rowIndicator === 'draft' ? (
  // [FORK] Новый чистый агент — только серая обводка без заливки (стиль Cursor).
  <span className="size-2 rounded-full border border-muted-foreground/50" />
```

Notes:
- No `bg-*` class → transparent fill, so it's a ring.
- `border-muted-foreground/50` keeps it subtle but visible on the sidebar background; adjust the opacity (`/40`–`/60`) during visual check against the reference. Stick to the existing `muted-foreground` role rather than introducing a new color, per the design-system rule in AGENTS.md / STYLEGUIDE.md.
- The `size-2` (8px) ring still fits the fixed `w-2.5` slot (`span` wrapper at line 237), so surrounding text does not shift. Confirm alignment; if the ring looks too big next to the amber/working dots, fall back to `size-1.5`.
- Leave the `'working'` (blinking) and `'unread-done'` (amber) branches unchanged.

## Verification

- Create a fresh blank agent in the agents-view sidebar and confirm the row shows **"New Agent"** with a **gray outline-only circle** (no fill), matching the Cursor screenshot.
- Type a prompt / start the chat: the label should switch to the prompt/generated title and the dot should leave the draft state (become `null` or amber-unread as before).
- Rename a row via the context menu: custom title still wins.
- Confirm the amber "done/unread" dot and the blinking "working" dot are visually unchanged.
- Run lint / typecheck to catch any now-unused import (`agentStateLabel`).

## To-do

- [ ] Read `src/renderer/src/components/sidebar/worktree-card-compact-agent-row.tsx` and re-confirm current lines for `getCompactAgentPrimary` (42–57) and the draft dot (242).
- [ ] Update the empty-prompt fallback in `getCompactAgentPrimary()` to return the generated title if present, else `translate('auto.components.sidebar.agentsView.newAgent', 'New Agent')`.
- [ ] Remove the now-unused `agentStateLabel` import (line 3) if no other reference remains in the file; keep `getAgentDotState`.
- [ ] Change the `rowIndicator === 'draft'` dot JSX to an outline-only ring: `size-2 rounded-full border border-muted-foreground/50` (no `bg-*`).
- [ ] Add the short `[FORK]` "why" comments to both edited regions.
- [ ] Run the app (dev/HMR), create a blank agent, and visually verify the "New Agent" label + outline dot against the Cursor screenshot; tweak border opacity/size if needed.
- [ ] Run lint and typecheck; confirm no unused-import or max-lines regressions.
