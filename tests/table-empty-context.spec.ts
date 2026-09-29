import { afterEach, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TableSurface from '../src/components/TableSurface.vue'
import { useTableRuntime, type TableRuntime } from '../src/runtime/useTableRuntime'
import type { Query, TableEmptyContext } from '../src/types'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

it('keeps empty-slot query edits out of later reloads and nested runtime criteria', async () => {
  type Row = { id: number; name: string; status: number | string }
  const requests: Query[] = []
  let runtime!: TableRuntime<Row>
  const wrapper = mount(defineComponent({
    components: { TableSurface },
    setup() {
      runtime = useTableRuntime<Row>({
        columns: [{ id: 'name', field: 'name', title: '名称', sortable: true }, { id: 'status', field: 'status', title: '状态' }],
        dataSource: { async query(query) { requests.push(query); return { rows: [], total: 0 } } },
      })
      function editSlotQuery(context: TableEmptyContext) {
        context.query.keyword = '插槽草稿'
        context.query.filters[0]!.value = ['插槽值']
        context.query.filterGroup!.rules.splice(0)
        context.query.sorts.push({ field: 'name', order: 'desc' })
      }
      return { runtime, editSlotQuery }
    },
    template: '<TableSurface :runtime="runtime"><template #empty="context"><button data-edit-slot @click="editSlotQuery(context)">修改副本</button><button data-reload-slot @click="context.reload()">重新读取</button></template></TableSurface>',
  }), { global: { stubs: {
    'vxe-table': { template: '<div><slot/><slot name="empty"/></div>', methods: { recalculate: async () => {}, scrollToRow: async () => {} } },
    'vxe-column': { template: '<div/>' },
  } } })
  wrappers.push(wrapper)
  await flushPromises()
  await runtime.setQuery({ keyword: '原查询', filters: [{ field: 'status', operator: 'in', value: [1, '1'] }],
    filterGroup: { logic: 'and', rules: [{ logic: 'or', rules: [{ field: 'name', operator: 'contains', value: '原条件' }] }] },
  })
  await flushPromises()
  await wrapper.get('[data-edit-slot]').trigger('click')
  await wrapper.get('[data-reload-slot]').trigger('click')
  await flushPromises()
  expect(requests.at(-1)).toMatchObject({ keyword: '原查询', filters: [{ field: 'status', operator: 'in', value: [1, '1'] }],
    filterGroup: { logic: 'and', rules: [{ logic: 'or', rules: [{ field: 'name', operator: 'contains', value: '原条件' }] }] }, sorts: [],
  })
  expect(runtime.query.value.keyword).toBe('原查询')
  expect(runtime.query.value.filterGroup?.rules).toHaveLength(1)
})
