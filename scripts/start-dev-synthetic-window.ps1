param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$ReviewedVersion,
 [switch]$NoConcurrentWriters,
 [switch]$PreflightOnly,
 [switch]$OpenReviewedWindow
)
# Draft for coordinator review. Fixed five-minute deadline, dev only. This is
# not a guarantee during host/network loss. Never wait for human review while open.
$ErrorActionPreference='Stop'
if(-not $NoConcurrentWriters -or ($PreflightOnly -eq $OpenReviewedWindow)){throw 'Choose exactly one of preflight-only or reviewed-open and assert no concurrent external writers'}
$taskRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNode=(Get-Command node.exe -ErrorAction Stop).Source
$taskShell=(Get-Command pwsh.exe -ErrorAction Stop).Source
$taskOperation=[Guid]::NewGuid().ToString('N')
$taskDirectory=Join-Path $taskRepo ('temporary/intake-window-'+$taskOperation)
New-Item -ItemType Directory -Path $taskDirectory -ErrorAction Stop | Out-Null
$taskBaseline=Join-Path $taskDirectory 'authority.json'
$taskPrepare=Join-Path $taskDirectory 'prepare.json'
$taskOpen=Join-Path $taskDirectory 'open.json'
$taskRunner=Join-Path $taskDirectory 'guard.ps1'
$taskHelper=Join-Path $taskRepo 'web/scripts/dev-synthetic-window.mjs'
$taskName='FLAG-dev-synthetic-window-'+$taskOperation
$taskRegistered=$false
$taskMayHaveOpened=$false
$taskTarget=[uri]'https://api.cloudflare.com'
$taskProxy=[System.Net.Http.HttpClient]::DefaultProxy
if(-not $taskProxy.IsBypassed($taskTarget)){$env:HTTPS_PROXY=$taskProxy.GetProxy($taskTarget).AbsoluteUri;$env:NODE_USE_ENV_PROXY='1'}
function Quote-WindowLiteral([string]$Value){return "'"+$Value.Replace("'","''")+"'"}
function Get-WindowSid([string]$Value){if($Value.StartsWith('S-1-')){return ([Security.Principal.SecurityIdentifier]::new($Value)).Value};return ([Security.Principal.NTAccount]::new($Value)).Translate([Security.Principal.SecurityIdentifier]).Value}
function Convert-WindowUtc($Value){
 if($Value -is [DateTime]){return $Value.ToUniversalTime()}
 if($Value -is [DateTimeOffset]){return $Value.UtcDateTime}
 return [DateTimeOffset]::Parse([string]$Value,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime
}
function Write-WindowReceipt([string]$Path,$Value){$taskPartial=$Path+'.partial';[IO.File]::WriteAllText($taskPartial,($Value|ConvertTo-Json -Depth 12));Move-Item -LiteralPath $taskPartial -Destination $Path -ErrorAction Stop}
function Wait-WindowTask([DateTime]$After,[int]$Seconds=420){
 $taskUntil=[DateTime]::UtcNow.AddSeconds($Seconds)
 while([DateTime]::UtcNow -lt $taskUntil){
  $taskState=Get-ScheduledTask -TaskName $taskName
  $taskInfo=Get-ScheduledTaskInfo -TaskName $taskName
  if($taskInfo.LastRunTime -ge $After.AddSeconds(-2) -and $taskState.State -ne 'Running' -and $taskInfo.LastTaskResult -ne 267009){
   if($taskInfo.LastTaskResult -ne 0){throw 'Independent guard failed; retain task and evidence'}
   $taskRuns=@(Get-ChildItem -LiteralPath $taskDirectory -Filter 'guard-run-*.json' -File|Sort-Object LastWriteTimeUtc -Descending)
   if(-not $taskRuns.Count){throw 'Completed guard has no atomic run receipt'}
   $taskRun=Get-Content -LiteralPath $taskRuns[0].FullName -Raw|ConvertFrom-Json
   if($taskRun.exitCode -ne 0 -or (Convert-WindowUtc $taskRun.at) -lt $After.ToUniversalTime().AddSeconds(-2)){throw 'Current guard run not verified'}
   $taskReceipt=Get-Content -LiteralPath $taskRun.receipt -Raw|ConvertFrom-Json
   if($taskReceipt.result -ne 'pass' -or $taskReceipt.confirmedState -ne 'false'){throw 'Guard did not confirm actual false'}
   return [ordered]@{receipt=$taskRun.receipt;lastTaskResult=$taskInfo.LastTaskResult;lastRunTime=$taskInfo.LastRunTime.ToUniversalTime().ToString('o');completed=$true;mutationAttempted=$taskReceipt.mutationAttempted}
  }
  Start-Sleep -Seconds 2
 }
 throw 'Independent guard completion unknown; preserve task'
}
try{
 & $taskNode $taskHelper prepare $taskBaseline $taskPrepare $ReviewedVersion *> $null
 if($LASTEXITCODE -ne 0){throw 'Fresh source/readiness preparation failed'}
 $taskAuthority=Get-Content -LiteralPath $taskBaseline -Raw|ConvertFrom-Json
 $taskDeadline=Convert-WindowUtc $taskAuthority.deadline
 $taskRunnerBody=@'
$ErrorActionPreference='Stop'
$taskTarget=[uri]'https://api.cloudflare.com'
$taskProxy=[System.Net.Http.HttpClient]::DefaultProxy
if(-not $taskProxy.IsBypassed($taskTarget)){$env:HTTPS_PROXY=$taskProxy.GetProxy($taskTarget).AbsoluteUri;$env:NODE_USE_ENV_PROXY='1'}
'@
 $taskRunnerBody+="`n`$taskDirectory="+(Quote-WindowLiteral $taskDirectory)+"`n`$taskRunId=[Guid]::NewGuid().ToString('N')`n`$taskReceipt=Join-Path `$taskDirectory ('restore-'+`$taskRunId+'.json')`n"
 $taskRunnerBody+='& '+(Quote-WindowLiteral $taskNode)+' '+(Quote-WindowLiteral $taskHelper)+' restore '+(Quote-WindowLiteral $taskBaseline)+" `$taskReceipt *> `$null`n`$taskCode=`$LASTEXITCODE`n"
 $taskRunnerBody+="`$taskStatus=Join-Path `$taskDirectory ('guard-run-'+`$taskRunId+'.json')`n`$taskPartial=`$taskStatus+'.partial'`n[IO.File]::WriteAllText(`$taskPartial,([ordered]@{at=[DateTime]::UtcNow.ToString('o');receipt=`$taskReceipt;exitCode=`$taskCode}|ConvertTo-Json))`nMove-Item -LiteralPath `$taskPartial -Destination `$taskStatus -ErrorAction Stop`nexit `$taskCode`n"
 Set-Content -LiteralPath $taskRunner -Value $taskRunnerBody
 $taskArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$taskRunner+'"'
 $taskAction=New-ScheduledTaskAction -Execute $taskShell -Argument $taskArguments -WorkingDirectory $taskRepo
 $taskPrincipal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
 $taskTrigger=New-ScheduledTaskTrigger -Once -At $taskDeadline.ToLocalTime()
 # Operational guard budget: wait180s + abandoned-owner quiet30s + restore120s
 # + owner-timeout quiet30s + startup/receipt margin30s =390s; round to7minutes.
 # Existing application/suite timeout limits remain unchanged.
 $taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 7)
 Register-ScheduledTask -TaskName $taskName -Action $taskAction -Principal $taskPrincipal -Trigger $taskTrigger -Settings $taskSettings -Description 'Reviewed FLAG dev synthetic window; fixed deadline restores only reviewed source fingerprint'|Out-Null
 $taskRegistered=$true
 $taskObserved=Get-ScheduledTask -TaskName $taskName
 if($taskObserved.State -eq 'Disabled' -or $taskObserved.Actions.Count -ne 1 -or [Xml.XmlConvert]::ToTimeSpan($taskObserved.Settings.ExecutionTimeLimit) -ne (New-TimeSpan -Minutes 7) -or -not $taskObserved.Settings.StartWhenAvailable -or $taskObserved.Settings.DisallowStartIfOnBatteries -or $taskObserved.Settings.StopIfGoingOnBatteries){throw 'Independent guard run/wait budget or availability mismatch'}
 if($taskObserved.Actions.Execute -ne $taskShell -or $taskObserved.Actions.Arguments -ne $taskArguments -or $taskObserved.Actions.WorkingDirectory -ne $taskRepo -or $taskObserved.Principal.RunLevel -ne 'Limited' -or (Get-WindowSid $taskObserved.Principal.UserId) -ne (Get-WindowSid $taskPrincipal.UserId) -or $taskObserved.Triggers.Count -ne 1 -or (Convert-WindowUtc $taskObserved.Triggers[0].StartBoundary) -ne $taskDeadline){throw 'Exact independent guard registration mismatch'}
 $taskNext=(Get-ScheduledTaskInfo -TaskName $taskName).NextRunTime
 if(-not $taskNext -or $taskNext.ToUniversalTime() -ne $taskDeadline -or $taskDeadline -le [DateTime]::UtcNow){throw 'Future independent deadline not armed at exact authority time'}
 # Exercise the same armed guard action now, while false, before any true PATCH.
 $taskPreflightAt=[DateTime]::Now
 Start-ScheduledTask -TaskName $taskName
 $taskPreflight=Wait-WindowTask $taskPreflightAt
 if($taskPreflight.mutationAttempted -ne $false){throw 'False-only guard preflight mutated; refuse opening'}
 Write-WindowReceipt (Join-Path $taskDirectory 'independent-preflight.json') $taskPreflight
 if($PreflightOnly){
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  $taskRegistered=$false
  $taskSummary=[ordered]@{phase='preflight-only';windowId=$taskAuthority.windowId;actualFalse=$true;mutationAttempted=$false;guardCompleted=$true;receipt=$taskPreflight.receipt;directory=$taskDirectory;enabledRestorationProven=$false;hostOrNetworkLossGuaranteed=$false}
  Write-WindowReceipt (Join-Path $taskDirectory 'preflight-only.json') $taskSummary
  $taskSummary|ConvertTo-Json
  return
 }
 $taskMayHaveOpened=$true
 & $taskNode $taskHelper open $taskBaseline $taskOpen $taskPreflight.receipt *> $null
 if($LASTEXITCODE -ne 0){throw 'Open incomplete; preserve guard and inspect restoration'}
 $taskOpened=Get-Content -LiteralPath $taskOpen -Raw|ConvertFrom-Json
 if($taskOpened.result -ne 'pass' -or $taskOpened.confirmedState -ne 'true'){throw 'Actual open not confirmed'}
 [ordered]@{phase='opened';windowId=$taskAuthority.windowId;deadline=$taskAuthority.deadline;guardTask=$taskName;authority=$taskBaseline;receipt=$taskOpen;hostOrNetworkLossGuaranteed=$false}|ConvertTo-Json
 # Browser synthetic work can run while this process remains alive. The armed
 # independent task also survives loss of this process; it needs host/network.
 while([DateTime]::UtcNow -lt $taskDeadline){Start-Sleep -Seconds 2}
 $taskClosed=Wait-WindowTask $taskDeadline.ToLocalTime()
 Write-WindowReceipt (Join-Path $taskDirectory 'independent-final.json') $taskClosed
 Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
 $taskRegistered=$false
 [ordered]@{phase='closed';windowId=$taskAuthority.windowId;confirmedState='false';guardCompleted=$true;receipt=$taskClosed.receipt;hostOrNetworkLossGuaranteed=$false}|ConvertTo-Json
}catch{
 # Never race an already-running independent restore with another writer.
 $taskRunning=$false
 if($taskRegistered){$taskRunning=(Get-ScheduledTask -TaskName $taskName).State -in @('Running','Queued')}
 $taskRecovery=$null
 # Once armed, let that independent task own deadline restoration: a parent
 # fallback can race its start. Node open already attempts immediate restoration
 # after an uncertain open. Retain the armed task on every parent failure.
 if($taskMayHaveOpened -and -not $taskRegistered){
  $taskRecovery=Join-Path $taskDirectory ('parent-failure-restore-'+[Guid]::NewGuid().ToString('N')+'.json')
  & $taskNode $taskHelper restore $taskBaseline $taskRecovery *> $null
 }
 $taskFailure=[ordered]@{phase='failed';at=[DateTime]::UtcNow.ToString('o');windowDirectory=$taskDirectory;guardRegistered=$taskRegistered;guardRunning=$taskRunning;mayHaveOpened=$taskMayHaveOpened;recoveryReceipt=$taskRecovery;errorType=$_.Exception.GetType().Name;hostOrNetworkLossGuaranteed=$false}
 Write-WindowReceipt (Join-Path $taskDirectory 'failure.json') $taskFailure
 $taskFailure|ConvertTo-Json
 exit 1
}
