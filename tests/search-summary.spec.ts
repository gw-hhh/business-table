import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import SearchSummary from '../src/components/SearchSummary.vue'
import { useQueryRuntime } from '../src/runtime/query'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
function setup(onCommit = async () => {}) {
  const definition = { resetBehavior: 'empty', items: [
      { id: 'keyword', label: '关键词', kind: 'keyword' },
      { id: 'status', label: '状态', kind: 'select', field: 'status', options: [{ value: 1, label: 'A' }] },
    ] }
  const runtime = useQueryRuntime({
    searchDefinition: () => definition,
    searchAllowedItems: () => undefined, registry: () => undefined, columns: () => [], report: () => {},
  })
  const context = runtime.context(onCommit)
  const wrapper = mount(SearchSummary, { props: { context } })
  wrappers.push(wrapper)
  return { wrapper, context, runtime }
}

describe('shared Search summary', () => {
  it('renders applied display labels and removes a chip through the Search Runtime', async () => {
    const { wrapper, context, runtime } = setup()
    context.setValue('status', 1)
    await context.submit()
    await flushPromises()
    expect(wrapper.text()).toContain('状态：A')
    expect(runtime.query.value.filters).toEqual([{ field: 'status', operator: 'eq', value: 1 }])
    await wrapper.get('button[aria-label="移除状态：A"]').trigger('click')
    await flushPromises()
    expect(runtime.query.value.filters).toEqual([])
    expect(wrapper.text()).not.toContain('状态：A')
  })

  it('shows pending changes without displaying draft values and resets through context', async () => {
    const { wrapper, context, runtime } = setup()
    context.setValue('status', 1)
    await context.submit()
    context.setValue('keyword', 'draft')
    await flushPromises()
    expect(wrapper.text()).toContain('条件已修改，点击查询生效')
    expect(wrapper.text()).not.toContain('draft')
    await wrapper.get('.bt-search-summary__clear').trigger('click')
    await flushPromises()
    expect(runtime.query.value.filters).toEqual([])
    expect(context.pending).toBe(false)
    expect(wrapper.text()).toBe('')
  })
})
