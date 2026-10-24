-- 002_rag_chunks.sql  (OPTIONAL - phase 2)
-- Apply only when evaluation shows that structured lookup + key_features are not enough:
-- large unstructured knowledge (FAQs, manuals, objection handling) or semantic queries
-- such as "something for running in summer".
--
-- Requires pgvector. The dimension (1024) must match your embedding model's output.
-- Anthropic does not provide an embeddings model; use a strong multilingual one
-- (e.g. Voyage AI, Cohere multilingual, BGE-M3) and test it on real Arabic customer messages.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type  text NOT NULL CHECK (source_type IN ('product', 'policy', 'faq', 'objection')),
  source_id    bigint,                                                   -- product id / policy id / faq id
  product_id   bigint REFERENCES products(id) ON DELETE CASCADE,         -- NULL = general knowledge
  content      text NOT NULL,                                            -- self-contained, ~80-200 words
  content_hash text NOT NULL,                                            -- skip re-embedding when unchanged
  embedding    vector(1024),
  embedded_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, content_hash)
);

CREATE INDEX knowledge_chunks_product_idx ON knowledge_chunks (product_id);
CREATE INDEX knowledge_chunks_embedding_hnsw
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Semantic search, optionally scoped to one product (plus general chunks).
-- Note: with strong filters, HNSW can return fewer than k rows; on pgvector >= 0.8 enable
-- iterative scans (SET hnsw.iterative_scan = relaxed_order) if you see that.
CREATE FUNCTION search_knowledge(q_emb vector(1024), p_product_id bigint DEFAULT NULL, k int DEFAULT 5)
RETURNS TABLE (chunk_id bigint, content text, similarity double precision)
LANGUAGE sql STABLE AS $$
  SELECT kc.id, kc.content, (1 - (kc.embedding <=> q_emb))::double precision
  FROM knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND (p_product_id IS NULL OR kc.product_id = p_product_id OR kc.product_id IS NULL)
  ORDER BY kc.embedding <=> q_emb
  LIMIT k
$$;

COMMIT;
