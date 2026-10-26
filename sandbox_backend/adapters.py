"""Sandbox-only HTTP adapters. Never log credentials or responses containing customer data."""
import base64, json, urllib.request, urllib.error
from urllib.parse import quote

PAYPAL='https://api-m.sandbox.paypal.com'
def request(url, method='GET', headers=None, data=None):
    req=urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=15) as response: return json.loads(response.read())

class PayPalSandbox:
    def __init__(self,client_id,secret):
        if not client_id or not secret: raise ValueError('Sandbox credentials required')
        self.client_id=client_id; self.secret=secret
    def token(self):
        basic=base64.b64encode((self.client_id+':'+self.secret).encode()).decode()
        return request(PAYPAL+'/v1/oauth2/token','POST',{'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},b'grant_type=client_credentials')['access_token']
    def call(self,path,method='GET',body=None,key=None):
        headers={'Authorization':'Bearer '+self.token(),'Content-Type':'application/json','Prefer':'return=representation'}
        if key: headers['PayPal-Request-Id']=key
        return request(PAYPAL+path,method,headers,json.dumps(body).encode() if body is not None else None)
    def create(self,oid,usd,key):
        data={'intent':'CAPTURE','purchase_units':[{'custom_id':oid,'amount':{'currency_code':'USD','value':usd}}]}
        return self.call('/v2/checkout/orders','POST',data,key)['id']
    def capture(self,paypal_id,key):
        return self.call('/v2/checkout/orders/'+quote(paypal_id,safe='')+'/capture','POST',{},key)
    def lookup_paid(self,paypal_id):
        order=self.call('/v2/checkout/orders/'+quote(paypal_id,safe=''))
        captures=order['purchase_units'][0]['payments']['captures']
        if len(captures)!=1: raise ValueError('Expected one capture')
        capture=self.call('/v2/payments/captures/'+quote(captures[0]['id'],safe=''))
        return order,capture

class GoogleTestSheet:
    """Requires an exclusively managed, initially empty TEST tab; DB and tab must be kept together.
    Token provider must return a fresh OAuth token scoped to the test Sheet.
    """
    def __init__(self,spreadsheet_id,token_provider,tab='SandboxBackendOrders'):
        if not spreadsheet_id or tab!='SandboxBackendOrders': raise ValueError('Dedicated test tab required')
        self.id=spreadsheet_id; self.token_provider=token_provider; self.tab=tab
    def upsert_and_verify(self,payload,row):
        if row<2: raise ValueError('Invalid row')
        cell=quote("'"+self.tab+"'!A"+str(row)+':E'+str(row),safe='')
        url='https://sheets.googleapis.com/v4/spreadsheets/'+quote(self.id,safe='')+'/values/'+cell
        headers={'Authorization':'Bearer '+self.token_provider(),'Content-Type':'application/json'}
        values=[payload['orderId'],payload['paypalOrderId'],payload['captureId'],payload['usd'],json.dumps(payload['snapshot'],sort_keys=True,separators=(',',':'),ensure_ascii=True)]
        current=request(url,headers=headers).get('values',[])
        if current and current[0]!=values: raise ValueError('Occupied or conflicting row')
        if not current: request(url+'?valueInputOption=RAW','PUT',headers,json.dumps({'range':"'"+self.tab+"'!A"+str(row)+':E'+str(row),'majorDimension':'ROWS','values':[values]}).encode())
        return request(url,headers=headers).get('values',[])==[values]
