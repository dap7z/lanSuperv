# Ping Monitor en powershell
# cd T:\GITLAB\lanSuperv\_dev\scripts
# .\ping-monitor.ps1 -Target "8.8.8.8" -Interval 30

param(
    [string]$Target = "8.8.8.8",
    [string]$LogFile = "ping_history.csv",
    [int]$Interval = 30,
    [int]$Packets = 10
)


# Créer en-tête CSV si fichier n'existe pas
if (-not (Test-Path $LogFile)) {
    "Timestamp,Packet_Loss_Percent,Latency_ms,Status" | Out-File -FilePath $LogFile -Encoding UTF8
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Ping Monitor - $Target" -ForegroundColor Cyan
Write-Host "  Appuyez Ctrl+C pour arreter" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    try {
        # Ping avec 10 paquets
        $pingResult = Test-Connection -ComputerName $Target -Count $Packets -ErrorAction SilentlyContinue
        
        if ($pingResult) {
            # Calculer la perte de paquets
            $received = $pingResult.Count
            $loss = [math]::Round((($Packets - $received) / $Packets) * 100, 1)
            
            # Calculer la latence moyenne
            $avgRtt = [math]::Round(($pingResult | Measure-Object -Property ResponseTime -Average).Average, 0)
            
            # Déterminer le statut
            $status = "OK"
            if ($loss -gt 10) { $status = "ATTENTION" }
            if ($loss -gt 50) { $status = "FAIL" }
            if ($avgRtt -gt 100) { $status = "ATTENTION" }
            if ($avgRtt -gt 200) { $status = "FAIL" }
            
            # Log CSV
            "$timestamp,$loss,$avgRtt,$status" | Out-File -FilePath $LogFile -Append -Encoding UTF8
            
            # Affichage console
            Clear-Host
            Write-Host "================================================" -ForegroundColor Cyan
            Write-Host "  Ping Monitor - $Target ($timestamp)" -ForegroundColor Cyan
            Write-Host "================================================" -ForegroundColor Cyan
            Write-Host "Perte paquets : " -NoNewline
            if ($loss -gt 50) {
                Write-Host "$loss%" -ForegroundColor Red
            } elseif ($loss -gt 10) {
                Write-Host "$loss%" -ForegroundColor Yellow
            } else {
                Write-Host "$loss%" -ForegroundColor Green
            }
            
            Write-Host "Latence moyenne : " -NoNewline
            if ($avgRtt -gt 200) {
                Write-Host "${avgRtt}ms" -ForegroundColor Red
            } elseif ($avgRtt -gt 100) {
                Write-Host "${avgRtt}ms" -ForegroundColor Yellow
            } else {
                Write-Host "${avgRtt}ms" -ForegroundColor Green
            }
            
            Write-Host "Statut : " -NoNewline
            if ($status -eq "FAIL") {
                Write-Host $status -ForegroundColor Red
            } elseif ($status -eq "ATTENTION") {
                Write-Host $status -ForegroundColor Yellow
            } else {
                Write-Host $status -ForegroundColor Green
            }
            Write-Host ""
            Write-Host "Historique : $LogFile" -ForegroundColor Gray
            Write-Host "Derniere mise a jour : $timestamp" -ForegroundColor Gray
            Write-Host "Appuyez Ctrl+C pour arreter" -ForegroundColor Yellow
            Write-Host "================================================" -ForegroundColor Cyan
        } else {
            # Échec complet du ping
            $loss = 100
            $avgRtt = -1
            $status = "FAIL"
            
            "$timestamp,$loss,$avgRtt,$status" | Out-File -FilePath $LogFile -Append -Encoding UTF8
            
            Clear-Host
            Write-Host "================================================" -ForegroundColor Cyan
            Write-Host "  Ping Monitor - $Target ($timestamp)" -ForegroundColor Cyan
            Write-Host "================================================" -ForegroundColor Cyan
            Write-Host "Perte paquets : " -NoNewline
            Write-Host "100%" -ForegroundColor Red
            Write-Host "Latence moyenne : " -NoNewline
            Write-Host "N/A" -ForegroundColor Red
            Write-Host "Statut : " -NoNewline
            Write-Host "FAIL" -ForegroundColor Red
            Write-Host ""
            Write-Host "Historique : $LogFile" -ForegroundColor Gray
            Write-Host "Derniere mise a jour : $timestamp" -ForegroundColor Gray
            Write-Host "Appuyez Ctrl+C pour arreter" -ForegroundColor Yellow
            Write-Host "================================================" -ForegroundColor Cyan
        }
    } catch {
        # Erreur lors du ping
        $loss = 100
        $avgRtt = -1
        $status = "ERROR"
        
        "$timestamp,$loss,$avgRtt,$status" | Out-File -FilePath $LogFile -Append -Encoding UTF8
        
        Write-Host "Erreur : $_" -ForegroundColor Red
    }
    
    # Rotation : garder l'en-tête et les 5000 dernières lignes de données
    $lines = Get-Content $LogFile | Measure-Object -Line
    if ($lines.Lines -gt 5001) {
        $content = Get-Content $LogFile
        $header = $content[0]
        $dataLines = $content[1..($content.Length - 1)]
        $lastDataLines = $dataLines[-5000..-1]
        ($header, $lastDataLines) | Out-File -FilePath $LogFile -Encoding UTF8
    }
    
    # Attendre avant le prochain ping
    Start-Sleep -Seconds $Interval
}
