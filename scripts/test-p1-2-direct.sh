#!/bin/bash

echo "================================================================================"
echo "P1-2 DIRECT CURL TEST"
echo "================================================================================"
echo ""

echo "TEST 1: hospitals with better safety outcomes"
echo "--------------------------------------------------------------------------------"
curl -X POST http://127.0.0.1:54321/functions/v1/orchestrator \
  -H "Content-Type: application/json" \
  -d '{"question":"hospitals with better safety outcomes","domain":"healthcare"}' 2>&1
echo ""
echo ""

echo "TEST 2: safety performance ranking"
echo "--------------------------------------------------------------------------------"
curl -X POST http://127.0.0.1:54321/functions/v1/orchestrator \
  -H "Content-Type: application/json" \
  -d '{"question":"safety performance ranking","domain":"healthcare"}' 2>&1
echo ""
echo ""

echo "TEST 3: best hospitals for safety"
echo "--------------------------------------------------------------------------------"
curl -X POST http://127.0.0.1:54321/functions/v1/orchestrator \
  -H "Content-Type: application/json" \
  -d '{"question":"best hospitals for safety","domain":"healthcare"}' 2>&1
echo ""
echo ""

echo "================================================================================"
echo "Checking orchestrator logs for intent and template..."
echo "================================================================================"
sleep 1
docker logs supabase_edge_runtime_intelligence-os --tail 50 2>&1 | grep -E "Intent:|Requested Template:"
