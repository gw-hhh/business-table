import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TableIcon from '../src/components/TableIcon.vue'

// Static drawing data from the approved reference UI, not its JS runtime.
const referencePaths: Record<string, string> = {
  file: 'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h6',
  search: 'm21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2',
  columns: 'M3 4h18v16H3V4Zm6 0v16m6-16v16',
  sort: 'm8 4-3 3m3-3 3 3M8 4v16m8 0-3-3m3 3 3-3m-3 3V4',
  'chevron-down': 'm6 9 6 6 6-6',
}

describe('reference icon drawings', () => {
  for (const [name, path] of Object.entries(referencePaths)) {
    it(`renders the approved ${name} shape and line weight`, () => {
      const wrapper = mount(TableIcon, { props: { name } })
      expect(wrapper.get('path').attributes('d')).toBe(path)
      expect(wrapper.attributes('stroke-width')).toBe('1.7')
      expect(wrapper.attributes('aria-hidden')).toBe('true')
      wrapper.unmount()
    })
  }
  for (const name of ['more', 'grip']) {
    it(`keeps ${name} dots visible with the reference 3px stroke`, () => {
      const wrapper = mount(TableIcon, { props: { name } })
      expect(wrapper.attributes('stroke-width')).toBe('3')
      wrapper.unmount()
    })
  }
  it('keeps the two solid freeze icons at their original viewbox', () => {
    for (const name of ['pin-left', 'pin-right']) {
      const wrapper = mount(TableIcon, { props: { name, size: 14 } })
      expect(wrapper.attributes('viewBox')).toBe('0 0 1024 1024')
      expect(wrapper.get('path').attributes('fill')).toBe('currentColor')
      expect(wrapper.attributes('width')).toBe('14')
      wrapper.unmount()
    }
  })
  it('falls back to the document drawing without accidentally filling an unknown pin name', () => {
    const wrapper = mount(TableIcon, { props: { name: 'pin-unknown' } })
    expect(wrapper.get('path').attributes('d')).toBe(referencePaths.file)
    expect(wrapper.get('path').attributes('fill')).toBe('none')
    expect(wrapper.attributes('viewBox')).toBe('0 0 24 24')
    wrapper.unmount()
  })
})
