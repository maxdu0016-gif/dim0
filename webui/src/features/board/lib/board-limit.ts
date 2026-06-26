import { BILLING_ENABLED } from "@/config/billing"
import type { BillingPlan } from "@/lib/decode-jwt"
import { useAppStore } from "@/store"
import { useListBoards } from "../api/list-boards"


// Per-plan workspace limits. `Infinity` = uncapped (Plus boards are "unlimited").
export const BOARD_LIMITS: Record<BillingPlan, number> = {
  free: 5,
  basic: 25,
  plus: Infinity,
}

export const DOCUMENT_LIMITS_PER_BOARD: Record<BillingPlan, number> = {
  free: 3,
  basic: 10,
  plus: 25,
}


// Back-compat aliases (free-tier values) still referenced by some components.
export const FREE_PLAN_BOARD_LIMIT = BOARD_LIMITS.free
export const FREE_PLAN_DOCUMENT_LIMIT_PER_BOARD = DOCUMENT_LIMITS_PER_BOARD.free

export const FREE_PLAN_BOARD_LIMIT_TOOLTIP =
  "Board limit reached for your plan. Upgrade for more boards, or self-host for your own unlimited setup."
export const FREE_PLAN_DOCUMENT_LIMIT_TOOLTIP =
  "Document upload limit reached for this board on your plan. Upgrade for more, or self-host for your own unlimited setup."


export function boardLimitForPlan(plan: BillingPlan): number {
  return BOARD_LIMITS[plan]
}


export function isBoardCreationLimited(plan: BillingPlan, boardCount: number): boolean {
  return BILLING_ENABLED && boardCount >= BOARD_LIMITS[plan]
}


export function isDocumentUploadLimited(plan: BillingPlan, documentCount: number): boolean {
  return BILLING_ENABLED && documentCount >= DOCUMENT_LIMITS_PER_BOARD[plan]
}


/**
 * Reactive variant of `isBoardCreationLimited` for UI gating.
 * Reuses the cached `listBoards` query so it doesn't trigger extra fetches.
 */
export function useIsBoardCreationLimited(): boolean {
  const userId = useAppStore((s) => s.userId)
  const userPlan = useAppStore((s) => s.userPlan)
  const { data: boards = [] } = useListBoards(userId)
  return isBoardCreationLimited(userPlan, boards.length)
}
