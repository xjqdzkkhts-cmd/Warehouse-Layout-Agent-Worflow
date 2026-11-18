"""Generate an offline numbered/color-coded review HTML from an inventory CSV."""
import argparse,csv,hashlib,io,json,math
from pathlib import Path

def generate(source,out):
 source=Path(source);items=[];seen=set()
 for r in csv.DictReader(io.StringIO(source.read_text(encoding='utf-8-sig'))):
  id=r['编号'];assert id and id not in seen,'Duplicate or empty ID';seen.add(id)
  state=r.get('处理','待确认');state=state if state in ['已识别','已确认','待确认','排除'] else '待确认'
  recognition_state=state
  if r.get('生成状态') == 'blocked' and state != '排除': state='待确认'
  item={'id':id,'label':r.get('显示编号') or id,'group':r['分组'],'description':r.get('说明',''),'status':state,'x':float(r['中心X_m']),'y':float(r['中心Y_m']),'width':float(r['长X_m']),'depth':float(r['宽Y_m']),'rotation':float(r.get('旋转_deg') or 0),'source':r.get('来源',r.get('sourceHandle','')),'reason':r.get('不确定原因',''),'question':r.get('需用户判断',''),'evidence':r.get('判断依据',''),'issue':r.get('问题分组',''),'answer':''}
  item.update(recognitionStatus=recognition_state,mappingStatus=r.get('映射状态',''),generationStatus=r.get('生成状态',''),blockers=r.get('阻断原因',''))
  if item['blockers'] and not item['reason']: item['reason']=item['blockers']
  # Explicit scope evidence is required for bulk answers; legacy CSV falls back to one item.
  scope=[r.get(k,'').strip() for k in ['规则集','规范图层','图块属性签名','确认作用域']]
  item['issueKey']=json.dumps([item['issue'],*scope],ensure_ascii=False) if item['issue'] and all(scope) else id
  assert all(math.isfinite(item[k]) for k in ['x','y','width','depth','rotation']) and item['width']>0 and item['depth']>0,'Invalid dimensions'
  items.append(item)
 assert items,'Empty inventory'
 data={'schemaVersion':2,'sourceId':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceName':source.name,'items':items}
 template=(Path(__file__).resolve().parents[1]/'assets/review-template.html').read_text()
 payload=json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('&','\\u0026')
 Path(out).write_text(template.replace('__REVIEW_DATA__',payload));return {'items':len(items),'out':str(out)}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('csv');p.add_argument('--out',required=True);a=p.parse_args();print(json.dumps(generate(a.csv,a.out),ensure_ascii=False))
