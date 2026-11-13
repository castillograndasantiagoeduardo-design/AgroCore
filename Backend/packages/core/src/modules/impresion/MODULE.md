# 📦 Módulo `impresion`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

## 🎯 Propósito

Imprime en una **térmica ESC/POS de 58 mm** (Xprinter XP-58 compartida en Windows, 32 caracteres por línea en fuente A)
un ticket con el resumen del terreno seleccionado: nombre / coordenadas, fecha, aptitud, suelo, meses baldíos y
vulnerables, las estrategias con su puntaje, fuentes y el aviso **"Herramienta de apoyo. Validar con agrónomo local."**

## 🧩 Dominio y aplicación (core, puro)

| Elemento | Qué hace |
| :--- | :--- |
| `componerTicketTerreno` (`domain/services/componer-ticket.service.ts`) | Devuelve líneas YA cortadas al ancho con estilo (título, negrita, normal, separador, centrado). Sin bytes y sin `Date` (la fecha entra desde `IReloj`). |
| `ImprimirTicketTerrenoUseCase` | Recalcula terreno y rotaciones (misma caché que el Frontend: una sola fuente de verdad), compone el ticket y lo imprime; `soloVistaPrevia` no toca la impresora. |
| Puerto `IImpresoraTermica` | `imprimir(lineas) → Result<{ impresora }, DomainError>`. |
| `ImpresoraNoDisponibleError` | `IMPRESORA_NO_DISPONIBLE` → HTTP 503 (nunca una caída de la API). |

## 🖨️ Adaptador (platform): `EscPosWindowsPrinter`

`ESC @` · `ESC t n` (página de códigos, `IMPRESORA_CODEPAGE`, por defecto 2 = PC850) · `ESC a` · `ESC E` · `GS !` · LF ·
`GS V` (solo si `IMPRESORA_CORTADOR=true`). Codifica en CP850/858 (tildes, ñ, ¿, ¡, °), escribe un archivo temporal y lo
envía en crudo con `cmd /c copy /b <archivo> \localhost\XP58` (`IMPRESORA_COMPARTIDA`).

**Pasos humanos:** compartir la impresora en Windows con el nombre `XP58`; imprimir la autoprueba (apagar, mantener
FEED, encender) para confirmar la página de códigos; revisar con los ojos el ticket de `scripts/probar-impresora.ts`.

**Respaldo** (backend en otro equipo o impresora no disponible): el Frontend ofrece `window.print()` con la vista
`TicketImprimible` (`@page { size: 58mm auto; margin: 0 }`, 48 mm útiles).

## 📁 Entradas

- `POST /api/impresion/terreno` (`Shared/contracts/src/impresion.schema.ts`) · `Http/impresion.http`
- Tool MCP `impresion_terreno`
- `deno run -A --env-file=../.env scripts/probar-impresora.ts` (0 = impreso · 2 = IMPRESORA_NO_DISPONIBLE controlado)
