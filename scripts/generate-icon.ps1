Add-Type -AssemblyName System.Drawing

function Draw-BlockHarborIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = $size / 48.0

    # Top face
    $topPoints = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF(24.0 * $s, 4.0 * $s)),
        (New-Object System.Drawing.PointF(42.0 * $s, 14.5 * $s)),
        (New-Object System.Drawing.PointF(24.0 * $s, 25.0 * $s)),
        (New-Object System.Drawing.PointF(6.0 * $s, 14.5 * $s))
    )
    $topBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 211, 153))
    $g.FillPolygon($topBrush, $topPoints)

    # Left face
    $leftPoints = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF(6.0 * $s, 14.5 * $s)),
        (New-Object System.Drawing.PointF(24.0 * $s, 25.0 * $s)),
        (New-Object System.Drawing.PointF(24.0 * $s, 44.0 * $s)),
        (New-Object System.Drawing.PointF(6.0 * $s, 33.5 * $s))
    )
    $leftBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 5, 150, 105))
    $g.FillPolygon($leftBrush, $leftPoints)

    # Right face
    $rightPoints = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF(24.0 * $s, 25.0 * $s)),
        (New-Object System.Drawing.PointF(42.0 * $s, 14.5 * $s)),
        (New-Object System.Drawing.PointF(42.0 * $s, 33.5 * $s)),
        (New-Object System.Drawing.PointF(24.0 * $s, 44.0 * $s))
    )
    $rightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 4, 120, 87))
    $g.FillPolygon($rightBrush, $rightPoints)

    # Inner Top Face Inset
    $innerTopPoints = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF(24.0 * $s, 7.5 * $s)),
        (New-Object System.Drawing.PointF(37.5 * $s, 15.0 * $s)),
        (New-Object System.Drawing.PointF(24.0 * $s, 22.5 * $s)),
        (New-Object System.Drawing.PointF(10.5 * $s, 15.0 * $s))
    )
    $innerTopBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 110, 231, 183))
    $g.FillPolygon($innerTopBrush, $innerTopPoints)

    # Center Beacon Diamond (White)
    $beaconPoints = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF(24.0 * $s, 16.0 * $s)),
        (New-Object System.Drawing.PointF(28.0 * $s, 21.0 * $s)),
        (New-Object System.Drawing.PointF(24.0 * $s, 26.0 * $s)),
        (New-Object System.Drawing.PointF(20.0 * $s, 21.0 * $s))
    )
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPolygon($whiteBrush, $beaconPoints)

    # Core Beacon (Emerald)
    $corePoints = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF(24.0 * $s, 18.5 * $s)),
        (New-Object System.Drawing.PointF(26.0 * $s, 21.0 * $s)),
        (New-Object System.Drawing.PointF(24.0 * $s, 23.5 * $s)),
        (New-Object System.Drawing.PointF(22.0 * $s, 21.0 * $s))
    )
    $emeraldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
    $g.FillPolygon($emeraldBrush, $corePoints)

    $g.Dispose()
    return $bmp
}

$icon256 = Draw-BlockHarborIcon 256
$icon256.Save("desktop\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon256.Save("frontend\public\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)

$sizes = @(16, 32, 48, 64, 128, 256)
$bitmaps = @($sizes | ForEach-Object { Draw-BlockHarborIcon $_ })

function Save-Ico($bitmaps, $outputPath) {
    $fs = [System.IO.File]::Create($outputPath)
    $bw = New-Object System.IO.BinaryWriter($fs)
    
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$bitmaps.Count)

    $offset = 6 + (16 * $bitmaps.Count)
    $pngStreams = @()

    foreach ($b in $bitmaps) {
        $ms = New-Object System.IO.MemoryStream
        $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $ms.ToArray()
        $pngStreams += ,$bytes

        $w = if ($b.Width -ge 256) { 0 } else { [byte]$b.Width }
        $h = if ($b.Height -ge 256) { 0 } else { [byte]$b.Height }

        $bw.Write($w)
        $bw.Write($h)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$bytes.Length)
        $bw.Write([uint32]$offset)

        $offset += $bytes.Length
    }

    foreach ($bytes in $pngStreams) {
        $bw.Write($bytes)
    }

    $bw.Flush()
    $fs.Close()
}

Save-Ico $bitmaps "desktop\app.ico"
Save-Ico $bitmaps "frontend\public\favicon.ico"
Write-Host "BlockHarbor icons created successfully!"
