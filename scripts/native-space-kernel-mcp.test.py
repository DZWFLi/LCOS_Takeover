"""Protocol-wrapper test: real MCP client/server, explicitly local HTTP stub.

The original Space/Core modules have separate real-storage integration tests.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import shutil
import threading
import uuid
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


workspace = Path(__file__).resolve().parent.parent
runtime_root = (workspace / ".runtime").resolve()
runtime = runtime_root / ("isolated-mcp-protocol-" + uuid.uuid4().hex[:10])
runtime.mkdir()
token = "a" * 64
requests = []
types = ["GET_SPACE_OUTLINE", "INSPECT_NODES", "INSPECT_EDGES"]
gui_types = ["SET_NAVIGATION_PIN", "SET_COLOR_PIN", "RENAME_COLOR_PIN"]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, body):
        text = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(text)))
        self.end_headers()
        self.wfile.write(text)

    def do_GET(self):
        assert self.headers.get("Authorization") == "Bearer " + token
        requests.append(("GET", self.path))
        if self.path.endswith("/capabilities"):
            return self.respond(200, {"queryTypes": types, "commandTypes": ["SET_NODE_GEOMETRY", "MERGE_NODE_DATA"], "guiTypes": gui_types})
        if not any(part in self.path for part in ("/capabilities/queries/", "/capabilities/commands/", "/capabilities/gui/")):
            return self.respond(404, {"error": {"message": "Unknown original capability route."}})
        operation = self.path.rsplit("/", 1)[1]
        if operation in gui_types:
            properties = {"type": {"const": operation}}
            if operation == "SET_NAVIGATION_PIN":
                properties.update({"nodeId": {"type": "string"}, "pinned": {"type": "boolean"}, "scope": {"enum": ["local", "cross-surface"]}})
                required = ["type", "nodeId", "pinned"]
            elif operation == "SET_COLOR_PIN":
                properties.update({"nodeId": {"type": "string"}, "color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"}, "present": {"type": "boolean"}})
                required = ["type", "nodeId", "color", "present"]
            else:
                properties.update({"definitionId": {"type": "string"}, "label": {"type": "string"}, "expectedLabel": {"type": ["string", "null"]}, "expectedUpdatedAt": {"type": "string"}})
                required = ["type", "definitionId", "label", "expectedLabel", "expectedUpdatedAt"]
            return self.respond(200, {"schema": {"type": "object", "properties": properties, "required": required, "additionalProperties": False}})
        return self.respond(200, {"schema": {"type": "object", "properties": {"type": {"const": operation},
            "ids": {"type": "array", "items": {"type": "string"}}, "items": {"type": "array"}},
            "required": ["type"], "additionalProperties": False}})

    def do_POST(self):
        assert self.headers.get("Authorization") == "Bearer " + token
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        requests.append(("POST", self.path, body))
        if self.path.endswith("/execute"):
            # A partial write can return failure. The wrapper must not replay.
            return self.respond(409, {"error": {"code": "PARTIAL_COMMIT", "message": "已保存部分位置，请读取核对。"}})
        if "canvasId" in body:
            return self.respond(400, {"error": {"message": "目标画布由原入口固定。"}})
        if self.path.endswith("/gui"):
            if body.get("nodeId") in ("semantic-unknown", "semantic-rejected"):
                status = "unknown" if body["nodeId"] == "semantic-unknown" else "rejected"
                return self.respond(200, {"status": status, "coreResponse": {"status": 503 if status == "unknown" else 409,
                    "body": {"ok": False, "error": {"code": "ORIGINAL_GUI_RESULT", "details": {"retained": "exact-original-evidence"}}}}})
            if body.get("nodeId") == "unknown-outcome":
                return self.respond(503, {"error": {"code": "OUTCOME_UNKNOWN", "message": "修改结果尚未确认，请先读取。", "details": {"mayHaveCommitted": True}}})
            if body["type"] == "RENAME_COLOR_PIN" and body.get("expectedLabel") == "stale":
                return self.respond(409, {"error": {"code": "CONFLICT", "message": "颜色组刚有变化。"}})
            return self.respond(200, {"type": body["type"], "status": "confirmed", "nodeId": body.get("nodeId"), "coreResponse": {"status": 200, "body": {"ok": True}}})
        return self.respond(200, {"type": body["type"], "result": {"nodes": [{"id": "original-node", "position": {"x": 12, "y": 34}}]}})


async def verify():
    spec = importlib.util.spec_from_file_location("kernel_mcp_client", Path(__file__).with_name("native-space-kernel-mcp-client.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    kernel_spec = importlib.util.spec_from_file_location("kernel_mcp_server", Path(__file__).with_name("native-space-kernel-mcp.py"))
    kernel_module = importlib.util.module_from_spec(kernel_spec)
    kernel_spec.loader.exec_module(kernel_module)
    with patch.dict("os.environ", {"http_proxy": "http://127.0.0.1:1", "HTTP_PROXY": "http://127.0.0.1:1", "no_proxy": "", "NO_PROXY": ""}), patch("urllib.request.proxy_bypass", return_value=False):
        assert kernel_module.KernelConnection(runtime, "surface-core-main").request("capabilities")["queryTypes"] == types
    listed = await module.call(runtime.name, "surface-core-main", None, {})
    assert len(listed["tools"]) == 8
    assert all("type" not in tool["inputSchema"]["properties"] for tool in listed["tools"])
    assert all(tool["annotations"]["readOnlyHint"] == (tool["name"] in ("get_space_outline", "inspect_nodes", "inspect_edges")) for tool in listed["tools"])
    assert all(tool["annotations"]["idempotentHint"] is False for tool in listed["tools"])
    assert next(tool for tool in listed["tools"] if tool["name"] == "rename_color_pin")["inputSchema"]["required"] == ["definitionId", "label", "expectedLabel", "expectedUpdatedAt"]
    actual = await module.call(runtime.name, "surface-core-main", "inspect_nodes", {"ids": ["original-node"]})
    assert actual["result"]["isError"] is False
    assert actual["result"]["structuredContent"]["result"]["nodes"][0]["id"] == "original-node"
    failed = await module.call(runtime.name, "surface-core-main", "set_node_geometry", {"items": [{"nodeId": "original-node", "position": {"x": 30, "y": 40}}]})
    assert failed["result"]["isError"] is True
    assert failed["result"]["structuredContent"]["error"]["code"] == "PARTIAL_COMMIT"
    writes = [row for row in requests if row[0] == "POST" and row[1].endswith("/execute")]
    assert len(writes) == 1, "Unknown/partial writes must never be replayed by the MCP wrapper."
    assert writes[0][2] == {"commands": [{"type": "SET_NODE_GEOMETRY", "items": [{"nodeId": "original-node", "position": {"x": 30, "y": 40}}]}]}
    examples = [
        ("set_node_pinned", {"nodeId": "original-node", "pinned": True}, "SET_NAVIGATION_PIN"),
        ("set_node_pinned", {"nodeId": "original-node", "pinned": False, "scope": "cross-surface"}, "SET_NAVIGATION_PIN"),
        ("set_node_color_pin", {"nodeId": "original-node", "color": "#F0606B", "present": True}, "SET_COLOR_PIN"),
        ("set_node_color_pin", {"nodeId": "original-node", "color": "#F0606B", "present": False}, "SET_COLOR_PIN"),
        ("rename_color_pin", {"definitionId": "definition", "label": "新名称", "expectedLabel": None, "expectedUpdatedAt": "observed"}, "RENAME_COLOR_PIN"),
    ]
    for name, arguments, operation in examples:
        actual_gui = await module.call(runtime.name, "surface-core-main", name, arguments)
        assert actual_gui["calls"] == 1 and actual_gui["result"]["isError"] is False
        assert requests[-1] == ("POST", "/api/rfs/surface-core-main/gui", {"type": operation, **arguments}), "GUI writes must stay direct and explicit, not execute commands or toggle."
    unknown_write = await module.call(runtime.name, "surface-core-main", "set_node_pinned", {"nodeId": "unknown-outcome", "pinned": True})
    assert unknown_write["result"]["isError"] is True
    assert unknown_write["result"]["structuredContent"]["error"]["details"]["mayHaveCommitted"] is True
    assert len([row for row in requests if row[0] == "POST" and row[1].endswith("/gui") and row[2].get("nodeId") == "unknown-outcome"]) == 1
    stale = await module.call(runtime.name, "surface-core-main", "rename_color_pin", {"definitionId": "definition", "label": "new", "expectedLabel": "stale", "expectedUpdatedAt": "old"})
    assert stale["result"]["isError"] is True and stale["result"]["structuredContent"]["error"]["code"] == "CONFLICT"
    for node in ("semantic-unknown", "semantic-rejected"):
        semantic = await module.call(runtime.name, "surface-core-main", "set_node_pinned", {"nodeId": node, "pinned": True})
        assert semantic["result"]["isError"] is True
        content = semantic["result"]["structuredContent"]
        assert content["coreResponse"]["body"]["error"]["details"] == {"retained": "exact-original-evidence"}
        assert len([row for row in requests if row[0] == "POST" and row[1].endswith("/gui") and row[2].get("nodeId") == node]) == 1
    invalid = await module.call(runtime.name, "surface-core-main", "inspect_nodes", {"canvasId": "foreign"})
    assert invalid["result"]["isError"] is True
    unknown = await module.call(runtime.name, "surface-core-main", "unsupported_tool", {})
    assert unknown["result"]["isError"] is True
    report = {"passed": True, "protocol": "installed MCP 2.1.1 client and stdio server", "http": "explicit loopback test stub",
        "checks": ["eight tools derive schemas from their actual query/command/gui capability route; GUI writes retain non-readonly/non-replay annotations", "original query and structured result survive real MCP transport",
                   "geometry is sent exactly once and partial result remains an error", "canvas override and unsupported tool fail",
                   "local bearer requests ignore inherited proxies even without a loopback bypass",
                   "pin/color explicit true and false plus rename observed CAS reach direct gui exactly once, without execute wrapping or toggle",
                   "GUI unknown-write details and stale rename CAS remain errors; unknown write is never replayed"],
        "modelCalls": 0, "liveCanvasWrites": 0}
    destination = workspace / "output/原画布内核薄接入_20261023/MCP协议回归.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
(runtime / "kernel-connection.json").write_text(json.dumps({"origin": "http://127.0.0.1:" + str(server.server_port), "connectionToken": token}), encoding="utf-8")
try:
    asyncio.run(verify())
finally:
    server.shutdown()
    server.server_close()
    # Only remove this test's freshly created, verified workspace child.
    assert runtime.resolve().parent == runtime_root and runtime.name.startswith("isolated-mcp-protocol-")
    shutil.rmtree(runtime)
