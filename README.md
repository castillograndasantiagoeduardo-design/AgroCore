# 🌱 AgroCore

> **Plataforma de Inteligencia Climática y Rotación Agronómica de Cultivos**
> Diseñada para optimizar decisiones agrícolas utilizando datos satelitales diarios de la **NASA (POWER)**, modelos de calibración con estaciones del **IDEAM** y algoritmos deterministas de evaluación multicriterio bajo **Clean Architecture**.

---

## 🚀 Características Principales

- **🛰️ Clima Satelital NASA POWER (30 años):** Consulta series históricas de precipitación y temperaturas diarias (1996–2025), ajustadas por gradiente altitudinal (-0,0065 °C/m).
- **📊 Calibración Local IDEAM:** Calibra automáticamente sesgos de precipitación satelital con la estación meteorológica más cercana (Surbatá-Bonza a 5,4 km en Duitama), detectando meses de heladas y régimen bimodal.
- **🔄 Motor de Rotaciones de 2 Años (4 semestres):**
  - **Estrategia A (Actual / Monocultivo):** Diagnóstico de la práctica actual y riesgos.
  - **Estrategia B (Cuidado del Suelo):** Optimiza fijación biológica de nitrógeno, cobertura vegetal y ruptura de ciclos de plagas.
  - **Estrategia C (Forraje y Ganadería):** Maximiza biomasa forrajera de alta calidad para lechería.
- **🗺️ Selector en Mapa Interactivo (OpenStreetMap / Leaflet):** Selección visual de coordenadas geográficas en el mapa con verificación de zona agronómica.
- **🎯 Presets de Prioridades:** Configuración con un clic para *Ahorro de Agua*, *Máxima Rentabilidad (Ventas)*, *Recuperación del Suelo*, *Control de Plagas* y *Forraje*.
- **🔐 Seguridad y Autenticación:** Tokens JWT HS256, contraseñas hasheadas con PBKDF2 (Web Crypto nativo) y control de acceso basado en roles (RBAC).
- **🤖 Servidor MCP Integrado:** Herramientas listas para que Agentes de IA (Claude, Gemini, Antigravity) consulten clima y evalúen rotaciones de fincas vía protocolo MCP.

---

## 🏛️ Arquitectura del Sistema (Clean Architecture + DDD)

El proyecto sigue estrictamente los principios de **Arquitectura Limpia**, **Puertos y Adaptadores (Hexagonal)** y **Domain-Driven Design (DDD)**:

```text
AgroCore/
├── Shared/
│   └── contracts/              # @duitamacrece/contracts (Zod, Roles, Permisos RBAC)
├── Backend/                    # Workspace Deno 2.x
│   ├── packages/
│   │   ├── shared-kernel/      # Primitivas (Result<T,E>, DomainError, Pagination)
│   │   ├── core/               # Dominio puro y Casos de Uso (fincas, clima, cultivos, rotaciones, auth)
│   │   ├── database/           # Drizzle ORM + MySQL 8 (Repositorios y Mappers)
│   │   ├── platform/           # Adaptadores técnicos (NASA POWER, IDEAM, PBKDF2, JWT HS256)
│   │   └── composition/        # Composition Root (createContainer)
│   └── apps/
│       ├── api/                # API REST con Hono
│       └── mcp-server/         # Servidor MCP para Agentes IA
├── Frontend/                   # Next.js 16 (App Router + React 19 + Tailwind CSS v4 + Leaflet)
├── Docs/                       # DDL SQL, migraciones y documentación técnica
└── Http/                       # Pruebas HTTP ejecutables (.http)
```

---

## ⚡ Requisitos Previos

- **Deno** 2.x o superior
- **Node.js** 20.x o superior con `npm`
- **MySQL** 8.0 local

---

## 🛠️ Configuración Rápida

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/castillograndasantiagoeduardo-design/AgroCore.git
   cd AgroCore
   ```

2. **Configurar variables de entorno:**
   Copia `.env.example` a `.env` y define tus credenciales locales de MySQL:
   ```bash
   cp .env.example .env
   ```

3. **Base de Datos:**
   Ejecuta el script `Docs/ddl.sql` en MySQL para crear la base de datos `duitama_crece` y sus tablas.

4. **Instalar dependencias del Frontend:**
   ```bash
   cd Frontend
   npm install
   ```

---

## 🏃‍♂️ Ejecución

### 1. Iniciar la API REST (Backend):
```bash
cd Backend
deno task dev:api
```
*API disponible en:* `http://localhost:8001`

### 2. Iniciar la Interfaz Web (Frontend):
```bash
cd Frontend
npm run dev
```
*Aplicación disponible en:* `http://localhost:3000`

### 3. Crear Usuario Administrador:
```bash
cd Backend
deno run -A --env-file=../.env scripts/crear-admin.ts
```

---

## 🧪 Pruebas y Calidad de Código

Desde la carpeta `Backend/`:
```bash
# Ejecutar suite de pruebas unitarias
deno task test

# Verificación estricta de tipos
deno task check
```

Desde la carpeta `Frontend/`:
```bash
npx tsc --noEmit
```

---

## 📄 Licencia

Desarrollado bajo licencia MIT para el reto **NASA Space Apps Challenge**.
