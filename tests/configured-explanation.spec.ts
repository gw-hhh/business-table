import {describe, expect, it} from 'vitest'
import {defineComponent, h} from 'vue'
import {mount} from '@vue/test-utils'
import ConfiguredBusinessTable from '../src/ConfiguredBusinessTable.vue'
import type {TableDefinition} from '../src/config/types'

const BusinessTableStub = defineComponent({
  props: ['rendering'],
  setup(_props, {slots}) { return () => h('div', slots.empty?.({})) },
})

describe('configured snapshot inspection', () => {
  it('explains the latest supplied props with optional view columns and forwards rendering and empty slots', async () => {
    const definition: TableDefinition = {
      schemaVersion: 3, tableKey: 'assets', rendering: {height: 400, virtualRows: true},
      columns: [{id: 'name', field: 'name', title: '名称', width: 120, configurable: {width: true}}],
    }
    const wrapper = mount(ConfiguredBusinessTable, {
      props: {definition, data: []}, slots: {empty: '<p>尚无资产</p>'},
      global: {stubs: {BusinessTable: BusinessTableStub}},
    })
    try {
      expect(wrapper.getComponent(BusinessTableStub).props('rendering')).toEqual(definition.rendering)
      expect(wrapper.text()).toBe('尚无资产')
      const snapshot = wrapper.vm.explainConfiguration({name: {width: 240}})
      expect(snapshot.scope).toBe('supplied-snapshot')
      expect(snapshot.entries.find(entry => entry.path === '/columns/name/width')).toMatchObject({source: 'view', effectiveValue: 240})
      await wrapper.setProps({remoteOverride: {columns: {name: {width: 180}}}})
      expect(wrapper.vm.explainConfiguration().entries.find(entry => entry.path === '/columns/name/width')).toMatchObject({source: 'remote', effectiveValue: 180})
      expect(wrapper.emitted('preferenceChange')).toBeUndefined()
    } finally {wrapper.unmount()}
  })
})
