"""Exercise one explicit call through the installed, real MCP stdio client."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


async def call(runtime_label: str, canvas: str, tool: str | None, arguments: dict):
    parameters = StdioServerParameters(command=sys.executable,
        args=["-X", "utf8", str(Path(__file__).with_name("native-space-kernel-mcp.py")),
              "--runtime-label", runtime_label, "--canvas", canvas])
    async with stdio_client(parameters) as (reader, writer):
        async with ClientSession(reader, writer, read_timeout_seconds=40) as client:
            await client.initialize()
            listed = await client.list_tools()
            if tool is None:
                return {"tools": [item.model_dump(mode="json", exclude_none=True, by_alias=True) for item in listed.tools], "calls": 0}
            result = await client.call_tool(tool, arguments)
            return {"tools": [item.name for item in listed.tools], "calls": 1,
                    "result": result.model_dump(mode="json", exclude_none=True, by_alias=True)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-label", default="isolated-node-carry-20261020")
    parser.add_argument("--canvas", required=True)
    parser.add_argument("--tool")
    parser.add_argument("--arguments-file", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    arguments = {} if args.arguments_file is None else json.loads(args.arguments_file.read_text("utf-8-sig"))
    result = asyncio.run(call(args.runtime_label, args.canvas, args.tool, arguments))
    serialized = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(serialized + "\n", encoding="utf-8")
    else:
        print(serialized)


if __name__ == "__main__":
    main()
