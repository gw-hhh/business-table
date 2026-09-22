import type { Pagination } from '../types'

const DEFAULT_SIZES = [10, 20, 50, 100]
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** All entry points share the same allowlist and invalid-value fallback. */
export function normalizePagination(input: Partial<Pagination> = {}, fallbackSize = 20) {
  const declared = input.pageSizeOptions?.filter(positiveInteger) ?? []
  const pageSizeOptions = [...new Set(declared.length ? declared : DEFAULT_SIZES)]
  const defaultSize = pageSizeOptions.includes(fallbackSize) ? fallbackSize : pageSizeOptions[0]!
  const pageSize = positiveInteger(input.pageSize) && pageSizeOptions.includes(input.pageSize)
    ? input.pageSize : defaultSize
  const page = positiveInteger(input.page) ? input.page : 1
  return { page, pageSize, pageSizeOptions }
}

export function clampPage(value: unknown, pages: number): number {
  return positiveInteger(value) ? Math.min(value, Math.max(1, pages)) : 1
}
