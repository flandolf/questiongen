/**
 * Centralized keyboard target checks.
 */

/**
 * Returns true if the given event target is a region where the user is
 * actively editing text (input, textarea, select, button, contenteditable).
 * Used to suppress global keyboard shortcuts so they do not conflict with
 * IME composition or in-progress typing.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toUpperCase();
  const editableSelectors = [
    'INPUT',
    'TEXTAREA',
    'SELECT',
    'BUTTON',
    '[contenteditable="true"]',
  ];
  return (
    editableSelectors.includes(tagName) ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

/**
 * Detects Cmd/Ctrl modifier pressed.
 */
export function isMetaCommand(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}
