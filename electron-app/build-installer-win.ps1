param(
  [string]$PetVariant = "pet2601"
)

$ErrorActionPreference = "Stop"

if (-not ($IsWindows -or $env:OS -eq "Windows_NT")) {
  throw "Windows package must be built on Windows."
}

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageJsonPath = Join-Path $appRoot "package.json"
$rceditExe = Join-Path $appRoot "node_modules\rcedit\bin\rcedit-x64.exe"
$appIcon = Join-Path $appRoot "build\app_icon.ico"
$installerVariantInclude = Join-Path $appRoot "build\installer-variant.nsh"
$petVariantsModule = (Join-Path $appRoot "electron\pet-variants.cjs") -replace '\\', '/'
$buildProfileJson = & node -e "const { getWindowsBuildProfile } = require(process.argv[1]); process.stdout.write(JSON.stringify(getWindowsBuildProfile(process.argv[2], 'installer')));" $petVariantsModule $PetVariant
if ($LASTEXITCODE -ne 0) {
  throw "Could not read Windows build profile for $PetVariant."
}
$buildProfile = $buildProfileJson | ConvertFrom-Json
$resolvedPetVariant = $buildProfile.variant
$installerOutput = $buildProfile.output
$installerRoot = Join-Path $appRoot ($installerOutput -replace '/', '\')
$packagedOutputRelative = ".tmp/installer-prepackaged-$([guid]::NewGuid().ToString('N'))"
$packagedRoot = Join-Path $appRoot ($packagedOutputRelative -replace '/', '\')
$unpackedRoot = Join-Path $packagedRoot "win-unpacked"
$displayName = [string]::Concat([char]0x5BA0, [char]0x4F34)
$appVersion = "1.0.0"
$internalName = "Chongban"
$exeDisplayName = "$displayName $($buildProfile.deliveryVersion)"
$installDirName = "$internalName $($buildProfile.deliveryVersion)"
$unpackedExe = Join-Path $unpackedRoot "$exeDisplayName.exe"
$builderCache = Join-Path $appRoot ".electron-builder-cache"
$tmpRoot = Join-Path $appRoot ".tmp"

function Remove-SafeDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (!(Test-Path $Path)) {
    return
  }

  $resolvedAppRoot = [System.IO.Path]::GetFullPath($appRoot).TrimEnd('\')
  $resolvedTarget = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  if ($resolvedTarget -eq $resolvedAppRoot -or !$resolvedTarget.StartsWith("$resolvedAppRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove directory outside app root: $resolvedTarget"
  }

  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

function Remove-InstallerSidecars {
  Get-ChildItem -LiteralPath $installerRoot -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Extension -eq ".blockmap" -or $_.Name -eq "builder-debug.yml"
  } | Remove-Item -Force

  Remove-SafeDirectory -Path (Join-Path $installerRoot "win-unpacked")
}

function Restore-Source {
  param(
    [string]$PackageJsonContent
  )

  if ($null -ne $PackageJsonContent) {
    [System.IO.File]::WriteAllText($packageJsonPath, $PackageJsonContent, [System.Text.UTF8Encoding]::new($false))
  }
  if (Test-Path $installerVariantInclude) {
    Remove-Item -LiteralPath $installerVariantInclude -Force
  }
}

function Write-InstallerVariantInclude {
  param(
    [string]$Variant,
    [string]$InstallDirName
  )

  $lines = @("!define PET_VARIANT `"$Variant`"")
  $lines += "!define PET_INSTALL_DIR_NAME `"$InstallDirName`""
  $lines += "!define PET_EXE_DISPLAY_NAME `"$exeDisplayName`""
  if ($buildProfile.autoStartAvailable) {
    $lines += "!define PET_AUTO_START_REGISTRY_KEY `"$($buildProfile.autoStartRegistryKey)`""
    $lines += "!define PET_AUTO_START_AVAILABLE"
  }

  [System.IO.File]::WriteAllText($installerVariantInclude, ($lines -join "`r`n") + "`r`n", [System.Text.UTF8Encoding]::new($false))
}

function Get-InstallerPackageJson {
  param(
    [string]$PackageJsonContent,
    [string]$Output
  )

  $package = $PackageJsonContent | ConvertFrom-Json
  $package.build.appId = $buildProfile.appId
  $package.build.productName = $exeDisplayName
  $package.build.executableName = $exeDisplayName
  $package.build.directories.output = $Output
  $package.build.win.artifactName = "$exeDisplayName.`${ext}"
  $package.build.nsis.artifactName = "$exeDisplayName.`${ext}"
  $package.build.nsis.shortcutName = $exeDisplayName
  $package.build.nsis.uninstallDisplayName = $exeDisplayName
  $package.build.nsis | Add-Member -NotePropertyName guid -NotePropertyValue $buildProfile.installerGuid -Force
  return $package | ConvertTo-Json -Depth 20
}

New-Item -ItemType Directory -Force -Path $builderCache | Out-Null
New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
New-Item -ItemType Directory -Force -Path $installerRoot | Out-Null
Get-ChildItem -LiteralPath $installerRoot -File | Where-Object {
  $_.Extension -in @(".exe", ".blockmap") -or $_.Name -eq "builder-debug.yml"
} | Remove-Item -Force
Remove-SafeDirectory -Path (Join-Path $installerRoot "win-unpacked")

if (!(Test-Path $rceditExe)) {
  throw "rcedit was not found: $rceditExe"
}
if (!(Test-Path $appIcon)) {
  throw "Installer icon was not found: $appIcon"
}

$env:ELECTRON_BUILDER_CACHE = $builderCache
$env:LOCALAPPDATA = $tmpRoot
$env:APPDATA = $tmpRoot

$originalPackageJson = [System.IO.File]::ReadAllText($packageJsonPath, [System.Text.Encoding]::UTF8)

try {
  Write-InstallerVariantInclude -Variant $resolvedPetVariant -InstallDirName $installDirName

  $installerPackageJson = Get-InstallerPackageJson -PackageJsonContent $originalPackageJson -Output $packagedOutputRelative
  [System.IO.File]::WriteAllText($packageJsonPath, $installerPackageJson, [System.Text.UTF8Encoding]::new($false))

  Push-Location $appRoot
  try {
    & powershell -ExecutionPolicy Bypass -File prepare-runtime-assets.ps1 -PetVariant $resolvedPetVariant -PetChannel installer
    if ($LASTEXITCODE -ne 0) {
      throw "prepare:runtime-assets failed with exit code $LASTEXITCODE"
    }

    & npx.cmd electron-builder --win dir --x64
    if ($LASTEXITCODE -ne 0) {
      throw "electron-builder dir failed with exit code $LASTEXITCODE"
    }
    if (!(Test-Path $unpackedExe)) {
      throw "Unpacked executable was not found: $unpackedExe"
    }

    & $rceditExe $unpackedExe `
      --set-icon $appIcon `
      --set-version-string FileDescription $exeDisplayName `
      --set-version-string ProductName $exeDisplayName `
      --set-version-string InternalName $internalName `
      --set-version-string OriginalFilename "$exeDisplayName.exe" `
      --set-file-version $appVersion `
      --set-product-version $appVersion
    if ($LASTEXITCODE -ne 0) {
      throw "rcedit failed with exit code $LASTEXITCODE"
    }

    $installerPackageJson = Get-InstallerPackageJson -PackageJsonContent $originalPackageJson -Output $installerOutput
    [System.IO.File]::WriteAllText($packageJsonPath, $installerPackageJson, [System.Text.UTF8Encoding]::new($false))

    & npx.cmd electron-builder --win nsis --x64 --prepackaged $unpackedRoot
    if ($LASTEXITCODE -ne 0) {
      throw "electron-builder nsis failed with exit code $LASTEXITCODE"
    }

    Remove-InstallerSidecars
  } finally {
    Pop-Location
  }
} finally {
  Restore-Source -PackageJsonContent $originalPackageJson
  Remove-SafeDirectory -Path $packagedRoot
}
