; Script generated for BlockHarbor
; Native Windows Minecraft Server Manager

#define MyAppName "BlockHarbor"
#define MyAppVersion "4.0.2"
#define MyAppPublisher "BlockHarbor Team"
#define MyAppURL "https://github.com/Yugraj20/BlockHarbor"
#define MyAppExeName "BlockHarbor.exe"
#define MyAppBackendName "BlockHarbor-Backend.exe"
#define SourceDir "..\dist\desktop"

[Setup]
AppId={{C8E289E4-2C62-4D93-B076-2FA739B31001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
OutputDir=..\dist\release
OutputBaseFilename=BlockHarbor-Setup-x64
SetupIconFile=..\desktop\app.ico
UninstallDisplayIcon={app}\app.ico
WizardImageFile=wizard-large.bmp
WizardSmallImageFile=wizard-small.bmp
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startwithwindows"; Description: "Launch BlockHarbor automatically when Windows starts"; GroupDescription: "Startup options:"; Flags: unchecked

[Files]
; Desktop Shell, Backend Executables, Libraries, and Runtimes
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\desktop\app.ico"; DestDir: "{app}"; DestName: "app.ico"; Flags: ignoreversion
Source: "..\desktop\icon.png"; DestDir: "{app}"; DestName: "icon.png"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; Tasks: startwithwindows

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// Helper function to check if directory exists
function DirExists(DirName: string): Boolean;
begin
  Result := DirExists(DirName);
end;

// Terminate running processes before installing or upgrading
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/f /im BlockHarbor.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/f /im BlockHarbor-Backend.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/f /im playit.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

// Stop processes before uninstall
function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/f /im BlockHarbor.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/f /im BlockHarbor-Backend.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/f /im playit.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

// Prompt user whether to preserve server data, databases, and backups upon uninstall
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
  UserChoice: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{app}\data');
    if DirExists(DataDir) or DirExists(ExpandConstant('{app}\servers')) then
    begin
      UserChoice := MsgBox('Would you like to KEEP your Minecraft server worlds, configs, and backups?' + #13#10 + #13#10 +
                           'Choose [Yes] to preserve all your game data.' + #13#10 +
                           'Choose [No] to completely delete all server data and backups.',
                           mbConfirmation, MB_YESNO or MB_DEFBUTTON1);
      if UserChoice = IDNO then
      begin
        DelTree(ExpandConstant('{app}\servers'), True, True, True);
        DelTree(ExpandConstant('{app}\backups'), True, True, True);
        DelTree(ExpandConstant('{app}\data'), True, True, True);
      end;
    end;
  end;
end;

// Check if WebView2 runtime is installed
function IsWebView2Installed(): Boolean;
var
  RegKey: String;
  Val: String;
begin
  RegKey := 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BAC-6FEA850E1E7C}';
  Result := RegQueryStringValue(HKEY_LOCAL_MACHINE, RegKey, 'pv', Val) and (Val <> '');
  if not Result then
  begin
    RegKey := 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BAC-6FEA850E1E7C}';
    Result := RegQueryStringValue(HKEY_CURRENT_USER, RegKey, 'pv', Val) and (Val <> '');
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  UserAnswer: Integer;
begin
  Result := True;
  if CurPageID = wpReady then
  begin
    if not IsWebView2Installed() then
    begin
      UserAnswer := MsgBox('BlockHarbor requires the Microsoft Edge WebView2 Runtime to display its desktop interface.' + #13#10 + #13#10 +
                           'It appears to be missing on this system. Would you like to proceed anyway?' + #13#10 +
                           '(If the app fails to open, download WebView2 from microsoft.com)',
                           mbInformation, MB_YESNO or MB_DEFBUTTON2);
      if UserAnswer = IDNO then
      begin
        Result := False;
      end;
    end;
  end;
end;
