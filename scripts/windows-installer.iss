#define AppName "Care Navigation Support"
#define AppVersion "2.16.0"
#define AppUserModelId "org.team26.southlakehive"

[Setup]
AppId={{DD39358A-679C-4ED1-A8F0-163CBE2DCED6}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Team 26
DefaultDirName={localappdata}\Programs\Southlake Hive
DefaultGroupName={#AppName}
UsePreviousGroup=no
PrivilegesRequired=lowest
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableWelcomePage=no
OutputDir=..\release\setup
OutputBaseFilename=Care-Navigation-Support-Setup-{#AppVersion}
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
Type: files; Name: "{app}\Southlake Care Navigation Support.exe"
Type: files; Name: "{autodesktop}\Southlake Hive.lnk"; Check: not PortableCheck
Type: files; Name: "{userprograms}\Southlake Hive\Southlake Hive.lnk"; Check: not PortableCheck
Type: files; Name: "{autodesktop}\Southlake Care Navigation Support.lnk"; Check: not PortableCheck
Type: files; Name: "{userprograms}\Southlake Care Navigation Support\Southlake Care Navigation Support.lnk"; Check: not PortableCheck

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hive.ico"; AppUserModelID: "{#AppUserModelId}"; Check: not PortableCheck
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hive.ico"; AppUserModelID: "{#AppUserModelId}"; Check: not PortableCheck

[Run]
Filename: "{app}\{#AppName}.exe"; Description: "Open {#AppName}"; Flags: nowait postinstall skipifsilent; Check: not PortableCheck

[Code]
function PortableCheck: Boolean;
begin
  Result := ExpandConstant('{param:portable|0}') = '1';
end;
