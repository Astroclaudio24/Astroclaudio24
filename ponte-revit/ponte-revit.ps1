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
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
// Porta in primo piano (e ripristina se ridotta a icona) la prima finestra il cui titolo inizia con il prefisso.
public static bool Riporta(string prefisso) {
  System.IntPtr trovata = System.IntPtr.Zero;
  EnumWindows(delegate(System.IntPtr h, System.IntPtr l) {
    if (!IsWindowVisible(h)) return true;
    System.Text.StringBuilder sb = new System.Text.StringBuilder(256);
    GetWindowText(h, sb, 256);
    if (sb.ToString().StartsWith(prefisso)) { trovata = h; return false; }
    return true;
  }, System.IntPtr.Zero);
  if (trovata == System.IntPtr.Zero) return false;
  if (IsIconic(trovata)) ShowWindow(trovata, 9);
  SetForegroundWindow(trovata);
  return true;
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

# ---------- Preferenze del ponte (browser dell'app, riapertura automatica) ----------

$cartella = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'OreCommesse' } else { Join-Path ([IO.Path]::GetTempPath()) 'OreCommesse' }
if ($TitoliTest) { $cartella = Join-Path ([IO.Path]::GetTempPath()) 'OreCommesseTest' }
$filePref = Join-Path $cartella 'ponte.json'
$pref = [ordered]@{ browser = ''; riapri = $true }
try {
  if (Test-Path $filePref) {
    $letto = Get-Content $filePref -Raw | ConvertFrom-Json
    if ($letto.browser) { $pref.browser = [string]$letto.browser }
    if ($null -ne $letto.riapri) { $pref.riapri = [bool]$letto.riapri }
  }
} catch { }

function Save-Pref {
  try {
    if (-not (Test-Path $cartella)) { New-Item -ItemType Directory -Path $cartella | Out-Null }
    ($pref | ConvertTo-Json) | Set-Content -Path $filePref -Encoding UTF8
  } catch { }
}

# Dal browser che interroga il ponte capisce con quale aprire l'app
# (i dati dell'app sono salvati nel browser, quindi deve essere lo stesso).
function Get-BrowserDaUserAgent([string]$ua) {
  if ($ua -match 'Edg/') { return 'msedge' }
  if ($ua -match 'OPR/|Opera') { return '' }
  if ($ua -match 'Chrome/') { return 'chrome' }
  return ''
}

# Apre l'app in una finestra a sé (senza schede), nello stesso browser in cui la usi.
function Open-App {
  if (-not $UrlApp -or $TitoliTest) { return }
  try {
    if ($pref.browser) { Start-Process $pref.browser -ArgumentList "--app=$UrlApp"; return }
  } catch { }
  Start-Process $UrlApp
}

# Porta in primo piano la finestra dell'app se è aperta, altrimenti la apre.
function Show-App {
  $trovata = $false
  try { $trovata = [OreCommesse.Win]::Riporta('Ore Commesse') } catch { }
  if (-not $trovata) { Open-App }
}

# ---------- Icona nell'area di notifica (vicino all'orologio) ----------

$icona = $null
$pompaEventi = $null   # fa rispondere l'icona ai clic (solo su Windows)
$testoIcona = 'Ore Commesse'
# Il codice dell'icona sta in un blocco a parte: viene preparato ed eseguito solo su Windows.
$creaIcona = {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $icona = New-Object System.Windows.Forms.NotifyIcon
    $png = Join-Path $PSScriptRoot 'icona.png'
    $icona.Icon = if (Test-Path $png) { [System.Drawing.Icon]::FromHandle(([System.Drawing.Bitmap]::new($png)).GetHicon()) } else { [System.Drawing.SystemIcons]::Application }
    $icona.Text = $testoIcona
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $voceApri = $menu.Items.Add('Apri Ore Commesse')
    $voceApri.Font = New-Object System.Drawing.Font($voceApri.Font, [System.Drawing.FontStyle]::Bold)
    $voceApri.add_Click({ Show-App })
    $voceRiapri = New-Object System.Windows.Forms.ToolStripMenuItem('Riapri l''app se la chiudo mentre lavoro in Revit')
    $voceRiapri.Checked = $pref.riapri
    $voceRiapri.CheckOnClick = $true
    $voceRiapri.add_Click({ $pref.riapri = $voceRiapri.Checked; Save-Pref })
    [void]$menu.Items.Add($voceRiapri)
    [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    $voceEsci = $menu.Items.Add('Chiudi il ponte Revit')
    $voceEsci.add_Click({ $script:esci = $true })
    $icona.ContextMenuStrip = $menu
    $icona.add_MouseClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Show-App } })
    $icona.Visible = $true
    $pompaEventi = { [System.Windows.Forms.Application]::DoEvents() }
  } catch {
    $icona = $null
  }
}
if ($suWindows -and -not $TitoliTest) { . $creaIcona }

function Set-TestoIcona([string]$t) {
  if (-not $icona) { return }
  if (-not $t) { $t = 'Ore Commesse' }
  if ($t.Length -gt 63) { $t = $t.Substring(0, 62) + '…' }
  if ($t -ne $script:testoIcona) { $script:testoIcona = $t; $icona.Text = $t }
}

# ---------- Server locale ----------

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Porta)
try {
  $listener.Start()
} catch {
  Write-Host "Porta $Porta già in uso: il ponte Revit è probabilmente già in esecuzione."
  if ($icona) { $icona.Dispose() }
  exit 0
}
Write-Host "Ponte Revit attivo su http://127.0.0.1:$Porta/stato  (Ctrl+C per chiudere)"

$ultimaRichiesta = [datetime]::MinValue
$ultimaControllo = [datetime]::MinValue
$ultimaAttivita = [datetime]::MinValue
$ultimaRiapertura = [datetime]::MinValue
$pidVisti = @{}
$esci = $false

try {
  while (-not $esci) {
    if ($pompaEventi) { & $pompaEventi }
    if (-not $listener.Pending()) {
      Start-Sleep -Milliseconds 200
      if (((Get-Date) - $ultimaAttivita).TotalSeconds -ge 1) {
        $ultimaAttivita = Get-Date
        try { Update-Attivita } catch { }
      }
      if (((Get-Date) - $ultimaControllo).TotalSeconds -ge 5) {
        $ultimaControllo = Get-Date
        $finestre = @(Get-FinestreRevit)
        foreach ($f in $finestre) {
          if (-not $pidVisti.ContainsKey($f.Id)) {
            $pidVisti[$f.Id] = $true
            $attivita[[int]$f.Id] = Get-Date   # aprire Revit conta come attività
          }
        }
        # Un modello è aperto ma l'app non si fa sentire da 3 minuti: è chiusa, la riapre
        # (al massimo ogni 10 minuti, e solo se la riapertura è attiva).
        $conModello = @($finestre | Where-Object { Get-NomeModello $_.Titolo })
        if ($conModello.Count -and $pref.riapri -and
            ((Get-Date) - $ultimaRichiesta).TotalMinutes -ge 3 -and
            ((Get-Date) - $ultimaRiapertura).TotalMinutes -ge 10) {
          $ultimaRiapertura = Get-Date
          Open-App
        }
        if (((Get-Date) - $ultimaRichiesta).TotalMinutes -ge 3) { Set-TestoIcona 'Ore Commesse (app chiusa)' }
      }
      continue
    }
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 2000
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $riga = $reader.ReadLine()
      $ua = ''
      while ($true) {
        $h = $reader.ReadLine()
        if ($null -eq $h -or $h -eq '') { break }
        if ($h -match '^User-Agent:\s*(.*)$') { $ua = $Matches[1] }
      }
      $metodo, $percorso = ($riga -split ' ')[0, 1]
      if ($metodo -eq 'OPTIONS') {
        Send-Risposta $stream 204 ''
      } elseif ($percorso -like '/stato*') {
        $ultimaRichiesta = Get-Date
        $b = Get-BrowserDaUserAgent $ua
        if ($b -and $b -ne $pref.browser) { $pref.browser = $b; Save-Pref }
        # ?t=... testo da mostrare sull'icona (es. il timer in corso)
        if ($percorso -match '[?&]t=([^&]*)') { Set-TestoIcona ([Uri]::UnescapeDataString($Matches[1].Replace('+', ' '))) }
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
} finally {
  $listener.Stop()
  if ($icona) { $icona.Visible = $false; $icona.Dispose() }
}
