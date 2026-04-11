#!/bin/bash
# Batch extract subtitles for all videos missing them
# Calls the admin API endpoint for each video

API_BASE="http://localhost:3000/api/videos"
INPUT="/tmp/missing_subs.txt"
TOTAL=$(wc -l < "$INPUT" | tr -d ' ')
COUNT=0
SUCCESS=0
FAIL=0

echo "Starting subtitle extraction for $TOTAL videos..."
echo ""

while IFS= read -r video_id; do
  COUNT=$((COUNT + 1))
  echo "[$COUNT/$TOTAL] Processing: $video_id"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$video_id/auto-subtitle" --max-time 600)
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ]; then
    LINES=$(echo "$BODY" | grep -o '"lines":[0-9]*' | cut -d: -f2)
    WORDS=$(echo "$BODY" | grep -o '"words":[0-9]*' | cut -d: -f2)
    echo "  ✓ $LINES lines, $WORDS words"
    SUCCESS=$((SUCCESS + 1))
  else
    ERROR=$(echo "$BODY" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    echo "  ✗ Failed: $ERROR"
    FAIL=$((FAIL + 1))
  fi
done < "$INPUT"

echo ""
echo "Done! Success: $SUCCESS, Failed: $FAIL, Total: $TOTAL"
