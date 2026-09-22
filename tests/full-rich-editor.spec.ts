import {describe,it,expect} from 'vitest'
import {readRichDocument,richText} from '../src/features/rich-text/document'
import {formatRange,replaceRange,readEditorHtml} from '../src/features/rich-text/editor-model'

describe('shared rich document editing',()=>{
  it('formats only selected text while keeping the source immutable',()=>{
    const source=readRichDocument('甲乙丙')
    const result=formatRange(source,{start:1,end:2},{bold:true,color:'#2468e8'})
    expect(richText(result)).toBe('甲乙丙')
    expect(result.ops.find(op=>op.insert==='乙')?.attributes).toMatchObject({bold:true,color:'#2468e8'})
    expect(source.ops).toEqual([{insert:'甲乙丙'},{insert:'\n'}])
  })
  it('preserves field tokens when replacing a selected range',()=>{
    const source=readRichDocument({ops:[{insert:'项目：'},{insert:{field:'name'}},{insert:'\n'}]},{fields:['name'],template:true})
    const result=replaceRange(source,{start:0,end:3},{ops:[{insert:'名称：'}]})
    expect(result.ops.some(op=>typeof op.insert==='object'&&op.insert.field==='name')).toBe(true)
    expect(richText(result,id=>id==='name'?'示例':'')).toBe('名称：示例')
  })
  it('sanitizes pasted HTML without loading or retaining executable content',()=>{
    const result=readEditorHtml('<p><b>你好</b><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">坏链接</a><a href="https://example.com/a">文档</a></p>')
    expect(richText(result)).toBe('你好坏链接文档')
    expect(result.ops.find(op=>typeof op.insert==='string'&&op.insert.includes('你好'))?.attributes?.bold).toBe(true)
    expect(result.ops.some(op=>op.attributes?.link?.startsWith('javascript:'))).toBe(false)
    expect(result.ops.find(op=>op.insert==='文档')?.attributes?.link).toBe('https://example.com/a')
  })
  it('restores list and paragraph attributes rather than flattening the document',()=>{
    const result=readEditorHtml('<ul><li>甲</li><li><i>乙</i></li></ul><p style="text-align:right">丙</p>')
    expect(richText(result)).toBe('甲\n乙\n丙')
    expect(result.ops.filter(op=>op.insert==='\n'&&op.attributes?.list==='bullet')).toHaveLength(2)
    expect(result.ops.some(op=>op.attributes?.align==='right')).toBe(true)
  })
  it('accepts only registered field chips and bounds paste size',()=>{
    const result=readEditorHtml('<p><span data-bt-field="name">名称</span><span data-bt-field="secret">secret</span></p>',{fields:['name'],template:true,maxChars:10})
    expect(result.ops.some(op=>typeof op.insert==='object'&&op.insert.field==='name')).toBe(true)
    expect(result.ops.some(op=>typeof op.insert==='object'&&op.insert.field==='secret')).toBe(false)
    expect([...richText(readEditorHtml('<p>'+ '甲'.repeat(3000)+'</p>',{maxChars:1000}))]).toHaveLength(1000)
  })
})
