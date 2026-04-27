# Configuration
$GATEWAY_URL = "https://websocket-gateway-475406249677.us-central1.run.app"
$SERVICE_A_URL = "https://service-a-475406249677.us-central1.run.app"
$OUTPUT_FILE = "consistency_results.txt"

$TEST_IDS = @(
    "573a1391f29313caabcd6e2a",
    "573a1391f29313caabcd6d40",
    "573a1390f29313caabcd63d6",
    "573a1390f29313caabcd6223",
    "573a1390f29313caabcd587d"
)

# Clear previous results
"Consistency Test Results - $(Get-Date)" | Out-File $OUTPUT_FILE
"------------------------------------------" | Out-File $OUTPUT_FILE -Append

$totalSeconds = 0
$runs = $TEST_IDS.Count

Write-Host "--- Starting Unique-ID Eventual Consistency Measurement ---" -ForegroundColor Yellow

for ($run = 1; $run -le $runs; $run++) {
    $CURRENT_ID = $TEST_IDS[$run - 1]
    
    Write-Host "`nRun ${run}/${runs}: Accessing NEW movie ID: ${CURRENT_ID}..." -ForegroundColor Cyan
    
    # Step 1: Trigger the event via Service A
    curl.exe -s -o NUL "$SERVICE_A_URL/api/v1/movies/$CURRENT_ID"
    
    $found = $false
    
    # Step 2: Polling loop (checking for the first appearance of this ID)
    for ($i = 1; $i -le 90; $i++) {
        $RESULT = curl.exe -s "$GATEWAY_URL" 
        
        if ($RESULT -like "*$CURRENT_ID*") {
            Write-Host "SUCCESS: ${CURRENT_ID} became consistent after ${i} seconds." -ForegroundColor Green
            "Run ${run} (${CURRENT_ID}): ${i} seconds" | Out-File $OUTPUT_FILE -Append
            $totalSeconds += $i
            $found = $true
            break
        }
        
        Write-Host "T+${i}s: Waiting for data propagation..."
        Start-Sleep -Seconds 1
    }
    
    if (-not $found) {
        "Run ${run} (${CURRENT_ID}): TIMEOUT (over 90s)" | Out-File $OUTPUT_FILE -Append
        Write-Host "Run ${run} failed to reach consistency." -ForegroundColor Red
    }
}

# Calculate and save the average
$average = $totalSeconds / $runs
"------------------------------------------" | Out-File $OUTPUT_FILE -Append
"Average Consistency Window: ${average} seconds" | Out-File $OUTPUT_FILE -Append

Write-Host "`nTest Complete. Results saved to $OUTPUT_FILE" -ForegroundColor Yellow
Write-Host "Average Consistency Window: ${average} seconds" -ForegroundColor White