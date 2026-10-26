import os,tempfile,threading,time,unittest
from concurrent.futures import ThreadPoolExecutor
from core import Engine,Pending,Conflict,Invalid,evidence

TOKEN='t'*40; KEY='k'*40
REQ={'items':[{'sku':'TEST-TEE','quantity':2,'size':'M','price':1}], 'delivery':{'name':'Test','email':'test@example.invalid','phone':'000','city':'Test','address':'Test'}}
class FakePayPal:
    def __init__(self): self.creates=0; self.captures=0; self.fail_create=False; self.fail_capture=False; self.oid=None
    def create(self,oid,usd,key):
        self.creates+=1; self.oid=oid; time.sleep(.04)
        if self.fail_create: raise TimeoutError()
        return 'PAYPAL123'
    def capture(self,pid,key):
        self.captures+=1; time.sleep(.04)
        if self.fail_capture: raise TimeoutError()
    def lookup_paid(self,pid):
        a={'currency_code':'USD','value':'20.90'}
        cap={'id':'CAPTURE123','status':'COMPLETED','amount':a,'supplementary_data':{'related_ids':{'order_id':pid}}}
        order={'id':pid,'status':'COMPLETED','purchase_units':[{'custom_id':self.oid,'payee':{'merchant_id':'MERCHANT'},'amount':a,'payments':{'captures':[cap]}}]}
        return order,cap
class Sheet:
    def __init__(self): self.rows={}; self.fail=False
    def upsert_and_verify(self,payload,row):
        if self.fail: raise TimeoutError()
        if row in self.rows and self.rows[row]!=payload: raise ValueError()
        self.rows[row]=payload; return True
class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.path=os.path.join(self.tmp.name,'db.sqlite'); self.pp=FakePayPal(); self.sheet=Sheet(); self.e=Engine(self.path,self.pp,self.sheet,{'TEST-TEE':10000},'0.1045','MERCHANT')
    def tearDown(self): self.tmp.cleanup()
    def test_price_and_idempotence(self):
        a=self.e.create(KEY,TOKEN,REQ); b=self.e.create(KEY,TOKEN,REQ)
        self.assertEqual(a,b); self.assertEqual(a['amountUSD'],'20.90'); self.assertEqual(self.pp.creates,1)
        changed={**REQ,'items':[{'sku':'TEST-TEE','quantity':1,'size':'M'}]}
        with self.assertRaises(Conflict): self.e.create(KEY,TOKEN,changed)
        with self.assertRaises(Invalid): self.e.status(a['orderId'],'x'*40)
    def test_simultaneous_create(self):
        with ThreadPoolExecutor(max_workers=12) as pool: results=list(pool.map(lambda _:self.e.create(KEY,TOKEN,REQ),range(12)))
        self.assertEqual(self.pp.creates,1); self.assertEqual(len({x['orderId'] for x in results}),1)
    def test_simultaneous_capture_and_sync_retry(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']
        def call(_):
            try: return self.e.capture(oid,TOKEN)['state']
            except Pending: return 'PENDING'
        with ThreadPoolExecutor(max_workers=8) as p: list(p.map(call,range(8)))
        self.assertEqual(self.pp.captures,1); self.assertEqual(self.e.status(oid,TOKEN)['state'],'PAID_PENDING_SHEET')
        self.sheet.fail=True
        with self.assertRaises(Pending): self.e.sync(oid,TOKEN)
        self.sheet.fail=False; self.assertEqual(self.e.sync(oid,TOKEN)['state'],'CONFIRMED'); self.e.sync(oid,TOKEN)
        self.assertEqual(len(self.sheet.rows),1)
    def test_unknown_never_retries_and_survives_restart(self):
        self.pp.fail_create=True
        with self.assertRaises(Pending): self.e.create(KEY,TOKEN,REQ)
        newer=Engine(self.path,self.pp,self.sheet,{'TEST-TEE':10000},'0.1045','MERCHANT')
        self.assertEqual(newer.create(KEY,TOKEN,REQ)['state'],'CREATE_UNKNOWN'); self.assertEqual(self.pp.creates,1)
    def test_capture_timeout_never_retries(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']; self.pp.fail_capture=True
        with self.assertRaises(Pending): self.e.capture(oid,TOKEN)
        with self.assertRaises(Pending): self.e.capture(oid,TOKEN)
        self.assertEqual(self.pp.captures,1); self.assertEqual(self.e.status(oid,TOKEN)['state'],'CAPTURE_UNKNOWN')
    def test_verifier_rejects_mismatch(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']; order,cap=self.pp.lookup_paid('PAYPAL123'); expected={'id':oid,'paypal_id':'PAYPAL123','usd':'20.90','merchant':'MERCHANT'}
        self.assertTrue(evidence(order,cap,expected)); cap['status']='REFUNDED'; self.assertFalse(evidence(order,cap,expected))
    def test_invalid_product(self):
        bad={**REQ,'items':[{'sku':'NO','quantity':1,'size':'M'}]}
        with self.assertRaises(Invalid): self.e.create(KEY,TOKEN,bad)
        self.assertEqual(self.pp.creates,0)
if __name__=='__main__': unittest.main()
