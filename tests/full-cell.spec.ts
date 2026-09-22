import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BusinessCell from '../src/components/BusinessCell.vue'
import { applySorts } from '../src/core'
import type { ColumnConfig } from '../src/types'

describe('one display pipeline for live cells and previews', () => {
  it('shows mapped text and styling without changing the raw value', () => {
    const row = { status: 1 }
    const column: ColumnConfig = { id: 'status', field: 'status', title: '状态', mapping: { enabled: true, type: 'number', presentation: 'tag', empty: '空', unknown: '未知', items: [{ value: 1, label: '待处理', color: '#123456', background: '#eeeeee' }] } }
    const live = mount(BusinessCell, { props: { row, column } })
    const preview = mount(BusinessCell, { props: { row, column, preview: true } })
    expect(live.text()).toBe('待处理')
    expect(preview.text()).toBe(live.text())
    expect(live.find('.bt-cell-map').attributes('style')).toContain('rgb(18, 52, 86)')
    expect(row.status).toBe(1)
  })
  it('keeps zero visible, treats null as empty, and respects secondary content', () => {
    const column: ColumnConfig = { id: 'name', field: 'name', title: '项目', content: { emptyText: '未填写', secondaryField: 'customer', showSecondary: true } }
    const wrapper = mount(BusinessCell, { props: { row: { name: 0, customer: '甲' }, column } })
    expect(wrapper.text()).toContain('0')
    expect(wrapper.find('small').text()).toBe('甲')
    wrapper.unmount()
    expect(mount(BusinessCell, { props: { row: { name: null }, column } }).text()).toBe('未填写')
  })
  it('does not provide interactive links or copy buttons inside a preview', () => {
    const column: ColumnConfig = { id: 'id', field: 'id', title: '编号', content: { copyable: true, link: true } }
    const wrapper = mount(BusinessCell, { props: { row: { id: 'A' }, column, preview: true } })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
  })
  it('renders field tokens through the target column formatter, not HTML or nested templates', () => {
    const amount: ColumnConfig = { id: 'amount', field: 'amount', title: '金额', type: 'currency' }
    const column: ColumnConfig = { id: 'name', field: 'name', title: '名称', template: { enabled: true, document: { ops: [{ insert: '<script>bad</script> ' }, { insert: { field: 'amount' }, attributes: { bold: true } }, { insert: '\n' }] } } }
    const wrapper = mount(BusinessCell, { props: { row: { amount: 12.5 }, column, columns: [column, amount] } })
    expect(wrapper.text()).toContain('<script>bad</script>')
    expect(wrapper.text()).toContain('12.50')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('strong').exists()).toBe(true)
  })
})

describe('reference sort semantics', () => {
  it('keeps empty values last for both directions and equal values stable', () => {
    const rows = [{ id:'a', value:null },{ id:'b', value:2 },{ id:'c', value:2 },{ id:'d', value:1 }]
    expect(applySorts(rows,[{field:'value',order:'asc'}]).map(row=>row.id)).toEqual(['d','b','c','a'])
    expect(applySorts(rows,[{field:'value',order:'desc'}]).map(row=>row.id)).toEqual(['b','c','d','a'])
  })
})
