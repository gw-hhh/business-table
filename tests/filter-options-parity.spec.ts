import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import FilterOptions from '../src/features/filters/FilterOptions.vue'
import type { FilterOption } from '../src/features/filters/model'
import type { ColumnConfig } from '../src/types'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
describe('column filter option interactions', () => {
  it('uses the compact reference option list and preserves hidden selections while searching', async () => {
    const values = ref<FilterOption['value'][]>([])
    const column: ColumnConfig = { id: 'status', field: 'status', title: '状态', type: 'enum' }
    const options: FilterOption[] = [{ value: 1, label: '草稿', count: 3 }, { value: 2, label: '已转合同', count: 2 }]
    const host = defineComponent({ components: { FilterOptions }, setup: () => ({ values, column,
      load: async (_column: ColumnConfig, search: string) => options.filter(option => option.label.includes(search)),
    }), template: '<FilterOptions v-model="values" :column="column" name="status" :load="load" />' })
    const wrapper = mount(host)
    wrappers.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).not.toContain('已选 0 项')
    expect(wrapper.findAll('button')).toHaveLength(0)
    await wrapper.get('input[aria-label="草稿"]').setValue(true)
    await wrapper.get('input[type="search"]').setValue('已')
    await flushPromises()
    expect(wrapper.find('input[aria-label="草稿"]').exists()).toBe(false)
    expect(values.value).toEqual([1])
    await wrapper.get('input[type="search"]').setValue('')
    await flushPromises()
    expect((wrapper.get('input[aria-label="草稿"]').element as HTMLInputElement).checked).toBe(true)
  })
})
