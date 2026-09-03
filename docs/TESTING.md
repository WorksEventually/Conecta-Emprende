# Testing Guide - Conecta Emprende AI

Guía completa de la suite de pruebas del proyecto Conecta Emprende AI (TradeArc MVP).

**Última actualización:** 2026-09-03 (Sprint 4)

---

## 📊 Estructura de Tests

El proyecto cuenta con **60 tests** organizados en **5 suites**:

### Tests Unitarios (17 tests)
- **Trust Score v2** (8 tests) - `test:trust-v2`
  - Fórmula de cálculo del Trust Score v2
  - Componentes: Completion Rate, Response Time, Reviews, Job History
  - Casos límite y penalizaciones

- **Risk Telemetry** (9 tests) - `test:risk-telemetry`
  - Métricas de riesgo (early_close_rate, dispute_rate)
  - Semántica de valores null vs 0
  - Cálculo de risk_level

### Tests E2E (22 tests)
- **Sprint 2 E2E** (16 tests) - `test:sprint-e2e`
  - Lifecycle completo de cotizaciones (OPEN → COMPLETED)
  - Recálculo automático de Trust Score tras completar trabajos
  - Flujo bilateral (requester + provider)

- **Risk Integration** (6 tests) - `test:risk-integration`
  - Generación automática de RiskReports
  - Integración con Trust Score
  - Penalizaciones por alto riesgo

### Tests Smoke (21 tests)
- **Admin Permissions** (21 tests) - `test:admin-permissions`
  - Sistema RBAC (3 roles: USER, ADMIN_REVIEWER, SUPER_ADMIN)
  - Permisos de lectura/escritura por endpoint
  - Casos de autorización y denegación

---

## 🚀 Comandos

### Ejecutar todas las suites
```bash
npm test
# o equivalente
npm run test:all
```

### Ejecutar por categoría
```bash
# Solo tests unitarios
npm run test:unit

# Solo tests E2E
npm run test:e2e
```

### Ejecutar suites individuales
```bash
npm run test:trust-v2           # Trust Score v2 (unit)
npm run test:risk-telemetry      # Risk Telemetry (unit)
npm run test:admin-permissions   # Admin Permissions (smoke)
npm run test:sprint-e2e          # Sprint 2 E2E (e2e)
npm run test:risk-integration    # Risk Integration (e2e)
```

---

## ⚙️ Requisitos

### 1. Servidor corriendo (E2E y Smoke tests)
**IMPORTANTE:** Los tests E2E y smoke requieren que el servidor esté corriendo en `http://localhost:3000`.

```bash
# En una terminal separada, levantar el servidor:
npm run dev

# En otra terminal, ejecutar tests:
npm test
```

**Tests unitarios** (Trust Score v2, Risk Telemetry) NO requieren servidor:
```bash
npm run test:unit  # Se ejecutan sin servidor
```

### 2. Base de datos PostgreSQL
Todas las suites requieren una base de datos PostgreSQL limpia:

```bash
# Limpiar y recrear DB
npx prisma migrate reset --force

# Aplicar migraciones
npx prisma migrate deploy

# Ejecutar seed
npm run db:seed
```

### 3. Variables de entorno
El archivo `.env` debe contener:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/conecta_emprende_test"
JWT_SECRET="your-secret-key"
GEMINI_API_KEY="your-gemini-key"  # Opcional para tests
NODE_ENV="test"
```

### 4. Puerto 3000 disponible
El servidor debe correr en `http://localhost:3000` para que los tests E2E se conecten.

---

## 🧪 Cobertura Actual

### Trust Score v2 (`test:trust-v2`)
✅ Fórmula base con pesos correctos  
✅ Completion rate (trabajos bilateralmente confirmados)  
✅ Response time (promedio conversaciones activas)  
✅ Reviews (promedio ponderado)  
✅ Job history (bonus por volumen)  
✅ Penalización por riesgo (30% si risk_level = HIGH)  
✅ Casos límite (sin trabajos, sin reseñas)  
✅ Normalización 0-100  

### Risk Telemetry (`test:risk-telemetry`)
✅ Cálculo de early_close_rate  
✅ Cálculo de dispute_rate  
✅ Semántica null (sin datos) vs 0 (impecable)  
✅ Determinación de risk_level (LOW/MEDIUM/HIGH)  
✅ Actualización automática tras eventos  
✅ Casos extremos (100% cierres tempranos)  

### Admin Permissions (`test:admin-permissions`)
✅ USER: sin acceso a endpoints admin  
✅ ADMIN_REVIEWER: lectura de reportes, sin modificación  
✅ SUPER_ADMIN: acceso total (lectura + escritura)  
✅ Endpoints protegidos: `/api/admin/reports`, `/api/admin/users`, etc.  
✅ Middleware `requireRole` funcionando correctamente  
✅ Casos de denegación (403 Forbidden)  

### Sprint 2 E2E (`test:sprint-e2e`)
✅ Crear cotización (OPEN)  
✅ Enviar mensaje (IN_CONVERSATION)  
✅ Enviar cotización por provider  
✅ Aceptar cotización por requester  
✅ Confirmar trabajo bilateral (COMPLETED)  
✅ Recálculo automático de Trust Score  
✅ Publicar reseña verificada (weight = 1.0)  
✅ Trust Score actualizado con nueva reseña  
✅ Estado de cotización correcto en cada paso  

### Risk Integration (`test:risk-integration`)
✅ RiskReport creado al completar primer trabajo  
✅ Métricas iniciales en 0 (impecable)  
✅ risk_level = LOW por defecto  
✅ Actualización tras cierre temprano  
✅ early_close_rate > 30% → risk_level = HIGH  
✅ Penalización del 30% en Trust Score  

---

## ➕ Agregar Nuevos Tests

### 1. Crear archivo de test
```typescript
// scripts/test_my_feature.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testMyFeature() {
  console.log("🧪 Test: My Feature");
  
  // Setup
  await prisma.myModel.create({ data: { ... } });
  
  // Execute
  const result = await myFunction();
  
  // Assert
  if (result.expected !== result.actual) {
    throw new Error(`Expected ${result.expected}, got ${result.actual}`);
  }
  
  console.log("✅ Test passed");
}

testMyFeature()
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### 2. Agregar comando a `package.json`
```json
{
  "scripts": {
    "test:my-feature": "tsx scripts/test_my_feature.ts"
  }
}
```

### 3. Registrar en el orquestador
Edita `scripts/run_all_tests.ts`:

```typescript
const TEST_SUITES: TestSuite[] = [
  // ... suites existentes
  { name: "My Feature", command: "test:my-feature", category: "unit" },
];
```

### 4. Ejecutar
```bash
npm run test:my-feature  # Individual
npm test                 # Todas las suites
```

---

## 🏗️ Estrategia de Testing

### Pirámide de Tests
```
        /\
       /  \      E2E Tests (22)
      /____\     - Flujo completo
     /      \    - Integración real
    /________\   
   /          \  Unit Tests (17)
  /____________\ - Lógica aislada
                 - Casos límite

  Smoke Tests (21)
  - Permisos RBAC
  - Rutas críticas
```

### Principios
1. **Fail-safe:** Si una suite falla, las demás continúan ejecutándose
2. **Fresh DB:** Cada suite asume una base de datos limpia (ejecutar seed antes)
3. **No mocks:** Tests E2E usan servidor real y DB real
4. **Exit codes:** 0 = éxito, 1 = fallo (compatible con CI/CD)

### Convenciones
- **Nombres:** `test_<feature>_<type>.ts` (e.g., `test_trust_score_v2.ts`)
- **Ubicación:** `scripts/` (mismo directorio que migraciones)
- **Assertions:** Lanzar `Error` si falla, `console.log("✅")` si pasa
- **Cleanup:** Siempre `prisma.$disconnect()` en `finally`

---

## 🐛 Troubleshooting

### Error: "Port 5959 already in use"
**Causa:** El servidor de tests E2E no se cerró correctamente.

**Solución:**
```bash
# Matar proceso en puerto 5959
lsof -ti:5959 | xargs kill -9

# O reiniciar tests
npm test
```

### Error: "Database schema out of sync"
**Causa:** Migraciones no aplicadas o schema desactualizado.

**Solución:**
```bash
npx prisma migrate reset --force
npm run db:seed
npm test
```

### Error: "JWT verification failed"
**Causa:** `JWT_SECRET` no configurado o token inválido.

**Solución:**
```bash
# Verificar .env
echo $JWT_SECRET

# Regenerar tokens en tests si es necesario
```

### Error: "GEMINI_API_KEY not found"
**Causa:** Tests que usan AI (si existen) requieren la API key.

**Solución:**
```bash
# Agregar a .env
GEMINI_API_KEY="tu-clave-aqui"

# O skip tests de AI si no son críticos
```

### Tests fallan inconsistentemente
**Causa:** Condiciones de carrera o estado compartido.

**Solución:**
```bash
# Ejecutar suites individuales
npm run test:trust-v2

# Si pasan individualmente pero fallan juntas:
# Revisar cleanup de DB entre suites
```

### Error: "Cannot find module 'tsx'"
**Causa:** Dependencias no instaladas.

**Solución:**
```bash
npm install
npm test
```

---

## 📚 Referencias

### Documentación Interna
- [`constraints.md`](../constraints.md) - Campos reservados y restricciones
- [`PLAN_DE_TAREAS_MVP.md`](../PLAN_DE_TAREAS_MVP.md) - Roadmap de sprints
- [`schema.prisma`](../prisma/schema.prisma) - Modelos de base de datos
- [`admin-permission-test-runbook.md`](./admin-permission-test-runbook.md) - Detalles de tests RBAC

### Archivos de Tests
- `scripts/test_trust_score_v2.ts` - Trust Score v2
- `scripts/test_risk_telemetry.ts` - Risk Telemetry
- `scripts/test_admin_permissions.ts` - Admin Permissions
- `scripts/test_sprint2_trust_v2_e2e.ts` - Sprint 2 E2E
- `scripts/test_risk_integration_e2e.ts` - Risk Integration

### Comandos Útiles
```bash
# Ver logs de Prisma
export DEBUG="prisma:*"
npm test

# Ejecutar con verbose
npm run test:trust-v2 --verbose

# CI/CD modo
npm test && echo "Tests passed" || echo "Tests failed"
```

---

## 🎯 Próximos Pasos

### Tests Pendientes (Roadmap)
- [ ] Tests de formalización (si se activa post-MVP)
- [ ] Tests de auto-solicitud (prevención de gaming)
- [ ] Tests de auto-reseña (prevención de gaming)
- [ ] Tests de concurrencia (race conditions)
- [ ] Tests de performance (benchmarks)
- [ ] Tests de seguridad (SQL injection, XSS)

### Mejoras Planeadas
- [ ] Coverage reports (Istanbul/NYC)
- [ ] CI/CD integration (GitHub Actions)
- [ ] Parallel test execution (cuando sea seguro)
- [ ] Test fixtures (shared test data)
- [ ] Snapshot testing (API responses)

---

**Última actualización:** 2026-09-03 05:18 UTC  
**Sprint:** 4 (Cleanup + Suite Unificada)  
**Cobertura:** 60 tests (17 unit, 22 e2e, 21 smoke)  
**Estrategia:** Fail-safe, fresh DB, real server
