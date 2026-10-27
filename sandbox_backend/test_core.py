import os,tempfile,threading,time,unittest,multiprocessing
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
    def lookup_order(self,pid):
        if getattr(self,'lookup_error',False): raise TimeoutError()
        if getattr(self,'unpaid',False):
            return {'id':pid,'status':'CREATED','purchase_units':[{'custom_id':self.oid,'payee':{'merchant_id':'MERCHANT'},'amount':{'currency_code':'USD','value':'20.90'}}]}
        return self.lookup_paid(pid)[0]
    def lookup_capture(self,cid):
        return self.lookup_paid('PAYPAL123')[1]
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
def hold_lock_then_wait(path,key,ready):
    from core import order_lock,digest
    stub=type('Stub',(),{'path':path})()
    with order_lock(stub,digest(key)):
        ready.set()
        time.sleep(30)

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
        def attempt(_):
            try: return self.e.create(KEY,TOKEN,REQ)
            except Pending: return None
        with ThreadPoolExecutor(max_workers=12) as pool: results=list(pool.map(attempt,range(12)))
        results=[x for x in results if x]
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
    def test_recover_unknown_create_with_verified_candidate(self):
        self.pp.fail_create=True
        with self.assertRaises(Pending): self.e.create(KEY,TOKEN,REQ)
        self.pp.unpaid=True
        row=self.e.create(KEY,TOKEN,REQ); oid=row['orderId']
        with self.assertRaises(Pending): self.e.reconcile(oid,TOKEN)
        self.assertEqual(self.e.reconcile(oid,TOKEN,'PAYPAL123')['state'],'AWAITING_APPROVAL')
        self.assertEqual(self.pp.creates,1)
    def test_create_recovery_rejects_mismatch_and_unavailable(self):
        self.pp.fail_create=True
        with self.assertRaises(Pending): self.e.create(KEY,TOKEN,REQ)
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']; self.pp.unpaid=True; self.pp.lookup_error=True
        with self.assertRaises(Pending): self.e.reconcile(oid,TOKEN,'PAYPAL123')
        self.pp.lookup_error=False; self.pp.oid='OTHER'
        with self.assertRaises(Pending): self.e.reconcile(oid,TOKEN,'PAYPAL123')
        self.assertEqual(self.e.status(oid,TOKEN)['state'],'CREATE_UNKNOWN')
    def test_recover_unknown_capture_after_restart(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']; self.pp.fail_capture=True
        with self.assertRaises(Pending): self.e.capture(oid,TOKEN)
        restarted=Engine(self.path,self.pp,self.sheet,{'TEST-TEE':10000},'0.1045','MERCHANT')
        self.assertEqual(restarted.reconcile(oid,TOKEN)['state'],'PAID_PENDING_SHEET')
        self.assertEqual(restarted.reconcile(oid,TOKEN)['state'],'PAID_PENDING_SHEET')
        self.assertEqual(self.pp.captures,1)
        self.assertEqual(restarted.sync(oid,TOKEN)['state'],'CONFIRMED')
    def test_unpaid_unknown_capture_stays_pending(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']; self.pp.fail_capture=True
        with self.assertRaises(Pending): self.e.capture(oid,TOKEN)
        self.pp.unpaid=True
        with self.assertRaises(Pending): self.e.reconcile(oid,TOKEN)
        self.assertEqual(self.e.status(oid,TOKEN)['state'],'CAPTURE_UNKNOWN'); self.assertEqual(self.pp.captures,1)
    def test_interrupted_states_and_live_lock(self):
        from core import order_lock, digest
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']
        self.e.transition(oid,'AWAITING_APPROVAL','CAPTURE_IN_PROGRESS')
        with order_lock(self.e,digest(KEY)):
            with self.assertRaises(Pending): self.e.reconcile(oid,TOKEN)
        restarted=Engine(self.path,self.pp,self.sheet,{'TEST-TEE':10000},'0.1045','MERCHANT')
        self.assertEqual(restarted.reconcile(oid,TOKEN)['state'],'PAID_PENDING_SHEET')
        self.e.transition(oid,'PAID_PENDING_SHEET','SHEET_IN_PROGRESS')
        self.assertEqual(restarted.reconcile(oid,TOKEN)['state'],'PAID_PENDING_SHEET')
        self.assertEqual(restarted.sync(oid,TOKEN)['state'],'CONFIRMED')
    def test_recover_after_process_killed_while_holding_lock(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']
        self.e.transition(oid,'AWAITING_APPROVAL','CAPTURE_IN_PROGRESS')
        ready=multiprocessing.Event(); process=multiprocessing.Process(target=hold_lock_then_wait,args=(self.path,KEY,ready))
        process.start()
        try:
            self.assertTrue(ready.wait(5))
            with self.assertRaises(Pending): self.e.reconcile(oid,TOKEN)
            process.terminate(); process.join(5)
            self.assertFalse(process.is_alive())
            restarted=Engine(self.path,self.pp,self.sheet,{'TEST-TEE':10000},'0.1045','MERCHANT')
            self.assertEqual(restarted.reconcile(oid,TOKEN)['state'],'PAID_PENDING_SHEET')
            self.assertEqual(self.pp.captures,0)
        finally:
            if process.is_alive(): process.terminate(); process.join()
    def test_interrupted_create_candidate_reuse_rejected(self):
        self.pp.fail_create=True
        with self.assertRaises(Pending): self.e.create(KEY,TOKEN,REQ)
        first=self.e.create(KEY,TOKEN,REQ)['orderId']; self.pp.unpaid=True
        self.e.reconcile(first,TOKEN,'PAYPAL123')
        key2='z'*40
        with self.assertRaises(Pending): self.e.create(key2,TOKEN,REQ)
        second=self.e.create(key2,TOKEN,REQ)['orderId']
        self.e.transition(second,'CREATE_UNKNOWN','CREATE_IN_PROGRESS')
        with self.assertRaises(Pending): self.e.reconcile(second,TOKEN,'PAYPAL123')
        self.assertEqual(self.e.status(second,TOKEN)['state'],'CREATE_IN_PROGRESS')
    def test_capture_reconcile_mismatch_fails_closed(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']; self.pp.fail_capture=True
        with self.assertRaises(Pending): self.e.capture(oid,TOKEN)
        self.pp.oid='DIFFERENT-ORDER'
        with self.assertRaises(Pending): self.e.reconcile(oid,TOKEN)
        self.assertEqual(self.e.status(oid,TOKEN)['state'],'CAPTURE_UNKNOWN')
        self.assertEqual(self.pp.captures,1)
    def test_concurrent_reconciliation_calls_never_capture(self):
        oid=self.e.create(KEY,TOKEN,REQ)['orderId']; self.pp.fail_capture=True
        with self.assertRaises(Pending): self.e.capture(oid,TOKEN)
        def attempt(_):
            try: return self.e.reconcile(oid,TOKEN)['state']
            except Pending: return 'PENDING'
        with ThreadPoolExecutor(max_workers=8) as pool: list(pool.map(attempt,range(8)))
        self.assertEqual(self.e.status(oid,TOKEN)['state'],'PAID_PENDING_SHEET')
        self.assertEqual(self.pp.captures,1)
    def test_invalid_product(self):
        bad={**REQ,'items':[{'sku':'NO','quantity':1,'size':'M'}]}
        with self.assertRaises(Invalid): self.e.create(KEY,TOKEN,bad)
        self.assertEqual(self.pp.creates,0)
if __name__=='__main__': unittest.main()
