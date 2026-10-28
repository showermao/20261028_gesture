"""Dependency-free ASGI smoke checks: python tests/smoke.py."""
import asyncio
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import app


async def request(path):
    messages = []

    async def receive():
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    await app({
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1", "method": "GET", "scheme": "http", "path": path,
        "raw_path": path.encode(), "query_string": b"", "root_path": "",
        "headers": [], "server": ("localhost", 8000), "client": ("localhost", 1),
    }, receive, send)
    response = next(m for m in messages if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return response, body


async def main():
    paths = ["/", "/health", "/static/style.css", "/static/app.js", "/static/gesture.js",
             "/static/shots.js", "/static/curtain.js"]
    paths += [f"/static/images/scene-{i}.svg" for i in range(1, 5)]
    for path in paths:
        response, body = await request(path)
        assert response["status"] == 200 and body, path
        if path == "/health":
            assert json.loads(body) == {"status": "ok"}
        if path.endswith(".js"):
            headers = dict(response["headers"])
            assert b"javascript" in headers[b"content-type"], path
        print(f"OK {path}")
    response, _ = await request("/static/missing.js")
    assert response["status"] == 404


if __name__ == "__main__":
    asyncio.run(main())
