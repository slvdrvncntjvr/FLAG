#requires -Version 5.1
<#
Prepare/review a FLAG D1 backup with -Target dev|production (default Mode: Plan).
Backup is an explicitly authorized remote read; it never applies migrations.
SelfTest uses only synthetic bytes and writes encrypted fixtures inside the repo.
Raw .sql.dpapi bytes use DPAPI CurrentUser, no optional entropy or text encoding.
#>
[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Backup', 'SelfTest')][string]$Mode = 'Plan',
    [ValidateSet('dev', 'production')][string]$Target,
    [string]$OutputName,
    [switch]$PrerequisitesVerified,
    [switch]$ProductionReleaseApproved
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ownerBackupDirectory = 'C:\Users\Vincent\FLAG-backups'

function Clear-Bytes([byte[]]$Bytes) {
    if ($null -ne $Bytes) { [Array]::Clear($Bytes, 0, $Bytes.Length) }
}

function New-PrivateScratch {
    $base = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($base.TrimEnd('\', '/') -eq $repoRoot -or
        $base.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'OS temporary directory must be outside this repository.'
    }
    $path = Join-Path $base ('flag-d1-backup-' + [Guid]::NewGuid().ToString('N'))
    try {
        $null = [IO.Directory]::CreateDirectory($path)
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
        # Use .NET directly: Python/CI may inherit a PSModulePath without the
        # Windows PowerShell Security module that supplies Set-Acl.
        if ($PSVersionTable.PSEdition -eq 'Desktop') { [IO.Directory]::SetAccessControl($path, $acl) }
        else { [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($path), $acl) }
        return $path
    } catch {
        if ([IO.Directory]::Exists($path)) { Remove-Item -LiteralPath $path -Recurse -Force }
        throw 'Could not create protected OS temporary directory.'
    }
}

function Remove-Scratch([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $base = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($full) -notmatch '^flag-d1-backup-[a-f0-9]{32}$') {
        throw 'Refusing cleanup outside operation-owned OS temporary directory.'
    }
    if ([IO.Directory]::Exists($full)) { Remove-Item -LiteralPath $full -Recurse -Force }
    if ([IO.Directory]::Exists($full)) { throw 'Plaintext cleanup failed.' }
}

function Get-ApprovedTarget {
    if ([string]::IsNullOrEmpty($Target)) { throw 'An explicit dev or production Target is required.' }
    $web = Join-Path $repoRoot 'web'
    if (-not [IO.File]::Exists((Join-Path $web 'node_modules/wrangler/bin/wrangler.js'))) {
        throw 'Project-local Wrangler is required; this command never installs packages.'
    }
    # Use the same parser and approved mapping as deployment; emit only nonsecret IDs.
    $code = @'
try {
 const { unstable_readConfig } = require('wrangler');
 const { checkResourceBindings, getDeploymentTarget, CLOUDFLARE_ACCOUNT_ID } =
   await import('./scripts/check-resource-bindings.mjs');
 const env = process.argv[1] === 'dev' ? 'dev' : '';
 const config = unstable_readConfig({config:'wrangler.jsonc', env});
 checkResourceBindings(config, env);
 if (config.d1_databases.filter(x => x.binding === 'DB').length !== 1)
   throw new Error();
 console.log(JSON.stringify({account:CLOUDFLARE_ACCOUNT_ID, ...getDeploymentTarget(env)}));
} catch { process.exitCode = 1; }
'@
    # CommonJS -e supports dynamic import but not top-level await.
    $code = '(async () => {' + $code + '})()'
    Push-Location $web
    try {
        $raw = & node.exe -e $code $Target 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Approved target validation failed.' }
        return ($raw | ConvertFrom-Json)
    } finally { Pop-Location }
}

function Invoke-EncryptedBackup {
    param([string]$Destination, [scriptblock]$Producer, [string]$FailurePoint = '')
    $scratch = $null
    $plain = $cipher = $stored = $decoded = $originalHash = $decodedHash = $null
    $sha = $null
    $created = $false
    $verified = $false
    $cleanupOk = $false
    try {
        # CreateNew below also closes the race after this preflight.
        if (Test-Path -LiteralPath $Destination) { throw 'Backup output already exists.' }
        $scratch = New-PrivateScratch
        $sql = Join-Path $scratch 'export.sql'
        & $Producer $sql $scratch
        $plain = [IO.File]::ReadAllBytes($sql)
        if ($plain.Length -eq 0) { throw 'Empty export refused.' }
        $cipher = [Security.Cryptography.ProtectedData]::Protect(
            $plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $stream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $created = $true
        try {
            if ($FailurePoint -eq 'write') {
                $stream.Write($cipher, 0, 1)
                throw 'Synthetic write failure.'
            }
            $stream.Write($cipher, 0, $cipher.Length)
            $stream.Flush($true)
        } finally { $stream.Dispose() }
        $stored = [IO.File]::ReadAllBytes($Destination)
        if ($FailurePoint -eq 'verify') { $stored[0] = $stored[0] -bxor 255 }
        $decoded = [Security.Cryptography.ProtectedData]::Unprotect(
            $stored, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $sha = [Security.Cryptography.SHA256]::Create()
        $originalHash = $sha.ComputeHash($plain)
        $decodedHash = $sha.ComputeHash($decoded)
        if ($plain.Length -ne $decoded.Length -or
            [Convert]::ToBase64String($originalHash) -cne [Convert]::ToBase64String($decodedHash)) {
            throw 'Backup verification failed.'
        }
        $verified = $true
    } catch {
        # Neither native stderr nor the caught exception can expose SQL/credentials.
        throw 'D1 backup failed; no verified backup was produced. Sensitive diagnostics suppressed.'
    } finally {
        foreach ($buffer in @($plain, $cipher, $stored, $decoded, $originalHash, $decodedHash)) { Clear-Bytes $buffer }
        if ($null -ne $sha) { $sha.Dispose() }
        try {
            if ($null -ne $scratch) { Remove-Scratch $scratch }
            $cleanupOk = $true
        } catch {
            throw 'D1 backup plaintext cleanup failed; verified backup withheld.'
        } finally {
            if ($created -and (-not $verified -or -not $cleanupOk)) {
                Remove-Item -LiteralPath $Destination -Force
            }
        }
    }
    [pscustomobject]@{ Verified = $verified; PlaintextCleaned = $cleanupOk; Path = $Destination }
}

function Invoke-SyntheticTests {
    # Only test artifacts (never developer files or backups); no Wrangler/node/network.
    $testRoot = Join-Path $repoRoot ('temporary\backup-selftest-' + [Guid]::NewGuid().ToString('N'))
    $null = [IO.Directory]::CreateDirectory($testRoot)
    $results = @()
    try {
        foreach ($case in @('success', 'export', 'empty', 'write', 'verify', 'overwrite', 'race', 'cleanup')) {
            $state = @{ Scratch = $null; Plain = $null; ProducerCalled = $false; Lock = $null }
            $output = Join-Path $testRoot ($case + '.sql.dpapi')
            if ($case -eq 'overwrite') { [IO.File]::WriteAllText($output, 'existing-synthetic-marker') }
            $producer = {
                param($sql, $scratch)
                $state.ProducerCalled = $true
                $state.Scratch = $scratch
                # Mutable byte fixture, including non-ASCII/NUL; never encoded as a SQL string.
                $fixture = [byte[]](0, 45, 45, 32, 83, 89, 78, 84, 72, 69, 84, 73, 67, 255, 10)
                try {
                    $state.Plain = $sql
                    if ($case -eq 'empty') { [IO.File]::WriteAllBytes($sql, [byte[]]@()) }
                    else { [IO.File]::WriteAllBytes($sql, $fixture) }
                    if ($case -eq 'race') { [IO.File]::WriteAllText($output, 'existing-synthetic-marker') }
                    if ($case -eq 'export') { throw 'Synthetic SQL/credential diagnostic MUST NOT LEAK' }
                    if ($case -eq 'cleanup') {
                        # Lock a sibling so export reading still works, but
                        # recursive cleanup must fail and withhold success.
                        $state.Lock = [IO.File]::Open((Join-Path $scratch 'locked-synthetic-file'),
                            [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
                    }
                } finally { Clear-Bytes $fixture }
            }.GetNewClosure()
            $failed = $false
            try { $null = Invoke-EncryptedBackup $output $producer $case }
            catch {
                $failed = $true
                $expectedMessage = if ($case -eq 'cleanup') { 'D1 backup plaintext cleanup failed; verified backup withheld.' }
                    else { 'D1 backup failed; no verified backup was produced. Sensitive diagnostics suppressed.' }
                if ($_.Exception.Message -ne $expectedMessage) {
                    throw 'Synthetic failure diagnostic was not suppressed.'
                }
            } finally {
                if ($null -ne $state.Lock) {
                    $state.Lock.Dispose()
                    if (Test-Path -LiteralPath $output) { throw 'Cleanup failure retained a verified artifact.' }
                    Remove-Scratch $state.Scratch
                }
            }
            $clean = ($null -eq $state.Scratch -or -not (Test-Path -LiteralPath $state.Scratch))
            $expectedFailure = $case -ne 'success'
            $outputOk = if ($case -in @('overwrite', 'race')) {
                [IO.File]::ReadAllText($output) -ceq 'existing-synthetic-marker'
            } else { (Test-Path -LiteralPath $output) -eq (-not $expectedFailure) }
            if (-not $clean -or -not $outputOk -or $failed -ne $expectedFailure -or
                ($case -eq 'overwrite' -and $state.ProducerCalled)) {
                [Console]::Error.WriteLine('Synthetic case ' + $case + ': cleanup=' + $clean + ', output=' + $outputOk + ', failure=' + $failed)
                throw 'Synthetic cleanup/overwrite assertion failed.'
            }
            $results += [pscustomobject]@{ Case = $case; Passed = $true; PlaintextCleaned = $clean }
        }
        # Check the actual wipe helper, not just its call sites.
        $wipe = [byte[]](1, 2, 255)
        Clear-Bytes $wipe
        if (@($wipe | Where-Object { $_ -ne 0 }).Count -ne 0) { throw 'Byte wipe failed.' }
        $results | ConvertTo-Json -Compress
    } finally {
        $full = [IO.Path]::GetFullPath($testRoot)
        $parent = [IO.Path]::GetFullPath((Join-Path $repoRoot 'temporary')) + [IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($full) -notmatch '^backup-selftest-[a-f0-9]{32}$') { throw 'Unsafe test cleanup path.' }
        Remove-Item -LiteralPath $full -Recurse -Force
    }
}

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows DPAPI CurrentUser is required.' }
    Add-Type -AssemblyName System.Security
    if ($Mode -eq 'SelfTest') {
        if ($Target -or $OutputName -or $PrerequisitesVerified -or $ProductionReleaseApproved) {
            throw 'SelfTest accepts no target, output or release switches.'
        }
        Invoke-SyntheticTests
    } else {
        if (-not $Target) { throw 'An explicit dev or production Target is required.' }
        if ($Mode -eq 'Backup' -and -not $PrerequisitesVerified) { throw 'Backup requires PrerequisitesVerified under the approved OPS release procedure.' }
        if ($Mode -eq 'Backup' -and $Target -eq 'production' -and -not $ProductionReleaseApproved) {
            throw 'Production backup requires later owner release approval and ProductionReleaseApproved.'
        }
        if (-not $OutputName) {
            $OutputName = 'flag-' + $Target + '-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.sql.dpapi'
        }
        if ($OutputName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.sql\.dpapi$' -or
            [IO.Path]::GetFileName($OutputName) -cne $OutputName) { throw 'OutputName must be a simple .sql.dpapi filename, without directories.' }
        $destination = Join-Path $ownerBackupDirectory $OutputName
        if (Test-Path -LiteralPath $destination) { throw 'Backup output already exists.' }
        $saved = @{}
        $settings = @{
            WRANGLER_SEND_METRICS = 'false'; WRANGLER_WRITE_LOGS = 'false'; WRANGLER_LOG = 'error'; WRANGLER_LOG_SANITIZE = 'true'
            CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'; npm_config_offline = 'true'
            npm_config_logs_max = '0'; npm_config_loglevel = 'silent'; npm_config_update_notifier = 'false'; CI = 'true'
        }
        foreach ($name in $settings.Keys) {
            $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
        }
        try {
            $approved = Get-ApprovedTarget
            foreach ($accountVariable in @('CLOUDFLARE_ACCOUNT_ID', 'CF_ACCOUNT_ID')) {
                $accountOverride = [Environment]::GetEnvironmentVariable($accountVariable, 'Process')
                if ($accountOverride -and $accountOverride -cne $approved.account) { throw 'Account environment override conflicts with the approved target.' }
            }
            if ($Mode -eq 'Plan') {
                [pscustomobject]@{
                    Mode = 'Plan'; Target = $Target; Account = $approved.account
                    Database = $approved.database; DatabaseId = $approved.databaseId; Output = $destination
                    Command = ('npx.cmd --no-install wrangler d1 export ' + $approved.database + ' --remote --env=' + $(if ($Target -eq 'dev') { 'dev' } else { '' }) + ' --config <isolated-OS-temp-config> --cwd <OS-temp-directory> --output <OS-temp-directory>\export.sql --yes')
                    Executed = $false
                } | ConvertTo-Json -Compress
            } else {
                if (-not [IO.Directory]::Exists($ownerBackupDirectory)) { throw 'The established owner backup directory must already exist.' }
                $producer = {
                    param($sql, $scratch)
                    $db = @{ binding = 'DB'; database_name = $approved.database; database_id = $approved.databaseId }
                    $config = @{ account_id = $approved.account; name = $approved.worker; d1_databases = @($db) }
                    if ($Target -eq 'dev') { $config.env = @{ dev = @{ name = $approved.worker; d1_databases = @($db) } } }
                    $configPath = Join-Path $scratch 'wrangler.json'
                    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 6))
                    $envArgument = if ($Target -eq 'dev') { '--env=dev' } else { '--env=' }
                    Push-Location (Join-Path $repoRoot 'web')
                    try {
                        & npx.cmd --no-install wrangler d1 export $approved.database --remote $envArgument --config $configPath --cwd $scratch --output $sql --yes *> $null
                        if ($LASTEXITCODE -ne 0) { throw 'Remote export failed.' }
                    } finally { Pop-Location }
                }.GetNewClosure()
                $result = Invoke-EncryptedBackup $destination $producer
                [pscustomobject]@{
                    Target = $Target; Database = $approved.database; DatabaseId = $approved.databaseId
                    TimeUtc = [DateTime]::UtcNow.ToString('o'); Path = $result.Path
                    Integrity = 'DPAPI CurrentUser decrypt + byte length + SHA-256 verified'; PlaintextCleaned = $result.PlaintextCleaned
                } | ConvertTo-Json -Compress
            }
        } finally {
            foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
        }
    }
} catch {
    # Fixed messages above are safe; unexpected runtime/native exception content is never shown.
    if ($Mode -eq 'SelfTest') {
        [Console]::Error.WriteLine('Synthetic self-test failure at script line ' + $_.InvocationInfo.ScriptLineNumber + ' (' + $_.Exception.GetType().Name + ').')
    }
    [Console]::Error.WriteLine('FLAG D1 backup command failed. Check explicit target, approvals, installed tools, output, and cleanup permissions; diagnostics suppressed.')
    exit 1
}
