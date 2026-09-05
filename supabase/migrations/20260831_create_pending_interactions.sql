-- Phase 8.10 Layer 2: Bounded conversational continuation state
-- Purpose: Store pending clarification/guidance interactions for two-turn flows
-- Scope: Minimal state for reconstruction only, NOT general conversation memory

CREATE TABLE pending_interactions (
  -- Primary identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Interaction type
  kind TEXT NOT NULL CHECK (kind IN ('clarification', 'guidance')),
  
  -- Optional user binding (supports both anonymous and authenticated flows)
  user_id TEXT,
  
  -- Original request context for reconstruction
  original_question TEXT NOT NULL,
  
  -- Full semantic resolution result (JSONB for flexibility across domains)
  original_semantic_result JSONB NOT NULL,
  
  -- Clarification: { entityMention, candidates }
  -- Guidance: { unavailableCapabilityId, requestedOperation, scope }
  pending_target JSONB NOT NULL,
  
  -- Offered options for deterministic matching
  -- Clarification: [{ facility_id, hospital_name, city, state, displayLabel }, ...]
  -- Guidance: [{ capabilityId, displayName }, ...]
  offered_options JSONB NOT NULL,
  
  -- Lifecycle management
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for retrieving non-consumed interactions that haven't expired
CREATE INDEX idx_pending_expires ON pending_interactions(expires_at) 
  WHERE NOT consumed;

-- Index for user-specific interactions (when user_id is present)
CREATE INDEX idx_pending_user ON pending_interactions(user_id) 
  WHERE NOT consumed AND user_id IS NOT NULL;

-- Index for efficient ID lookups
CREATE INDEX idx_pending_id_active ON pending_interactions(id)
  WHERE NOT consumed;
