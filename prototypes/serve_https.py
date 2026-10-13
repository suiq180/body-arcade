"""폰에서 접속할 수 있는 HTTPS 서버.

폰 브라우저는 HTTPS 주소에서만 기울기·마이크 센서를 허용합니다.
처음 실행하면 자체 서명 인증서(cert.pem, key.pem)를 만들고,
같은 와이파이(또는 폰 핫스팟)에 연결된 폰에서 열 주소를 알려 줍니다.

실행: python serve_https.py
"""
import http.server
import os
import shutil
import socket
import ssl
import subprocess
import sys

PORT = 8443
HERE = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(HERE, "cert.pem")
KEY = os.path.join(HERE, "key.pem")


def find_openssl():
    found = shutil.which("openssl")
    if found:
        return found
    for path in (r"C:\Program Files\Git\usr\bin\openssl.exe", r"C:\Program Files\Git\mingw64\bin\openssl.exe"):
        if os.path.exists(path):
            return path
    return None


def make_cert():
    openssl = find_openssl()
    if not openssl:
        sys.exit("openssl을 찾지 못했어요. Git for Windows를 설치하거나 openssl을 PATH에 추가해 주세요.")
    print("인증서를 만드는 중...")
    subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "365",
                    "-keyout", KEY, "-out", CERT, "-subj", "/CN=breath-garden"],
                   check=True, capture_output=True)


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


def main():
    os.chdir(HERE)
    if not (os.path.exists(CERT) and os.path.exists(KEY)):
        make_cert()
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), http.server.SimpleHTTPRequestHandler)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    print("\n폰 브라우저에서 아래 주소 중 하나를 여세요 (같은 와이파이/핫스팟 필요):")
    for ip in lan_ips():
        print(f"  https://{ip}:{PORT}/garden.html")
    print(f"  (PC에서는 https://localhost:{PORT}/garden.html)")
    print("\n'연결이 비공개로 설정되어 있지 않습니다' 경고가 나오면 [고급] → [계속 진행]을 누르세요.")
    print("종료: Ctrl+C\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
