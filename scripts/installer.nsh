!macro customInstall
  ; Chromium's restricted sandbox needs read/execute access to public application files.
  ; The user's service databases and credentials live outside INSTDIR.
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-15-2-2:(OI)(CI)(RX)" /T /C'
!macroend
