"""
LensAI — Local Proxy Server
────────────────────────────
Serves the frontend and proxies both Anthropic API and Google News RSS
so the browser never hits cross-origin restrictions.

Run:  python server.py
"""

import json, ssl, os, urllib.request, urllib.error, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT     = 8080

SSL_CTX = ssl.create_default_context()

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.jsx':  'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.ico':  'image/x-icon',
    '.png':  'image/png',
    '.svg':  'image/svg+xml',
}

BROWSER_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
)


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f'  {self.address_string()}  {fmt % args}')

    # ── CORS preflight ────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path

        if path in ('/', '/index.html'):
            return self._serve('index.html')

        if path == '/proxy/news':
            return self._proxy_news(parsed.query)

        if path == '/proxy/rss':
            return self._proxy_rss(parsed.query)

        # Static files: /static/…, /src/…, /agent/…
        rel = path.lstrip('/')
        if '..' in rel:
            return self.send_error(403, 'Forbidden')
        self._serve(rel)

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self):
        if self.path == '/proxy/anthropic':
            return self._proxy_anthropic()
        self.send_error(404)

    # ── Serve a local file ────────────────────────────────────────────────────
    def _serve(self, rel_path):
        full = os.path.join(BASE_DIR, rel_path.replace('/', os.sep))
        if not os.path.isfile(full):
            return self.send_error(404, f'Not found: {rel_path}')
        ext  = os.path.splitext(full)[1].lower()
        mime = MIME.get(ext, 'application/octet-stream')
        with open(full, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    # ── Proxy: Anthropic API ──────────────────────────────────────────────────
    def _proxy_anthropic(self):
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
            with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as resp:
                self._send_json(200, resp.read())

        except urllib.error.HTTPError as e:
            self._send_json(e.code, e.read())
        except TimeoutError as e:
            self._send_json(504, json.dumps({'error': 'Proxy timeout — Claude API took too long. Try a simpler prompt or retry.'}).encode())
        except Exception as e:
            self._send_json(500, json.dumps({'error': str(e)}).encode())

    # ── Proxy: generic RSS URL (used by sources.js) ──────────────────────────
    def _proxy_rss(self, query_string):
        try:
            params = urllib.parse.parse_qs(query_string)
            url    = params.get('url', [''])[0]
            if not url.startswith('http'):
                return self._send_json(400, json.dumps({'error': 'Invalid URL'}).encode())
            req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA})
            with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/xml; charset=utf-8')
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self._send_json(e.code, json.dumps({'error': f'Source error: {e.reason}'}).encode())
        except Exception as e:
            self._send_json(500, json.dumps({'error': str(e)}).encode())

    # ── Proxy: Google News RSS (legacy — kept for /proxy/news?q= compatibility) ──
    def _proxy_news(self, query_string):
        try:
            q   = urllib.parse.parse_qs(query_string).get('q', [''])[0]
            cfg = window_config_from_env()   # optional override via env
            url = (
                f'https://news.google.com/rss/search'
                f'?q={urllib.parse.quote(q)}'
                f'&hl={cfg["language"]}&gl={cfg["country"]}&ceid={cfg["ceid"]}'
            )
            req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA})
            with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/xml; charset=utf-8')
            self._cors()
            self.end_headers()
            self.wfile.write(data)

        except urllib.error.HTTPError as e:
            self._send_json(e.code, json.dumps({'error': f'Google News: {e.reason}'}).encode())
        except Exception as e:
            self._send_json(500, json.dumps({'error': str(e)}).encode())

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _send_json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(data if isinstance(data, bytes) else data.encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version')


def window_config_from_env():
    """Read optional locale overrides from environment variables."""
    return {
        'language': os.environ.get('LENSAI_LANG',    'en-IN'),
        'country':  os.environ.get('LENSAI_COUNTRY', 'IN'),
        'ceid':     os.environ.get('LENSAI_CEID',    'IN:en'),
    }


if __name__ == '__main__':
    httpd = ThreadingHTTPServer(('localhost', PORT), Handler)
    print()
    print('  +------------------------------------------+')
    print('  |         LensAI  -  Local Server          |')
    print('  +------------------------------------------+')
    print(f'  |  URL  ->  http://localhost:{PORT}/          |')
    print('  |  Stop ->  Ctrl + C                       |')
    print('  +------------------------------------------+')
    print()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')
        httpd.server_close()
