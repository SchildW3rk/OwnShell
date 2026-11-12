const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const mod = isMac ? '⌘' : 'Ctrl+';

/** Key hints for tooltips (key names, not translated text). */
export const SHORTCUT_LABELS = {
  send: `${mod}${isMac ? '↵' : 'Enter'}`,
  cancel: 'Esc',
  save: `${mod}S`,
};

export type ShortcutAction = 'send' | 'save' | 'cancel' | null;

/** Elements that own their keys (Esc closes them, Enter picks an item). */
export const OVERLAY_SELECTOR = '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';

/**
 * Which view shortcut a key press triggers. An open menu, dropdown or dialog (or a key
 * pressed inside one) gets the key instead, so Esc closes it rather than cancelling a send.
 */
export function getShortcutAction(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  state: { loading: boolean; overlayOpen: boolean }
): ShortcutAction {
  if (state.overlayOpen) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key === 'Enter') return 'send';
  if (mod && event.key.toLowerCase() === 's' && !event.shiftKey && !event.altKey) return 'save';
  if (event.key === 'Escape' && state.loading) return 'cancel';
  return null;
}
