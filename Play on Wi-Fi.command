#!/usr/bin/env python3
"""Serve the standalone game to a phone on this Mac's Wi-Fi network."""
import errno
import ipaddress
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

GAME = Path(__file__).resolve().with_name("Play Voidstrike.html")
PORT = 8744


def wifi_address():
    ports = subprocess.check_output(
        ["/usr/sbin/networksetup", "-listallhardwareports"], text=True
    )
    for block in ports.split("\n\n"):
        lines = block.strip().splitlines()
        if any(line in ("Hardware Port: Wi-Fi", "Hardware Port: AirPort") for line in lines):
            device = next((line.removeprefix("Device: ") for line in lines if line.startswith("Device: ")), None)
            if device:
                result = subprocess.run(
                    ["/usr/sbin/ipconfig", "getifaddr", device], text=True, capture_output=True
                )
                if result.returncode == 0:
                    return str(ipaddress.IPv4Address(result.stdout.strip()))
    raise SystemExit("Mac နဲ့ ဖုန်းကို Wi-Fi တစ်ခုတည်းမှာ ချိတ်ပြီး ဒီဖိုင်ကို ပြန်ဖွင့်ပါ။")


class GamePage(BaseHTTPRequestHandler):
    def respond(self, include_body):
        if urlsplit(self.path).path not in ("/", "/index.html"):
            self.send_error(404)
            return
        try:
            data = GAME.read_bytes()
        except OSError:
            self.send_error(503, "Game file unavailable")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Game", "Voidstrike")
        self.end_headers()
        if include_body:
            self.wfile.write(data)

    def do_GET(self):
        self.respond(True)

    def do_HEAD(self):
        self.respond(False)


def main():
    if not GAME.is_file():
        raise SystemExit("ဒီဖိုင်နဲ့ Play Voidstrike.html ကို ဖိုင်တွဲတစ်ခုတည်းထဲမှာ ထားပါ။")
    address = wifi_address()
    url = f"http://{address}:{PORT}/"
    try:
        server = ThreadingHTTPServer((address, PORT), GamePage)
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE:
            raise
        try:
            with build_opener(ProxyHandler({})).open(Request(url, method="HEAD"), timeout=2) as reply:
                if reply.headers.get("X-Game") == "Voidstrike":
                    print(f"Voidstrike ဖွင့်ထားပြီးပါပြီ။ ဖုန်းမှာ ဒီလိပ်စာကို ဖွင့်ပါ။\n{url}")
                    return
        except OSError:
            pass
        server = ThreadingHTTPServer((address, 0), GamePage)
        url = f"http://{address}:{server.server_port}/"
    with server:
        print(f"ဖုန်းကို Mac နဲ့ Wi-Fi တစ်ခုတည်းမှာ ချိတ်ပြီး ဒီလိပ်စာကို ဖွင့်ပါ။\n{url}", flush=True)
        print("ကစားနေစဉ် ဒီဝင်းဒိုးကို ဖွင့်ထားပါ။ ရပ်ချင်ရင် Control-C ကို နှိပ်ပါ။", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
