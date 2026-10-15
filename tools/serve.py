# Yerel geliştirme sunucusu: tarayıcının eski dosyaları önbellekten kullanmasını engeller.
# Kullanım (proje klasöründe): python tools/serve.py [port]   →   http://localhost:8000
import http.server
import os
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    # Uygulama açılışta tüm ders ve paket dosyalarını aynı anda ister; varsayılan kuyruk (5) yetmez.
    request_queue_size = 256


Server(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8000), NoCacheHandler).serve_forever()
