import { toRaw } from 'vue'
import type { RowData } from '../types'

export function getValue(row: RowData, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) =>
    value !== null && typeof value === 'object' && Object.hasOwn(value, key)
      ? (value as RowData)[key] : undefined, row)
}

/** Clone data graphs without leaking Vue proxies or mutable caller-owned query values. */
export function cloneData<T>(value: T): T {
  const seen = new WeakMap<object, unknown>()
  function unwrap(input: unknown): unknown {
    if (input === null || typeof input !== 'object') return input
    const raw = toRaw(input)
    if (seen.has(raw)) return seen.get(raw)
    if (raw instanceof Map) {
      const output = new Map(); seen.set(raw, output)
      for (const [key, item] of raw) output.set(unwrap(key), unwrap(item))
      return output
    }
    if (raw instanceof Set) {
      const output = new Set(); seen.set(raw, output)
      for (const item of raw) output.add(unwrap(item))
      return output
    }
    if (Array.isArray(raw) || Object.prototype.toString.call(raw) === '[object Object]') {
      const output: Record<string, unknown> | unknown[] = Array.isArray(raw) ? [] : {}
      seen.set(raw, output)
      for (const [key, item] of Object.entries(raw)) Object.defineProperty(output, key, { value: unwrap(item), enumerable: true, configurable: true, writable: true })
      return output
    }
    return raw
  }
  return structuredClone(unwrap(value)) as T
}

export function typedKey(value: unknown): string {
  if (value === null) return 'null:'
  if (value === undefined) return 'undefined:'
  if (typeof value === 'number' && Object.is(value, -0)) return 'number:-0'
  return `${typeof value}:${String(value)}`
}

export function withValue(row:RowData,path:string,value:unknown):RowData {
  const output=cloneData(row),keys=path.split('.')
  let target=output
  keys.forEach((key,index)=>{
    if(index===keys.length-1)Object.defineProperty(target,key,{value,enumerable:true,writable:true,configurable:true})
    else {
      const current=Object.hasOwn(target,key)?target[key]:undefined
      if(current===null||typeof current!=='object'||Array.isArray(current))Object.defineProperty(target,key,{value:Object.create(null),enumerable:true,writable:true,configurable:true})
      target=target[key] as RowData
    }
  })
  return output
}
