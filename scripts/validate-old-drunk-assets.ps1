$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '..\assets\npcs\old_drunk_healer'
$sets = @{ idle = 4; drink = 6; sway = 4; interact = 4; heal = 5; fx = 5 }
$problems = [System.Collections.Generic.List[string]]::new()
$dimensions = $null
foreach ($set in $sets.Keys) {
  $pattern = if ($set -eq 'fx') { 'heal_fx_*.png' } else { "$set`_*.png" }
  $files = @(Get-ChildItem (Join-Path $root $set) -Filter $pattern | Sort-Object Name)
  if ($files.Count -ne $sets[$set]) { $problems.Add("$set expected $($sets[$set]) frames, found $($files.Count)") }
  foreach ($file in $files) {
    $image = [System.Drawing.Bitmap]::new($file.FullName)
    if ($image.PixelFormat -notmatch 'Argb|PArgb') { $problems.Add("$($file.Name) is not RGBA") }
    if ($null -eq $dimensions) { $dimensions = "$($image.Width)x$($image.Height)" } elseif ($dimensions -ne "$($image.Width)x$($image.Height)") { $problems.Add("$($file.Name) dimensions differ") }
    $hasTransparency = $false
    for ($x = 0; $x -lt $image.Width -and -not $hasTransparency; $x += 8) { for ($y = 0; $y -lt $image.Height; $y += 8) { if ($image.GetPixel($x, $y).A -lt 255) { $hasTransparency = $true; break } } }
    if (-not $hasTransparency) { $problems.Add("$($file.Name) has no transparent alpha") }
    $image.Dispose()
  }
}
$report = @("# NPC Old Drunk Asset Report", "", "- Validation date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "- Required dimensions: $dimensions", "- Alpha: RGBA with transparent pixels verified", "- Frame counts: idle 4, drink 6, sway 4, interact 4, heal 5, FX 5", "- Result: $(if ($problems.Count) { 'FAILED' } else { 'PASS' })")
if ($problems.Count) { $report += ''; $report += '## Problems'; $report += $problems | ForEach-Object { "- $_" } }
$report | Set-Content (Join-Path $PSScriptRoot '..\docs\NPC_OLD_DRUNK_ASSET_REPORT.md') -Encoding utf8
if ($problems.Count) { throw ($problems -join '; ') }
