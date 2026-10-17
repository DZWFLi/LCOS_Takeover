# CLI: curation-apply

```bash
lcos curation apply <project-id> <patch.json> [--scope <scope-id>]
```

patch 支持：createTexts / relations（provenance）/ presentation（members/hierarchy/emphasis/pin/edges）。

应用前先 search 去重；应用后 verify。
