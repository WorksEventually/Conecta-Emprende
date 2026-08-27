# Git Workflow — Conecta Emprende AI

**Proyecto:** Conecta Emprende AI  
**Hackathon Nicaragua 2026**  
**Categoría:** Avanzado  

Este documento describe el flujo de ramas y merge que sigue el equipo.  
El objetivo es mantener un proceso ordenado, trazable y profesional, donde el código solo llega a `master` después de pasar por etapas de validación.

---

## 1. Estructura de ramas

```
feature/*  →  test  →  QA  →  master
```

| Rama | Propósito | Quién puede mergear hacia ella |
|------|-----------|--------------------------------|
| `feature/*` | Desarrollo de nuevas funcionalidades o correcciones | Desarrolladores del equipo |
| `test` | Integración y verificación de que los cambios funcionan correctamente | Desde `feature/*` (vía Pull Request) |
| `QA` | Validación de calidad y revisión final antes de producción | Desde `test` (vía Pull Request) |
| `master` | Código estable y listo. Solo contiene cambios que ya pasaron por `test` y `QA` | Desde `QA` (vía Pull Request) |

---

## 2. Flujo de trabajo diario

### 2.1 Crear una nueva funcionalidad

```bash
# Partir siempre desde test actualizado
git checkout test
git pull origin test

# Crear la rama de feature
git checkout -b feature/nombre-descriptivo

# Desarrollar, hacer commits y subir
git push -u origin feature/nombre-descriptivo
```

**Convención de nombres de ramas feature:**
- `feature/busqueda-ia`
- `feature/sistema-rating`
- `feature/modulo-formalizacion`
- `fix/corregir-mapa`
- `chore/actualizar-dependencias`

### 2.2 Integrar la feature en `test`

1. Crear un **Pull Request** desde `feature/...` hacia `test`.
2. Asignar al menos un revisor del equipo.
3. Resolver comentarios y asegurarse de que el código compile / funcione.
4. Mergear el Pull Request (preferiblemente con “Squash and merge” o “Rebase and merge”).
5. Eliminar la rama `feature/...` después del merge (opcional pero recomendado).

### 2.3 Promover de `test` a `QA`

1. Crear un **Pull Request** desde `test` hacia `QA`.
2. Verificar que los cambios se comportan correctamente en conjunto.
3. Mergear solo cuando el equipo esté de acuerdo en que la versión es estable para revisión de calidad.

### 2.4 Promover de `QA` a `master`

1. Crear un **Pull Request** desde `QA` hacia `master`.
2. Realizar la validación final (revisión de funcionalidad crítica, UI, flujos principales).
3. Mergear a `master` **solo** después de pasar la validación de QA.
4. Etiquetar la versión si es necesario (`v0.1.0`, `v0.2.0`, etc.).

---

## 3. Reglas importantes

1. **Nunca** se hace push directo a `master`.
2. **Nunca** se salta la etapa `test` o `QA`.
3. Todo cambio llega a `master` únicamente a través de Pull Requests.
4. Las ramas `feature/*` deben ser de corta duración (idealmente menos de una semana).
5. Se recomienda que al menos una persona distinta al autor revise el Pull Request antes de mergear a `test`.
6. `master` debe representar siempre una versión funcional y estable del proyecto.

---

## 4. Protección de ramas (GitHub)

Se recomienda configurar **Branch Protection Rules** en GitHub:

### Rama `master`
- Require a pull request before merging
- Require at least 1 approval
- Do not allow bypassing the above settings
- Restrict who can push to matching branches (solo administradores)

### Rama `QA`
- Require a pull request before merging
- Require at least 1 approval

### Rama `test` (recomendado)
- Require a pull request before merging

**Cómo configurarlo:**  
Repository → **Settings** → **Branches** → **Add branch protection rule**

---

## 5. Validación en cada etapa

| Etapa | Qué se valida |
|-------|---------------|
| `feature` → `test` | El cambio individual funciona y no rompe lo existente |
| `test` → `QA` | La integración de varios cambios funciona correctamente en conjunto |
| `QA` → `master` | Revisión final de calidad, flujos principales y estabilidad general |

Si el proyecto cuenta con tests automatizados o CI, estos deben pasar antes de permitir el merge en cada etapa.

---

## 6. Resumen visual del flujo

```
┌─────────────────┐
│  feature/*      │  ← Desarrollo individual
└────────┬────────┘
         │ Pull Request
         ▼
┌─────────────────┐
│  test           │  ← Integración + verificación
└────────┬────────┘
         │ Pull Request
         ▼
┌─────────────────┐
│  QA             │  ← Validación de calidad
└────────┬────────┘
         │ Pull Request
         ▼
┌─────────────────┐
│  master         │  ← Código estable
└─────────────────┘
```

---

## 7. Responsabilidades del equipo

| Rol | Responsabilidad |
|-----|-----------------|
| Desarrollador | Crear ramas `feature/*`, abrir PRs hacia `test`, resolver comentarios |
| Revisor | Revisar PRs, aprobar o solicitar cambios |
| Tech Lead / Coordinador | Autorizar promoción de `test` → `QA` y de `QA` → `master` |

---

## 8. Notas para evaluadores

Este flujo de ramas tiene como objetivo:

- Garantizar que el código en `master` ha pasado por al menos dos etapas de validación (`test` y `QA`).
- Evitar merges directos y desordenados.
- Facilitar la trazabilidad de los cambios mediante Pull Requests.
- Demostrar buenas prácticas de control de versiones y trabajo en equipo.

El repositorio está configurado para que el camino normal de cualquier cambio sea:

**feature → test → QA → master**

---

**Documento mantenido por el equipo de Conecta Emprende AI**  
Hackathon Nicaragua 2026
