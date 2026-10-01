# Ponte Revit per «Ore Commesse»
#
# Legge quale modello è aperto in Autodesk Revit (dal titolo della finestra)
# e lo comunica all'app Ore Commesse, che può così cambiare commessa da sola.
# Funziona con qualunque versione di Revit e non modifica nulla in Revit.
#
# Rimane in ascolto solo sul computer stesso: http://127.0.0.1:47800/stato
# Nessun dato esce dal PC.

param(
  [int]$Porta = 47800,
  [string]$UrlApp = 'https://astroclaudio24.github.io/Astroclaudio24/',
  # Solo per test: titoli finti separati da "|" al posto delle finestre reali,
  # e secondi di inattività simulati.
  [string]$TitoliTest = '',
  [int]$InattivoTest = -1
)

$ErrorActionPreference = 'Stop'

$suWindows = $IsWindows -or ($PSVersionTable.PSEdition -eq 'Desktop')
if ($suWindows) {
  Add-Type -Namespace OreCommesse -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint pid);
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
// Millisecondi dall'ultimo uso di tastiera o mouse (in qualunque programma).
public static uint IdleMs() {
  LASTINPUTINFO l = new LASTINPUTINFO();
  l.cbSize = (uint)Marshal.SizeOf(l);
  GetLastInputInfo(ref l);
  return unchecked((uint)System.Environment.TickCount - l.dwTime);
}
'@
}

# Dal titolo della finestra ricava il nome del modello.
# Esempi:  "Autodesk Revit 2024.2 - [Villa_Rossi - Pianta piano: Livello 1]"
#          "Autodesk Revit 2025 - Villa_Rossi.rvt - Vista 3D: {3D}"
#          "Autodesk Revit 2025 - Pagina iniziale"   -> nessun modello
function Get-NomeModello([string]$titolo) {
  if (-not $titolo) { return '' }
  $t = $titolo.Trim()
  $t = $t -replace '^Autodesk Revit[^-–]*[-–]\s*', ''
  $t = $t.Trim().TrimStart('[').TrimEnd(']').Trim()
  # Il nome del modello è prima del separatore " - " che introduce la vista.
  $parti = $t -split '\s[-–]\s', 2
  $nome = $parti[0].Trim()
  if ($parti.Count -lt 2 -and $nome -notmatch '\.(rvt|rfa|rte)$') {
    # Nessuna vista nel titolo: è la pagina iniziale o un'altra schermata.
    return ''
  }
  $nome = $nome -replace '\.(rvt|rfa|rte)$', ''
  return $nome.Trim()
}

function Get-FinestreRevit {
  if ($TitoliTest) {
    $i = 0
    return @($TitoliTest -split '\|' | ForEach-Object {
      $i++; [pscustomobject]@{ Id = $i; Titolo = $_; PrimoPiano = ($i -eq 1) }
    })
  }
  if (-not $suWindows) { return @() }
  $pidAttivo = 0
  [void][OreCommesse.Win]::GetWindowThreadProcessId([OreCommesse.Win]::GetForegroundWindow(), [ref]$pidAttivo)
  return @(Get-Process -Name 'Revit' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle } |
    ForEach-Object { [pscustomobject]@{ Id = $_.Id; Titolo = $_.MainWindowTitle; PrimoPiano = ($_.Id -eq $pidAttivo) } })
}

# Ultimo momento in cui hai usato tastiera/mouse dentro ciascun Revit (pid -> data).
# Dopo uno standby resta l'ora di prima dello standby, quindi risulta inattività.
$attivita = @{}

function Update-Attivita {
  if (-not $suWindows -or $TitoliTest) { return }
  $pidAttivo = 0
  [void][OreCommesse.Win]::GetWindowThreadProcessId([OreCommesse.Win]::GetForegroundWindow(), [ref]$pidAttivo)
  if (-not $pidAttivo) { return }
  $p = Get-Process -Id $pidAttivo -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -eq 'Revit' -and [OreCommesse.Win]::IdleMs() -lt 2000) {
    $script:attivita[[int]$pidAttivo] = Get-Date
  }
}

function Get-SecondiInattivo([int]$id) {
  if ($InattivoTest -ge 0) { return $InattivoTest }
  if (-not $script:attivita.ContainsKey($id)) { $script:attivita[$id] = Get-Date }
  return [int]((Get-Date) - $script:attivita[$id]).TotalSeconds
}

function Get-Stato {
  $finestre = Get-FinestreRevit
  $istanze = @($finestre | ForEach-Object {
    [ordered]@{
      pid = $_.Id; titolo = $_.Titolo; modello = (Get-NomeModello $_.Titolo)
      primoPiano = [bool]$_.PrimoPiano; secondiInattivo = (Get-SecondiInattivo $_.Id)
    }
  })
  $inattivoPC = if ($InattivoTest -ge 0) { $InattivoTest } elseif ($suWindows) { [int]([OreCommesse.Win]::IdleMs() / 1000) } else { 0 }
  return [ordered]@{
    versione = 2
    revitAperto = ($istanze.Count -gt 0)
    istanze = $istanze
    secondiInattivoPC = $inattivoPC
    ora = (Get-Date).ToString('o')
  }
}

function Send-Risposta($stream, [int]$codice, [string]$corpo) {
  $testo = @{ 200 = 'OK'; 204 = 'No Content'; 404 = 'Not Found' }[$codice]
  $byteCorpo = [Text.Encoding]::UTF8.GetBytes($corpo)
  $intestazioni = "HTTP/1.1 $codice $testo`r`n" +
    "Content-Type: application/json; charset=utf-8`r`n" +
    "Content-Length: $($byteCorpo.Length)`r`n" +
    "Access-Control-Allow-Origin: *`r`n" +
    "Access-Control-Allow-Methods: GET, OPTIONS`r`n" +
    "Access-Control-Allow-Headers: *`r`n" +
    "Access-Control-Allow-Private-Network: true`r`n" +
    "Cache-Control: no-store`r`n" +
    "Connection: close`r`n`r`n"
  $b = [Text.Encoding]::ASCII.GetBytes($intestazioni)
  $stream.Write($b, 0, $b.Length)
  if ($byteCorpo.Length) { $stream.Write($byteCorpo, 0, $byteCorpo.Length) }
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Porta)
try {
  $listener.Start()
} catch {
  Write-Host "Porta $Porta già in uso: il ponte Revit è probabilmente già in esecuzione."
  exit 0
}
Write-Host "Ponte Revit attivo su http://127.0.0.1:$Porta/stato  (Ctrl+C per chiudere)"

$ultimaRichiesta = [datetime]::MinValue
$ultimaControllo = [datetime]::MinValue
$ultimaAttivita = [datetime]::MinValue
$pidVisti = @{}

while ($true) {
  # Se si apre Revit e l'app non è aperta, la apre (una volta per avvio di Revit).
  if (-not $listener.Pending()) {
    Start-Sleep -Milliseconds 250
    if (((Get-Date) - $ultimaAttivita).TotalSeconds -ge 1) {
      $ultimaAttivita = Get-Date
      try { Update-Attivita } catch { }
    }
    if (((Get-Date) - $ultimaControllo).TotalSeconds -ge 5) {
      $ultimaControllo = Get-Date
      foreach ($f in Get-FinestreRevit) {
        if (-not $pidVisti.ContainsKey($f.Id)) {
          $pidVisti[$f.Id] = $true
          $attivita[[int]$f.Id] = Get-Date   # aprire Revit conta come attività
          if (((Get-Date) - $ultimaRichiesta).TotalMinutes -ge 3 -and $UrlApp -and -not $TitoliTest) {
            Start-Process $UrlApp
          }
        }
      }
    }
    continue
  }
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 2000
    $stream = $client.GetStream()
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
    $riga = $reader.ReadLine()
    while ($true) { $h = $reader.ReadLine(); if ($null -eq $h -or $h -eq '') { break } }
    $metodo, $percorso = ($riga -split ' ')[0, 1]
    if ($metodo -eq 'OPTIONS') {
      Send-Risposta $stream 204 ''
    } elseif ($percorso -like '/stato*') {
      $ultimaRichiesta = Get-Date
      Send-Risposta $stream 200 (Get-Stato | ConvertTo-Json -Depth 4 -Compress)
    } else {
      Send-Risposta $stream 404 '{"errore":"usa /stato"}'
    }
  } catch {
    # richiesta malformata o interrotta: si ignora
  } finally {
    $client.Close()
  }
}
