param(
 [Parameter(Mandatory=$true)][int]$OwnerProcessId,
 [Parameter(Mandatory=$true)][ValidateSet('open','restore','close','test')][string]$Role,
 [Parameter(Mandatory=$true)][string]$ReceiptPath
)
# One OS-owned mutex for every supported dev settings writer. A separate lease
# process survives owner loss, observes a quiet period, then releases. If this
# lease itself dies, the OS marks the mutex abandoned for the next lease.
$ErrorActionPreference='Stop'
$taskReceipt=[ordered]@{at=[DateTime]::UtcNow.ToString('o');role=$Role;ownerPid=$OwnerProcessId;leasePid=$PID;acquired=$false;abandoned=$false;ownerDied=$false;ownerWallLimitReached=$false;recoveryQuietSeconds=0;released=$false;result='failed'}
$taskMutex=$null
$taskOwns=$false
$taskQuietSeconds=30
$taskWallSeconds=switch($Role){'open'{90};'test'{30};default{120}}
$taskMarker=Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../temporary'))) 'dev-settings-writer-owner.json'
$taskMarkerOwned=$false
function Write-WriterMarker([string]$State){
 $taskMarkerPart=$taskMarker+'.partial'
 [IO.File]::WriteAllText($taskMarkerPart,([ordered]@{state=$State;leasePid=$PID;ownerPid=$OwnerProcessId;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
 Move-Item -LiteralPath $taskMarkerPart -Destination $taskMarker -Force
}
try{
 if(Test-Path -LiteralPath $ReceiptPath){throw 'Preserve existing lock receipt'}
 # Compile before acquiring: compiler startup cannot consume lock ownership.
 Add-Type -TypeDefinition 'public static class FlagDevLeaseInput { public static System.Threading.Tasks.Task<string> Read() { return System.Threading.Tasks.Task.Run(() => System.Console.In.ReadLine()); } }'
 $taskOwner=[Diagnostics.Process]::GetProcessById($OwnerProcessId)
 if($taskOwner.HasExited){throw 'Writer owner already exited'}
 $taskMutex=[Threading.Mutex]::new($false,'Global\FLAG-dev-settings-writer-v1')
 try{$taskOwns=$taskMutex.WaitOne([TimeSpan]::FromSeconds(180))}catch [Threading.AbandonedMutexException]{$taskOwns=$true;$taskReceipt.abandoned=$true}
 if(-not $taskOwns){throw 'Writer lock wait budget exhausted'}
 $taskReceipt.acquired=$true
 # A killed lease can destroy the last kernel handle before another waiter
 # exists. The durable marker detects that case even without OS abandonment.
 $taskUnclean=$false
 if(Test-Path -LiteralPath $taskMarker){$taskPrevious=Get-Content -LiteralPath $taskMarker -Raw|ConvertFrom-Json;if($taskPrevious.state -notin @('active','released')){throw 'Unknown writer marker; inspect before mutation'};$taskUnclean=$taskPrevious.state -eq 'active'}
 $taskReceipt.uncleanOwnerMarker=$taskUnclean
 if($taskReceipt.abandoned -or $taskUnclean){Start-Sleep -Seconds $taskQuietSeconds;$taskReceipt.recoveryQuietSeconds=$taskQuietSeconds}
 if($taskOwner.HasExited){throw 'Writer owner exited while waiting'}
 Write-WriterMarker 'active'
 $taskMarkerOwned=$true
 $taskReceipt.acquiredAt=[DateTime]::UtcNow.ToString('o')
 [Console]::Out.WriteLine('{"event":"acquired"}')
 [Console]::Out.Flush()
 # Console's synchronized TextReader may implement ReadLineAsync synchronously;
 # use a real CLR task so stdin cannot disable the owner/wall-time watchdog.
 $taskReleaseLine=[FlagDevLeaseInput]::Read()
 $taskUntil=[DateTime]::UtcNow.AddSeconds($taskWallSeconds)
 $taskNormalRelease=$false
 while([DateTime]::UtcNow -lt $taskUntil){
  if($taskReleaseLine.IsCompleted){$taskNormalRelease=$taskReleaseLine.Result -eq 'release';break}
  if($taskOwner.HasExited){$taskReceipt.ownerDied=$true;break}
  Start-Sleep -Milliseconds 100
 }
 if(-not $taskNormalRelease){
  if(-not $taskOwner.HasExited){$taskReceipt.ownerWallLimitReached=$true;$taskOwner.Kill();$taskOwner.WaitForExit()}
  $taskReceipt.ownerDied=$true
  Start-Sleep -Seconds $taskQuietSeconds
  $taskReceipt.recoveryQuietSeconds=$taskQuietSeconds
 }else{$taskReceipt.result='pass'}
}catch{$taskReceipt.errorType=$_.Exception.GetType().Name}
finally{
 if($taskOwns){if($taskMarkerOwned){Write-WriterMarker 'released'};$taskMutex.ReleaseMutex();$taskReceipt.released=$true}
 if($taskMutex){$taskMutex.Dispose()}
 $taskReceipt.finishedAt=[DateTime]::UtcNow.ToString('o')
 $taskPartial=$ReceiptPath+'.partial'
 [IO.File]::WriteAllText($taskPartial,($taskReceipt|ConvertTo-Json -Depth 6))
 Move-Item -LiteralPath $taskPartial -Destination $ReceiptPath -ErrorAction Stop
}
if($taskReceipt.result -ne 'pass'){exit 1}
