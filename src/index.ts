import type{App,Plugin}from'vue'
import VxeUITable from'vxe-table'
import'vxe-table/lib/style.css'
import'./style.css'
import BusinessTable from'./BusinessTable.vue'
export*from'./types';export*from'./core';export*from'./persistence';export{BusinessTable}
export const BusinessTablePlugin:Plugin={install(app:App){app.use(VxeUITable);app.component('BusinessTable',BusinessTable)}}
export default BusinessTablePlugin
