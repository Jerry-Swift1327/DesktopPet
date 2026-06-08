param(
  [int]$PetPid = 0,
  [string]$PetInternalName = "Chongban",
  [string]$TargetHwnd = ""
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class WindowSurfaces {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder className, int count);

  [DllImport("user32.dll")]
  public static extern IntPtr GetShellWindow();

  [DllImport("user32.dll")]
  public static extern IntPtr GetDesktopWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT placement);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT rect, int size);

  public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  public const int SW_SHOWMINIMIZED = 2;
  public const int SW_SHOWMAXIMIZED = 3;
  public const uint GW_OWNER = 4;

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct WINDOWPLACEMENT {
    public int length;
    public int flags;
    public int showCmd;
    public POINT minPosition;
    public POINT maxPosition;
    public RECT normalPosition;
  }
}
"@

$shellWindow = [WindowSurfaces]::GetShellWindow()
$desktopWindow = [WindowSurfaces]::GetDesktopWindow()
$items = New-Object System.Collections.Generic.List[object]
$targetHandle = [IntPtr]::Zero
if (-not [string]::IsNullOrWhiteSpace($TargetHwnd)) {
  $rawTarget = $TargetHwnd.Trim()
  $targetValue = 0L
  if ($rawTarget.StartsWith("0x", [System.StringComparison]::OrdinalIgnoreCase)) {
    $targetValue = [Convert]::ToInt64($rawTarget.Substring(2), 16)
  } else {
    $targetValue = [Convert]::ToInt64($rawTarget, 10)
  }
  if ($targetValue -gt 0) {
    $targetHandle = [IntPtr]::new($targetValue)
  }
}

$callback = {
  param([IntPtr]$hwnd, [IntPtr]$lParam)

  if ($targetHandle -ne [IntPtr]::Zero -and $hwnd -ne $targetHandle) {
    return $true
  }
  if ($hwnd -eq $shellWindow -or $hwnd -eq $desktopWindow) {
    return $true
  }
  if (-not [WindowSurfaces]::IsWindowVisible($hwnd)) {
    return $true
  }
  if ([WindowSurfaces]::GetWindow($hwnd, [WindowSurfaces]::GW_OWNER) -ne [IntPtr]::Zero) {
    return $true
  }

  $pidRef = [uint32]0
  [void][WindowSurfaces]::GetWindowThreadProcessId($hwnd, [ref]$pidRef)
  if ($PetPid -gt 0 -and [int]$pidRef -eq $PetPid) {
    return $true
  }

  $processName = ""
  try {
    $proc = Get-Process -Id ([int]$pidRef) -ErrorAction SilentlyContinue
    if ($proc) {
      $processName = [string]$proc.ProcessName
      if (-not [string]::IsNullOrWhiteSpace($PetInternalName) -and [string]$proc.MainModule.FileVersionInfo.InternalName -eq $PetInternalName) {
        return $true
      }
    }
  } catch {
    $processName = ""
  }

  $placement = New-Object WindowSurfaces+WINDOWPLACEMENT
  $placement.length = [Runtime.InteropServices.Marshal]::SizeOf([type][WindowSurfaces+WINDOWPLACEMENT])
  if (-not [WindowSurfaces]::GetWindowPlacement($hwnd, [ref]$placement)) {
    return $true
  }
  if ($placement.showCmd -eq [WindowSurfaces]::SW_SHOWMINIMIZED -or $placement.showCmd -eq [WindowSurfaces]::SW_SHOWMAXIMIZED) {
    return $true
  }

  $titleLength = [WindowSurfaces]::GetWindowTextLength($hwnd)
  if ($titleLength -le 0) {
    return $true
  }
  $titleBuilder = New-Object System.Text.StringBuilder ($titleLength + 1)
  [void][WindowSurfaces]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString().Trim()
  if ([string]::IsNullOrWhiteSpace($title)) {
    return $true
  }

  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][WindowSurfaces]::GetClassName($hwnd, $classBuilder, $classBuilder.Capacity)
  $className = $classBuilder.ToString().Trim()

  $rect = New-Object WindowSurfaces+RECT
  $dwmResult = [WindowSurfaces]::DwmGetWindowAttribute(
    $hwnd,
    [WindowSurfaces]::DWMWA_EXTENDED_FRAME_BOUNDS,
    [ref]$rect,
    [Runtime.InteropServices.Marshal]::SizeOf([type][WindowSurfaces+RECT])
  )
  if ($dwmResult -ne 0) {
    if (-not [WindowSurfaces]::GetWindowRect($hwnd, [ref]$rect)) {
      return $true
    }
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 120 -or $height -lt 100) {
    return $true
  }

  $items.Add([pscustomobject]@{
    hwnd = $hwnd.ToInt64().ToString()
    pid = [int]$pidRef
    processName = $processName
    className = $className
    title = $title
    minimized = $false
    maximized = $false
    left = [int]$rect.Left
    top = [int]$rect.Top
    right = [int]$rect.Right
    bottom = [int]$rect.Bottom
    width = [int]$width
    height = [int]$height
  })

  return $true
}

[void][WindowSurfaces]::EnumWindows($callback, [IntPtr]::Zero)
$items | ConvertTo-Json -Compress -Depth 3
