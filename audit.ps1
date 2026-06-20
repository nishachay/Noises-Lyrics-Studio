$html = Get-Content "e:\noises lyric\public\index.html" -Raw
$js = Get-Content "e:\noises lyric\public\app.js" -Raw

# Extract all IDs used in JS via $('...')
$matches = [regex]::Matches($js, '\$\(\''([^'']+)\''\)')
$jsIds = $matches | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique

# Check which ones are missing from HTML
$missing = @()
foreach ($id in $jsIds) {
    if ($html -notmatch "id=""$id""") {
        $missing += $id
    }
}

Write-Host "=== IDs used in JS but MISSING from HTML ==="
$missing | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Total JS IDs checked: $($jsIds.Count)"
Write-Host "Missing: $($missing.Count)"
