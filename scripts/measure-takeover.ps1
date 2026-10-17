$ErrorActionPreference = 'Stop'
$takeoverSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'takeover-browser.mjs') -Raw
$takeoverEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($takeoverSource))
$takeoverInvocation = "async page => { return await eval('(' + Buffer.from('$takeoverEncoded', 'base64').toString('utf8').replace('export default ', '') + ')')(page); }"
$takeoverCliOutput = & npx --no-install --package '@playwright/cli' playwright-cli -s=dsh-03-takeover run-code $takeoverInvocation
if ($LASTEXITCODE -ne 0) { throw ($takeoverCliOutput -join [Environment]::NewLine) }
$takeoverResult = $takeoverCliOutput | Where-Object { $_ -like '{*' } | Select-Object -First 1
if (-not $takeoverResult) { throw 'Browser CLI did not return a measurement. Check its modal/error state; no report was accepted.' }
$takeoverReport = $takeoverResult | ConvertFrom-Json
[pscustomobject]@{
  url = $takeoverReport.url
  nodes = $takeoverReport.canvasNodeCount
  fixtureBadge = $takeoverReport.fixtureBadge
  bridgePresent = $takeoverReport.bridgePresent
  diagnosticCounts = @($takeoverReport.diagnostics | Group-Object kind | Select-Object Name,Count)
  apiStatus = @($takeoverReport.apiChecks | Select-Object method,path,status)
  navigationProbe = $takeoverReport.navigationProbe
} | ConvertTo-Json -Depth 6
