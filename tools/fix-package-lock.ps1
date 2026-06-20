param(
    [string]$LockFilePath = "package-lock.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $LockFilePath)) {
    throw "package-lock.json was not found: $LockFilePath"
}

$resolvedPath = (Resolve-Path -LiteralPath $LockFilePath).Path
$backupPath = "$resolvedPath.before-registry-fix.bak"
$tempPath = "$resolvedPath.registry-fix.tmp"

Copy-Item -LiteralPath $resolvedPath -Destination $backupPath -Force

$content = [System.IO.File]::ReadAllText($resolvedPath)

$internalRegistryUrls = @(
    "https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/",
    "https://packages.hub.ace-research.openai.org/artifactory/api/npm/npm-public/"
)

$replacementCount = 0

foreach ($internalRegistryUrl in $internalRegistryUrls) {
    $matchCount = (
        [regex]::Matches(
            $content,
            [regex]::Escape($internalRegistryUrl)
        )
    ).Count

    if ($matchCount -gt 0) {
        $content = $content.Replace(
            $internalRegistryUrl,
            "https://registry.npmjs.org/"
        )

        $replacementCount += $matchCount
    }
}

$genericInternalRegistryPattern =
    "https://packages\.[^/]+\.internal\.api\.openai\.org/artifactory/api/npm/npm-public/"

$genericMatchCount = (
    [regex]::Matches(
        $content,
        $genericInternalRegistryPattern,
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
).Count

if ($genericMatchCount -gt 0) {
    $content = [regex]::Replace(
        $content,
        $genericInternalRegistryPattern,
        "https://registry.npmjs.org/",
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    $replacementCount += $genericMatchCount
}

[System.IO.File]::WriteAllText(
    $tempPath,
    $content,
    [System.Text.UTF8Encoding]::new($false)
)

try {
    & node -e "const fs=require('fs'); JSON.parse(fs.readFileSync(process.argv[1],'utf8'));" $tempPath

    if ($LASTEXITCODE -ne 0) {
        throw "Node.js could not parse the updated package-lock.json."
    }

    Move-Item -LiteralPath $tempPath -Destination $resolvedPath -Force
}
catch {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    throw
}

$remainingInternalUrls = Select-String `
    -LiteralPath $resolvedPath `
    -Pattern "applied-caas|internal\.api\.openai\.org|openai\.org/artifactory/api/npm"

if ($remainingInternalUrls) {
    Write-Host "Internal registry URLs are still present:" -ForegroundColor Red

    $remainingInternalUrls | ForEach-Object {
        Write-Host $_.Line
    }

    throw "Could not remove every internal registry URL."
}

Write-Host "package-lock.json was updated successfully." -ForegroundColor Green
Write-Host "Replacements: $replacementCount"
Write-Host "Backup: $backupPath"
Write-Host ""
Write-Host "Next commands:"
Write-Host "  npm ci"
Write-Host "  npm run check"
