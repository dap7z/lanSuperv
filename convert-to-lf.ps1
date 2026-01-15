# Script PowerShell pour convertir tous les fichiers de CRLF vers LF
# Usage: .\convert-to-lf.ps1

Write-Host "Conversion des fins de ligne CRLF vers LF..." -ForegroundColor Cyan
Write-Host "Repertoire de travail: $(Get-Location)" -ForegroundColor Yellow

# Extensions de fichiers a traiter
$extensions = @(
  "*.vue", "*.js", "*.ts", "*.json", "*.css", "*.scss", "*.html", "*.htm",
  "*.cs", "*.csproj", "*.sln", "*.md", "*.txt", "*.xml", "*.yaml", "*.yml",
  "*.bat", "*.sh", "*.ps1", "*.mdc", "*.config"
)

$totalFiles = 0
$convertedFiles = 0

foreach ($extension in $extensions) {
  Write-Host "Recherche des fichiers $extension..." -ForegroundColor Green

  $files = Get-ChildItem -Path . -Filter $extension -Recurse -File | Where-Object {
    $_.FullName -notlike "*\node_modules\*" -and
    $_.FullName -notlike "*\bin\*" -and
    $_.FullName -notlike "*\obj\*" -and
    $_.FullName -notlike "*\.git\*"
  }

  foreach ($file in $files) {
    $totalFiles++
    Write-Host "  Traitement: $($file.Name)" -ForegroundColor Gray

    try {
      # Lire le contenu du fichier
      $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8

      # Verifier si le fichier contient des CRLF
      if ($content -match "`r`n") {
        # Remplacer CRLF par LF
        $newContent = $content -replace "`r`n", "`n"

        # Ecrire le nouveau contenu
        Set-Content -Path $file.FullName -Value $newContent -NoNewline -Encoding UTF8

        $convertedFiles++
        Write-Host "    Converti: $($file.Name)" -ForegroundColor Green
      }
      else {
        Write-Host "    Deja en LF: $($file.Name)" -ForegroundColor Yellow
      }
    }
    catch {
      Write-Host "    Erreur: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

Write-Host "`nResume de la conversion:" -ForegroundColor Cyan
Write-Host "  Fichiers traites: $totalFiles" -ForegroundColor White
Write-Host "  Fichiers convertis: $convertedFiles" -ForegroundColor Green
Write-Host "  Fichiers deja en LF: $($totalFiles - $convertedFiles)" -ForegroundColor Yellow

if ($convertedFiles -gt 0) {
  Write-Host "`nConversion terminee avec succes!" -ForegroundColor Green
}
else {
  Write-Host "`nAucun fichier n'a necessite de conversion." -ForegroundColor Blue
}

Write-Host "`nPour eviter les conversions futures, assurez-vous que:" -ForegroundColor Cyan
Write-Host "  - .vscode/settings.json contient 'files.eol': '\n'" -ForegroundColor White
Write-Host "  - cursor/rules.mdc definit les regles de fin de ligne" -ForegroundColor White
Write-Host "  - Votre editeur est configure pour utiliser LF" -ForegroundColor White

Read-Host "`nAppuyez sur Entree pour continuer..."
