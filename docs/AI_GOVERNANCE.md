# AI Governance & Institutional Principles

## 1. Zero-Fabrication Policy
The AI must NEVER invent data, hallucinate corporate structures, or guess market regimes.
If retrieving semantic context yields `< 0.70 cosine similarity`, the AI MUST reply: "Insufficient institutional data available."

## 2. Source Traceability
Every AI output via `/api/copilot/query` must return a `citations` array linking to the exact `memory_id` or filing source.

## 3. Tiered AI Model Strategy (Cost & Privacy Control)
1. **Tier 1 (Free / Local)**: `Ollama` running `llama3` for data classification, embedding, and summary.
2. **Tier 2 (Free Cloud)**: `Groq`, `Gemini Flash`, `OpenRouter` for standard reasoning.
3. **Tier 3 (Paid Cloud)**: `DeepSeek` / GPT-4 for deep reasoning and complex graph traversal (restricted to 5M tokens/month via quota).

## 4. Model Downgrading
If Tier 3 or Tier 2 models fail (rate limits or timeouts), the orchestrator automatically gracefully downgrades the query complexity and pushes it to local Ollama.
