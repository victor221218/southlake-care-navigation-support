#define AppName "Southlake Care Navigation Support"
#define AppVersion "2.5.0"

[Setup]
AppId={{DD39358A-679C-4ED1-A8F0-163CBE2DCED6}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Team 26
DefaultDirName={localappdata}\Programs\Southlake Hive
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableWelcomePage=no
OutputDir=..\release\setup
OutputBaseFilename=Southlake-Care-Navigation-Support-Setup-2.5.0
SetupIconFile=..\assets\hive.ico
UninstallDisplayIcon={app}\hive.ico
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
UsePreviousAppDir=not PortableCheck
Uninstallable=not PortableCheck

[Files]
Source: "..\release\windows-app-{#AppVersion}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: files; Name: "{app}\Southlake Hive.exe"
Type: files; Name: "{autodesktop}\Southlake Hive.lnk"; Check: not PortableCheck
Type: files; Name: "{userprograms}\Southlake Hive\Southlake Hive.lnk"; Check: not PortableCheck

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\Southlake Care Navigation Support.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hive.ico"; Check: not PortableCheck
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\Southlake Care Navigation Support.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hive.ico"; Check: not PortableCheck

[Run]
Filename: "{app}\Southlake Care Navigation Support.exe"; Description: "Open Southlake Care Navigation Support"; Flags: nowait postinstall skipifsilent; Check: not PortableCheck

[Code]
function PortableCheck: Boolean;
begin
  Result := ExpandConstant('{param:portable|0}') = '1';
end;
