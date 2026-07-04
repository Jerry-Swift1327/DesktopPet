!include /NONFATAL "installer-variant.nsh"

!ifndef PET_VARIANT
  !define PET_VARIANT "dog"
  !define PET_INSTALL_DIR_NAME "Chongban 1.1"
  !define PET_EXE_DISPLAY_NAME "宠伴 1.1"
  !define PET_AUTO_START_REGISTRY_KEY "ChongbanDesktopPet-dog"
  !define PET_AUTO_START_AVAILABLE
!endif

!ifdef PET_INSTALL_DIR_NAME
  !undef APP_FILENAME
  !define APP_FILENAME "${PET_INSTALL_DIR_NAME}"
!endif

!macro customHeader
  !undef UNINSTALL_FILENAME
  !define UNINSTALL_FILENAME "Uninstaller.exe"
  VIAddVersionKey /LANG=1033 "InternalName" "Chongban"
  VIAddVersionKey /LANG=1033 "OriginalFilename" "${PET_EXE_DISPLAY_NAME}.exe"
!macroend

!ifndef BUILD_UNINSTALLER
Function ShowInstallingNotice
  GetDlgItem $0 $HWNDPARENT 1038
  SetCtlColors $0 0xFF0000 transparent
  SendMessage $0 0x000C 0 "STR:$(^NameDA) 正在安装，请等候。（部分安全软件会误判，请放心允许即可）"
FunctionEnd

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW ShowInstallingNotice
!macroend
!endif

!ifndef BUILD_UNINSTALLER
!ifdef PET_AUTO_START_AVAILABLE
Var mui.FinishPage.ShowReadme
!define MUI_FINISHPAGE_SHOWREADME_VARIABLES

Function EnableAutoStartAfterFinish
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PET_AUTO_START_REGISTRY_KEY}" `"$INSTDIR\${PET_EXE_DISPLAY_NAME}.exe"`
FunctionEnd

Function DisableAutoStartAfterFinish
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PET_AUTO_START_REGISTRY_KEY}"
FunctionEnd

Function ApplyAutoStartAfterFinish
  SendMessage $mui.FinishPage.ShowReadme 0x00F0 0 0 $0
  StrCmp $0 1 0 disable
  Call EnableAutoStartAfterFinish
  Return
  disable:
    Call DisableAutoStartAfterFinish
FunctionEnd

Function IgnoreAutoStartAfterFinish
FunctionEnd
!endif
!endif

!macro customUnInstall
  ${GetParameters} $R0
  ${GetOptions} $R0 "/KEEP_APP_DATA" $R1
  ${if} ${Errors}
    !ifdef PET_AUTO_START_REGISTRY_KEY
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PET_AUTO_START_REGISTRY_KEY}"
    !endif
    RMDir /r "$LOCALAPPDATA\Chongban\${PET_VARIANT}"
    RMDir "$LOCALAPPDATA\Chongban"
  ${endif}
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  !ifdef PET_AUTO_START_AVAILABLE
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE ApplyAutoStartAfterFinish
    !define MUI_FINISHPAGE_SHOWREADME
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "开机自启"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "IgnoreAutoStartAfterFinish"
  !endif

  !insertmacro MUI_PAGE_FINISH
!macroend
