param(
  [string]$Root = (Join-Path $PSScriptRoot "..\\assets\\enemies\\buffalo")
)

Add-Type -AssemblyName System.Drawing
$expected = @{
  "idle/down" = 4; "idle/up" = 4; "idle/side" = 4
  "walk/down" = 5; "walk/up" = 5; "walk/side" = 5
  "attack/down" = 6; "special_spin" = 8
}
$rows = foreach ($relative in $expected.Keys | Sort-Object) {
  $folder = Join-Path $Root $relative
  $files = @(Get-ChildItem -LiteralPath $folder -Filter "*.png" -File -ErrorAction SilentlyContinue | Sort-Object Name)
  $sizes = @(); $alphaValid = $true
  foreach ($file in $files) {
    $image = [System.Drawing.Bitmap]::FromFile($file.FullName)
    $sizes += "$($image.Width)x$($image.Height)"
    if (($image.PixelFormat -band [System.Drawing.Imaging.PixelFormat]::Alpha) -eq 0 -and ($image.PixelFormat -band [System.Drawing.Imaging.PixelFormat]::PAlpha) -eq 0) { $alphaValid = $false }
    $image.Dispose()
  }
  $dimensions = @($sizes | Select-Object -Unique)
  [PSCustomObject]@{
    Animation = $relative; FrameCount = $files.Count; Expected = $expected[$relative]
    Dimensions = ($dimensions -join ", "); Alpha = if ($alphaValid -and $files.Count) { "RGBA" } else { "INVALID" }
    Status = if ($files.Count -eq $expected[$relative] -and $dimensions.Count -eq 1 -and $alphaValid) { "PASS" } else { "FAIL" }
  }
}
$report = @("# Buffalo asset validation", "", "Generated: $(Get-Date -Format s)", "", "| Animation | Frames | Expected | Dimensions | Alpha | Status |", "|---|---:|---:|---|---|---|")
$report += $rows | ForEach-Object { "| $($_.Animation) | $($_.FrameCount) | $($_.Expected) | $($_.Dimensions) | $($_.Alpha) | $($_.Status) |" }
$report += "", 'Pivot convention: Phaser origin `0.5, 1.0` (feet baseline).'
$reportPath = Join-Path $PSScriptRoot "..\\docs\\BUFFALO_ASSET_REPORT.md"
Set-Content -LiteralPath $reportPath -Value $report -Encoding utf8
$rows | Format-Table -AutoSize
if ($rows.Status -contains "FAIL") { exit 1 }
