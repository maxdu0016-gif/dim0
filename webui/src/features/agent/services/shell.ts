/**
 * The island "card" surface — sidebar ground, hairline border, rounded-2xl, and
 * the soft layered shadow shared by the floating island and its steps popover.
 * Centralised so the Services popover and the signed-out empty-state card look
 * identical to the rest of the assistant chrome.
 */
export const SERVICES_SHELL =
  "bg-sidebar border border-border rounded-2xl " +
  "shadow-[0_6px_16px_-4px_rgba(0,0,0,0.18),0_1px_4px_-2px_rgba(0,0,0,0.08)] " +
  "dark:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.4),0_1px_4px_-2px_rgba(0,0,0,0.2)]"
