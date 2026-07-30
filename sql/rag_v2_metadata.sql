ALTER TABLE "KnowledgeDocument"
  ADD COLUMN IF NOT EXISTS "sotModule"    text,
  ADD COLUMN IF NOT EXISTS "targetAgents" text[],
  ADD COLUMN IF NOT EXISTS "chunkType"    text DEFAULT 'DICTIONARY_ENTRY';
CREATE INDEX IF NOT EXISTS idx_kd_module ON "KnowledgeDocument"("sotModule");
