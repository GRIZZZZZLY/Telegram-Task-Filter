<#
.SYNOPSIS
    Converts any image (PNG/JPG/ICO) to a multi-size ICO required by electron-builder.
    Sizes packed: 16, 32, 48, 256 px.

.USAGE
    .\fix-icon.ps1                          # reads icon.ico from same folder
    .\fix-icon.ps1 -Input "C:\my-logo.png"  # from a custom source
#>
param(
    [string]$Input  = "$PSScriptRoot\icon.ico",
    [string]$Output = "$PSScriptRoot\icon.ico"
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Input)) {
    Write-Error "Source file not found: $Input"
    exit 1
}

$sizes = @(16, 32, 48, 256)

Write-Host "Reading source: $Input"
$source = [System.Drawing.Bitmap]::new($Input)

# ── Render each size as PNG bytes ──────────────────────────────────────────
$bitmaps = @()
foreach ($size in $sizes) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.Dispose()

    $ms = [System.IO.MemoryStream]::new()
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmaps += @{ size = $size; data = $ms.ToArray() }
    $bmp.Dispose()
    Write-Host "  rendered ${size}x${size}"
}
$source.Dispose()

# ── Assemble ICO binary ────────────────────────────────────────────────────
# ICO format: 6-byte header + N*16-byte directory + image data
$headerSize    = 6
$directorySize = $sizes.Count * 16
$dataOffset    = $headerSize + $directorySize

# Calculate offsets
$offset = $dataOffset
foreach ($b in $bitmaps) {
    $b.offset = $offset
    $offset  += $b.data.Length
}

$ms  = [System.IO.MemoryStream]::new()
$bw  = [System.IO.BinaryWriter]::new($ms)

# Header
$bw.Write([uint16]0)              # reserved
$bw.Write([uint16]1)              # type = ICO
$bw.Write([uint16]$sizes.Count)   # image count

# Directory entries
foreach ($b in $bitmaps) {
    $dim = if ($b.size -eq 256) { [byte]0 } else { [byte]$b.size }  # 0 = 256 in ICO spec
    $bw.Write($dim)               # width
    $bw.Write($dim)               # height
    $bw.Write([byte]0)            # color count (0 = no palette)
    $bw.Write([byte]0)            # reserved
    $bw.Write([uint16]1)          # planes
    $bw.Write([uint16]32)         # bit count
    $bw.Write([uint32]$b.data.Length)
    $bw.Write([uint32]$b.offset)
}

# Image data
foreach ($b in $bitmaps) {
    $bw.Write($b.data)
}

$bw.Flush()
[System.IO.File]::WriteAllBytes($Output, $ms.ToArray())

Write-Host ""
Write-Host "Done! ICO saved to: $Output"
Write-Host "Sizes: $($sizes -join ', ') px"
