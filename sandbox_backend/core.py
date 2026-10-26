"""Sandbox-only order engine. External adapters are injected; never use for production."""
import hashlib, json, secrets, sqlite3, uuid
from decimal import Decimal, ROUND_HALF_UP

class Conflict(Exception): pass
class Pending(Exception): pass
class Invalid(Exception): pass

def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)

def evidence(order, capture, expected):
    try:
        units=order['purchase_units']; unit=units[0]; captures=unit['payments']['captures']; embedded=captures[0]
        def amount(a):
            return a['currency_code']=='USD' and Decimal(a['value']) == Decimal(expected['usd']) and Decimal(a['value']).as_tuple().exponent == -2
        return (order['id']==expected['paypal_id'] and order['status']=='COMPLETED' and len(units)==1 and len(captures)==1
            and unit['custom_id']==expected['id'] and unit['payee']['merchant_id']==expected['merchant']
            and amount(unit['amount']) and embedded['id']==capture['id'] and embedded['status']=='COMPLETED'
            and amount(embedded['amount']) and capture['status']=='COMPLETED' and amount(capture['amount'])
            and capture['supplementary_data']['related_ids']['order_id']==expected['paypal_id'])
    except (KeyError, IndexError, TypeError, ValueError, ArithmeticError): return False

class Engine:
    def __init__(self, path, paypal, sheet, catalog, rate, merchant):
        self.path=path; self.paypal=paypal; self.sheet=sheet; self.catalog=catalog; self.rate=Decimal(rate); self.merchant=merchant
        if not merchant or self.rate<=0: raise ValueError('Invalid test configuration')
        with self.db() as c:
            c.executescript('''CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, token_hash TEXT NOT NULL, request_hash TEXT NOT NULL, snapshot TEXT NOT NULL, usd TEXT NOT NULL, state TEXT NOT NULL, paypal_id TEXT UNIQUE, capture_id TEXT UNIQUE, sync_row INTEGER UNIQUE, version INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS sequence (id INTEGER PRIMARY KEY CHECK(id=1), n INTEGER NOT NULL);''')
    def db(self):
        c=sqlite3.connect(self.path, timeout=20, isolation_level=None); c.row_factory=sqlite3.Row; c.execute('PRAGMA busy_timeout=20000'); return c
    def price(self, request):
        items=request.get('items'); delivery=request.get('delivery')
        if not isinstance(items,list) or not 1<=len(items)<=20 or not isinstance(delivery,dict): raise Invalid('Invalid request')
        required=('name','email','phone','city','address')
        if any(not isinstance(delivery.get(k),str) or not 1<=len(delivery[k].strip())<=200 for k in required): raise Invalid('Invalid delivery')
        lines=[]; mad=0
        for line in items:
            if not isinstance(line,dict): raise Invalid('Invalid item')
            sku=line.get('sku'); qty=line.get('quantity'); size=line.get('size')
            if not isinstance(sku,str) or sku not in self.catalog or type(qty) is not int or not 1<=qty<=10 or not isinstance(size,str) or not 1<=len(size)<=20: raise Invalid('Invalid product')
            unit=self.catalog[sku]
            if type(unit) is not int or unit<=0: raise Invalid('Invalid catalog')
            mad+=unit*qty; lines.append({'sku':sku,'quantity':qty,'size':size,'unit_mad_cents':unit})
        usd=(Decimal(mad)/100*self.rate).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
        if usd<=0: raise Invalid('Invalid amount')
        return {'items':lines,'delivery':{k:delivery[k].strip() for k in required},'mad_cents':mad}, str(usd)
    def create(self, key, token, request):
        if not isinstance(key,str) or len(key)<20 or len(key)>128 or not isinstance(token,str) or len(token)<32 or len(token)>256: raise Invalid('Invalid session')
        request_hash=digest(canonical(request)); snapshot,usd=self.price(request); oid='NOT-'+uuid.uuid4().hex
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT * FROM orders WHERE idem=?',(digest(key),)).fetchone()
            if row:
                c.execute('COMMIT')
                if row['token_hash']!=digest(token) or row['request_hash']!=request_hash: raise Conflict('Idempotency conflict')
                return self.public(row)
            c.execute('INSERT INTO orders(id,idem,token_hash,request_hash,snapshot,usd,state) VALUES(?,?,?,?,?,?,?)',(oid,digest(key),digest(token),request_hash,canonical(snapshot),usd,'CREATE_IN_PROGRESS'))
            c.execute('COMMIT')
        try: created=self.paypal.create(oid,usd,'create-'+oid)
        except Exception:
            self.transition(oid,'CREATE_IN_PROGRESS','CREATE_UNKNOWN'); raise Pending('Creation requires reconciliation')
        if not isinstance(created,str) or not created.isalnum():
            self.transition(oid,'CREATE_IN_PROGRESS','CREATE_UNKNOWN'); raise Pending('Creation requires reconciliation')
        with self.db() as c:
            c.execute('UPDATE orders SET state=?,paypal_id=?,version=version+1 WHERE id=? AND state=?',('AWAITING_APPROVAL',created,oid,'CREATE_IN_PROGRESS'))
        return self.status(oid,token)
    def transition(self, oid, old, new):
        with self.db() as c: return c.execute('UPDATE orders SET state=?,version=version+1 WHERE id=? AND state=?',(new,oid,old)).rowcount==1
    def get(self, oid, token):
        with self.db() as c: row=c.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone()
        if not row or not isinstance(token,str) or not secrets.compare_digest(row['token_hash'],digest(token)): raise Invalid('Not found')
        return row
    def public(self,row): return {'orderId':row['id'],'state':row['state'],'paypalOrderId':row['paypal_id'],'amountUSD':row['usd']}
    def status(self,oid,token): return self.public(self.get(oid,token))
    def capture(self,oid,token):
        row=self.get(oid,token)
        if row['state'] in ('PAID_PENDING_SHEET','CONFIRMED'): return self.public(row)
        if not self.transition(oid,'AWAITING_APPROVAL','CAPTURE_IN_PROGRESS'): raise Pending('Capture or reconciliation in progress')
        try:
            self.paypal.capture(row['paypal_id'],'capture-'+oid)
            order,capture=self.paypal.lookup_paid(row['paypal_id'])
            expected={'id':oid,'paypal_id':row['paypal_id'],'usd':row['usd'],'merchant':self.merchant}
            if not evidence(order,capture,expected): raise ValueError('Unverified payment')
            with self.db() as c:
                c.execute('UPDATE orders SET state=?,capture_id=?,version=version+1 WHERE id=? AND state=?',('PAID_PENDING_SHEET',capture['id'],oid,'CAPTURE_IN_PROGRESS'))
        except Exception:
            self.transition(oid,'CAPTURE_IN_PROGRESS','CAPTURE_UNKNOWN'); raise Pending('Payment requires reconciliation; do not pay again')
        return self.status(oid,token)
    def sync(self,oid,token):
        row=self.get(oid,token)
        if row['state']=='CONFIRMED': return self.public(row)
        if not self.transition(oid,'PAID_PENDING_SHEET','SHEET_IN_PROGRESS'): raise Pending('Sync or reconciliation in progress')
        try:
            # Adapter must be idempotent by order ID, and read back exact payload.
            row=self.get(oid,token)
            with self.db() as c:
                c.execute('BEGIN IMMEDIATE')
                current=c.execute('SELECT sync_row FROM orders WHERE id=?',(oid,)).fetchone()['sync_row']
                if current is None:
                    c.execute('INSERT OR IGNORE INTO sequence(id,n) VALUES(1,1)')
                    c.execute('UPDATE sequence SET n=n+1 WHERE id=1')
                    current=c.execute('SELECT n FROM sequence WHERE id=1').fetchone()['n']
                    c.execute('UPDATE orders SET sync_row=? WHERE id=?',(current,oid))
                c.execute('COMMIT')
            payload={'orderId':oid,'paypalOrderId':row['paypal_id'],'captureId':row['capture_id'],'usd':row['usd'],'snapshot':json.loads(row['snapshot'])}
            if self.sheet.upsert_and_verify(payload,current) is not True: raise ValueError('Sheet not confirmed')
            self.transition(oid,'SHEET_IN_PROGRESS','CONFIRMED')
        except Exception:
            self.transition(oid,'SHEET_IN_PROGRESS','PAID_PENDING_SHEET'); raise Pending('Sheet sync pending')
        return self.status(oid,token)
