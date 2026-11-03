#!/usr/bin/env node
// CLI de finhub: ver src/cli/index.js
import { main } from '../src/cli/index.js';

const codigo = await main(process.argv.slice(2));
if (codigo !== null) process.exit(codigo);
