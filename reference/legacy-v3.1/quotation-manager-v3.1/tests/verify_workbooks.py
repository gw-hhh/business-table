"""独立验证最终应用生成/实际下载的 XLSX：ZIP/XML + artifact_tool 导入。"""
from pathlib import Path
import json, zipfile, subprocess
from xml.etree import ElementTree as ET
from artifact_tool import Blob, SpreadsheetFile
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/artifacts'
subprocess.run(['node', '-e', r'''
const fs=require('node:fs'),C=require('./src/core.js'),Config=require('./src/config.js'),E=require('./src/export-data.js'),W=require('./src/xlsx.js');
const s=C.normalizeSnapshot(),c=s.columns.find(c=>c.key==='amountCents');
c.number={enabled:true,mode:'percent',percentBase:'hundred',minDigits:2,maxDigits:2};
fs.writeFileSync('tests/artifacts/rules-percent.xlsx',W.write(E.createWorkbook([{...Config.SEED_ROWS[0],amountCents:1234}],s,{keys:['id','amountCents'],valueMode:'both'})));
c.number={enabled:true,mode:'decimal',scale:10000,minDigits:2,maxDigits:2,suffix:'万元'};
fs.writeFileSync('tests/artifacts/rules-scaled.xlsx',W.write(E.createWorkbook(Config.SEED_ROWS,s,{keys:['id','amountCents'],total:true})));
'''], cwd=ROOT, check=True)
specs = [
 ('browser-export.xlsx', '报价列表', 'J7'),
 ('browser-template-blank.xlsx', '数据填写', 'J5'),
 ('browser-template-example.xlsx', '示例', 'J2'),
 ('rules-mapping-export.xlsx', '报价列表', 'K7'),
 ('rules-percent.xlsx', '报价列表', 'C2'),
 ('rules-scaled.xlsx', '报价列表', 'B8'),
]
report = []
for name, sheet, last in specs:
 path=OUT/name
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  parts=[n for n in z.namelist() if n.endswith(('.xml','.rels'))]
  for part in parts: ET.fromstring(z.read(part))
  if name=='rules-percent.xlsx': assert '%' in z.read('xl/styles.xml').decode()
 book=SpreadsheetFile.import_xlsx(Blob.load(str(path)))
 values=book.worksheets.get_item(sheet).get_range(f'A1:{last}').values
 assert values[0][0]=='报价编号'
 if name=='browser-export.xlsx': assert values[1][0]=='Q20260914-0001' and abs(float(values[1][3])-63860)<1e-7
 if name=='browser-template-blank.xlsx': assert all(v in (None,'') for row in values[1:] for v in row)
 if name=='rules-mapping-export.xlsx': assert '待处理' in values[1] and 'draft' in values[1] and any('原值' in str(v) for v in values[0])
 if name=='rules-percent.xlsx': assert abs(float(values[1][1])-.1234)<1e-12 and abs(float(values[1][2])-12.34)<1e-10
 if name=='rules-scaled.xlsx': assert abs(float(values[1][1])-6.386)<1e-8 and abs(float(values[7][1])-102.645)<1e-8
 result={'file':name,'zip_crc':'passed','xml_parts':len(parts),'independent_import':'passed','first_row':values[0]}
 if name in ['browser-export.xlsx','rules-percent.xlsx']:
  try:
   book.render({'sheet_name':sheet,'range':f'A1:{last}','scale':1.5}).save(str(OUT/(name[:-5]+'-render.png')))
   result['render']='passed'
  except Exception as exc:
   result['render_error']=str(exc)
 report.append(result)
 print('PASS',name,repr(values[:2])[:300],flush=True)
(OUT/'independent-xlsx-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str))
