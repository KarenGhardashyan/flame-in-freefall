"""
Standalone Server for Ashkan Ashkani's Flame Lab
Serves AshkanAshkani/flame-lab/ on http://localhost:5050/
"""

import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASHKAN_DIR = os.path.join(PROJECT_ROOT, "AshkanAshkani", "flame-lab")

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class AshkanRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ASHKAN_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

def run(port=5050):
    server_address = ("0.0.0.0", port)
    httpd = ThreadedHTTPServer(server_address, AshkanRequestHandler)
    print(f"[ASHKAN LAB] Standalone Ashkan Flame Lab running at http://localhost:{port}/")
    print(f"[ASHKAN LAB] Root directory: {ASHKAN_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[ASHKAN LAB] Shutting down...")
        httpd.server_close()

if __name__ == "__main__":
    port = 5050
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run(port=port)
