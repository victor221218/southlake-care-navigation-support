#define AppName "Southlake Hive"
#define AppVersion "2.0.0"

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
OutputBaseFilename=Southlake-Hive-Setup
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
Source: "..\release\windows-app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\Southlake Hive.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hive.ico"; Check: not PortableCheck
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\Southlake Hive.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hive.ico"; Check: not PortableCheck

[Run]
Filename: "{app}\Southlake Hive.exe"; Description: "Open Southlake Hive"; Flags: nowait postinstall skipifsilent; Check: not PortableCheck

[Code]
function PortableCheck: Boolean;
begin
  Result := ExpandConstant('{param:portable|0}') = '1';
end;
