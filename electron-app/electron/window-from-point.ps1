param(
  [int]$X = 0,
  [int]$Y = 0,
  [int]$PetPid = 0,
  [string]$PetInternalName = "Chongban"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class WindowPointTarget {
  [DllImport("user32.dll")]
  public static extern IntPtr WindowFromPoint(POINT point);

  [DllImport("user32.dll")]
  public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

  [DllImport("user32.dll")]
  public static extern IntPtr GetParent(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder className, int count);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT placement);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT rect, int size);

  public const uint GA_ROOT = 2;
  public const uint GA_ROOTOWNER = 3;
  public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  public const int SW_SHOWMINIMIZED = 2;
  public const int SW_SHOWMAXIMIZED = 3;

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

function Get-WindowInfo {
  param([IntPtr]$Hwnd, [string]$Reason)

  if ($Hwnd -eq [IntPtr]::Zero) {
    return [pscustomobject]@{ ok = $false; reason = $Reason; queryX = $X; queryY = $Y }
  }

  $pidRef = [uint32]0
  [void][WindowPointTarget]::GetWindowThreadProcessId($Hwnd, [ref]$pidRef)

  $placement = New-Object WindowPointTarget+WINDOWPLACEMENT
  $placement.length = [Runtime.InteropServices.Marshal]::SizeOf([type][WindowPointTarget+WINDOWPLACEMENT])
  $hasPlacement = [WindowPointTarget]::GetWindowPlacement($Hwnd, [ref]$placement)

  $titleLength = [WindowPointTarget]::GetWindowTextLength($Hwnd)
  $titleBuilder = New-Object System.Text.StringBuilder ([Math]::Max(1, $titleLength + 1))
  [void][WindowPointTarget]::GetWindowText($Hwnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString().Trim()

  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][WindowPointTarget]::GetClassName($Hwnd, $classBuilder, $classBuilder.Capacity)
  $className = $classBuilder.ToString().Trim()

  $rect = New-Object WindowPointTarget+RECT
  $dwmResult = [WindowPointTarget]::DwmGetWindowAttribute(
    $Hwnd,
    [WindowPointTarget]::DWMWA_EXTENDED_FRAME_BOUNDS,
    [ref]$rect,
    [Runtime.InteropServices.Marshal]::SizeOf([type][WindowPointTarget+RECT])
  )
  if ($dwmResult -ne 0) {
    [void][WindowPointTarget]::GetWindowRect($Hwnd, [ref]$rect)
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top

  return [pscustomobject]@{
    ok = $true
    reason = $Reason
    queryX = $X
    queryY = $Y
    hwnd = $Hwnd.ToInt64().ToString()
    pid = [int]$pidRef
    processName = (Get-Process -Id ([int]$pidRef) -ErrorAction SilentlyContinue).ProcessName
    className = $className
    title = $title
    visible = [WindowPointTarget]::IsWindowVisible($Hwnd)
    minimized = ($hasPlacement -and $placement.showCmd -eq [WindowPointTarget]::SW_SHOWMINIMIZED)
    maximized = ($hasPlacement -and $placement.showCmd -eq [WindowPointTarget]::SW_SHOWMAXIMIZED)
    left = [int]$rect.Left
    top = [int]$rect.Top
    right = [int]$rect.Right
    bottom = [int]$rect.Bottom
    width = [int]$width
    height = [int]$height
  }
}

function Test-PetProcess {
  param([int]$ProcessId)

  if ($ProcessId -le 0 -or [string]::IsNullOrWhiteSpace($PetInternalName)) {
    return $false
  }
  try {
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    return $proc -and [string]$proc.MainModule.FileVersionInfo.InternalName -eq $PetInternalName
  } catch {
    return $false
  }
}

$point = New-Object WindowPointTarget+POINT
$point.X = $X
$point.Y = $Y

$hit = [WindowPointTarget]::WindowFromPoint($point)
if ($hit -eq [IntPtr]::Zero) {
  Get-WindowInfo $hit "no-window" | ConvertTo-Json -Compress -Depth 3
  exit 0
}

$root = [WindowPointTarget]::GetAncestor($hit, [WindowPointTarget]::GA_ROOT)
$rootOwner = [WindowPointTarget]::GetAncestor($hit, [WindowPointTarget]::GA_ROOTOWNER)
$target = if ($rootOwner -ne [IntPtr]::Zero) { $rootOwner } elseif ($root -ne [IntPtr]::Zero) { $root } else { $hit }

$targetPidRef = [uint32]0
[void][WindowPointTarget]::GetWindowThreadProcessId($target, [ref]$targetPidRef)
if ($PetPid -gt 0 -and [int]$targetPidRef -eq $PetPid) {
  $parent = [WindowPointTarget]::GetParent($target)
  if ($parent -ne [IntPtr]::Zero) {
    $target = $parent
  }
} elseif (Test-PetProcess ([int]$targetPidRef)) {
  Get-WindowInfo ([IntPtr]::Zero) "pet-window" | ConvertTo-Json -Compress -Depth 3
  exit 0
}

Get-WindowInfo $target "point-hit" | ConvertTo-Json -Compress -Depth 3
