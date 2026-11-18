import csv
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from preview_review import generate

class ReviewTests(unittest.TestCase):
    def render(self, scopes):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'review.csv'; output=Path(folder)/'review.html'
            rows=[dict(zip(['编号','分组','中心X_m','中心Y_m','长X_m','宽Y_m','处理','生成状态','阻断原因','问题分组','规则集','规范图层','图块属性签名','确认作用域'],[str(i),'G1','0','0','1','1','已确认','blocked','缺少高度','高度','project-a','JDL-AUTO-PICK','shape-a',scope])) for i,scope in enumerate(scopes)]
            with source.open('w',encoding='utf-8-sig',newline='') as f:
                writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
            generate(source,output)
            return json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>',output.read_text(),re.S)[1])['items']

    def test_confirmed_but_missing_parameter_stays_visible(self):
        row=self.render(['1F'])[0]
        self.assertEqual(row['status'],'待确认')
        self.assertEqual(row['recognitionStatus'],'已确认')
        self.assertEqual(row['reason'],'缺少高度')

    def test_bulk_scope_separates_floors_and_missing_metadata(self):
        rows=self.render(['1F','1F','2F','',''])
        self.assertEqual(rows[0]['issueKey'],rows[1]['issueKey'])
        self.assertNotEqual(rows[0]['issueKey'],rows[2]['issueKey'])
        self.assertNotEqual(rows[3]['issueKey'],rows[4]['issueKey'])

if __name__=='__main__': unittest.main()
