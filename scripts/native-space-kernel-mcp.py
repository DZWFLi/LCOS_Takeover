"""MCP transport for the same opened TapNow/Huabu canvas capability adapter.

The original HTTP adapter supplies schemas and owns validation and execution.
This process owns no canvas, material, conversation, queue or tool credentials.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler

# A provider may inherit its model credential into stdio children. This fixed
# local canvas server needs only OS/Python process basics, never model/Host keys.
if __name__ == "__main__":
    allowed_environment = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
                           "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL",
                           "PYTHONUTF8", "PYTHONIOENCODING"}
    for environment_key in tuple(os.environ):
        if environment_key.upper() not in allowed_environment:
            os.environ.pop(environment_key, None)

local_dependencies = Path(__file__).resolve().parent.parent / ".runtime" / "native-space-python"
if local_dependencies.is_dir():
    sys.path.insert(0, str(local_dependencies))

from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


class KernelOperationError(Exception):
    def __init__(self, status: int, error: dict[str, Any]):
        super().__init__("The original canvas operation was not confirmed.")
        self.result = {"status": status, "error": error}


class KernelConnection:
    def __init__(self, runtime: Path, canvas_id: str):
        self.runtime = runtime
        self.canvas_id = canvas_id
        # This is a local application credential. Never send it through an
        # inherited OS/http_proxy configuration, even when NO_PROXY is absent.
        self.opener = build_opener(ProxyHandler({}), NoRedirect)

    def request(self, suffix: str, body: dict[str, Any] | None = None) -> Any:
        # Read the original local connection configuration on each explicit
        # request so a server restart does not leave a stale credential cached.
        configuration = json.loads((self.runtime / "kernel-connection.json").read_text("utf-8"))
        parsed = urlsplit(configuration["origin"])
        if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1")
                or not parsed.port or parsed.path not in ("", "/") or parsed.query or parsed.fragment
                or parsed.username or parsed.password):
            raise ValueError("The canvas connection must use the configured local application.")
        token = configuration.get("connectionToken")
        if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token):
            raise ValueError("The local canvas connection is unavailable.")
        address = configuration["origin"].rstrip("/") + "/api/rfs/" + quote(self.canvas_id, safe="") + "/" + suffix
        request = Request(address, data=None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"),
                          headers={"Authorization": "Bearer " + token, "Accept": "application/json",
                                   **({"Content-Type": "application/json"} if body is not None else {})},
                          method="GET" if body is None else "POST")
        try:
            with self.opener.open(request, timeout=30) as response:
                value = json.loads(response.read(2_097_153))
        except HTTPError as error:
            # Never print the Request or its authorization header. No mutation
            # is retried, including a timeout or unknown response.
            try:
                value = json.loads(error.read(65_537))
            except Exception:
                raise ValueError("The original canvas operation was not confirmed; read its current state before retrying.") from None
            original = value.get("error")
            if not isinstance(original, dict):
                original = {"code": "SPACE_AUTHENTICATION_REQUIRED" if error.code == 401 else "SPACE_OPERATION_REJECTED",
                            "message": value.get("message", "The original canvas operation was rejected.")}
            raise KernelOperationError(error.code, {key: original[key] for key in ("code", "message", "details") if key in original}) from None
        return value


TOOLS = {
    "get_space_outline": ("query", "GET_SPACE_OUTLINE", "get_space_outline：查看当前画布的结构和位置。"),
    "inspect_nodes": ("query", "INSPECT_NODES", "inspect_nodes：检查当前画布中指定节点的结构、标题和位置。"),
    "inspect_edges": ("query", "INSPECT_EDGES", "inspect_edges：检查当前画布中的连接关系。"),
    "set_node_geometry": ("command", "SET_NODE_GEOMETRY", "set_node_geometry：通过原布局保存流程移动已接通的现有节点。集合及其内部成员、外接缩放暂不支持；拒绝后不自动重发。"),
    "set_node_emphasis": ("command", "MERGE_NODE_DATA", "set_node_emphasis：保存或取消现有节点的视觉强调。patches中只接受lcos_gui_emphasis布尔值；不修改正文、标题、位置或任务，不需要Run。"),
    "set_node_pinned": ("gui", "SET_NAVIGATION_PIN", "set_node_pinned：明确固定或取消固定当前画布节点，pinned为期望状态；不使用切换语义，不需要Run。失败或未知结果先读取核对，不自动重发。"),
    "set_node_color_pin": ("gui", "SET_COLOR_PIN", "set_node_color_pin：明确添加或移除当前节点的一种颜色标记。color为#RRGGBB，present为期望状态；保留其他颜色，不修改材料或任务。"),
    "rename_color_pin": ("gui", "RENAME_COLOR_PIN", "rename_color_pin：修改项目同色组共享名称。已有定义使用刚读取的definitionId、expectedLabel、expectedUpdatedAt；当前普通节点无定义的颜色组，使用color=#RRGGBB、expectedDefinitionId=null首次命名。两组参数互斥，不改节点标题、不创建成员；冲突或未知先读取，不自动重发。"),
}


def create_server(connection: KernelConnection) -> Server:
    async def list_tools(_context, _params):
        capabilities = await asyncio.to_thread(connection.request, "capabilities")
        tools = []
        for name, (kind, operation, description) in TOOLS.items():
            allowed = capabilities.get("queryTypes" if kind == "query" else "guiTypes" if kind == "gui" else "commandTypes", [])
            if operation not in allowed:
                continue
            capability = await asyncio.to_thread(connection.request, "capabilities/" + ("queries" if kind == "query" else "gui" if kind == "gui" else "commands") + "/" + operation)
            schema = json.loads(json.dumps(capability["schema"]))
            schema.setdefault("properties", {}).pop("type", None)
            schema["required"] = [key for key in schema.get("required", []) if key != "type"]
            tools.append(types.Tool(name=name, description=description, inputSchema=schema,
                                    annotations=types.ToolAnnotations(readOnlyHint=kind == "query", idempotentHint=False,
                                                                     openWorldHint=False)))
        return types.ListToolsResult(tools=tools)

    async def call_tool(_context, params):
        if params.name not in TOOLS:
            return types.CallToolResult(isError=True, content=[types.TextContent(type="text", text="这个画布工具尚未接通。")])
        arguments = params.arguments or {}
        if not isinstance(arguments, dict) or "type" in arguments:
            return types.CallToolResult(isError=True, content=[types.TextContent(type="text", text="请使用该工具公布的参数。")])
        kind, operation, _ = TOOLS[params.name]
        body = {"type": operation, **arguments}
        try:
            result = await asyncio.to_thread(connection.request, "query" if kind == "query" else "gui" if kind == "gui" else "execute",
                                             body if kind in ("query", "gui") else {"commands": [body]})
            # GUI services can truthfully return HTTP 200 with a rejected or
            # unknown action. Preserve the complete original coreResponse and
            # never turn transport success into confirmation or a replay.
            gui_unconfirmed = kind == "gui" and (not isinstance(result, dict) or result.get("status") != "confirmed")
            return types.CallToolResult(isError=gui_unconfirmed, content=[types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False))],
                                        structuredContent=result)
        except KernelOperationError as error:
            # Preserve the real rejection/partial-commit facts supplied by the
            # same adapter. An error is not a rollback or permission to replay.
            return types.CallToolResult(isError=True, structuredContent=error.result,
                content=[types.TextContent(type="text", text=json.dumps(error.result, ensure_ascii=False))])
        except Exception:
            # API failure/timeout can follow a committed write. Keep it unknown
            # and require readback; do not turn an MCP reconnect into a resend.
            return types.CallToolResult(isError=True, content=[types.TextContent(type="text",
                text="画布操作未能确认。已有内容保留，请先读取当前画布核对；不会自动重发。")])

    return Server("lcos-native-space", version="0.1.0", on_list_tools=list_tools, on_call_tool=call_tool,
                  instructions="Current canvas: " + connection.canvas_id + ". Use only the tools actually returned by list_tools for this canvas. Connected GUI tools may include set_node_emphasis, set_node_pinned, set_node_color_pin and rename_color_pin; these save visual expression and do not require a Run or stage. Pin and color operations set the explicit desired state, never toggle. Shared color-group rename affects every place using that definition and retains the original observed-value check. Use published model-facing names; prior conversation claims of unavailable tools are historical. Read schemas and inspect_nodes GUI availability/state before use. A failed write may have committed: inspect before retrying; never automatically replay. Unsupported content/task operations remain unavailable. In user-facing answers use readable node labels and the requested result; omit internal filenames, revisions and protocol identifiers unless asked.")


async def main():
    parser = argparse.ArgumentParser(description="Use the existing local TapNow/Huabu canvas through MCP.")
    parser.add_argument("--runtime-label", default="isolated-node-carry-20261020")
    parser.add_argument("--canvas", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"isolated-[a-z0-9][a-z0-9-]{0,100}", args.runtime_label):
        parser.error("Use an existing isolated runtime label.")
    if not args.canvas or re.search(r"[\\/\x00-\x1f]", args.canvas) or args.canvas in (".", ".."):
        parser.error("Use an opened canvas identifier.")
    workspace = Path(__file__).resolve().parent.parent
    runtime_root = (workspace / ".runtime").resolve()
    runtime = (runtime_root / args.runtime_label).resolve()
    if runtime.parent != runtime_root or not runtime.is_dir():
        parser.error("The runtime must be an existing directory in this workspace.")
    connection = KernelConnection(runtime, args.canvas)
    server = create_server(connection)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
