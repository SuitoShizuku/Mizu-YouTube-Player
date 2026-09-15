param([switch]$Publish, [string]$Output = 'artifacts/phase1-adblock')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$localSdk = Join-Path $repo '.tools/dotnet/dotnet.exe'
$sdk = if (Test-Path $localSdk) { $localSdk } else { 'dotnet' }
Push-Location $repo
try {
    & $sdk build Mizu.slnx -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    & $sdk run --project tests/Mizu.Tests -c Release --no-build
    if ($LASTEXITCODE -ne 0) { throw 'Checks failed' }
    if ($Publish) {
        & $sdk publish src/Mizu.App -c Release -r win-x64 --self-contained true -o $Output
        if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
    }
} finally { Pop-Location }
