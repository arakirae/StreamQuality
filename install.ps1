# StreamQuality installer for Windows
#
# What it does:
#   1. Checks for Git, Node.js 22+ and pnpm, and installs what is missing
#      (Git and Node.js with winget, pnpm with npm)
#   2. Finds your Vencord folder (Vencord in your user folder or in Documents) and updates it,
#      or downloads Vencord into %USERPROFILE%\Vencord if you don't have it yet
#   3. Copies StreamQuality into Vencord\src\userplugins\streamQuality and builds Vencord
#   4. Asks whether to install (inject) Vencord into Discord
#
# Start it with Install.bat, or run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = 'Stop'

$VencordRepo = 'https://github.com/Vendicated/Vencord.git'
$MinNodeMajor = 18          # Vencord's build refuses older versions
$RecommendedNodeMajor = 22  # what Vencord asks for in its package.json
$MinPnpmMajor = 9

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$PluginFile = Join-Path $ScriptDir 'index.ts'
$DefaultVencordDir = Join-Path $env:USERPROFILE 'Vencord'
$script:VencordDir = $DefaultVencordDir

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Magenta
}

function Write-Ok([string]$Text) {
    Write-Host "    $Text" -ForegroundColor Green
}

function Write-Info([string]$Text) {
    Write-Host "    $Text"
}

# Full path of a program on PATH (.exe or .cmd), or $null
function Get-ToolPath([string]$Name) {
    $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    return $null
}

function Get-MajorVersion([string]$Text) {
    if ($Text -match '(\d+)\.\d+') { return [int]$Matches[1] }
    return 0
}

# Lets this window see programs that were installed while it was open
function Update-SessionPath {
    $parts = @($env:Path -split ';')
    foreach ($scope in @('Machine', 'User')) {
        $value = [Environment]::GetEnvironmentVariable('Path', $scope)
        if ($value) { $parts += @($value -split ';') }
    }
    $env:Path = (@($parts | Where-Object { $_ }) | Select-Object -Unique) -join ';'
}

# Runs a program in this window (so its messages and prompts work) and stops if it fails
function Invoke-Tool([string]$What, [string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    $proc = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru
    $null = $proc.Handle # keeps the exit code readable after the program ends
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) {
        throw "$What failed (exit code $($proc.ExitCode)). Read the messages above for details."
    }
}

function Install-WithWinget([string]$Id, [string]$Name, [string]$Url) {
    $winget = Get-ToolPath 'winget'
    if (-not $winget) {
        throw "$Name is missing and winget is not available to install it. Install $Name from $Url, then run Install.bat again."
    }
    Write-Info "Installing $Name with winget. If Windows asks for permission, click Yes."
    Invoke-Tool "Installing $Name" $winget @('install', '--id', $Id, '--exact', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements') $env:USERPROFILE
    Update-SessionPath
}

function Assert-Git {
    Write-Step 'Checking Git'
    if (-not (Get-ToolPath 'git')) {
        Install-WithWinget 'Git.Git' 'Git' 'https://git-scm.com/download/win'
        if (-not (Get-ToolPath 'git')) {
            throw 'Git was installed, but this window cannot see it yet. Close this window and run Install.bat again.'
        }
    }
    $version = (& (Get-ToolPath 'git') --version | Out-String).Trim()
    Write-Ok $version
}

function Assert-Node {
    Write-Step 'Checking Node.js'
    if (-not (Get-ToolPath 'node')) {
        Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js' 'https://nodejs.org'
        if (-not (Get-ToolPath 'node')) {
            throw 'Node.js was installed, but this window cannot see it yet. Close this window and run Install.bat again.'
        }
    }
    $version = (& (Get-ToolPath 'node') --version | Out-String).Trim()
    $major = Get-MajorVersion $version
    if ($major -lt $MinNodeMajor) {
        throw "Vencord needs Node.js $RecommendedNodeMajor or newer, but you have $version. Install the LTS version from https://nodejs.org, then run Install.bat again."
    }
    Write-Ok "Node.js $version"
    if ($major -lt $RecommendedNodeMajor) {
        Write-Info "Vencord recommends Node.js $RecommendedNodeMajor or newer. If something fails below, install the LTS version from https://nodejs.org and run Install.bat again."
    }
}

function Get-PnpmVersion {
    $pnpm = Get-ToolPath 'pnpm'
    if (-not $pnpm) { return '' }
    return (& $pnpm --version | Out-String).Trim()
}

function Assert-Pnpm {
    Write-Step 'Checking pnpm'
    $version = Get-PnpmVersion
    if ((Get-MajorVersion $version) -lt $MinPnpmMajor) {
        if ($version) { Write-Info "pnpm $version is too old, updating it..." }
        else { Write-Info 'Installing pnpm...' }
        $npm = Get-ToolPath 'npm'
        if (-not $npm) { throw 'npm was not found. Reinstall Node.js from https://nodejs.org, then run Install.bat again.' }
        Invoke-Tool 'Installing pnpm' $npm @('install', '--global', 'pnpm@latest') $env:USERPROFILE
        Update-SessionPath
        $version = Get-PnpmVersion
        if (-not $version) {
            throw 'pnpm was installed, but this window cannot see it yet. Close this window and run Install.bat again.'
        }
        if ((Get-MajorVersion $version) -lt $MinPnpmMajor) {
            throw "pnpm $version is too old. Update it with: npm install --global pnpm@latest"
        }
    }
    Write-Ok "pnpm $version"
}

# An existing Vencord download: in the user folder, or in Documents (where Vencord's own guide puts it)
function Find-Vencord {
    $candidates = @(
        $DefaultVencordDir,
        (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Vencord'),
        (Join-Path $env:USERPROFILE 'Documents\Vencord')
    )
    foreach ($dir in $candidates) {
        if ($dir -and (Test-Path -LiteralPath (Join-Path $dir '.git'))) { return $dir }
    }
    return $null
}

function Sync-Vencord {
    Write-Step 'Getting Vencord'
    $git = Get-ToolPath 'git'
    $existing = Find-Vencord
    if ($existing) {
        $script:VencordDir = $existing
        Write-Info "Updating your Vencord in $existing"
        Invoke-Tool 'Updating Vencord' $git @('pull', '--ff-only') $existing
    }
    elseif (Test-Path -LiteralPath $DefaultVencordDir) {
        throw "The folder $DefaultVencordDir already exists but is not a Vencord download. Rename or move it, then run Install.bat again."
    }
    else {
        Write-Info "Downloading Vencord into $DefaultVencordDir"
        Invoke-Tool 'Downloading Vencord' $git @('clone', $VencordRepo, 'Vencord') $env:USERPROFILE
        $script:VencordDir = $DefaultVencordDir
    }
    Write-Ok "Vencord is ready in $($script:VencordDir)"
}

function Copy-Plugin {
    Write-Step 'Adding StreamQuality'
    $pluginDir = [IO.Path]::Combine($script:VencordDir, 'src', 'userplugins', 'streamQuality')
    New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
    Copy-Item -LiteralPath $PluginFile -Destination (Join-Path $pluginDir 'index.ts') -Force
    Write-Ok "Copied to $pluginDir"
}

function Build-Vencord {
    $pnpm = Get-ToolPath 'pnpm'
    Write-Step 'Installing what Vencord needs (this can take a few minutes)'
    Invoke-Tool 'Installing Vencord dependencies' $pnpm @('install', '--frozen-lockfile') $script:VencordDir
    Write-Step 'Building Vencord'
    Invoke-Tool 'Building Vencord' $pnpm @('build') $script:VencordDir
    Write-Ok 'Build finished'
}

function Install-IntoDiscord {
    Write-Step 'Installing Vencord into Discord'
    Write-Info 'This is needed the first time, or if you used the normal Vencord installer before.'
    Write-Info 'If you are not sure, answer Y: doing it again is harmless.'
    $answer = Read-Host '    Install Vencord into Discord now? (Y/N)'
    if ($answer -notmatch '^\s*[YySs]') {
        Write-Info 'Skipped.'
        return
    }
    Write-Info 'Pick your Discord with the arrow keys and press Enter.'
    Invoke-Tool 'Installing Vencord into Discord' (Get-ToolPath 'pnpm') @('inject') $script:VencordDir
}

$exitCode = 0
try {
    Write-Host ''
    Write-Host 'StreamQuality installer' -ForegroundColor Magenta
    Write-Host 'Installs Vencord from source together with the StreamQuality plugin.'

    if (-not (Test-Path -LiteralPath $PluginFile)) {
        throw 'index.ts was not found next to this installer. Extract the whole ZIP first (right click > Extract All), then run Install.bat from the extracted folder.'
    }

    Assert-Git
    Assert-Node
    Assert-Pnpm
    Sync-Vencord
    Copy-Plugin
    Build-Vencord
    Install-IntoDiscord

    Write-Host ''
    Write-Host 'Done!' -ForegroundColor Green
    Write-Host 'Last steps:'
    Write-Host '  1. Fully close Discord: right click its icon next to the clock > Quit Discord.'
    Write-Host '  2. Open Discord again.'
    Write-Host '  3. User Settings > Vencord > Plugins: search for StreamQuality and turn it on.'
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host "Something went wrong: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Fix the problem above, then run Install.bat again.'
}
exit $exitCode
