"""Local TEST-only HTTP API. No public listener. Capture disabled by default."""
import json, os, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from core import Engine, Conflict, Invalid, Pending
from adapters import PayPalSandbox, GoogleTestSheet
from google_auth_provider import GoogleTokenProvider

# These settings must be supplied explicitly; never use real account credentials.
def build_engine():
    if os.environ.get('NOTORIOUS_ENV')!='TEST': raise RuntimeError('TEST mode required')
    catalog=json.loads(os.environ['TEST_CATALOG_JSON']) # SKU -> integer MAD centimes
    sheet=GoogleTestSheet(os.environ['TEST_SPREADSHEET_ID'],GoogleTokenProvider.from_adc())
    return Engine(os.environ['TEST_DB_PATH'],PayPalSandbox(os.environ['TEST_PAYPAL_CLIENT_ID'],os.environ['TEST_PAYPAL_SECRET']),sheet,catalog,os.environ['TEST_MAD_TO_USD_RATE'],os.environ['TEST_PAYPAL_MERCHANT_ID'])

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,code,body):
        data=json.dumps(body).encode(); self.send_response(code); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def token(self):
        auth=self.headers.get('Authorization','')
        if not auth.startswith('Bearer ') or len(auth[7:])<32: raise Invalid('Unauthorized')
        return auth[7:]
    def do_GET(self):
        try:
            match=re.fullmatch(r'/api/orders/(NOT-[0-9a-f]{32})',self.path)
            if not match: return self.reply(404,{'error':'not found'})
            self.reply(200,self.server.engine.status(match.group(1),self.token()))
        except Invalid: self.reply(404,{'error':'not found'})
        except Exception: self.reply(500,{'error':'internal error'})
    def do_POST(self):
        try:
            token=self.token(); length=int(self.headers.get('Content-Length','0'))
            if length<2 or length>20000 or self.headers.get_content_type()!='application/json': raise Invalid('Invalid request')
            body=json.loads(self.rfile.read(length));
            if not isinstance(body,dict): raise Invalid('Invalid request')
            if self.path=='/api/orders':
                result=self.server.engine.create(self.headers.get('Idempotency-Key',''),token,body)
            else:
                match=re.fullmatch(r'/api/orders/(NOT-[0-9a-f]{32})/(capture|sync|reconcile)',self.path)
                if not match: return self.reply(404,{'error':'not found'})
                if match.group(2)=='capture':
                    if os.environ.get('TEST_CAPTURE_ENABLED')!='YES': return self.reply(403,{'error':'capture disabled'})
                    result=self.server.engine.capture(match.group(1),token)
                elif match.group(2)=='sync': result=self.server.engine.sync(match.group(1),token)
                else: result=self.server.engine.reconcile(match.group(1),token,body.get('candidatePayPalOrderId'))
            self.reply(200,result)
        except Pending: self.reply(202,{'state':'PENDING','message':'Do not pay again. Reconciliation required.'})
        except Conflict: self.reply(409,{'error':'request conflict'})
        except (Invalid,ValueError,TypeError): self.reply(400,{'error':'invalid request'})
        except Exception: self.reply(500,{'error':'internal error'})

def main():
    server=ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('TEST_PORT','8080'))),Handler)
    server.engine=build_engine(); server.serve_forever()
if __name__=='__main__': main()
