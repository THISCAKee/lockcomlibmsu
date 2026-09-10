[CmdletBinding()]
param(
    [string]$AppRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

function Require-EnvironmentVariable([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required production environment variable: $Name"
    }
    return $value
}

$required = @(
    'LOCKCOMPUTER_AUTH_SECRET',
    'LOCKCOMPUTER_CLIENT_KEY',
    'LOCKCOMPUTER_ROOT_ADMIN_EMAIL',
    'LOCKCOMPUTER_ADMIN_WEB_URL',
    'OAUTH_CLIENT_SECRET',
    'OAUTH_REDIRECT_URI',
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SHEETS_CREDENTIALS_FILE'
)
foreach ($name in $required) { $null = Require-EnvironmentVariable $name }

$redirectUri = Require-EnvironmentVariable 'OAUTH_REDIRECT_URI'
if (-not $redirectUri.StartsWith('https://', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OAUTH_REDIRECT_URI must use https:// in production.'
}

$credentialsFile = [Environment]::GetEnvironmentVariable('GOOGLE_SHEETS_CREDENTIALS_FILE')
if (-not (Test-Path -LiteralPath $credentialsFile -PathType Leaf)) {
    throw 'GOOGLE_SHEETS_CREDENTIALS_FILE does not point to an existing file.'
}

$resolvedRoot = [IO.Path]::GetFullPath($AppRoot)
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot 'package.json') -PathType Leaf)) {
    throw "Next.js package.json was not found under the configured application directory."
}
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot '.next') -PathType Container)) {
    throw 'Built Next.js output was not found. Run npm run build (next build) before starting production.'
}

Push-Location $resolvedRoot
try {
    Write-Host 'Starting LockComputer Next.js production service on port 3000.'
    & npm run start -- -p 3000
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
