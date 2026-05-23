# setup-chrome-shortcut.ps1
# Creates a Chrome shortcut on Desktop with --remote-debugging-port=9222
# Run once. After that, use the shortcut to open Chrome for ERP capture.

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
    Write-Host "ERROR: Chrome not found. Check install path." -ForegroundColor Red
    exit 1
}

$desktop  = [System.Environment]::GetFolderPath("Desktop")
$shortcut = "$desktop\Chrome (ERP).lnk"

$WScript = New-Object -ComObject WScript.Shell
$lnk     = $WScript.CreateShortcut($shortcut)
$lnk.TargetPath       = $chromePath
$lnk.Arguments        = "--remote-debugging-port=9222"
$lnk.Description      = "Chrome with CDP enabled for ERP capture"
$lnk.WorkingDirectory = Split-Path $chromePath
$lnk.Save()

Write-Host "OK: Shortcut created -> $shortcut" -ForegroundColor Green
Write-Host ""
Write-Host "Steps:" -ForegroundColor Cyan
Write-Host "  1. Close current Chrome if running"
Write-Host "  2. Open Chrome using the new shortcut [Chrome (ERP)] on Desktop"
Write-Host "  3. Login to ERP, go to SearchList (page 1)"
Write-Host "  4. Run debug to confirm column indices:"
Write-Host "     node C:\Users\ericlin\Projects\erp-scraper\capture.js --debug"
Write-Host "  5. After confirming IDX, run capture:"
Write-Host "     node C:\Users\ericlin\Projects\erp-scraper\capture.js"
