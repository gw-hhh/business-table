import type {Query,TableEmptyContext} from '../types'

/** Only the effective query is considered; unsaved search drafts cannot label the displayed result. */
export function emptyReason(query:Query,busy:boolean,error:string):TableEmptyContext['reason'] {
  if(busy)return 'loading'
  if(error)return 'error'
  return query.keyword?.trim()||query.filters.length||query.columnFilters?.length||query.filterGroup?.rules.length?'no-results':'empty'
}
