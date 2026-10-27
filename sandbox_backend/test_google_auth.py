import threading,time,unittest
from concurrent.futures import ThreadPoolExecutor
from google_auth_provider import GoogleTokenProvider

class Credentials:
    def __init__(self): self.valid=False; self.token=None; self.refreshes=0
    def refresh(self,request):
        self.refreshes+=1; time.sleep(.03); self.token='example-token'; self.valid=True
class TestGoogleTokenProvider(unittest.TestCase):
    def test_refresh_once_concurrent_and_again_after_expiry(self):
        credentials=Credentials(); provider=GoogleTokenProvider(credentials,lambda:object())
        with ThreadPoolExecutor(max_workers=8) as pool: tokens=list(pool.map(lambda _:provider(),range(8)))
        self.assertEqual(tokens,['example-token']*8); self.assertEqual(credentials.refreshes,1)
        credentials.valid=False; provider(); self.assertEqual(credentials.refreshes,2)
    def test_failure_is_propagated_without_token(self):
        class Bad(Credentials):
            def refresh(self,request): raise RuntimeError('refresh failed')
        with self.assertRaises(RuntimeError): GoogleTokenProvider(Bad(),lambda:object())()
if __name__=='__main__': unittest.main()
