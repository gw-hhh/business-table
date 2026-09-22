/** Stable, serializable font tokens. No font files, URLs or arbitrary CSS are loaded. */
export const columnFontFamilies = ['inherit','sans-serif','serif','monospace','system','yahei','pingfang','simsun','mono'] as const
export type ColumnFontFamily = typeof columnFontFamilies[number]

export const fontFamilies: Record<ColumnFontFamily,{label:string;css:string}> = {
  inherit: {label:'继承页面字体',css:'inherit'},
  'sans-serif': {label:'无衬线',css:'sans-serif'},
  serif: {label:'衬线',css:'serif'},
  monospace: {label:'等宽',css:'monospace'},
  system: {label:'系统字体',css:'-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'},
  yahei: {label:'微软雅黑',css:'"Microsoft YaHei", "PingFang SC", sans-serif'},
  pingfang: {label:'苹方',css:'"PingFang SC", "Microsoft YaHei", sans-serif'},
  simsun: {label:'宋体',css:'SimSun, "Songti SC", serif'},
  mono: {label:'等宽字体',css:'Consolas, "SFMono-Regular", monospace'},
}
export const fontOptions = [
  {value:'',label:'跟随表格'},
  ...(['system','yahei','pingfang','simsun','mono','sans-serif','serif','monospace','inherit'] as const)
    .map(value=>({value,label:fontFamilies[value].label})),
]
export function fontFamilyCss(value:ColumnFontFamily):string {
  return Object.hasOwn(fontFamilies,value)?fontFamilies[value].css:'inherit'
}
