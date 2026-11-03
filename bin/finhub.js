#!/usr/bin/env node
// CLI de finhub. En F0 solo reconoce los comandos; el servidor llega en F2.
const AYUDA = `finhub · tu dinero en local

Uso:
  finhub [start]            arranca el servidor en 127.0.0.1:4747 y abre el navegador
  finhub stop | status      para el servidor o muestra su estado
  finhub carpeta [ruta]     muestra o cambia la carpeta de datos (Windows o WSL)

Opciones:
  --datos <ruta>   usa esa carpeta solo en esta ejecución
  --puerto <n>     puerto (por defecto 4747 o el siguiente libre)
  --silencioso     no abre el navegador
  --ejemplo        usa una copia temporal de ejemplo/ (datos inventados)
  -h, --help       esta ayuda`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(AYUDA);
  process.exit(0);
}
const comando = args.find((a) => !a.startsWith('-')) ?? 'start';
if (!['start', 'stop', 'status', 'carpeta'].includes(comando)) {
  console.error(`Comando desconocido: «${comando}».\n\n${AYUDA}`);
  process.exit(2);
}
console.error(`finhub ${comando}: aún no implementado (llega en la fase F2).`);
process.exit(1);
