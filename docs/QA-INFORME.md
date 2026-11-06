# Informe de QA de finhub

Plan e inventario: [QA-PLAN.md](QA-PLAN.md). Se actualiza al terminar cada fase.

## Estado de partida
- Etiqueta `qa-inicio` en `558ffe4`.
- `~/.config/finhub/config.json`: **no existe** al empezar (hash registrado: «no existe»). `scripts/test.js` lo comprueba en cada ejecución.

## Bugs
Gravedades: crítico (R1, seguridad, pérdida o corrupción) · alto (cifra incorrecta o funcionalidad rota) · medio · bajo.

| Id | Gravedad | Qué pasaba y cómo reproducirlo | Causa raíz | Arreglo | Test |
|---|---|---|---|---|---|
