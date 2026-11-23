# Run GPU jobs strictly one after another on the desktop.
#   Launch as a scheduled task (not over SSH: Windows OpenSSH kills a session's processes when it closes):
#     schtasks /create /f /tn dls-queue /sc once /sd 01/01/2099 /st 00:00 /tr "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\User\dls-ft\queue.ps1 -List queue.txt [-WaitPid N] [-WaitFor run]"
#     schtasks /run /tn dls-queue
#     schtasks /delete /f /tn dls-queue        (when it is done)
#   The trigger MUST be in the far future: a "/sc once /st 23:59" placeholder fires again that night and re-runs
#   the whole list (2026-11-22: three queues re-trained at once overnight and filled the GPU).
#   The list has one job per line: "train <run>", "eval <run>" or "serve <run>" (serves on :8010 until runs\<run>\serve.stop exists, max 60 min). Logged to queue.log.
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
  elseif ($kind -eq "evalgold") { & $py eval_unsloth.py "runs\$run" "data\sets\claude-hard-med\test.jsonl" *> "runs\$run\eval.log" }   # medieval wording: the gold test set only
  elseif ($kind -eq "train") { & $py train_unsloth.py "runs\$run\config.json" *> "runs\$run\train.log" }
  elseif ($kind -eq "serve") {
    # Serve the model on :8010 until runs\<run>\serve.stop appears (or 60 min), so the Mac can run the golden suite.
    Remove-Item "runs\$run\serve.stop" -ErrorAction SilentlyContinue
    $p = Start-Process -FilePath $py -ArgumentList "serve_unsloth.py", "runs\$run\model", "--port", "8010" -RedirectStandardOutput "runs\$run\serve.log" -RedirectStandardError "runs\$run\serve.err" -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddMinutes(60)
    while (-not (Test-Path "runs\$run\serve.stop") -and (Get-Date) -lt $deadline -and -not $p.HasExited) { Start-Sleep 10 }
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force; Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
  }
  Add-Content queue.log "$(Get-Date -Format s) done $job (exit $LASTEXITCODE)"
}
Add-Content queue.log "$(Get-Date -Format s) queue finished ($List)"
