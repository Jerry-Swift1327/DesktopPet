param(
  [ValidateSet("dog", "cat", "shorthair", "tabby", "brit", "pomeranian")]
  [string]$PetVariant = "dog"
)

$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $appRoot
$electronDist = Join-Path $appRoot "node_modules\electron\dist"
$electronExe = Join-Path $electronDist "electron.exe"
$appIcon = Join-Path $projectRoot "app_icon.ico"
$rceditExe = Join-Path $appRoot "node_modules\rcedit\bin\rcedit-x64.exe"
$petVariantsModule = (Join-Path $appRoot "electron\pet-variants.cjs") -replace '\\', '/'
$buildProfileJson = & node -e "const { getWindowsBuildProfile } = require(process.argv[1]); process.stdout.write(JSON.stringify(getWindowsBuildProfile(process.argv[2], 'release')));" $petVariantsModule $PetVariant
if ($LASTEXITCODE -ne 0) {
  throw "Could not read Windows build profile for $PetVariant."
}
$buildProfile = $buildProfileJson | ConvertFrom-Json
$releaseOutput = $buildProfile.output
$releaseRoot = Join-Path $appRoot ($releaseOutput -replace '/', '\')
$outDir = Join-Path $releaseRoot "Chongban-win32-x64"
$legacyOutDirs = @(
  (Join-Path $releaseRoot "PetMate-win32-x64"),
  (Join-Path $releaseRoot "PawPal-win32-x64")
)
$resourcesDir = Join-Path $outDir "resources"
$appDir = Join-Path $resourcesDir "app"
$assetsOut = Join-Path $resourcesDir "assets"
$assetsRoot = Join-Path $projectRoot "assets"
$soundsOut = Join-Path $assetsOut "sounds"
$displayName = [string]::Concat([char]0x5BA0, [char]0x4F34)
$appVersion = "1.0.0"
$internalName = "Chongban"
$exeDisplayName = "$displayName $($buildProfile.deliveryVersion)"
$releasedExeName = "$exeDisplayName.exe"
$reuseExistingRuntime = $false

function Copy-RuntimeTree {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,
    [Parameter(Mandatory = $true)]
    [string]$DestinationRoot
  )

  New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
  Get-ChildItem -LiteralPath $SourceRoot -Force | ForEach-Object {
    $target = Join-Path $DestinationRoot $_.Name
    if ($_.PSIsContainer) {
      Copy-RuntimeTree -SourceRoot $_.FullName -DestinationRoot $target
      return
    }

    try {
      Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    } catch {
      Write-Warning "Could not copy runtime file: $target"
      Write-Warning $_.Exception.Message
    }
  }
}

if (!(Test-Path $electronExe)) {
  throw "Electron runtime was not found. Run npm.cmd install inside electron-app first."
}

if (!(Test-Path $appIcon)) {
  throw "Application icon was not found: $appIcon"
}

if (Test-Path $outDir) {
  try {
    Remove-Item -LiteralPath $outDir -Recurse -Force
  } catch {
    $reuseExistingRuntime = $true
    Write-Warning "Could not fully remove existing release directory because it is in use: $outDir"
    Write-Warning $_.Exception.Message
  }
}
foreach ($legacyOutDir in $legacyOutDirs) {
  if (Test-Path $legacyOutDir) {
    try {
      Remove-Item -LiteralPath $legacyOutDir -Recurse -Force
    } catch {
      Write-Warning "Could not remove legacy release directory because it is in use: $legacyOutDir"
      Write-Warning $_.Exception.Message
    }
  }
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (!$reuseExistingRuntime -or !(Test-Path $outDir)) {
  Copy-Item -LiteralPath $electronDist -Destination $outDir -Recurse -Force
} else {
  Copy-RuntimeTree -SourceRoot $electronDist -DestinationRoot $outDir
}

$releasedElectronExe = Join-Path $outDir "electron.exe"
$releasedAppExe = Join-Path $outDir $releasedExeName
if (Test-Path $releasedAppExe) {
  try {
    Remove-Item -LiteralPath $releasedAppExe -Force
  } catch {
    throw "Could not replace $releasedAppExe. Close the running app and package again. $($_.Exception.Message)"
  }
}
Copy-Item -LiteralPath $electronExe -Destination $releasedAppExe -Force
if (Test-Path $releasedElectronExe) {
  Remove-Item -LiteralPath $releasedElectronExe -Force
}

New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null
$variantConfigPath = Join-Path $resourcesDir "pet_variant.json"
$variantConfigJson = @{ variant = $PetVariant; channel = "release" } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($variantConfigPath, $variantConfigJson, [System.Text.UTF8Encoding]::new($false))

if (Test-Path $rceditExe) {
  & $rceditExe $releasedAppExe `
    --set-icon $appIcon `
    --set-version-string FileDescription $exeDisplayName `
    --set-version-string ProductName $displayName `
    --set-version-string InternalName $internalName `
    --set-version-string OriginalFilename $releasedExeName `
    --set-file-version $appVersion `
    --set-product-version $appVersion
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to apply Windows icon and metadata to $releasedAppExe"
  }
} else {
  Write-Warning "rcedit.exe was not found; exe icon metadata was not updated."
}

if (Test-Path $appDir) {
  Remove-Item -LiteralPath $appDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item -LiteralPath (Join-Path $appRoot "electron") -Destination $appDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $appRoot "static") -Destination $appDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $appRoot "package.json") -Destination (Join-Path $appDir "package.json") -Force
foreach ($iconName in @("appIcon.ico", "app_icon.ico")) {
  $iconPath = Join-Path $resourcesDir $iconName
  if (Test-Path $iconPath) {
    Remove-Item -LiteralPath $iconPath -Force
  }
}
Copy-Item -LiteralPath $appIcon -Destination (Join-Path $resourcesDir "app_icon.ico") -Force

if (Test-Path $assetsOut) {
  Remove-Item -LiteralPath $assetsOut -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $assetsOut "animations") | Out-Null

$animationFolders = @($buildProfile.animationFolders)
foreach ($folder in $animationFolders) {
  $source = Join-Path $assetsRoot "animations\$folder"
  $target = Join-Path $assetsOut "animations\$folder"
  $transparentFrames = Join-Path $source "transparent_frames"
  $loopMetadata = Join-Path $source "loop.json"

  if (!(Test-Path $transparentFrames)) {
    throw "Missing transparent frames for $folder. Run tools\process_pet_videos.py first."
  }

  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -LiteralPath $transparentFrames -Destination $target -Recurse -Force
  if (Test-Path $loopMetadata) {
    Copy-Item -LiteralPath $loopMetadata -Destination (Join-Path $target "loop.json") -Force
  }
}

$manifestName = $buildProfile.manifestName
$manifest = Join-Path $assetsRoot "animations\$manifestName"
if (Test-Path $manifest) {
  Copy-Item -LiteralPath $manifest -Destination (Join-Path $assetsOut "animations\$manifestName") -Force
}

$variantSounds = Join-Path $assetsRoot "sounds\$PetVariant"
if (Test-Path $variantSounds) {
  New-Item -ItemType Directory -Force -Path $soundsOut | Out-Null
  Copy-Item -LiteralPath $variantSounds -Destination (Join-Path $soundsOut $PetVariant) -Recurse -Force
}

Write-Host "Built Electron portable app:"
Write-Host $releasedAppExe
