# Matriz Canónica de Señales de Riesgo

Versión del algoritmo: `risk-v1.0.0`

Las señales son reglas estadísticas deterministas. No son detección mediante IA y nunca ejecutan una sanción por sí solas. Un valor `null` significa que la fuente no está disponible; no se interpreta como evidencia positiva ni negativa.

| Señal | Fuente | Ventana | Umbral | Contribución | Estado |
|---|---|---:|---:|---:|---|
| `FAST_SEARCH` | `SearchEvent` | Por interacción | < 8 s | 20 / 10 | `null`: fuente aún no disponible |
| `FAST_COMPLETION` | `QuoteThread.completedAt`, eventos `COMPLETION_CONFIRMED` | 30 días | < 15 min | 20 / 10 | Activa |
| `LOW_MESSAGE_COUNT` | `QuoteMessage`, eventos `MESSAGE_SENT` | Por solicitud | < 2 mensajes | 15 / 8 | Activa |
| `NEW_ACCOUNT_CONCENTRATION` | `User.createdAt`, `QuoteThread.senderId` | 30 días | Porcentaje agregado | 0-20 | Activa |
| `REPEATED_PROVIDER_TARGET` | `QuoteThread.senderId` | 30 días | Concentración agregada | 0-25 | Activa |
| `RATING_CONCENTRATION` | `Review`, `User.createdAt` | 30 días | Concentración agregada | 0-20 | Activa |
| `SYNCHRONIZED_COMPLETIONS` | `completedAt`, eventos de cierre | 30 días | Cierres dentro de 60 s | 0-20 | Activa |
| `REVIEW_BURST` | `Review.createdAt` y actividad asociada | 24 horas | 2+ reseñas recientes | 0-20 | Activa |
| `ACCOUNT_CLUSTER` | `User.createdAt`, solicitudes repetidas | 30 días | Grupos nuevos repetidos | 0-25 | Activa |
| `PROFILE_RECREATION` | Linaje `Provider.riskLineageRootId`, estados de perfil | Histórico | Perfil baneado relacionado | 0-25 | Activa |
| `ACTION_VOLUME` | Solicitudes, mensajes y reseñas | 1 hora | > 80 acciones | 0-20 | Activa |

## Exclusiones

- Las métricas sin fuente suficiente se almacenan como `null`.
- La evidencia de cuentas sintéticas, demo y pruebas no se considera actividad de producción cuando el dato está marcado con `User.isSynthetic`.
- Un reporte algorítmico solo activa `growthHold`; el castigo público requiere una decisión humana `ACTION_TAKEN`.
- La evidencia persistida incluye la ventana, versión del algoritmo y los IDs de eventos disponibles para reproducir el cálculo.
