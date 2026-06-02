"""
Vercel serverless function — proxies requests to the Anthropic API.
Route: /proxy/anthropic  (rewritten from vercel.json)
"""

from http.server import BaseHTTPRequestHandler
import json, ssl, urllib.request, urllib.error

SSL_CTX = ssl.create_default_context()


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length  = int(self.headers.get('Content-Length', 0))
            body    = self.rfile.read(length)
            api_key = self.headers.get('x-api-key', '')

            req = urllib.request.Request(
                'https://api.anthropic.com/v1/messages',
                data=body,
                headers={
                    'Content-Type':      'application/json',
                    'x-api-key':         api_key,
                    'anthropic-version': '2023-06-01',
                },
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=28, context=SSL_CTX) as resp:
                self._respond(200, resp.read(), 'application/json')

        except urllib.error.HTTPError as e:
            self._respond(e.code, e.read(), 'application/json')
        except Exception as e:
            self._respond(500, json.dumps({'error': str(e)}).encode(), 'application/json')

    def _respond(self, code, data, content_type):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self._cors()
        self.end_headers()
        self.wfile.write(data if isinstance(data, bytes) else data.encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers',
                         'Content-Type, x-api-key, anthropic-version')
