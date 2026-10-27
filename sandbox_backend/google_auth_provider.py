"""Credential adapter for local TEST use. No interactive authorization is initiated."""
import threading

DRIVE_FILE_SCOPE='https://www.googleapis.com/auth/drive.file'

class GoogleTokenProvider:
    def __init__(self,credentials,request_factory):
        self._credentials=credentials
        self._request_factory=request_factory
        self._lock=threading.Lock()
    def __call__(self):
        with self._lock:
            if not self._credentials.valid:
                self._credentials.refresh(self._request_factory())
            if not self._credentials.valid or not self._credentials.token:
                raise RuntimeError('Google credentials unavailable')
            return self._credentials.token
    @classmethod
    def from_adc(cls):
        # ADC must already have a separately reviewed grant to the dedicated test file.
        # Existing user credentials retain their preauthorized scopes; this cannot narrow them.
        import google.auth
        from google.auth.transport.requests import Request
        credentials,_=google.auth.default(scopes=[DRIVE_FILE_SCOPE])
        return cls(credentials,Request)
