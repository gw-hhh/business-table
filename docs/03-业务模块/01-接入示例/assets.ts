import type { ColumnConfig } from '@company/business-table'

export type Asset = { id: string; name: string; status: number; amount: number }

export const rows: Asset[] = [
  { id: 'A-001', name: '温度传感器', status: 1, amount: 1280 },
  { id: 'A-002', name: '压力转换器', status: 0, amount: 3600 },
  { id: 'A-003', name: '液位计', status: 1, amount: 8200 },
]

export const columns: ColumnConfig<Asset>[] = [
  { id: 'id', field: 'id', title: '编号', width: 140, fixed: 'left' },
  { id: 'name', field: 'name', title: '物料名称', width: 220, sortable: true },
  {
    id: 'status', field: 'status', title: '状态', type: 'enum', width: 120,
    valueMap: [{ value: 0, label: '草稿' }, { value: 1, label: '已确认' }],
    filter: {
      enabled: true, type: 'multi', source: 'mapping', search: true,
      counts: false, operators: ['in', 'notIn', 'empty', 'notEmpty'], options: [],
    },
  },
  {
    id: 'amount', field: 'amount', title: '金额', type: 'currency',
    width: 160, align: 'right', sortable: true,
    numberFormat: { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 },
  },
]
