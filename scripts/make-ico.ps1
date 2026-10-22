Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::new(48, 48)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 12, 18, 16))
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
$g.FillRectangle($brush, 10, 10, 28, 28)
$inner = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$g.FillRectangle($inner, 18, 18, 12, 12)
$core = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 5, 150, 105))
$g.FillRectangle($core, 21, 21, 6, 6)
$g.Dispose()

$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create("desktop\app.ico")
$icon.Save($fs)
$fs.Close()

$fs2 = [System.IO.File]::Create("frontend\public\favicon.ico")
$icon.Save($fs2)
$fs2.Close()
Write-Host "Icons generated successfully!"
