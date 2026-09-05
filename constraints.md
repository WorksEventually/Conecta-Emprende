# Constraints

Technical constraints and reserved fields for the TradeArc MVP.

## Reserved fields

### `Provider.formalizationStatus`

- **Status:** RESERVED — not used by any active MVP feature.
- **Values:** `INFORMAL | EN_PROCESO | MIPYME_FORMAL | DOCUMENTOS_PENDIENTES` (field remains in the schema for future use).
- **Does not affect:** Trust Score v2 (`calculateTrustScoreV2` has no formalization component), search ranking, or badges. No MVP endpoint surfaces it as a quality signal.
- **Rationale:** Decision **D-17** — legal formalization stays strictly outside the MVP scope so that informal MIPYMEs are never scored down for lacking paperwork (inclusivity requirement).
- **Future use:** roadmap-only. If formalization is ever activated, it must be opt-in, documented in the decision register, and must not alter historical trust scores.
- **Sprint 4 cleanup:** Endpoints `/api/providers/:id/formalization` disabled (return 501), schemas marked `@deprecated`, UI cleaned of formalization badges.
