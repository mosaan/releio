#!/usr/bin/env python3
"""
Simple HTTP server for testing Electron auto-update functionality.

Usage:
    python scripts/test-update-server.py [port]

Default port: 5000

Place your update files in the ./dist-updates directory:
- latest.yml
- electron-ai-starter-X.X.X-setup.exe
"""

import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
DIRECTORY = "./dist-updates"

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Add CORS headers for development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Custom logging format
        print(f"[Update Server] {format % args}")

if __name__ == "__main__":
    # Create directory if it doesn't exist
    os.makedirs(DIRECTORY, exist_ok=True)

    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print(f"=" * 60)
        print(f"Electron Update Server Running")
        print(f"=" * 60)
        print(f"URL: http://localhost:{PORT}")
        print(f"Directory: {os.path.abspath(DIRECTORY)}")
        print(f"=" * 60)
        print(f"\nPlace your update files in {DIRECTORY}/:")
        print(f"  - latest.yml")
        print(f"  - electron-ai-starter-X.X.X-setup.exe")
        print(f"\nPress Ctrl+C to stop the server\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")
            sys.exit(0)
