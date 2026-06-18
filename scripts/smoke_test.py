#!/usr/bin/env python3
"""Isolated startup/auth/API smoke test for the local job tracker.

This test imports server.py, points it at a temporary SQLite database, starts a
short-lived localhost server on an ephemeral port, and verifies the basic
auth/API lifecycle without touching real tracker data.
"""

import json
import sys
import tempfile
import threading
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True

import server  # noqa: E402


TEST_PASSWORD = "this is a local test passphrase"
TIMEOUT = 5
AUTH_IDLE_TIMEOUT_SECONDS = int(server.SESSION_IDLE_TIMEOUT.total_seconds())


class SmokeTestError(Exception):
    pass


class QuietHandler(server.Handler):
    def log_message(self, *_args):
        return


def main():
    with tempfile.TemporaryDirectory() as tmp:
        configure_temp_database(tmp)
        server.init_db()

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()

        client = SmokeClient(f"http://127.0.0.1:{port}", f"127.0.0.1:{port}")
        try:
            run_checks(client)
        finally:
            httpd.shutdown()
            thread.join(timeout=TIMEOUT)

    print("Smoke test passed")


def configure_temp_database(tmp):
    temp_root = Path(tmp)
    server.DATA_DIR = temp_root / "data"
    server.DB_PATH = server.DATA_DIR / "job-tracker.sqlite"
    server.DOCUMENTS_DIR = server.DATA_DIR / "documents"


class SmokeClient:
    def __init__(self, base_url, host_header):
        self.base_url = base_url
        self.host_header = host_header
        self.cookie_header = ""

    def request(self, path, method="GET", payload=None):
        body = None
        headers = {"Host": self.host_header}
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if self.cookie_header:
            headers["Cookie"] = self.cookie_header

        request = Request(f"{self.base_url}{path}", data=body, method=method, headers=headers)
        try:
            with urlopen(request, timeout=TIMEOUT) as response:
                status = response.status
                response_headers = dict(response.headers)
                response_body = response.read()
        except HTTPError as error:
            status = error.code
            response_headers = dict(error.headers)
            response_body = error.read()

        self.capture_cookie(response_headers)
        return status, response_headers, response_body

    def capture_cookie(self, headers):
        raw_cookie = headers.get("Set-Cookie")
        if not raw_cookie:
            return
        cookie = SimpleCookie()
        cookie.load(raw_cookie)
        morsel = cookie.get(server.SESSION_COOKIE)
        if morsel and morsel.value:
            self.cookie_header = f"{server.SESSION_COOKIE}={morsel.value}"
        elif morsel:
            self.cookie_header = ""


def run_checks(client):
    expect_status(client, "/", 200)
    expect_json(
        client,
        "/api/auth/status",
        200,
        {"configured": False, "authenticated": False, "idleTimeoutSeconds": AUTH_IDLE_TIMEOUT_SECONDS},
    )
    expect_status(client, "/api/applications", 401)
    expect_status(client, "/api/auth/setup", 400, method="POST", payload={"password": "too short"})

    status, _, body = client.request("/api/auth/setup", method="POST", payload={"password": TEST_PASSWORD})
    expect(status == 200, f"setup failed: {body[:200]!r}")
    expect(client.cookie_header, "setup did not return a session cookie")

    expect_json(client, "/api/applications", 200, [])
    app = {
        "id": "smoke-test-application",
        "companyName": "Smoke Test Co",
        "jobTitle": "Test Role",
        "createdAt": "2026-06-16",
        "updatedAt": "2026-06-16T00:00:00Z",
    }
    expect_json(client, "/api/applications", 200, app, method="PUT", payload=app)

    applications = parse_json(expect_status(client, "/api/applications", 200)[2])
    expect(any(item["id"] == app["id"] for item in applications), "created application was not returned")

    event = {
        "id": "smoke-test-event",
        "applicationId": app["id"],
        "type": "internal_contact_replied",
        "occurredAt": "2026-06-16",
        "createdAt": "2026-06-16T00:00:00Z",
    }
    expect_status(client, "/api/events", 200, method="PUT", payload=event)
    events = parse_json(expect_status(client, "/api/events", 200)[2])
    saved_event = next((item for item in events if item["id"] == event["id"]), None)
    expect(saved_event and saved_event.get("title") == "Internal Contact Replied", "internal contact event label was not normalized")

    expect_json(
        client,
        "/api/auth/logout",
        200,
        {
            "ok": True,
            "configured": True,
            "authenticated": False,
            "idleTimeoutSeconds": AUTH_IDLE_TIMEOUT_SECONDS,
        },
        method="POST",
        payload={},
    )
    expect_status(client, "/api/applications", 401)
    expect_status(client, "/api/auth/login", 401, method="POST", payload={"password": "wrong local passphrase"})

    status, _, body = client.request("/api/auth/login", method="POST", payload={"password": TEST_PASSWORD})
    expect(status == 200, f"login failed: {body[:200]!r}")
    expect_status(client, f"/api/applications/{app['id']}", 200, method="DELETE")
    expect_json(client, "/api/applications", 200, [])


def expect_status(client, path, expected_status, method="GET", payload=None):
    status, headers, body = client.request(path, method=method, payload=payload)
    expect(status == expected_status, f"{method} {path} expected {expected_status}, got {status}: {body[:200]!r}")
    return status, headers, body


def expect_json(client, path, expected_status, expected_payload, method="GET", payload=None):
    _, _, body = expect_status(client, path, expected_status, method=method, payload=payload)
    actual_payload = parse_json(body)
    expect(actual_payload == expected_payload, f"{method} {path} returned {actual_payload!r}")


def parse_json(body):
    return json.loads(body.decode("utf-8"))


def expect(condition, message):
    if not condition:
        raise SmokeTestError(message)


if __name__ == "__main__":
    try:
        main()
    except SmokeTestError as error:
        print(f"Smoke test failed: {error}", file=sys.stderr)
        sys.exit(1)
