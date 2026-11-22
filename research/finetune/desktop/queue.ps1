# Run GPU jobs strictly one after another on the desktop. Usage: powershell -File queue.ps1 <wait-for-run> ; then the job list below.
param([string]$WaitFor)
Set-Location C:\Users\User\dls-ft
$py = ".venv\Scripts\python.exe"
$T = "data\sets\heuristic-hard\test.jsonl", "data\sets\d3-hard\test.jsonl", "data\sets\claude-hard\test.jsonl"
if ($WaitFor) { while (-not (Select-String -Path "runs\$WaitFor\train.log" -Pattern "^DONE" -Quiet)) { Start-Sleep 30 } }
foreach ($job in Get-Content "queue.txt") {
  if (-not $job.Trim() -or $job.StartsWith("#")) { continue }
  $kind, $run = $job.Split(" ", 2)
  Add-Content queue.log "$(Get-Date -Format s) start $job"
  if ($kind -eq "eval") { & $py eval_unsloth.py "runs\$run" @T *> "runs\$run\eval.log" }
  elseif ($kind -eq "train") { & $py train_unsloth.py "runs\$run\config.json" *> "runs\$run\train.log" }
  Add-Content queue.log "$(Get-Date -Format s) done $job"
}
