# Security Policy & Architecture

## Data Portability (GDPR)
Data export is available at `GET /api/user/export`. Provides full portfolio, session, and watchlist history in JSON format.

## AI Security Layers
1. **Prompt Injection Guard**: Uses regex and entropy scoring to block system-prompt overwrites.
2. **Output Leak Scanner**: Detects OpenAI keys, AWS keys, JWTs, and DB URIs in AI outputs and replaces them with `[REDACTED]`.
3. **Local-First Failback**: Sensitive institutional data (like proprietary portfolios) prioritizes local `Ollama` inference over cloud APIs to ensure privacy.

## Authentication
- NextAuth compatible manual auth engine.
- Session tokens are `HttpOnly`, `Secure`, `SameSite=Lax`.
- Passwords are bcrypt hashed.
- Redis-backed rate limiting per IP & User ID.

## Threat Model Assumptions
- All user inputs are hostile. Validated via `zod`.
- All LLM outputs are hostile (hallucinations/injection). Validated via AI Security Guard.
