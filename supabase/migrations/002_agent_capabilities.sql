-- A2A Comms — Agent Capabilities
-- Migration: 002_agent_capabilities.sql
-- Created: 2026-03-29

ALTER TABLE agents ADD COLUMN capabilities TEXT[] DEFAULT '{}';
ALTER TABLE agents ADD COLUMN protocols TEXT[] DEFAULT ARRAY['a2a-comms-v1'];
ALTER TABLE agents ADD COLUMN max_concurrent_contracts INTEGER DEFAULT 10;
