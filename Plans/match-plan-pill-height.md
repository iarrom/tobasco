# Match the composer "Plan" pill height to the other footer buttons

The amber **Plan** pill in the native-chat composer footer renders shorter than the buttons beside it. The user wants it sized like "the rest" of the footer controls (the `+` attach button, mic, and send). This is a small, contained CSS-class change in one fork file.

## Diagnosis

The composer footer (`NativeChatComposerActions.tsx`) lays out a left cluster — `+` attach / add-menu, the **Plan** pill, the model picker — and a right cluster — mic and send. Their effective heights on a fine pointer today:

- `+` attach button — `size="icon-sm"` → `size-8` = **32px** (`button.tsx:28`).
- Mic button — `size="icon-sm"` → `size-8` = **32px**.
- Send button — `size="icon"` + `className="size-8"` = **32px**.
- Model picker — `h-7` = **28px** (`NativeChatModelPicker.tsx:120`).
- **Plan pill** — raw `<button>` with `px-2 py-1 text-xs` → `text-xs` (16px line-height) + `py-1` (8px) ≈ **24px** (`use-native-chat-plan-composer.tsx:43`).

So the Plan pill is ~8px shorter than the dominant 32px icon buttons and even shorter than the 28px model picker — this is the visible mismatch in the screenshot.

The pill is defined inline in `useNativeChatPlanComposer` (`src/renderer/src/components/native-chat/use-native-chat-plan-composer.tsx:38-48`), a `[FORK]` file. It is passed as `planPill` through `NativeChatComposer` → `NativeChatComposerField` → `NativeChatComposerActions`, where it is rendered at line 70. No tests assert on the pill's className, so the change is low-risk.

## Approach

Give the pill an explicit fixed height matching the icon buttons (`h-8` = 32px, the dominant button size in the row) and let the existing `flex items-center` handle vertical centering, instead of relying on `py-1` to grow the box.

Concretely, in `use-native-chat-plan-composer.tsx:43`, change the pill's className from:

```
flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-warning outline-none transition-colors hover:bg-warning/10 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11
```

to (replace `py-1` with a fixed `h-8`, keep horizontal padding, keep the coarse-pointer touch target):

```
flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-warning outline-none transition-colors hover:bg-warning/10 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11
```

Notes:
- `h-8` (32px) lines the pill up with the `+`, mic, and send buttons (all `size-8`). This is the cleanest reading of "same size as the rest," since those are the primary footer buttons.
- `px-2.5` (slightly more than `px-2`) balances the now-taller pill; keep it modest so the text still reads as a compact pill. This is optional polish — `px-2` is also fine.
- Keep `pointer-coarse:min-h-11` (44px touch target) unchanged — coarse-pointer behavior already matched the other controls.
- Do **not** add a `[FORK]` sentinel comment beyond what already exists; the file is already fork-annotated.

## Verification

- Run the app (`/run` or `pnpm dev`) with a Claude agent, enable Plan mode via the `+` menu, and confirm the amber **Plan** pill's height now matches the `+` button and send button in the composer footer.
- Confirm the pill text and check icon remain vertically centered and the amber styling / hover / focus ring are unchanged.
- Verify the coarse-pointer (touch) size still expands to the 44px target.
- Run the existing native-chat unit tests to confirm nothing regressed (no test asserts on this className, so this is a sanity pass): `pnpm vitest run src/renderer/src/components/native-chat`.

## To-do

- [ ] Re-read `src/renderer/src/components/native-chat/use-native-chat-plan-composer.tsx` around line 43 to confirm the current pill className.
- [ ] Replace `px-2 py-1` with `h-8 px-2.5` (keeping `flex items-center`, the amber/hover/focus classes, and `pointer-coarse:min-h-11`) so the pill is 32px tall to match the `+`, mic, and send buttons.
- [ ] Run the app, enable Plan mode, and visually confirm the pill height now matches the neighboring footer buttons and text stays centered.
- [ ] Run `pnpm vitest run src/renderer/src/components/native-chat` to confirm no regressions.
