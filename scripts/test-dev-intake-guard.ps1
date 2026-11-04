param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$ExpectedVersion)
# Verify that a separate Windows Task Scheduler invocation can authenticate and
# confirm dev intake=false. Does not enable intake or claim host-loss immunity.
$ErrorActionPreference = 'Stop'
$taskRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskShell = (Get-Command pwsh.exe -ErrorAction Stop).Source
$taskId = [Guid]::NewGuid().ToString('N')
$taskName = 'FLAG-dev-intake-guard-' + $taskId
$taskTemp = Join-Path $taskRepo 'temporary'
if (-not (Test-Path -LiteralPath $taskTemp -PathType Container)) { throw 'Existing evidence directory required' }
$taskReceipt = Join-Path $taskTemp ('intake-guard-' + $taskId + '.json')
$taskRunner = Join-Path $taskTemp ('intake-guard-' + $taskId + '.ps1')
$taskHelper = Join-Path $taskRepo 'web/scripts/dev-synthetic-intake.mjs'
if (Test-Path -LiteralPath $taskReceipt) { throw 'Preserve existing receipt' }
function Quote-TaskLiteral([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
$taskRunnerBody = @'
$ErrorActionPreference = 'Stop'
$taskTarget = [uri]'https://api.cloudflare.com'
$taskProxy = [System.Net.Http.HttpClient]::DefaultProxy
if (-not $taskProxy.IsBypassed($taskTarget)) {
  $env:HTTPS_PROXY = $taskProxy.GetProxy($taskTarget).AbsoluteUri
  $env:NODE_USE_ENV_PROXY = '1'
}
'@
$taskRunnerBody += "`n& " + (Quote-TaskLiteral $taskNode) + ' ' + (Quote-TaskLiteral $taskHelper) + ' close ' + (Quote-TaskLiteral $taskReceipt) + ' ' + (Quote-TaskLiteral $ExpectedVersion) + " *> `$null`nexit `$LASTEXITCODE`n"
Set-Content -LiteralPath $taskRunner -Value $taskRunnerBody
$taskAction = New-ScheduledTaskAction -Execute $taskShell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $taskRunner + '"') -WorkingDirectory $taskRepo
$taskPrincipal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$taskTrigger = New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddSeconds(20))
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$taskRegistered = $false
try {
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Principal $taskPrincipal -Trigger $taskTrigger -Settings $taskSettings -Description 'FLAG controlled dev intake restoration readiness test; never enables intake' | Out-Null
  $taskRegistered = $true
  $taskObserved = Get-ScheduledTask -TaskName $taskName
  if ($taskObserved.Actions.Execute -ne $taskShell -or $taskObserved.Principal.RunLevel -ne 'Limited') { throw 'Exact scheduled guard mismatch' }
  $taskDeadline = [DateTime]::UtcNow.AddSeconds(60)
  $taskCompleted = $false
  while ([DateTime]::UtcNow -lt $taskDeadline) {
    $taskObserved = Get-ScheduledTask -TaskName $taskName
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
    if ($taskInfo.LastRunTime -gt [DateTime]::Now.AddMinutes(-2) -and $taskObserved.State -ne 'Running' -and $taskInfo.LastTaskResult -ne 267009) { $taskCompleted = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $taskCompleted) { throw 'Scheduled invocation completion not observed; preserve task and evidence' }
  if ($taskInfo.LastTaskResult -ne 0) { throw 'Scheduled invocation failed; preserve task and evidence' }
  if (-not (Test-Path -LiteralPath $taskReceipt)) { throw 'Independent close receipt not observed; preserve guard' }
  $taskResult = Get-Content -LiteralPath $taskReceipt -Raw | ConvertFrom-Json
  if ($taskResult.mode -ne 'close' -or $taskResult.result -ne 'pass' -or $taskResult.intakeBefore -ne 'false' -or $taskResult.intakeAfter -ne 'false' -or $taskResult.mutationAttempted -ne $false) { throw 'Benign false-only observation not confirmed; preserve task and evidence' }
  $taskSummary = [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); independentSchedulerVerified=$true; taskCompletionVerified=$true; lastTaskResult=$taskInfo.LastTaskResult; lastRunTime=$taskInfo.LastRunTime.ToUniversalTime().ToString('o'); intakeAfter='false'; enabled=$false; mutationAttempted=$false; inheritanceProven=$false; enabledRestorationProven=$false; receipt=$taskReceipt; taskName=$taskName; hostOrNetworkLossGuaranteed=$false }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  $taskRegistered = $false
  $taskSummary | ConvertTo-Json
  # Keep the operation's runner and receipt as evidence; no private bytes present.
} catch {
  [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); independentSchedulerVerified=$false; enabled=$false; guardRegistered=$taskRegistered; taskName=$taskName; receipt=$taskReceipt; taskCompletionVerified=$taskCompleted; lastTaskResult=if($taskInfo){$taskInfo.LastTaskResult}else{$null}; errorType=$_.Exception.GetType().Name } | ConvertTo-Json
  exit 1
}
