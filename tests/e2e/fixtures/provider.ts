import { createApp, h } from 'vue'
import { BusinessTable, BusinessTablePlugin, type Query, type QueryResult, type RowData } from '../../../src'

interface PendingRequest {
  query: Query
  resolve: (result: QueryResult<RowData>) => void
  reject: (error: Error) => void
}
declare global {
  interface Window { queryRequests: PendingRequest[] }
}
window.queryRequests = []
createApp({
  render: () => h(BusinessTable, {
    tableKey: 'test.provider', rowKey: 'id',
    features: {search:true,toolbar:true},
    columns: [{ id: 'id', field: 'id', title: '编号', width: 180, sortable: true }],
    dataSource: {
      query: (query: Query) => new Promise<QueryResult<RowData>>((resolve, reject) => {
        window.queryRequests.push({ query, resolve, reject })
      })
    }
  })
}).use(BusinessTablePlugin).mount('#app')
