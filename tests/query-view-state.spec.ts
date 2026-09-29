import {afterEach, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, nextTick} from 'vue'
import TableSearch from '../src/components/TableSearch.vue'
import FeatureHost from '../src/components/FeatureHost.vue'
import {useQueryRuntime} from '../src/runtime/query'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
function search(onCommit = async () => {}) {
  const definition = {items: [{id: 'amount', label: '金额', kind: 'number', field: 'amount', operator: 'eq', defaultValue: 1}]}
  const runtime = useQueryRuntime({searchDefinition: () => definition, searchAllowedItems: () => undefined, registry: () => undefined, columns: () => [{id: 'amount', field: 'amount', title: '金额', type: 'number'}], report: () => {}})
  const context = runtime.context(onCommit)
  const wrapper = mount(TableSearch, {props: {context}})
  wrappers.push(wrapper)
  return {context, wrapper}
}
it('marks the query button only while actual draft values differ and clears after submit', async () => {
  const {context, wrapper} = search()
  const button = wrapper.get('button[type=submit]')
  expect(button.find('[aria-label="查询条件有未应用的更改"]').exists()).toBe(false)
  context.setValue('amount', 2); await nextTick()
  expect(button.find('[aria-label="查询条件有未应用的更改"]').exists()).toBe(true)
  context.setValue('amount', 1); await nextTick()
  expect(button.find('[aria-label="查询条件有未应用的更改"]').exists()).toBe(false)
  context.setValue('amount', 2); await nextTick()
  await button.trigger('click'); await flushPromises()
  expect(context.appliedValues.amount).toBe(2)
  expect(button.find('[aria-label="查询条件有未应用的更改"]').exists()).toBe(false)
})
it('retains the pending indicator when a malformed draft is rejected', async () => {
  const {context, wrapper} = search()
  context.setValue('amount', 'invalid'); await nextTick()
  await wrapper.get('button[type=submit]').trigger('click'); await flushPromises()
  expect(wrapper.find('[role=alert]').exists()).toBe(true)
  expect(wrapper.get('button[type=submit]').find('[aria-label="查询条件有未应用的更改"]').exists()).toBe(true)
  expect(context.appliedValues.amount).toBe(1)
})
it('shows a load failure separately after query values have been committed', async () => {
  const {context, wrapper} = search(async () => {throw new Error('加载失败')})
  context.setValue('amount', 2); await nextTick()
  await wrapper.get('button[type=submit]').trigger('click'); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toBe('加载失败')
  expect(context.appliedValues.amount).toBe(2)
  expect(wrapper.find('[aria-label="查询条件有未应用的更改"]').exists()).toBe(false)
})
it('keeps an applied feature entry active while its panel is closed', async () => {
  const component = defineComponent({render: () => h('div')})
  const wrapper = mount(FeatureHost, {props: {local: true, defaultStrategy: 'on-interaction', entryLabel: '组合筛选', entryActive: true, createContext: () => ({}), loader: async () => ({default: component})}})
  wrappers.push(wrapper)
  expect(wrapper.get('button').classes()).toContain('is-active')
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
  await wrapper.setProps({entryActive: false})
  expect(wrapper.get('button').classes()).not.toContain('is-active')
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(wrapper.get('button').classes()).toContain('is-active')
})
