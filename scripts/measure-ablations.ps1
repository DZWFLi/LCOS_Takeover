param([ValidateSet('ablation','cut')][string]$Probe = 'ablation')
$ErrorActionPreference = 'Stop'
$ablationModule = if ($Probe -eq 'cut') { 'cut-browser.mjs' } else { 'ablation-browser.mjs' }
$ablationSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot $ablationModule) -Raw
$ablationEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ablationSource))
$ablationInvocation = "async page => { return await eval('(' + Buffer.from('$ablationEncoded', 'base64').toString('utf8').replace('export default ', '') + ')')(page); }"
$ablationCacheRoot = Join-Path $env:LOCALAPPDATA 'npm-cache/_npx'
$ablationCli = Get-ChildItem -LiteralPath $ablationCacheRoot -Directory | ForEach-Object {
  Join-Path $_.FullName 'node_modules/@playwright/cli/playwright-cli.js'
} | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $ablationCli) { throw 'An installed Playwright CLI cache is required; this script does not download tools.' }
# Call the installed CLI directly: npm's Windows cmd wrapper has an 8191-character limit.
$ablationCliOutput = & node $ablationCli -s=dsh-03-ablation run-code $ablationInvocation
if ($LASTEXITCODE -ne 0) { throw ($ablationCliOutput -join [Environment]::NewLine) }
$ablationResult = $ablationCliOutput | Where-Object { $_.StartsWith('[{') -or $_.StartsWith('{') } | Select-Object -First 1
if (-not $ablationResult) { throw 'No ablation result was returned; inspect browser errors, do not infer success.' }
$ablationResult
