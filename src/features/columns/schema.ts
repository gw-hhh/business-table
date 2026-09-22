import {z} from 'zod'
import {columnFontFamilies} from '../../config/font-families'
import {operatorLabels} from '../filters/model'

const color=z.string().regex(/^#[\da-fA-F]{6}$/)
const primitive=z.union([z.string(),z.number().finite(),z.boolean(),z.null()])
export const numberRuleSchema=z.object({
  enabled:z.boolean().optional(),style:z.enum(['decimal','currency','percent']).optional(),
  currency:z.string().regex(/^[A-Z]{3}$/i).optional(),useGrouping:z.boolean().optional(),
  minimumFractionDigits:z.number().int().min(0).max(20).optional(),maximumFractionDigits:z.number().int().min(0).max(20).optional(),
  percentBase:z.enum(['ratio','percent']).optional(),prefix:z.string().max(40).optional(),suffix:z.string().max(40).optional(),
  scale:z.union([z.literal(1),z.literal(1000),z.literal(10000),z.literal(100000000)]).optional(),sign:z.enum(['auto','always','accounting']).optional(),
}).strict().refine(value=>value.minimumFractionDigits===undefined||value.maximumFractionDigits===undefined||value.minimumFractionDigits<=value.maximumFractionDigits)
export const mappingItemSchema=z.object({value:primitive,label:z.string().max(400),color:color.optional(),background:color.optional(),border:color.optional(),icon:z.string().max(40).optional()}).strict()
export const mappingSchema=z.object({enabled:z.boolean(),type:z.enum(['text','number','boolean']),presentation:z.enum(['text','tag','dot']).optional(),empty:z.string().max(400).optional(),unknown:z.string().max(400).optional(),sort:z.boolean().optional(),items:z.array(mappingItemSchema).max(200)}).strict()
export const contentSchema=z.object({wrap:z.enum(['ellipsis','two','wrap']).optional(),emptyText:z.string().max(400).optional(),description:z.string().max(1000).optional(),copyable:z.boolean().optional(),secondaryField:z.string().max(160).optional(),showSecondary:z.boolean().optional(),dateFormat:z.enum(['iso','slash','cn']).optional()}).strict()
const attrs=z.object({bold:z.boolean().optional(),italic:z.boolean().optional(),underline:z.boolean().optional(),strike:z.boolean().optional(),color:color.optional(),background:color.optional(),font:z.enum(columnFontFamilies).optional(),size:z.number().int().min(10).max(32).optional(),align:z.enum(['left','center','right']).optional(),list:z.enum(['ordered','bullet']).optional(),link:z.string().max(1000).optional()}).strict()
export const templateSchema=z.object({enabled:z.boolean(),document:z.object({ops:z.array(z.object({insert:z.union([z.string().max(10000),z.object({field:z.string().max(160)}).strict()]),attributes:attrs.optional()}).strict()).max(2000)}).strict()}).strict()
export const filterSchema=z.object({enabled:z.boolean().optional(),type:z.enum(['text','number','date','single','multi','boolean']).optional(),source:z.enum(['data','mapping','manual','remote']).optional(),search:z.boolean().optional(),counts:z.boolean().optional(),operators:z.array(z.enum(Object.keys(operatorLabels) as [keyof typeof operatorLabels,...(keyof typeof operatorLabels)[]])).optional(),options:z.array(z.object({value:primitive,label:z.string(),count:z.number().int().nonnegative().optional()}).strict()).max(1000).optional()}).strict()
export const ruleFieldSchemas={content:contentSchema,mapping:mappingSchema,numberRule:numberRuleSchema,template:templateSchema,filter:filterSchema,filterable:z.boolean(),emptyText:z.string().max(400),numberFormat:numberRuleSchema,valueMap:z.array(mappingItemSchema).max(200)}
