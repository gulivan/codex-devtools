export const CHAT_LAYOUT_INVALIDATED_EVENT = 'codex-devtools:chat-layout-invalidated';

export function notifyChatLayoutInvalidated(): void {
  if (typeof window === 'undefined') {
    return;
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event(CHAT_LAYOUT_INVALIDATED_EVENT));
  });
}
