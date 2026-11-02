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
$script:backupStage = 'preflight'
$script:backupFailureStage = $null

function Invoke-QuietNode {
    param([string[]]$Arguments, [string]$WorkingDirectory, [switch]$CaptureOutput)
    # Windows PowerShell promotes native stderr to terminating errors under
    # ErrorActionPreference=Stop, even with *> $null and a successful exit.
    # Start Node directly (no cmd/npx/package resolution); drain both pipes
    # concurrently without retaining export diagnostics in strings or on disk.
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start.WorkingDirectory = $WorkingDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    # ProcessStartInfo.ArgumentList is unavailable in Windows PowerShell 5.1.
    # Quote each argument using the Windows argv backslash/quote rules.
    $start.Arguments = (@($Arguments | ForEach-Object {
        $escaped = [regex]::Replace($_, '(\\*)"', '$1$1\"')
        '"' + [regex]::Replace($escaped, '(\\+)$', '$1$1') + '"'
    }) -join ' ')
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        $null = $process.Start()
        $stderr = $process.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
        $stdout = if ($CaptureOutput) { $process.StandardOutput.ReadToEndAsync() }
            else { $process.StandardOutput.BaseStream.CopyToAsync([IO.Stream]::Null) }
        $process.WaitForExit()
        $null = $stderr.GetAwaiter().GetResult()
        if ($CaptureOutput) { $output = $stdout.GetAwaiter().GetResult() }
        else { $null = $stdout.GetAwaiter().GetResult(); $output = $null }
        [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $output }
    } finally { $process.Dispose() }
}

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
    $native = Invoke-QuietNode -Arguments @('-e', $code, $Target) -WorkingDirectory $web -CaptureOutput
    if ($native.ExitCode -ne 0) { throw 'Approved target validation failed.' }
    return ($native.Output | ConvertFrom-Json)
}

function Invoke-D1Export {
    param([string]$Sql, [string]$Scratch, $Approved, [string]$Environment, [string]$EntryPoint)
    $script:backupStage = 'export_config'
    $db = @{ binding = 'DB'; database_name = $Approved.database; database_id = $Approved.databaseId }
    $config = @{ account_id = $Approved.account; name = $Approved.worker; d1_databases = @($db) }
    if ($Environment -eq 'dev') { $config.env = @{ dev = @{ name = $Approved.worker; d1_databases = @($db) } } }
    $configPath = Join-Path $Scratch 'wrangler.json'
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 6))
    $envArgument = if ($Environment -eq 'dev') { '--env=dev' } else { '--env=' }
    $script:backupStage = 'export_native'
    $native = Invoke-QuietNode -Arguments @($EntryPoint, 'd1', 'export', $Approved.database,
        '--remote', $envArgument, '--config', $configPath, '--cwd', $Scratch, '--output', $Sql, '--skip-confirmation') -WorkingDirectory $Scratch
    if ($native.ExitCode -ne 0) { throw 'Remote export failed.' }
}

function Invoke-EncryptedBackup {
    param([string]$Destination, [scriptblock]$Producer, [string]$FailurePoint = '')
    $scratch = $null
    $plain = $cipher = $stored = $decoded = $originalHash = $decodedHash = $null
    $sha = $null
    $created = $false
    $verified = $false
    $cleanupOk = $false
    $script:backupFailureStage = $null
    try {
        # CreateNew below also closes the race after this preflight.
        $script:backupStage = 'output_preflight'
        if (Test-Path -LiteralPath $Destination) { throw 'Backup output already exists.' }
        $script:backupStage = 'private_scratch'
        $scratch = New-PrivateScratch
        $sql = Join-Path $scratch 'export.sql'
        $script:backupStage = 'export'
        & $Producer $sql $scratch
        $script:backupStage = 'read_export'
        $plain = [IO.File]::ReadAllBytes($sql)
        if ($plain.Length -eq 0) { throw 'Empty export refused.' }
        $script:backupStage = 'encrypt'
        $cipher = [Security.Cryptography.ProtectedData]::Protect(
            $plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $script:backupStage = 'write_artifact'
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
        $script:backupStage = 'verify_artifact'
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
        $script:backupFailureStage = $script:backupStage
        # Neither native stderr nor the caught exception can expose SQL/credentials.
        throw 'D1 backup failed; no verified backup was produced. Sensitive diagnostics suppressed.'
    } finally {
        foreach ($buffer in @($plain, $cipher, $stored, $decoded, $originalHash, $decodedHash)) { Clear-Bytes $buffer }
        if ($null -ne $sha) { $sha.Dispose() }
        try {
            if ($null -ne $scratch) { Remove-Scratch $scratch }
            $cleanupOk = $true
        } catch {
            $script:backupFailureStage = 'cleanup'
            throw 'D1 backup plaintext cleanup failed; verified backup withheld.'
        } finally {
            if ($created -and (-not $verified -or -not $cleanupOk)) {
                $script:backupStage = 'remove_failed_artifact'
                Remove-Item -LiteralPath $Destination -Force
            }
        }
    }
    [pscustomobject]@{ Verified = $verified; PlaintextCleaned = $cleanupOk; Path = $Destination }
}

function Invoke-SyntheticTests {
    # Only test artifacts (never developer files or backups); fake native export
    # uses Node with synthetic source only, never installed Wrangler or network.
    $testRoot = Join-Path $repoRoot ('temporary\backup-selftest-' + [Guid]::NewGuid().ToString('N'))
    $null = [IO.Directory]::CreateDirectory($testRoot)
    $results = @()
    try {
        foreach ($case in @('success', 'export', 'empty', 'write', 'verify', 'overwrite', 'race', 'cleanup', 'native_stderr', 'native_failure', 'native_empty_env')) {
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
                    if ($case -in @('native_stderr', 'native_failure', 'native_empty_env')) {
                        $fake = Join-Path $scratch 'fake wrangler.js'
                        $source = @'
const fs = require('node:fs');
const a = process.argv.slice(2);
function need(ok) { if (!ok) process.exit(91); }
need(a.length === 12 && a[0] === 'd1' && a[1] === 'export');
need(a[2] === 'synthetic db "quoted" \\' && a[3] === '--remote');
need(a[4] === '--env=dev' && a[5] === '--config' && a[7] === '--cwd');
need(a[9] === '--output' && a[11] === '--skip-confirmation');
const c = JSON.parse(fs.readFileSync(a[6], 'utf8'));
need(c.account_id === 'synthetic-account' && c.env.dev.d1_databases[0].database_name === a[2]);
need(process.cwd() === a[8]);
process.stdout.write('MUST_NOT_LEAK-synthetic-output\n'.repeat(8192));
process.stderr.write('MUST_NOT_LEAK-synthetic-stderr\n'.repeat(8192));
fs.writeFileSync(a[10], Buffer.from([0, 45, 255, 10]));
'@
                        if ($case -eq 'native_failure') { $source += "`nprocess.exitCode = 23;" }
                        if ($case -eq 'native_empty_env') {
                            $source = $source.Replace("a[4] === '--env=dev'", "a[4] === '--env='")
                            $source = $source.Replace('c.env.dev.d1_databases[0]', 'c.d1_databases[0]')
                        }
                        [IO.File]::WriteAllText($fake, $source)
                        $synthetic = [pscustomobject]@{ account = 'synthetic-account'; worker = 'synthetic-worker';
                            database = 'synthetic db "quoted" \'; databaseId = 'synthetic-database-id' }
                        $syntheticEnvironment = if ($case -eq 'native_empty_env') { 'production' } else { 'dev' }
                        Invoke-D1Export $sql $scratch $synthetic $syntheticEnvironment $fake
                        return
                    }
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
            $expectedFailure = $case -notin @('success', 'native_stderr', 'native_empty_env')
            $outputOk = if ($case -in @('overwrite', 'race')) {
                [IO.File]::ReadAllText($output) -ceq 'existing-synthetic-marker'
            } else { (Test-Path -LiteralPath $output) -eq (-not $expectedFailure) }
            if (-not $clean -or -not $outputOk -or $failed -ne $expectedFailure -or
                ($case -eq 'overwrite' -and $state.ProducerCalled)) {
                [Console]::Error.WriteLine('Synthetic case ' + $case + ': cleanup=' + $clean + ', output=' + $outputOk + ', failure=' + $failed)
                throw 'Synthetic cleanup/overwrite assertion failed.'
            }
            $results += [pscustomobject]@{ Case = $case; Passed = $true; PlaintextCleaned = $clean; FailureStage = $script:backupFailureStage }
        }
        # Empty args, whitespace, shell metacharacters, literal quotes and
        # trailing backslashes must reach Node unchanged without a shell.
        $native = Invoke-QuietNode -Arguments @('-e', 'process.exit(process.argv[1] === "" && process.argv[2] === "a & b" && process.argv[3] === "quote\"tail\\" ? 0 : 92)', '', 'a & b', 'quote"tail\') -WorkingDirectory $repoRoot
        if ($native.ExitCode -ne 0) { throw 'Synthetic native argument check failed.' }
        $results += [pscustomobject]@{ Case = 'native_arguments'; Passed = $true; PlaintextCleaned = $true }
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
            $script:backupStage = 'target_validation'
            $approved = Get-ApprovedTarget
            $script:backupStage = 'account_override'
            foreach ($accountVariable in @('CLOUDFLARE_ACCOUNT_ID', 'CF_ACCOUNT_ID')) {
                $accountOverride = [Environment]::GetEnvironmentVariable($accountVariable, 'Process')
                if ($accountOverride -and $accountOverride -cne $approved.account) { throw 'Account environment override conflicts with the approved target.' }
            }
            if ($Mode -eq 'Plan') {
                [pscustomobject]@{
                    Mode = 'Plan'; Target = $Target; Account = $approved.account
                    Database = $approved.database; DatabaseId = $approved.databaseId; Output = $destination
                    Command = ('node.exe "' + (Join-Path $repoRoot 'web/node_modules/wrangler/bin/wrangler.js') + '" d1 export ' + $approved.database + ' --remote --env=' + $(if ($Target -eq 'dev') { 'dev' } else { '' }) + ' --config <isolated-OS-temp-config> --cwd <OS-temp-directory> --output <OS-temp-directory>\export.sql --skip-confirmation')
                    Executed = $false
                } | ConvertTo-Json -Compress
            } else {
                $script:backupStage = 'backup_directory'
                if (-not [IO.Directory]::Exists($ownerBackupDirectory)) { throw 'The established owner backup directory must already exist.' }
                $producer = {
                    param($sql, $scratch)
                    Invoke-D1Export $sql $scratch $approved $Target (Join-Path $repoRoot 'web/node_modules/wrangler/bin/wrangler.js')
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
    $stage = if ($script:backupFailureStage) { $script:backupFailureStage } else { $script:backupStage }
    if ($stage -notin @('preflight', 'target_validation', 'account_override', 'backup_directory',
        'output_preflight', 'private_scratch', 'export', 'export_config', 'export_native', 'read_export',
        'encrypt', 'write_artifact', 'verify_artifact', 'cleanup', 'remove_failed_artifact')) { $stage = 'preflight' }
    [Console]::Error.WriteLine('FLAG_BACKUP_FAILED stage=' + $stage)
    [Console]::Error.WriteLine('FLAG D1 backup command failed. Check explicit target, approvals, installed tools, output, and cleanup permissions; diagnostics suppressed.')
    exit 1
}
