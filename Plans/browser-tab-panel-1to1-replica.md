# Replicate the browser tab panel 1:1 (toolbar + functional bookmarks bar)

Rebuild Orca's in-app browser chrome so that, when a browser tab is active, it matches the reference screenshot 1:1: a three-row stack of (1) the existing Orca tab strip + window controls, (2) a restyled navigation toolbar — reading-list icon, back, forward, reload, **star/bookmark**, a borderless address bar with a dimmed path, then dev / terminal / `…` icons — and (3) a **new, fully-functional bookmarks bar**. Row 1 already exists and matches; the work is concentrated in the browser pane's toolbar (row 2) and an entirely new bookmarks subsystem (row 3: data model, store slice, disk persistence, and UI). Per the two locked decisions: bookmarks are **fully functional** (add via star, persist across sessions, click-to-open, rename/remove/reorder) and the toolbar is matched **exactly to the reference**, with Orca's existing grab/annotate/DevTools/external-link actions moved into the `…` overflow menu.

This is a fork customization, so it follows the fork rules from memory: keep edits isolated, mark new/changed fork behavior with `[FORK]` sentinels, and do not rebrand. It also honors AGENTS.md: no `max-lines` disables (we extract components instead of growing `BrowserPane.tsx`), concrete non-generic file names, tokens from `main.css`, primitives from `components/ui/`, and the SSH/remote + cross-platform cases.

## Current state (from research)

- **Tab strip + window controls (row 1)** — already exist and already match the reference: `src/renderer/src/components/tab-bar/TabBar.tsx` renders the strip and the `+` new-tab button (`Plus`, ~L1277–1290); `src/renderer/src/App.tsx` renders the expand button (`Minimize2`, ~L2084–2100) and the right-sidebar toggle (`PanelRight`, ~L2055–2072). **No work needed here** beyond a visual sanity check.
- **Browser toolbar + address bar (row 2)** — exist but differ from the reference. The toolbar is **inline JSX inside `BrowserPane.tsx`** at ~L4898–5071 (local `BrowserPagePane`) with a mirrored clone for the remote/streamed pane at ~L2510–2548 (`RemoteBrowserPagePane`). Buttons today: back (`ArrowLeft`), forward (`ArrowRight`), reload/stop (`RefreshCw`/`Loader2`), then `BrowserAddressBar`, `BrowserImportHintButton`, grab (`Crosshair`), annotate (`MessageSquarePlus`), DevTools (`SquareCode`), external-link (`ExternalLink`), and `BrowserToolbarMenu` overflow. Navigation is called **imperatively on the Electron `<webview>`** via `webviewRef` (`goBack`/`goForward`/`reload`/`stop`) for local panes, and via runtime RPC (`browser.back|forward|reload`) for remote panes. The address bar is `src/renderer/src/components/browser-pane/BrowserAddressBar.tsx` — a bordered rounded box (`rounded-xl border border-border bg-background px-3 py-1 shadow-sm`) with a leading `Globe` and a Popover/Command autocomplete fed by `browserUrlHistory`.
- **Bookmarks (row 3)** — **do not exist.** No bookmark type, store, persistence, or UI anywhere. Entirely greenfield.
- **Browser tab state** — `BrowserPage` and `BrowserWorkspace` in `src/shared/types.ts` (~L892–940): `url`, `title`, `loading`, `faviconUrl`, `canGoBack`, `canGoForward`, `loadError`, etc. Favicons arrive from the webview's `page-favicon-updated` event (`BrowserPane.tsx` ~L3838–3846) and flow into the store via `updateBrowserPageState` (`src/renderer/src/store/slices/browser.ts`).
- **Store** — `src/renderer/src/store/slices/browser.ts` holds browser workspace/page actions (`createBrowserTab`, `updateBrowserPageState`, `setBrowserPageUrl`, …) and `browserUrlHistory`, which is already persisted — its persistence path is the template to follow for bookmarks.
- **Icons / tokens** — `lucide-react` is standard (511 files). Dark tokens in `src/renderer/src/assets/main.css`: `--background: #181818`, `--card: #141414`, `--muted-foreground: #a1a1a1`, `--border: rgb(255 255 255 / 0.07)`. STYLEGUIDE: match button size to row height; toolbar tooltip pattern lives in `sidebar/SidebarToolbar.tsx`.

## Design decisions

- **Bookmarks are app-global**, not per-worktree — a browser bookmarks bar is conceptually cross-project (the reference's "Админ / Эйч / Cursor / …" are personal, not repo-scoped). Persist them the same way `browserUrlHistory` / app settings persist. (Alternative — per-worktree — is possible later by keying the slice on `worktreeId`; global is the right default.)
- **Extract the toolbar out of `BrowserPane.tsx`** into a dedicated `BrowserToolbar.tsx` rather than editing the 5,800-line inline block and adding the bookmarks bar inline. This keeps `BrowserPane.tsx` from growing (AGENTS.md forbids `max-lines` disables) and gives the local and remote panes one shared toolbar. The toolbar receives plain callback props (`onBack`/`onForward`/`onReload`/`onStop`/`onToggleBookmark`/`isBookmarked`/address-bar props/overflow-menu content) so it stays agnostic to webview-vs-RPC wiring; each pane passes its own handlers.
- **Reference icon mapping (row 2, left→right):** reading-list `List` (toggles the bookmarks bar visibility — sensible default; adjustable) · back `ArrowLeft` · forward `ArrowRight` · reload `RefreshCw`/stop · **`Star`/`StarOff` bookmark toggle (new)** · borderless address bar (host emphasized, path in `text-muted-foreground` when unfocused) · dev `SquareCode` → DevTools · terminal `TerminalSquare` → open a terminal tab in this worktree · `MoreHorizontal` `…` → overflow menu now holding grab / annotate / external-link / import / viewport presets / profiles. The `List` and `TerminalSquare` behaviors are the two genuinely ambiguous icons — defaults chosen; call out in the PR for confirmation.
- **Star semantics:** reflects `isBookmarked(currentUrl)`; clicking adds/removes the active page, capturing its `title` and `faviconUrl` at add time.
- **Address-bar restyle** is additive to `BrowserAddressBar.tsx` (borderless variant + host/path split display) — keep the existing Popover/Command autocomplete and history wiring intact.

## Implementation outline

### 1. Bookmarks data model
- Add `Bookmark` to `src/shared/types.ts`: `{ id: string; url: string; title: string; faviconUrl: string | null; createdAt: number; sortOrder: number }`.

### 2. Bookmarks store slice (`[FORK]`)
- New `src/renderer/src/store/slices/bookmarks.ts`: state `bookmarks: Bookmark[]`; actions `addBookmark(page)`, `removeBookmark(id)`, `removeBookmarkByUrl(url)`, `renameBookmark(id, title)`, `reorderBookmarks(orderedIds)`, and a selector helper `isUrlBookmarked(url)` (normalize URLs before compare — reuse `normalizeBrowserNavigationUrl` from `src/shared/browser-url.ts`; dedupe by normalized URL on add).
- Register the slice in `src/renderer/src/store/index.ts` and its type in `src/renderer/src/store/types.ts`, following the shape of the existing `browser.ts` slice.

### 3. Persistence
- Follow the exact persistence path `browserUrlHistory` uses (identify it in `browser.ts` + `src/main` on implementation — likely persisted state written through the main process / settings). Persist `bookmarks` the same way so they survive restarts. Cover the SSH/remote case: bookmarks are renderer/app UI state and remain client-side, so no remote-runtime round-trip is required.

### 4. Extract `BrowserToolbar.tsx` (`[FORK]` restyle)
- New `src/renderer/src/components/browser-pane/BrowserToolbar.tsx` implementing the reference row 2. Move the current inline toolbar JSX (`BrowserPane.tsx` ~L4898–5071) here, add the `List` and `Star` buttons, and relocate grab/annotate/DevTools/external-link/import into the `…` overflow (extend `BrowserToolbarMenu.tsx`). Style to the dark reference using `main.css` tokens and `components/ui/Button` + the `Tooltip` pattern; size buttons to the row height per STYLEGUIDE.
- Replace the inline block in `BrowserPagePane` (local) with `<BrowserToolbar …/>` passing webview-ref handlers, and mirror in `RemoteBrowserPagePane` (~L2510–2548) passing the RPC handlers.

### 5. Borderless address bar (`[FORK]`)
- In `BrowserAddressBar.tsx`, add a borderless visual variant matching the reference and, when unfocused, render the URL split so the origin is `text-foreground` and the path/query is `text-muted-foreground`. Extract the split into a pure helper `browser-url-display.ts` (`formatBrowserUrlDisplay(url) → { origin, rest }`) for unit-testing. Keep all existing autocomplete/history behavior.

### 6. `BrowserBookmarksBar.tsx` (row 3, `[FORK]`, new)
- New `src/renderer/src/components/browser-pane/BrowserBookmarksBar.tsx`: a horizontal, overflow-scrollable row of bookmark chips (favicon via the same fallback-to-`Globe` pattern as `BrowserTab.tsx`, plus muted title). Click → navigate the active pane to the bookmark's URL (reuse the pane's existing `navigateToUrl`). Right-click context menu (open / open-in-default-browser / rename / remove) via `components/ui/dropdown-menu`; drag-to-reorder with `@dnd-kit` (already a dependency) calling `reorderBookmarks`. Empty state = an empty bar (bookmarks start empty; the reference's entries are illustrative, not seeded).
- Mount it directly beneath `<BrowserToolbar>` in both `BrowserPagePane` and `RemoteBrowserPagePane`, gated by the `List`-icon visibility toggle.

### 7. i18n
- Add new keys (star add/remove tooltips, bookmarks-bar labels, rename dialog, context-menu items) to `src/renderer/src/i18n/locales/en.json`, and mirror into `es.json`, `ja.json`, `ko.json`, `zh.json` (the locale set already modified in this branch), using the repo's `translate('…', 'fallback')` convention.

### 8. Tests
- `bookmarks.ts` slice: add/remove/rename/reorder, URL-normalized dedupe, `isUrlBookmarked`.
- `browser-url-display.ts`: origin/path split across http/https/file/blank URLs.
- `BrowserBookmarksBar` render/interaction: renders chips, click navigates, context-menu remove.

## Risks / watch-outs

- `BrowserPane.tsx` is ~5,800 lines with a shared favicon/navigation model — extract the toolbar carefully, preserving `webviewRef` handler identity and the `data-contextual-tour-target="browser-toolbar"` marker.
- Keep the **remote/streamed pane** (`RemoteBrowserPagePane`) at parity — it has its own toolbar clone and RPC nav; the bookmarks bar must work there too (navigation via `runRemoteNavigation`/`navigateToUrl`).
- Favicon at bookmark-add time may be `null` (event not yet fired) — fall back to `Globe`, and optionally backfill on next visit.
- Don't regress the address bar's autocomplete/history Popover when adding the borderless variant.
- Confirm the two ambiguous reference icons (`List` = toggle bookmarks bar, `TerminalSquare` = open terminal) match intent in review.

## To-do

- [ ] Add the `Bookmark` type to `src/shared/types.ts`.
- [ ] Create the `[FORK]` bookmarks store slice `src/renderer/src/store/slices/bookmarks.ts` (add/remove/rename/reorder/`isUrlBookmarked`, URL-normalized dedupe) and register it in `store/index.ts` + `store/types.ts`.
- [ ] Wire bookmarks persistence by mirroring `browserUrlHistory`'s persistence path (identify it in `browser.ts` + `src/main`), so bookmarks survive restarts; keep it client-side for the SSH/remote case.
- [ ] Extract the current inline browser toolbar (`BrowserPane.tsx` ~L4898–5071) into a new `src/renderer/src/components/browser-pane/BrowserToolbar.tsx`, restyled 1:1 to the reference (reading-list `List`, back, forward, reload, `Star`/`StarOff`, address bar, dev, terminal, `…`), moving grab/annotate/DevTools/external-link/import into the `…` overflow (`BrowserToolbarMenu.tsx`).
- [ ] Swap the inline toolbar for `<BrowserToolbar>` in `BrowserPagePane` (local, webview handlers) and mirror it in `RemoteBrowserPagePane` (~L2510–2548, RPC handlers).
- [ ] Add a borderless variant + host/path split display to `BrowserAddressBar.tsx`, extracting `browser-url-display.ts` (`formatBrowserUrlDisplay`), preserving existing autocomplete/history.
- [ ] Add the `Star` bookmark-toggle button to the toolbar reflecting `isUrlBookmarked(currentUrl)` and adding/removing the active page (with captured title + favicon).
- [ ] Create `src/renderer/src/components/browser-pane/BrowserBookmarksBar.tsx` (favicon+title chips, click-to-navigate, right-click open/rename/remove, drag-to-reorder) and mount it beneath the toolbar in both panes, gated by the reading-list toggle.
- [ ] Add new i18n keys to `en.json` and mirror into `es/ja/ko/zh`.
- [ ] Add unit tests for the bookmarks slice, `formatBrowserUrlDisplay`, and `BrowserBookmarksBar`.
- [ ] Run the app with a browser tab, verify the three-row layout matches the reference 1:1, exercise add/remove/rename/reorder/navigate + restart-persistence, and confirm parity in the remote pane; run `pnpm vitest run` on the new tests and typecheck.
