// Testes que precisam de um navegador de verdade (DOMParser, WebCrypto, página inteira).
// Rodar: node --test estoque/testes/   (pula se o Playwright não estiver instalado:
//   npm i -g playwright && npx playwright install chromium, ou PLAYWRIGHT_PATH=/caminho/node_modules/playwright)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, readdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..'); // raiz do repositório notas

const require = createRequire(import.meta.url);
function acharPlaywright() {
  for (const c of ['playwright', process.env.PLAYWRIGHT_PATH, '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) {
    if (!c) continue;
    try { return require(c); } catch { /* tenta o próximo */ }
  }
  return null;
}
const pw = acharPlaywright();

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

/** Servidor estático mínimo da raiz do repositório (ES modules não carregam de file://). */
function servir(raiz) {
  const srv = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let caminho = decodeURIComponent(url.pathname);
      if (caminho.endsWith('/')) caminho += 'index.html';
      const alvo = resolve(raiz, '.' + caminho);
      if (!alvo.startsWith(raiz)) { res.writeHead(403); return res.end(); }
      const corpo = await readFile(alvo);
      res.writeHead(200, { 'content-type': TIPOS[extname(alvo)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(corpo);
    } catch {
      res.writeHead(404); res.end('não encontrado');
    }
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

let navegador, servidor;
test.before(async () => {
  if (!pw) return;
  servidor = await servir(RAIZ);
  navegador = await pw.chromium.launch();
});
test.after(async () => {
  if (navegador) await navegador.close();
  if (servidor) servidor.srv.close();
});

test('nfe.js lê os XMLs de exemplo igual ao parser Python', { skip: !pw && 'Playwright não encontrado' }, async () => {
  const esperado = JSON.parse(await readFile(join(AQUI, 'fixture-nfe-esperado.json'), 'utf-8'));
  const pagina = await navegador.newPage();
  await pagina.goto(`${servidor.base}/estoque/testes/harness.html`);
  await pagina.waitForFunction(() => window.harnessPronto === true);
  const arquivos = (await readdir(join(AQUI, 'xml'))).filter(a => a.endsWith('.xml')).sort();
  assert.deepEqual(arquivos, Object.keys(esperado).sort());
  for (const nome of arquivos) {
    const obtido = await pagina.evaluate(async (n) => {
      const xml = await (await fetch(`/estoque/testes/xml/${n}`)).text();
      return window.estoque.nfe.lerNfeTexto(xml, n);
    }, nome);
    assert.deepEqual(obtido, esperado[nome], nome);
  }
  // XML inválido e XML que não é NF-e
  const erros = await pagina.evaluate(() => {
    const { lerNfeTexto, NFeInvalida } = window.estoque.nfe;
    const tenta = (x) => { try { lerNfeTexto(x, 't'); return 'ok'; } catch (e) { return e instanceof NFeInvalida ? e.message : 'outro erro'; } };
    return [tenta('<isso nao fecha'), tenta('<outra><coisa/></outra>'),
      tenta('<NFe><infNFe Id="NFe123"><ide><dEmi>2020-01-01</dEmi></ide></infNFe></NFe>')];
  });
  assert.match(erros[0], /XML inválido/);
  assert.match(erros[1], /infNFe não encontrado/);
  assert.match(erros[2], /chave de acesso inválida/);
  await pagina.close();
});

test('ferramentas/cifrar_pagina.py gera página que o navegador decifra com a senha', { skip: !pw && 'Playwright não encontrado' }, async () => {
  const temPython = spawnSync('python3', ['-c', 'import cryptography'], { encoding: 'utf-8' }).status === 0;
  if (!temPython) { test.skip('python3 com cryptography não disponível'); return; }
  const dir = await mkdtemp(join(tmpdir(), 'cifra-'));
  const claro = join(dir, 'claro.html');
  await writeFile(claro, '<!doctype html><html><body><h1 id="ok">DECIFRADO ✔ áéç</h1></body></html>', 'utf-8');
  const saida = join(RAIZ, 'estoque', 'testes', '_cifrada.tmp.html');
  const r = spawnSync('python3', [join(RAIZ, 'ferramentas', 'cifrar_pagina.py'), claro, '--saida', saida, '--senha-env', 'SENHA_TESTE', '--iteracoes', '1000'],
    { encoding: 'utf-8', env: { ...process.env, SENHA_TESTE: 'segredo-123' } });
  assert.equal(r.status, 0, r.stderr);
  try {
    const pagina = await navegador.newPage();
    await pagina.goto(`${servidor.base}/estoque/testes/_cifrada.tmp.html`);
    await pagina.fill('#pw', 'errada');
    await pagina.click('button');
    await pagina.waitForFunction(() => document.getElementById('err')?.textContent === 'Senha incorreta.');
    await pagina.fill('#pw', 'segredo-123');
    await pagina.press('#pw', 'Enter');
    await pagina.waitForSelector('#ok');
    assert.equal(await pagina.textContent('#ok'), 'DECIFRADO ✔ áéç');
    // lembrou a senha na chave própria da página, não na do painel
    const chaves = await pagina.evaluate(() => [localStorage.getItem('fdr_est_pw'), localStorage.getItem('fdr_pw')]);
    assert.deepEqual(chaves, ['segredo-123', null]);
    await pagina.close();
  } finally {
    const { unlink } = await import('node:fs/promises');
    await unlink(saida).catch(() => {});
  }
});
