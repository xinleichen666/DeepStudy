Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(255, 247, 241, 230))

$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 176, 58, 46))
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 247, 241, 230))
$g.FillEllipse($bg, 18, 18, ($size - 36), ($size - 36))

$font = New-Object System.Drawing.Font('Microsoft YaHei UI', 118, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF 0, 10, $size, $size
$g.DrawString([char]0x7814, $font, $ink, $rect, $format)

$outDir = Join-Path $PSScriptRoot '..\electron'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir 'icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "wrote $out"
