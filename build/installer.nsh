; electron-builder 26.8.1's PowerShell directory-prefix process lookup can
; match the uninstaller itself (and unrelated executables in that directory).
; Use the built-in executable-name fallback while retaining the standard
; close prompt, retry loop, and current-user filtering.
; Keep this override under review when upgrading electron-builder.
!include "getProcessInfo.nsh"
Var /GLOBAL pid

!macro customCheckAppRunning
  Var /GLOBAL IsPowerShellAvailable
  StrCpy $IsPowerShellAvailable 1
  !insertmacro _CHECK_APP_RUNNING
!macroend
