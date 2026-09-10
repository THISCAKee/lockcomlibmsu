[CmdletBinding()]
param(
    [string]$ServiceName = 'LockComputerNext',
    [string]$DisplayName = 'LockComputer Next.js',
    [string]$AppRoot = (Split-Path -Parent $PSScriptRoot),
    [PSCredential]$ServiceCredential
)

$ErrorActionPreference = 'Stop'

$resolvedRoot = [IO.Path]::GetFullPath($AppRoot)
$startScript = Join-Path $resolvedRoot 'scripts\start-production.ps1'
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot 'package.json') -PathType Leaf)) {
    throw 'package.json was not found under AppRoot.'
}
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot '.next') -PathType Container)) {
    throw 'Built Next.js output was not found. Run npm run build before installing the service.'
}
if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
    throw 'The production startup script was not found.'
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    throw "A Windows service named $ServiceName already exists. Remove or update it deliberately first."
}
if (-not $ServiceCredential) {
    $ServiceCredential = Get-Credential -Message 'Enter the explicit Windows service account for LockComputer Next.js.'
}

$powerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$binaryPath = "`"$powerShell`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$startScript`""
New-Service -Name $ServiceName -DisplayName $DisplayName -Description 'LockComputer Admin/API Next.js service' -BinaryPathName $binaryPath -StartupType Automatic -Credential $ServiceCredential | Out-Null

Write-Host "Installed $ServiceName. Set machine-level production environment variables, then start the service."
Write-Host 'Publish HTTPS at the public URL (for example https://lockcomputer.example.ac.th) and register the same URL as OAUTH_REDIRECT_URI.'
Write-Host "The service working directory is controlled by start-production.ps1: $resolvedRoot"
