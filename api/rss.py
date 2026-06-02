"""
Vercel serverless function — generic RSS/news feed proxy.
Route: /proxy/rss?url=<encoded_feed_url>  (rewritten from vercel.json)
"""

from http.server import BaseHTTPRequestHandler
import json, ssl, urllib.request, urllib.error, urllib.parse

SSL_CTX   = ssl.create_default_context()
BROWSER_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
)


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        try:
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            url    = params.get('url', [''])[0]

            if not url.startswith('http'):
                return self._respond(400,
                    json.dumps({'error': 'Invalid URL — must start with http'}).encode(),
                    'application/json')

            req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA})
            with urllib.request.urlopen(req, timeout=14, context=SSL_CTX) as resp:
                data = resp.read()

            self._respond(200, data, 'application/xml; charset=utf-8')

        except urllib.error.HTTPError as e:
            self._respond(e.code,
                json.dumps({'error': f'Feed error: {e.reason}'}).encode(),
                'application/json')
        except Exception as e:
            self._respond(500,
                json.dumps({'error': str(e)}).encode(),
                'application/json')

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
