param([string]$Version = '1.74.0')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$extensionRoot = Join-Path $projectRoot 'extensions'
$destination = Join-Path $extensionRoot 'ublock'
if (Test-Path -LiteralPath $destination) { throw 'extensions/ublock already exists. Keep or explicitly remove that version before installing another.' }
$release = Invoke-RestMethod -Uri ('https://api.github.com/repos/gorhill/uBlock/releases/tags/' + $Version) -Headers @{ 'User-Agent' = 'Mizu-YouTube-Player' }
$asset = $release.assets | Where-Object { $_.name -match '\.chromium\.zip$' } | Select-Object -First 1
if (-not $asset) { throw 'Official release does not include a Chromium build.' }
if (-not $asset.browser_download_url.StartsWith('https://github.com/gorhill/uBlock/releases/download/')) { throw 'Unexpected release URL.' }
$staging = Join-Path $projectRoot ('.local/ublock-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
$archive = Join-Path $staging 'ublock.zip'
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archive
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $staging 'unpacked')
$manifest = Get-ChildItem -LiteralPath (Join-Path $staging 'unpacked') -Filter manifest.json -Recurse | Where-Object { $_.Directory.Name -eq 'uBlock0.chromium' } | Select-Object -First 1
if (-not $manifest) { throw 'Expected Chromium manifest was not found.' }
Copy-Item -LiteralPath $manifest.Directory.FullName -Destination $destination -Recurse
@{ version = $release.tag_name; source = $asset.browser_download_url; sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $extensionRoot 'ublock-release.json') -Encoding utf8
Write-Output ('Installed official uBlock Origin ' + $release.tag_name + '. Electron API compatibility still requires verification.')
