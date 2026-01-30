param(
  [Parameter(Mandatory=$true)][string]$ExePath,
  [Parameter(Mandatory=$false)][string]$Scheme = "facturetn-agent"
)

$protocol = $Scheme
$base = "HKCU:\Software\Classes\$protocol"

New-Item -Path $base -Force | Out-Null
Set-ItemProperty -Path $base -Name "(Default)" -Value "URL:FactureTN Agent Protocol"
Set-ItemProperty -Path $base -Name "URL Protocol" -Value ""

New-Item -Path "$base\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$base\DefaultIcon" -Name "(Default)" -Value "`"$ExePath`",1"

New-Item -Path "$base\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$base\shell\open\command" -Name "(Default)" -Value "`"$ExePath`" `"%1`""

Write-Host "OK: protocole $protocol enregistré pour $ExePath"
