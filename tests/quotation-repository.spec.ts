import { describe, expect, it, vi } from 'vitest'
import { createQuotationRepository, quotationDataKey } from '../demo/quotation/repository'
import { makeExampleQuotations, serializeQuotationBackup } from '../demo/quotation/model'
function memoryStorage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}}
describe('quotation local repository',()=>{
  it('reads the existing backup envelope and only publishes after a durable write',()=>{
    const storage=memoryStorage();storage.setItem(quotationDataKey,serializeQuotationBackup(makeExampleQuotations()))
    const repository=createQuotationRepository({storage}),before=repository.read(),version=repository.snapshot().version
    vi.spyOn(storage,'setItem').mockImplementationOnce(()=>{throw Error('quota')})
    expect(()=>repository.commit([{...before[0],name:'未保存'},...before.slice(1)],version)).toThrow('保存失败')
    expect(repository.rows.value[0].name).toBe(before[0].name)
    expect(repository.snapshot().version).toBe(version)
    repository.commit([{...before[0],name:'已保存'},...before.slice(1)],version)
    expect(repository.rows.value[0].name).toBe('已保存')
    expect(JSON.parse(storage.getItem(quotationDataKey)!)).toMatchObject({kind:'quotation-demo',version:1,revision:1})
  })
  it('reports another tab change without replacing the visible rows and rejects stale writes',()=>{
    const storage=memoryStorage(),events=new EventTarget(),first=createQuotationRepository({storage,events}),second=createQuotationRepository({storage})
    const original=first.read();second.read();const snapshot=first.snapshot()
    second.commit([{...original[0],name:'另一个标签的修改'},...original.slice(1)])
    events.dispatchEvent(new StorageEvent('storage',{key:quotationDataKey,newValue:storage.getItem(quotationDataKey)}))
    expect(first.externalChanged.value).toBe(true)
    expect(first.rows.value[0].name).toBe(original[0].name)
    expect(()=>first.commit(original,snapshot.version)).toThrow('其他页面')
    first.read(true)
    expect(first.externalChanged.value).toBe(false)
    expect(first.rows.value[0].name).toBe('另一个标签的修改')
    expect(()=>first.commit(original,snapshot.version)).toThrow('重新打开')
    first.dispose()
    events.dispatchEvent(new StorageEvent('storage',{key:quotationDataKey,newValue:null}))
    expect(first.externalChanged.value).toBe(false)
  })
  it('retains current data when an explicit reload fails and never replaces corrupted storage implicitly',()=>{
    const storage=memoryStorage(),repository=createQuotationRepository({storage});const rows=repository.read()
    storage.setItem(quotationDataKey,'broken')
    expect(()=>repository.read(true)).toThrow('当前列表未被覆盖')
    expect(repository.rows.value).toEqual(rows)
    const warning=vi.fn(),temporary=createQuotationRepository({storage,onWarning:warning})
    expect(temporary.read()).toEqual(makeExampleQuotations())
    expect(temporary.temporary.value).toBe(true);expect(warning).toHaveBeenCalledOnce()
    temporary.commit([{...rows[0],name:'临时修改'},...rows.slice(1)])
    expect(storage.getItem(quotationDataKey)).toBe('broken')
  })
})
