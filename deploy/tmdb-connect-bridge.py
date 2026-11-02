#!/usr/bin/python3
import ipaddress
import select
import socket
import socketserver

LISTEN_HOST = "172.20.0.1"
LISTEN_PORT = 17890
ALLOWED_NETWORK = ipaddress.ip_network("172.20.0.0/16")
TUNNEL_HOST = "127.0.0.1"
TUNNEL_PORT = 17891
MAX_HEADER = 4096
TIMEOUT = 12


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        client = self.request
        client.settimeout(TIMEOUT)
        if ipaddress.ip_address(self.client_address[0]) not in ALLOWED_NETWORK:
            return

        header = bytearray()
        while b"\r\n\r\n" not in header and len(header) <= MAX_HEADER:
            chunk = client.recv(1024)
            if not chunk:
                return
            header.extend(chunk)
        first_line = bytes(header).split(b"\r\n", 1)[0]
        if len(header) > MAX_HEADER or first_line != b"CONNECT api.themoviedb.org:443 HTTP/1.1":
            client.sendall(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
            return

        try:
            upstream = socket.create_connection((TUNNEL_HOST, TUNNEL_PORT), timeout=TIMEOUT)
        except OSError:
            client.sendall(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
            return
        try:
            upstream.sendall(b"CONNECT api.themoviedb.org:443 HTTP/1.1\r\nHost: api.themoviedb.org:443\r\nProxy-Connection: Keep-Alive\r\n\r\n")
            client.settimeout(None)
            upstream.settimeout(None)
            relay(client, upstream)
        finally:
            upstream.close()


def relay(left, right):
    peers = {left: right, right: left}
    while True:
        readable, _, exceptional = select.select([left, right], [], [left, right])
        if exceptional:
            return
        for source in readable:
            data = source.recv(65536)
            if not data:
                return
            peers[source].sendall(data)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    Server((LISTEN_HOST, LISTEN_PORT), Handler).serve_forever()
