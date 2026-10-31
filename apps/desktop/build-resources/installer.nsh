; QF.45: before replacing a running copy, ask it to quit the normal way
; (quit backup, last session log, campaign LOCK released). electron-builder's
; default check stops it with Stop-Process (TerminateProcess), which skips all
; three. The forced stop stays as the fallback after about 8 seconds.
!macro customCheckAppRunning
  Var /GLOBAL pid
  StrCpy $pid 0
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    ; Ask first, as electron-builder does (a silent install answers OK); an
    ; auto-update skips the question.
    ${ifNot} ${isUpdated}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK theSystemQuitApp
      Quit
    ${endIf}
    theSystemQuitApp:
    DetailPrint "$(appClosing)"
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --quit-for-update'
    ; Wait up to 8 s by the clock (each process check itself takes time).
    System::Call 'kernel32::GetTickCount()i.r1'
    theSystemWaitQuit:
      Sleep 500
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 == 0
        System::Call 'kernel32::GetTickCount()i.r2'
        IntOp $2 $2 - $1
        ${if} $2 < 8000
          Goto theSystemWaitQuit
        ${endIf}
        ; Still running after ~8 s: the old way, polite then forced.
        !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
        Sleep 1000
        !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
        Sleep 500
        ; Cannot be stopped (running elevated): ask, as electron-builder does.
        theSystemStillRunning:
        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY theSystemStillRunning
          Quit
        ${endIf}
      ${endIf}
  ${endIf}
!macroend
