# Test del ponte Revit su Windows (eseguito da GitHub Actions prima della pubblicazione).
$ErrorActionPreference = 'Stop'
$script = (Resolve-Path (Join-Path $PSScriptRoot '..\ponte-revit\ponte-revit.ps1')).Path
"PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

# 1) sintassi
$t = $null; $e = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$t, [ref]$e)
if ($e) { throw "Errori di sintassi: $e" }
'OK  sintassi'

function Start-Ponte([string]$argomenti) {
  Start-Process powershell.exe -PassThru -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$script`" $argomenti"
}
function Get-StatoPonte([int]$porta) {
  for ($i = 0; $i -lt 30; $i++) {
    try { return Invoke-RestMethod "http://127.0.0.1:$porta/stato?t=prova" -TimeoutSec 3 } catch { Start-Sleep -Seconds 1 }
  }
  throw "Il ponte sulla porta $porta non risponde"
}

# 2) avvio reale su Windows (icona, codice C#, lettura finestre), senza Revit aperto
$p = Start-Ponte '-Porta 47899 -UrlApp ""'
try {
  $r = Get-StatoPonte 47899
  if ($r.versione -lt 2) { throw 'versione del ponte inattesa' }
  if ($r.revitAperto) { throw 'Revit risulta aperto ma non lo è' }
  "OK  ponte reale: revitAperto=$($r.revitAperto) secondiInattivoPC=$($r.secondiInattivoPC)"
  Start-Sleep -Seconds 6   # qualche giro del ciclo principale (controllo attività/riapertura)
  if ($p.HasExited) { throw "Il ponte si è chiuso da solo (codice $($p.ExitCode))" }
  'OK  ciclo principale stabile'
} finally { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force } }

# 3) lettura dei titoli di Revit (anche con trattino lungo)
$titoli = 'Autodesk Revit 2025 ' + [char]0x2013 + ' [Scuola Media - Tavola: A101 - Piante]|Autodesk Revit 2024.2 - [Villa_Rossi - Pianta piano: Livello 1]|Autodesk Revit 2025 - Pagina iniziale'
$p = Start-Ponte "-Porta 47898 -TitoliTest `"$titoli`" -InattivoTest 30"
try {
  $r = Get-StatoPonte 47898
  $modelli = @($r.istanze | ForEach-Object { $_.modello })
  if ($modelli[0] -ne 'Scuola Media' -or $modelli[1] -ne 'Villa_Rossi' -or $modelli[2] -ne '') { throw "Modelli letti male: $($modelli -join ' | ')" }
  if ($r.istanze[0].secondiInattivo -ne 30) { throw 'inattività simulata non riportata' }
  "OK  titoli: $($modelli -join ' | ')"
} finally { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
'Tutti i test del ponte sono passati.'
