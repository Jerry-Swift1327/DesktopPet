param(
  [ValidateSet("dog", "cat", "shorthair", "pomeranian")]
  [string]$PetVariant = "dog",
  [ValidateSet("release", "installer")]
  [string]$PetChannel = "release"
)

$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $appRoot
$sourceRoot = Join-Path $projectRoot "assets\animations"
$runtimeRoot = Join-Path $appRoot ".runtime-assets"
$runtimeAnimations = Join-Path $runtimeRoot "animations"
$animationFolders = @("${PetVariant}_squat", "${PetVariant}_walk", "${PetVariant}_feed", "${PetVariant}_ball")
$variantConfigPath = Join-Path $runtimeRoot "pet_variant.json"

if (Test-Path $runtimeRoot) {
  Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $runtimeAnimations | Out-Null
$variantConfigJson = @{ variant = $PetVariant; channel = $PetChannel } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($variantConfigPath, $variantConfigJson, [System.Text.UTF8Encoding]::new($false))

foreach ($folder in $animationFolders) {
  $sourceAction = Join-Path $sourceRoot $folder
  $sourceFrames = Join-Path $sourceAction "transparent_frames"
  $sourceLoop = Join-Path $sourceAction "loop.json"
  $targetAction = Join-Path $runtimeAnimations $folder

  if (!(Test-Path $sourceFrames)) {
    throw "Missing runtime transparent frames: $sourceFrames"
  }

  New-Item -ItemType Directory -Force -Path $targetAction | Out-Null
  Copy-Item -LiteralPath $sourceFrames -Destination $targetAction -Recurse -Force

  if (Test-Path $sourceLoop) {
    Copy-Item -LiteralPath $sourceLoop -Destination (Join-Path $targetAction "loop.json") -Force
  }
}

$manifest = Join-Path $sourceRoot "${PetVariant}_actions_manifest.json"
if (Test-Path $manifest) {
  Copy-Item -LiteralPath $manifest -Destination (Join-Path $runtimeAnimations "${PetVariant}_actions_manifest.json") -Force
}

Write-Host "Prepared runtime assets:"
Write-Host $runtimeRoot
