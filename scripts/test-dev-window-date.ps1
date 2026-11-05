$ErrorActionPreference='Stop'
$taskAst=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'start-dev-synthetic-window.ps1'),[ref]$null,[ref]$null)
$taskFunction=$taskAst.Find({param($taskNode)$taskNode -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $taskNode.Name -eq 'Convert-WindowUtc'},$true)
Invoke-Expression $taskFunction.Extent.Text
$taskOriginal=[Globalization.CultureInfo]::CurrentCulture
$taskPassed=0
try{
 foreach($taskCulture in @('en-US','en-GB','fil-PH')){
  [Globalization.CultureInfo]::CurrentCulture=[Globalization.CultureInfo]::GetCultureInfo($taskCulture)
  $taskJson='{"deadline":"2026-11-04T09:10:11.000Z"}'|ConvertFrom-Json
  foreach($taskValue in @($taskJson.deadline,'2026-11-04T09:10:11.000Z','2026-11-04T17:10:11+08:00')){
   $taskUtc=Convert-WindowUtc $taskValue
   if($taskUtc.Kind -ne [DateTimeKind]::Utc -or $taskUtc.Year -ne 2026 -or $taskUtc.Month -ne 11 -or $taskUtc.Day -ne 4 -or $taskUtc.Hour -ne 9 -or $taskUtc.Minute -ne 10 -or $taskUtc.Second -ne 11){throw 'Deadline culture/date-kind regression'}
   $taskPassed++
  }
 }
}finally{[Globalization.CultureInfo]::CurrentCulture=$taskOriginal}
[ordered]@{cases=$taskPassed;result='pass';networkOrSettingsMutation=$false}|ConvertTo-Json
