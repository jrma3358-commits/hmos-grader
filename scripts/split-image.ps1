# 이미지를 위·아래 두 장으로 자른다 (겹침 영역 포함). OCR 해상도를 높이기 위한 것.
# 사용: powershell -File scripts/split-image.ps1 <입력.png> <위.png> <아래.png> [겹침px]
param([string]$In, [string]$Top, [string]$Bottom, [int]$Overlap = 80)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path $In))
try {
  $half = [int]($img.Height / 2)
  $parts = @(
    @{ Path = $Top; Y = 0; H = [Math]::Min($img.Height, $half + $Overlap) },
    @{ Path = $Bottom; Y = [Math]::Max(0, $half - $Overlap); H = $img.Height - [Math]::Max(0, $half - $Overlap) }
  )
  foreach ($p in $parts) {
    $bmp = New-Object System.Drawing.Bitmap $img.Width, $p.H
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $img.Width, $p.H), (New-Object System.Drawing.Rectangle 0, $p.Y, $img.Width, $p.H), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $bmp.Save($p.Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  }
} finally { $img.Dispose() }
