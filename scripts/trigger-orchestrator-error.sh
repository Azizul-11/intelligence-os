#!/bin/bash
cd ~/Projects/intelligence-os
echo "Triggering orchestrator request..."
curl -X POST http://127.0.0.1:54321/functions/v1/orchestrator \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}' 2>&1

echo ""
echo "Waiting for logs..."
sleep 2

echo ""
echo "Recent orchestrator logs:"
docker logs supabase_edge_runtime_intelligence-os --tail 30 2>&1 | grep -A 20 "Error\|TypeError\|Cannot read"
