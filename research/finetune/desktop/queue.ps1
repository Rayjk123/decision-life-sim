# Run GPU jobs strictly one after another on the desktop.
#   Launch as a scheduled task (not over SSH: Windows OpenSSH kills a session's processes when it closes):
#     schtasks /create /f /tn dls-queue /sc once /st 23:59 /tr "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\User\dls-ft\queue.ps1 -List queue.txt [-WaitPid N] [-WaitFor run]"
#     schtasks /run /tn dls-queue
#   The list has one job per line: "train <run>" or "eval <run>". Logged to queue.log.
#   The task runs without admin rights; files written over SSH (elevated) need: icacls C:\Users\User\dls-ft /grant User:(OI)(CI)F /T
param([string]$List = "queue.txt", [string]$WaitFor = "", [int]$WaitPid = 0)
Set-Location C:\Users\User\dls-ft
$py = ".venv\Scripts\python.exe"
$T = "data\sets\heuristic-hard\test.jsonl", "data\sets\d3-hard\test.jsonl", "data\sets\claude-hard\test.jsonl"
Add-Content queue.log "$(Get-Date -Format s) queue started (pid $PID, list $List, wait run '$WaitFor', wait pid $WaitPid)"
if ($WaitPid) { while (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) { Start-Sleep 30 } }
if ($WaitFor) { while (-not (Select-String -Path "runs\$WaitFor\train.log" -Pattern "^DONE" -Quiet)) { Start-Sleep 30 } }
foreach ($job in Get-Content $List) {
  if (-not $job.Trim() -or $job.StartsWith("#")) { continue }
  $kind, $run = $job.Split(" ", 2)
  Add-Content queue.log "$(Get-Date -Format s) start $job"
  if ($kind -eq "eval") { & $py eval_unsloth.py "runs\$run" @T *> "runs\$run\eval.log" }
  elseif ($kind -eq "train") { & $py train_unsloth.py "runs\$run\config.json" *> "runs\$run\train.log" }
  Add-Content queue.log "$(Get-Date -Format s) done $job (exit $LASTEXITCODE)"
}
Add-Content queue.log "$(Get-Date -Format s) queue finished ($List)"
