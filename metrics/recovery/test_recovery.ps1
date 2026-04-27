# Configuration
$GATEWAY_URL = "https://websocket-gateway-475406249677.us-central1.run.app"
$CRASH_URL = "$GATEWAY_URL/crash"
$OUTPUT_FILE = "recovery_metrics.txt"

Write-Host "--- Starting System Resilience & Recovery Measurement ---" -ForegroundColor Yellow
"Recovery Test Results - $(Get-Date)" | Out-File $OUTPUT_FILE
"--------------------------------------------------" | Out-File $OUTPUT_FILE -Append

# Step 1: Trigger the service failure
Write-Host "Action: Sending crash signal to Gateway..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri $CRASH_URL -ErrorAction SilentlyContinue
} catch {
    Write-Host "Crash signal sent. Monitoring downtime..." -ForegroundColor Gray
}

# Step 2: High-precision polling to detect recovery
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$recovered = $false

Write-Host "Status: Service is DOWN. Waiting for Auto-healing..." -ForegroundColor Red

while ($stopwatch.Elapsed.TotalSeconds -lt 60) {
    try {
        # Added -UseBasicParsing to avoid the security warning
        $response = Invoke-WebRequest -Uri $GATEWAY_URL -Method Get -TimeoutSec 1 -ErrorAction Stop -UseBasicParsing
        
        if ($response.StatusCode -eq 200) {
            $stopwatch.Stop()
            $recoverySeconds = [math]::Round($stopwatch.Elapsed.TotalMilliseconds / 1000, 2)
            
            Write-Host "`nSUCCESS: Gateway recovered in $recoverySeconds seconds!" -ForegroundColor Green
            "Service Recovery Time (MTTR): $recoverySeconds seconds" | Out-File $OUTPUT_FILE -Append
            "Status: Auto-healing verified via Google Cloud Run." | Out-File $OUTPUT_FILE -Append
            $recovered = $true
            break
        }
    } catch {
        # Fixed: Write-Host instead of Write-Mark
        Write-Host "." -NoNewline
    }
    Start-Sleep -Milliseconds 500
}

if (-not $recovered) {
    Write-Host "`nTIMEOUT: Service failed to recover within 60 seconds." -ForegroundColor Red
    "Result: Recovery Timeout" | Out-File $OUTPUT_FILE -Append
}

Write-Host "`nTest Complete. Results saved to $OUTPUT_FILE" -ForegroundColor Yellow