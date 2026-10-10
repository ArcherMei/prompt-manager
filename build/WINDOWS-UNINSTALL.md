# Windows uninstall integrity fix

Version 0.0.0 packaged on macOS contained an invalid NSIS uninstaller CRC.
The outer installer CRC was valid. electron-builder 26.8.1's UninstallerReader
copied the executable header without applying NSIS's uninstaller resource
patch block. The compiler's CRC expects those patches.

`fix-nsis-uninstaller.cjs` applies the original resource patches on macOS
before signing/embedding, following NSIS's EW_WRITEUNINSTALLER implementation:
https://github.com/NSIS-Dev/nsis/blob/master/Source/exehead/exec.c
It validates the original compiler CRC rather than rewriting it or disabling
integrity checking. `verify-nsis.cjs` also validates the final installer and
its embedded uninstaller on every NSIS build. Review the internal reader
override when upgrading electron-builder.

Build: `npm run app:build -- --win --x64`

Windows acceptance checks (require a Windows machine):
- Install 0.0.1, close the app, uninstall through Windows Settings.
- Reinstall, keep the app open, uninstall and accept the close prompt.
- Repeat using an installation path containing spaces and non-ASCII text.
- Confirm application files/shortcuts and the installed-app entry are removed,
  and the saved prompt database remains available after reinstalling.

Old installations retain their broken uninstaller. To recover, close the app,
copy the verified `Uninstall Prompt Manager.exe` from the repair folder into
the application's actual installation folder (beside `Prompt Manager.exe`),
replacing the existing file of the same name, then run it there. Do not run
the standalone uninstaller from Downloads or another unrelated directory.
After removing the old installation, install version 0.0.1 if desired.
