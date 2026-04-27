# Configuration
$GATEWAY_URL = "https://websocket-gateway-475406249677.us-central1.run.app"
$SERVICE_A_URL = "https://service-a-475406249677.us-central1.run.app"
$OUTPUT_FILE = "latency_results.txt"

$TEST_IDS = @(
    "573a1390f29313caabcd516c",
    "573a1390f29313caabcd4803",
    "573a1391f29313caabcd7472",
    "573a1391f29313caabcd6f98",
    "573a1391f29313caabcd6ea2"
)

"End-to-End Latency Results - $(Get-Date)" | Out-File $OUTPUT_FILE
"------------------------------------------" | Out-File $OUTPUT_FILE -Append

$totalLatency = 0

Write-Host "--- Starting End-to-End Latency Measurement ---" -ForegroundColor Yellow

foreach ($id in $TEST_IDS) {
    Write-Host "`nMeasuring Latency for ID: $id" -ForegroundColor Cyan
    
    # Capture start time with high precision
    $startTime = [System.Diagnostics.Stopwatch]::StartNew()
    
    # Step 1: Trigger the event
    curl.exe -s -o NUL "$SERVICE_A_URL/api/v1/movies/$id"
    
    $found = $false
    
    # Step 2: High-frequency polling (every 200ms) for precise measurement
    while ($startTime.Elapsed.TotalSeconds -lt 90) {
        $RESULT = curl.exe -s "$GATEWAY_URL"
        
        if ($RESULT -like "*$id*") {
            $startTime.Stop()
            $latency = [math]::Round($startTime.Elapsed.TotalMilliseconds, 2)
            
            Write-Host "SUCCESS: Dashboard updated in $latency ms" -ForegroundColor Green
            "ID: $id | Latency: $latency ms" | Out-File $OUTPUT_FILE -Append
            
            $totalLatency += $latency
            $found = $true
            break
        }
        
        # Small delay to avoid overwhelming the gateway but keep precision
        Start-Sleep -Milliseconds 200
    }
    
    if (-not $found) {
        Write-Host "TIMEOUT: Resource not found within 90s" -ForegroundColor Red
        "ID: $id | Latency: TIMEOUT" | Out-File $OUTPUT_FILE -Append
    }
    
    # Cooling period between tests to ensure clean state
    Start-Sleep -Seconds 2
}

$average = $totalLatency / $TEST_IDS.Count
"------------------------------------------" | Out-File $OUTPUT_FILE -Append
"Average End-to-End Latency: $average ms" | Out-File $OUTPUT_FILE -Append

Write-Host "`nTest Complete. Average Latency: $average ms" -ForegroundColor Yellow