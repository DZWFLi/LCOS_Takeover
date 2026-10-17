# CLI: search

```bash
lcos search <project-id> --q "..." [--limit N]
lcos conversation search <project-id> --q "..." [--semantic --limit N]
```

- 默认 FTS；语义搜索首次慢，可后补。
- 未命名对象也能被找到（body/source 检索）。
