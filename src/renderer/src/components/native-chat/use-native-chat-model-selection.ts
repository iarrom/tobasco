// [FORK] Per-agent persisted state for the native-chat model picker. Kept in
// localStorage (not the Zustand store) so this fork-only feature stays isolated
// from upstream store slices that change often — merge-safety over a fast
// upstream. Keyed by agent so each agent remembers its own last selection.

import { useCallback, useState } from 'react'
import {
  DEFAULT_NATIVE_CHAT_MODEL_SELECTION,
  normalizeNativeChatModelSelection,
  type NativeChatModelSelection
} from './native-chat-model-selection'

function storageKey(agent: string): string {
  return `orca:native-chat-model-selection:${agent}`
}

function readSelection(agent: string): NativeChatModelSelection {
  try {
    const raw = window.localStorage.getItem(storageKey(agent))
    if (!raw) {
      return DEFAULT_NATIVE_CHAT_MODEL_SELECTION
    }
    return normalizeNativeChatModelSelection(JSON.parse(raw))
  } catch {
    // Corrupt blob or storage disabled (e.g. locked-down SSH webview): fall back
    // to the default rather than break the composer.
    return DEFAULT_NATIVE_CHAT_MODEL_SELECTION
  }
}

function writeSelection(agent: string, selection: NativeChatModelSelection): void {
  try {
    window.localStorage.setItem(storageKey(agent), JSON.stringify(selection))
  } catch {
    // Persisting is best-effort; a failed write must not break selection.
  }
}

export type NativeChatModelSelectionState = {
  selection: NativeChatModelSelection
  update: (patch: Partial<NativeChatModelSelection>) => NativeChatModelSelection
}

export function useNativeChatModelSelection(agent: string): NativeChatModelSelectionState {
  const [selectionByAgent, setSelectionByAgent] = useState<
    Record<string, NativeChatModelSelection>
  >(() => ({ [agent]: readSelection(agent) }))

  // Lazily hydrate a newly-focused agent's selection without an effect so the
  // first render already reflects its persisted choice.
  const selection = selectionByAgent[agent] ?? readSelection(agent)
  if (!selectionByAgent[agent]) {
    setSelectionByAgent((prev) => ({ ...prev, [agent]: selection }))
  }

  const update = useCallback(
    (patch: Partial<NativeChatModelSelection>): NativeChatModelSelection => {
      const next = normalizeNativeChatModelSelection({ ...readSelection(agent), ...patch })
      writeSelection(agent, next)
      setSelectionByAgent((prev) => ({ ...prev, [agent]: next }))
      return next
    },
    [agent]
  )

  return { selection, update }
}
