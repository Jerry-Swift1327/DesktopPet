param(
  [ValidateSet("dog", "cat", "shorthair", "tabby", "brit", "bshmitted", "van", "pomeranian")]
  [string]$PetVariant = "dog",
  [ValidateSet("release", "installer")]
  [string]$PetChannel = "release"
)

$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $appRoot
try {
  & node prepare-runtime-assets.cjs --pet-variant=$PetVariant --pet-channel=$PetChannel
  if ($LASTEXITCODE -ne 0) {
    throw "prepare-runtime-assets.cjs failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
