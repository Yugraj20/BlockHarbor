<#
.SYNOPSIS
    Builds the entire BlockHarbor Windows release locally on your machine.
.DESCRIPTION
    Compiles Frontend -> VFS -> Backend Single-File EXE -> Desktop WPF Host -> Inno Setup Installer & Portable ZIP.
#>

param(
    [switch]$SkipFrontend = $false,
    [switch]$SkipBackend = $false,
    [string]$PublishTag = ""
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  BlockHarbor Local Release Builder       " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Frontend & VFS
if (-not $SkipFrontend) {
    Write-Host "`n[1/5] Building Frontend & Generating VFS..." -ForegroundColor Yellow
    Push-Location "$RootDir\frontend"
    bun run build
    Pop-Location

    node "$RootDir\scripts\generate-vfs.js"
} else {
    Write-Host "`n[1/5] Skipping Frontend build..." -ForegroundColor DarkGray
}

# 2. Backend Bundle & Standalone Executable
if (-not $SkipBackend) {
    Write-Host "`n[2/5] Compiling Standalone Backend Executable..." -ForegroundColor Yellow
    Push-Location "$RootDir\backend"
    npm run build
    Pop-Location

    bun run "$RootDir\scripts\build.ts" -f -b --platform win
} else {
    Write-Host "`n[2/5] Skipping Backend build..." -ForegroundColor DarkGray
}

# 3. Desktop WPF Host
Write-Host "`n[3/5] Publishing Desktop Native Host..." -ForegroundColor Yellow
dotnet publish "$RootDir\desktop\BlockHarbor.Desktop.csproj" -c Release -r win-x64 --self-contained true -o "$RootDir\dist\desktop"
Copy-Item "$RootDir\dist\BlockHarbor-Backend.exe" "$RootDir\dist\desktop\BlockHarbor-Backend.exe" -Force
Copy-Item "$RootDir\desktop\app.ico" "$RootDir\dist\desktop\app.ico" -Force
Copy-Item "$RootDir\desktop\icon.png" "$RootDir\dist\desktop\icon.png" -Force

# 4. Inno Setup Installer
Write-Host "`n[4/5] Compiling Inno Setup Installer..." -ForegroundColor Yellow
$iscc = "C:\Program Files (x86)\Inno Setup 6\iscc.exe"
if (-not (Test-Path $iscc)) {
    $cmd = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if ($cmd) { $iscc = $cmd.Source }
}
if ($iscc) {
    & $iscc "$RootDir\scripts\installer.iss"
} else {
    Write-Warning "Inno Setup compiler (iscc.exe) not found. Skipping installer exe creation."
}

# 5. Portable ZIP & Checksums
Write-Host "`n[5/5] Packaging Portable ZIP & Generating Checksums..." -ForegroundColor Yellow
if (-not (Test-Path "$RootDir\dist\release")) {
    New-Item -ItemType Directory -Path "$RootDir\dist\release" -Force | Out-Null
}
Compress-Archive -Path "$RootDir\dist\desktop\*" -DestinationPath "$RootDir\dist\release\BlockHarbor-Portable-x64.zip" -Force

$hashes = Get-ChildItem -Path "$RootDir\dist\release" -Filter "BlockHarbor*" | ForEach-Object {
    $h = Get-FileHash -Path $_.FullName -Algorithm SHA256
    "$($h.Hash.ToLower())  $($_.Name)"
}
$hashes | Out-File -FilePath "$RootDir\dist\release\SHA256SUMS.txt" -Encoding ascii

Write-Host "`nRelease files ready in dist\release\:" -ForegroundColor Green
Get-ChildItem -Path "$RootDir\dist\release" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

if ($PublishTag) {
    Write-Host "`nPublishing directly to GitHub Release $PublishTag..." -ForegroundColor Cyan
    node "$RootDir\scripts\upload-release-assets.js" $PublishTag
}
