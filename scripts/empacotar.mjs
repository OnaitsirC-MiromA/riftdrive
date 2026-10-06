#!/usr/bin/env node
// Junta o servidor inteiro — código, dependências e a interface embutida — num
// único dist/riftdrive.cjs.
//
// É esse arquivo que o `npx riftdrive` executa e que, mais adiante, vira o
// executável único. Nada de node_modules no destino, nada de compilar na
// instalação: o único requisito continua sendo o Node.
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const raiz = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const saida = path.join(raiz, 'dist', 'riftdrive.cjs');

// Limpa a pasta antes: sobra de um build anterior seria publicada junto.
fs.rmSync(path.dirname(saida), { recursive: true, force: true });

const resultado = await esbuild.build({
  entryPoints: [path.join(raiz, 'server', 'src', 'index.ts')],
  outfile: saida,
  bundle: true,
  platform: 'node',
  target: 'node22',
  // CommonJS, e não ESM: o Node SEA (o executável único) só aceita CommonJS como
  // entrada, e em CommonJS o require é nativo — o Fastify e suas dependências,
  // que são CJS e chamam require em tempo de execução, funcionam sem gambiarra.
  format: 'cjs',
  banner: { js: '#!/usr/bin/env node' },
  // Em CommonJS não existe import.meta.url; __filename é o equivalente e mantém
  // o createRequire válido no ramo que o bundle não usa.
  define: { 'import.meta.url': '__filename' },
  // Sem minificar: quando alguém for investigar um problema, vai ler ISTO.
  minify: false,
  metafile: true,
  logLevel: 'info',
});

fs.chmodSync(saida, 0o755);

const tamanho = fs.statSync(saida).size;
const web = fs.existsSync(path.join(raiz, 'web', 'dist'));
console.log(`\ndist/riftdrive.cjs — ${(tamanho / 1024 / 1024).toFixed(2)} MB${web ? '' : '  (ATENÇÃO: sem a interface embutida)'}`);

const externos = Object.keys(resultado.metafile.inputs).filter((f) => f.includes('node_modules'));
console.log(`empacotou ${Object.keys(resultado.metafile.inputs).length} arquivos (${externos.length} de dependências)`);
