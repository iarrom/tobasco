# Show "Creating plan…" Only While the Agent Is Actually Streaming the Plan

The native-chat transcript status line (`NativeChatPlanStatusLine`) currently shimmers **"Creating plan…"** for the *entire* working duration whenever Plan mode is on — including while the agent is only researching (reading, grepping, spawning subagents, thinking). It should appear **only when the plan is actually being produced/streamed by the agent** (i.e. the `Plans/*.md` write is in flight, or an `ExitPlanMode` call is streaming), and otherwise fall back to the existing "Created plan" / hidden states. This plan replaces the over-broad `isWorking && planMode` gate with a precise "plan is streaming right now" signal derived from the transcript, keeping the "Created plan" behavior unchanged.

## Root cause

`src/renderer/src/components/native-chat/use-native-chat-plan.ts:62-63`:

```ts
const planStatus: 'creating' | 'created' | null =
  isWorking && planMode ? 'creating' : plan && plan.path !== builtPlanPath ? 'created' : null
```

`'creating'` is gated on `isWorking && planMode` — true for any activity while Plan mode is toggled, not just plan generation. That is exactly the false positive the user sees: "Creating plan…" shows during research, long before any plan is written.

## Relevant architecture (verified)

- **Status line component** — `NativeChatMessageList.tsx:40-81` (`NativeChatPlanStatusLine`). `'creating'` → shimmer label; `'created'` → clickable Cursor-style card. Rendered once, at the transcript tail, gated by `planStatus` (`NativeChatMessageList.tsx:357-359`).
- **Prop flow** — `NativeChatView.tsx:376-383` builds the controller via `useNativeChatPlan(...)`; passes `plan.planStatus` down at `NativeChatView.tsx:438`.
- **Plan detection (the reliable fork signal)** — `native-chat-plan-detection.ts:48-79` (`deriveLatestNativeChatPlan`) scans the whole transcript for a `Write`/`create_file`/`str_replace_editor` tool call whose path matches `Plans/*.md` (`WRITE_TOOL_NAMES`, `isNativeChatPlanFilePath`). Returns the **last** such write, so `plan != null` persists for the rest of the session once any plan is written — which is why `plan != null` alone cannot mean "creating now".
- **Tool blocks** — `shared/native-chat-types.ts`: `NativeChatToolCallBlock` (`type: 'tool-call'`, `name`, `input`) and `NativeChatToolResultBlock` (`type: 'tool-result'`). No id links a call to its result; ordering within/between messages is the only correlation. Guards `isToolCallBlock` / `isToolResultBlock` exist.
- **Active-step convention** — `NativeChatMessageList.tsx:154-171`: the "currently streaming" step is the **last** transcript message while `isWorking` (and no streaming bubble). This is the established pattern for "what the agent is doing right now."
- **ExitPlanMode** — `native-chat-tool-verb.ts:43` already maps `ExitPlanMode` → active verb "Creating plan". The fork's custom plan flow writes `Plans/*.md` rather than calling `ExitPlanMode`, so the **`Plans/*.md` write is the primary signal**; `ExitPlanMode` is included as a secondary signal for the standard Claude plan-mode flow.

## Design: a "plan is streaming now" predicate

Add a pure, testable helper next to the existing detection so "creating" reflects an **in-flight** plan-producing tool call, not merely "a plan exists" or "agent is busy":

In `native-chat-plan-detection.ts`, add:

```ts
/** True when the agent is presently producing the plan: the most recent
 *  plan-producing tool call (a `Plans/*.md` write, or `ExitPlanMode`) has no
 *  tool-result after it yet — i.e. it's still streaming. Pure so it's unit-
 *  testable off the assembled transcript. */
export function isNativeChatPlanStreaming(
  messages: readonly NativeChatMessage[],
  worktreePath?: string
): boolean {
  // Flatten blocks in transcript order, tagging plan-tool-calls vs any result.
  // Find the last plan-producing tool-call; if no tool-result appears after it,
  // the write hasn't returned → the plan is still being created.
  let lastPlanCallSeenWithoutResult = false
  for (const message of messages) {
    for (const block of message.blocks) {
      if (isToolResultBlock(block)) {
        lastPlanCallSeenWithoutResult = false
        continue
      }
      if (!isToolCallBlock(block)) {
        continue
      }
      if (block.name === 'ExitPlanMode') {
        lastPlanCallSeenWithoutResult = true
        continue
      }
      if (WRITE_TOOL_NAMES.has(block.name)) {
        const filePath = readStringField(block.input, ['file_path', 'path', 'filePath'])
        lastPlanCallSeenWithoutResult =
          !!filePath && isNativeChatPlanFilePath(filePath, worktreePath)
      }
    }
  }
  return lastPlanCallSeenWithoutResult
}
```

Notes on the predicate:
- Any tool-result block clears the flag, so a plan write that already returned (followed by more tools/prose) is **not** "creating" — this avoids the "persists forever" trap of `plan != null`.
- A replan (second `Plans/*.md` write) resets the flag on the newer write.
- `readStringField`, `WRITE_TOOL_NAMES`, `isNativeChatPlanFilePath`, `isToolCallBlock`, `isToolResultBlock` are all already imported/available in this module (add the `isToolResultBlock` import).
- This mirrors the tool-call/tool-result pairing idea in `native-chat-tool-pairing.ts` (`pairToolBlocks`) but operates across the whole transcript tail; keep it self-contained rather than forcing pairing semantics.

## Wire it into the status gate

In `use-native-chat-plan.ts`, replace lines 62-63 with:

```ts
// [FORK] «Creating plan…» — только пока агент реально стримит создание плана
// (незавершённая запись Plans/*.md или ExitPlanMode), а не всю работу в
// плане-режиме. «Created plan» остаётся, пока план обнаружен и не собран.
const planStreaming = isWorking && isNativeChatPlanStreaming(messages, fileLinkContext?.worktreePath)
const planStatus: 'creating' | 'created' | null = planStreaming
  ? 'creating'
  : plan && plan.path !== builtPlanPath
    ? 'created'
    : null
```

- Add `isNativeChatPlanStreaming` to the existing import from `./native-chat-plan-detection`.
- `messages` and `fileLinkContext?.worktreePath` are already in scope (same inputs `deriveLatestNativeChatPlan` uses).
- `planMode` is intentionally dropped from the `'creating'` gate: the streaming predicate is inherently plan-specific, and the existing `'created'` branch never required `planMode` either — so both branches now agree on "detected plan activity" rather than "toggle state". `planMode` remains used elsewhere in the hook (auto-open effect at line 97), so its import/derivation stays.

### Resulting behavior

| Situation | Old | New |
|---|---|---|
| Plan mode on, agent researching (no plan write yet) | `creating` ❌ | `null` ✓ |
| Agent mid-write of `Plans/*.md` (no result yet) | `creating` | `creating` ✓ |
| Plan write returned, turn still finishing | `creating` | `created` (plan detected) |
| Turn done, plan present, not built | `created` | `created` (unchanged) |
| Follow-up turn later, plan already exists, agent busy on other work | `creating` ❌ | `null`/`created` ✓ (no false "creating") |

## Verification

- Add unit tests to `native-chat-plan-detection.test.ts` for `isNativeChatPlanStreaming`:
  - empty transcript → false;
  - transcript with a `Plans/foo.md` `Write` tool-call and **no** following tool-result → true;
  - same write **followed by** a tool-result → false;
  - a non-plan `Write` (e.g. `src/x.ts`) in flight → false;
  - `ExitPlanMode` call with no result → true; with a following result → false;
  - replan: first plan write resolved, second plan write in flight → true.
- Run the existing suite: `pnpm test` for the native-chat detection/plan tests (`native-chat-plan-detection.test.ts`, and confirm `native-chat-plan-instruction.test.ts` untouched).
- Live check (dev/HMR): start a native chat in Plan mode. Confirm during research (reads/greps/subagents) **no** "Creating plan…" shows (normal work steps / "Thinking…" instead); confirm "Creating plan…" appears only as the `Plans/*.md` write streams; confirm it transitions to the "Created plan" card afterward; confirm the Review Plan card still appears. Reload the app after main/preload changes per the dev workflow.
- Confirm no `max-lines` regression in the two edited files (both small); run `pnpm check:max-lines-ratchet` if in doubt.

## To-do

- [ ] Re-read `use-native-chat-plan.ts:62-63` and `native-chat-plan-detection.ts` to confirm current lines before editing.
- [ ] Add the pure `isNativeChatPlanStreaming(messages, worktreePath)` helper to `native-chat-plan-detection.ts`, importing `isToolResultBlock` (reuse existing `WRITE_TOOL_NAMES`, `isNativeChatPlanFilePath`, `readStringField`, `isToolCallBlock`).
- [ ] In `use-native-chat-plan.ts`, import the helper and replace the `planStatus` computation so `'creating'` = `isWorking && isNativeChatPlanStreaming(messages, worktreePath)`, leaving the `'created'` branch unchanged; add the short `[FORK]` "why" comment.
- [ ] Verify `planMode` is still referenced by the auto-open effect (line ~97) and keep its derivation/import; only remove it from the `'creating'` gate.
- [ ] Add unit tests for `isNativeChatPlanStreaming` in `native-chat-plan-detection.test.ts` covering the cases listed under Verification.
- [ ] Run `pnpm test` for the native-chat plan detection tests and fix any fallout.
- [ ] Live-verify in the running app (Plan mode): no "Creating plan…" during research, shimmer only while the plan write streams, then the "Created plan" card; Review Plan card still works.
- [ ] Run `pnpm check:max-lines-ratchet` / lint / typecheck to confirm no regressions.
