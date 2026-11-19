# The URI is shown on screen (it keeps [YOUR-PASSWORD]); the password stays hidden and
# nothing is ever written to disk or to PowerShell command history.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$projectRoot = Split-Path -Path $PSScriptRoot -Parent

function Read-PrivateText([string]$Prompt) {
    $secret = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secret.Dispose() }
}

# The password is never echoed; only its length is printed, so a truncated input is detectable.
function Get-DatabasePassword([string]$Prompt) {
    $passwordFile = Join-Path $projectRoot 'db-password.txt'
    if (Test-Path -LiteralPath $passwordFile) {
        $fromFile = (Get-Content -LiteralPath $passwordFile -Raw)
        if ($null -eq $fromFile) { $fromFile = '' }
        $fromFile = $fromFile.TrimEnd("`r", "`n").TrimStart("`uFEFF", ' ')
        Write-Host ("Using the password from db-password.txt ({0} characters)." -f $fromFile.Length)
        return $fromFile
    }
    $typed = Read-PrivateText $Prompt
    Write-Host ("Password length: {0} characters." -f $typed.Length)
    return $typed
}

# Accept the shapes a dashboard "Copy" button can produce, plus stray quotes/CR/LF.
function Normalize-DatabaseUri([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
    $v = $Value.Trim()
    $v = $v -replace '[\u200B-\u200D\uFEFF\r\n\t]', ''
    $v = $v.Trim('"', "'", '`', ' ')
    $v = $v -replace '^(?i)(DATABASE_URL|SUPABASE_DB_URL|POSTGRES_URL)\s*=\s*', ''
    $v = $v -replace '^(?i)psql\s+', ''
    $v = $v.Trim('"', "'", '`', ' ')
    if ($v -notmatch '^(?i)postgres(ql)?://' -and $v -match '^[^/\s@]+@') { $v = 'postgresql://' + $v }
    return $v
}

function Test-DatabaseUri([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    if ($Value.Length -lt 20) { return $false }
    if ($Value -notmatch '^(?i)postgres(ql)?://[^/\s@]+@[^/\s@]+\.[^/\s@]+') { return $false }
    try {
        $parsed = [System.Uri]$Value
        return (@('postgres', 'postgresql') -contains $parsed.Scheme.ToLowerInvariant()) -and [bool]$parsed.Host
    } catch { return $false }
}

function Show-UriDiagnosis([string]$Value, [string]$Source) {
    Write-Host ("{0}: read {1} characters." -f $Source, $Value.Length)
    Write-Host ("  starts with postgresql:// : {0}" -f [bool]($Value -match '^(?i)postgres(ql)?://'))
    Write-Host ("  contains '@'             : {0}" -f $Value.Contains('@'))
    Write-Host ("  contains ':5432'         : {0}" -f [bool]($Value -match ':5432'))
    Write-Host ("  contains whitespace      : {0}" -f [bool]($Value -match '\s'))
}

# Use the project-local Supabase root CA unless the caller already pointed at one.
if (-not $env:DATABASE_CA_CERT_PATH) {
    $projectCa = Join-Path $projectRoot 'supabase-root-ca.pem'
    if (Test-Path -LiteralPath $projectCa) { $env:DATABASE_CA_CERT_PATH = $projectCa }
}

$previousDatabaseUrl = $env:DATABASE_URL
$exitCode = 1
try {
    $databaseUri = ''

    # 1) A file is the most reliable way to move a long string: db-uri.txt in the project root.
    $uriFile = Join-Path $projectRoot 'db-uri.txt'
    if (Test-Path -LiteralPath $uriFile) {
        $candidate = Normalize-DatabaseUri (Get-Content -LiteralPath $uriFile -Raw)
        if (Test-DatabaseUri $candidate) {
            $databaseUri = $candidate
            Write-Host ("Using the connection string from {0} (host {1})." -f $uriFile, ([System.Uri]$candidate).Host)
        } else {
            Show-UriDiagnosis $candidate 'db-uri.txt'
            Write-Host 'Ignoring that file and asking for the URI instead.'
        }
    }

    # 2) Otherwise paste it. Shown on screen on purpose: a truncated paste is then visible.
    if (-not $databaseUri) {
        Write-Host 'Supabase > Connect > Session pooler > URI (port 5432).'
        Write-Host 'Paste the URI and press Enter. It is echoed so you can see it arrived completely.'
        Write-Host 'It should still contain [YOUR-PASSWORD]; the real password is asked next, hidden.'
        $databaseUri = Normalize-DatabaseUri (Read-Host 'Database URI')
        Write-Host ("Read {0} characters." -f $databaseUri.Length)
        if (-not (Test-DatabaseUri $databaseUri)) {
            Show-UriDiagnosis $databaseUri 'Pasted URI'
            Write-Host 'The string is incomplete or malformed. Copy it again with the Copy button,'
            Write-Host 'or save it to db-uri.txt next to package.json and run this again.'
            exit 1
        }
    }

    if ($databaseUri -match '\[YOUR[-_]PASSWORD\]|%5BYOUR[-_]PASSWORD%5D') {
        $password = Get-DatabasePassword 'Database password (not your Supabase account password)'
        $databaseUri = [regex]::Replace($databaseUri, '(?i)\[YOUR[-_]PASSWORD\]|%5BYOUR[-_]PASSWORD%5D', [Uri]::EscapeDataString($password))
        $password = $null
    } elseif ($databaseUri -notmatch '://[^/@]+:[^/@]*@') {
        $password = Get-DatabasePassword 'Database password (not your Supabase account password)'
        $databaseUri = $databaseUri -replace '://([^/@]+)@', ('://$1:' + [Uri]::EscapeDataString($password) + '@')
        $password = $null
    }

    $env:DATABASE_URL = $databaseUri
    $databaseUri = $null
    & node (Join-Path $PSScriptRoot 'apply-schema.mjs')
    $exitCode = $LASTEXITCODE
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $databaseUri = $null
    $password = $null
}
exit $exitCode
