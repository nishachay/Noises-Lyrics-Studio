$f = "e:\noises lyric\public\index.html"
$lines = Get-Content $f -Encoding UTF8
$kept = $lines[0..329] + $lines[429..($lines.Count - 1)]
Set-Content -Path $f -Value $kept -Encoding UTF8
Write-Host "Done. Total lines: $($kept.Count)"
