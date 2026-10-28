"""Live reads and one explicitly rejected collection batch; no accepted write."""
from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-pid", type=int, required=True)
    parser.add_argument("--runtime-label", default="isolated-node-carry-20261020")
    parser.add_argument("--canvas", default="surface-core-main")
    parser.add_argument("--queries-only", action="store_true", help="Verify a real opened scene without requiring the Main collection fixture or issuing geometry requests.")
    args = parser.parse_args()
    workspace = Path(__file__).resolve().parent.parent
    runtime_root = (workspace / ".runtime").resolve()
    runtime = (runtime_root / args.runtime_label).resolve()
    assert runtime.parent == runtime_root and runtime.name.startswith("isolated-")
    configuration = json.loads((runtime / "kernel-connection.json").read_text("utf-8"))
    token, origin = configuration["connectionToken"], configuration["origin"]
    assert configuration["pid"] == args.expected_pid
    assert origin == "http://127.0.0.1:56311", "This test targets the established isolated local preview."
    opener = build_opener(ProxyHandler({}))
    checks = []

    def request(path, body=None, headers=None):
        req = Request(origin + path, method="GET" if body is None else "POST",
            data=None if body is None else json.dumps(body).encode("utf-8"),
            headers={"Accept": "application/json", **({"Content-Type": "application/json"} if body is not None else {}), **(headers or {})})
        try:
            with opener.open(req, timeout=20) as response:
                return response.status, json.loads(response.read(2_097_152))
        except HTTPError as error:
            return error.code, json.loads(error.read(65_536))

    health = request("/health")[1]
    assert health["pid"] == args.expected_pid and health["realCoreConnected"] is True
    prefix = "/api/rfs/" + args.canvas
    assert request(prefix + "/capabilities")[0] == 401
    assert request(prefix + "/capabilities", headers={"Authorization": "Bearer invalid"})[0] == 401
    auth = {"Authorization": "Bearer " + token}
    assert request(prefix + "/capabilities", headers={**auth, "Origin": "https://unrelated.invalid"})[0] == 403
    assert request(prefix + "/capabilities", headers={**auth, "Host": "unrelated.invalid"})[0] == 403
    status, caps = request(prefix + "/capabilities", headers=auth)
    assert status == 200 and caps["queryTypes"] == ["GET_SPACE_OUTLINE", "INSPECT_NODES", "INSPECT_EDGES"]
    assert caps["commandTypes"] == ["SET_NODE_GEOMETRY"] and caps["execution"]["idempotent"] is False
    checks.append("Actual lab/server HTTP preserves 401 for missing/invalid Bearer and 403 for foreign Origin/Host.")
    status, canvas = request("/api/canvas/v1/canvases/" + args.canvas)
    assert status == 200
    canvas = canvas["data"]
    node = next(item for item in canvas["nodes"] if item["type"] == "text" and item["data"].get("lcos_ref"))
    for operation in caps["queryTypes"]:
        status, capability = request(prefix + "/capabilities/queries/" + operation, headers=auth)
        assert status == 200 and capability["type"] == operation and capability["schema"]
    assert request("/api/rfs/foreign-canvas/query", {"type": "GET_SPACE_OUTLINE"}, auth)[0] == 404
    assert request(prefix + "/query", {"type": "GET_SPACE_OUTLINE", "includePreviews": True}, auth)[0] == 400
    assert request(prefix + "/query", {"type": "INSPECT_NODES", "ids": [node["id"]], "canvasId": "foreign"}, auth)[0] == 400
    status, inspected = request(prefix + "/query", {"type": "INSPECT_NODES", "ids": [node["id"]]}, auth)
    assert status == 200 and inspected["type"] == "INSPECT_NODES"
    checks.append("Same-process original structural query works; foreign canvas, preview body and caller canvas override fail.")
    spec = importlib.util.spec_from_file_location("live_kernel_client", Path(__file__).with_name("native-space-kernel-mcp-client.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    mcp_result = asyncio.run(module.call(args.runtime_label, args.canvas, "inspect_nodes", {"ids": [node["id"]]}))
    assert mcp_result["result"]["isError"] is False
    assert mcp_result["result"]["structuredContent"] == inspected
    checks.append("Real installed MCP stdio client returns the same actual original query result as authenticated HTTP.")
    if not args.queries_only:
        collection = next(item for item in canvas["nodes"] if item.get("data", {}).get("lcos_native_collection") is True)
        refused = {"type": "SET_NODE_GEOMETRY", "items": [
            {"nodeId": item["id"], "position": {"x": item["position"]["x"] + 1, "y": item["position"]["y"] + 1}}
            for item in [node, collection]
        ]}
        status, denial = request(prefix + "/execute", {"commands": [refused]}, auth)
        assert status == 501 and denial["error"]["code"] == "SPACE_COLLECTION_GEOMETRY_NOT_CONNECTED", denial
        checks.append("Actual authenticated mixed text/collection batch is rejected before any geometry is saved; the original canvas stays exact.")
    else:
        checks.append("Explicit queries-only mode performs no geometry request and does not assume this child scene contains the Main collection fixture.")
    assert request("/api/canvas/v1/canvases/" + args.canvas)[1]["data"] == canvas
    checks.append("HTTP and MCP read checks do not change the original canvas, geometry, body or revision.")
    report = {"passed": True, "pid": args.expected_pid, "origin": origin, "canvasId": args.canvas,
        "nodeId": node["id"], "canvasVersion": canvas["version"], "checks": checks, "modelCalls": 0,
        "geometryWrites": 0, "rejectedGeometryRequests": 0 if args.queries_only else 1, "queriesOnly": args.queries_only,
        "credentialValuesRecorded": False, "mcpTools": mcp_result["tools"]}
    directory = workspace / "output/原画布内核薄接入_20261023/真实HTTP与MCP" / datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory.mkdir(parents=True)
    destination = directory / "report.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "report": str(destination), "pid": args.expected_pid, "nodeId": node["id"], "modelCalls": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
