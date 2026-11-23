# The default decision model as a service: serve E07m on :8010 forever, restarting if it ever exits.
# Installed as a scheduled task that runs at logon (the trigger is meant to fire, unlike the queue's placeholder):
#   schtasks /create /f /tn dls-decision-model /sc onlogon /tr "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\User\dls-ft\serve-default.ps1"
#   schtasks /run /tn dls-decision-model          (start now)      schtasks /end /tn dls-decision-model  (stop)
# Change the model by editing $Run below.
$Run = "e07m-deals-4b-medieval"
Set-Location C:\Users\User\dls-ft
while ($true) {
  Add-Content serve-default.log "$(Get-Date -Format s) starting $Run on :8010"
  & .venv\Scripts\python.exe serve_unsloth.py "runs\$Run\model" --port 8010 *> "runs\$Run\serve-default.log"
  Add-Content serve-default.log "$(Get-Date -Format s) server exited ($LASTEXITCODE); restarting in 30 s"
  Start-Sleep 30
}
