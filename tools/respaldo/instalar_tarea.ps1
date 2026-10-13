# Registra (o actualiza) la tarea diaria de respaldo para el usuario actual. No requiere administrador.
# Uso:  powershell -ExecutionPolicy Bypass -File instalar_tarea.ps1 [-Hora 13:00] [-Destino "<carpeta>"]
# Si la PC esta apagada a esa hora, el respaldo corre apenas se encienda (StartWhenAvailable).
param(
  [string]$Hora = '13:00',
  [string]$Destino = ("$env:USERPROFILE\Dropbox\TEQUE CHEVERE INTERNACIONAL, S.A\DEPARTAMENTOS\Calidad e Inocuidad\" +
                      "Respaldos app Calidad Ch$([char]0xE9)vere")
)

$py = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = "$env:LOCALAPPDATA\Programs\Python\Python313\pythonw.exe" }
if (-not (Test-Path $py)) { throw "No encuentro pythonw.exe; instala Python o ajusta la ruta en este script." }
$script = Join-Path $PSScriptRoot 'respaldo.py'

$accion = New-ScheduledTaskAction -Execute $py -Argument "`"$script`" --destino `"$Destino`"" -WorkingDirectory $PSScriptRoot
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName 'Respaldo Calidad Chevere' -Action $accion -Trigger $disparador -Settings $ajustes `
  -Description 'Copia diaria de la base de la app de calidad (Supabase) a Dropbox. Ver tools/respaldo/README.md.' -Force |
  Out-Null
Write-Output "Tarea 'Respaldo Calidad Chevere' registrada: todos los dias a las $Hora -> $Destino"
