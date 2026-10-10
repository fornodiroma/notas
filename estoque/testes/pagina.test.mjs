// Teste de ponta a ponta da página estoque.html no Chromium (Playwright), com os dados de exemplo
// servidos no lugar de dados/estoque/*.json. Pula se o Playwright não estiver instalado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const require = createRequire(import.meta.url);
function acharPlaywright() {
  for (const c of ['playwright', process.env.PLAYWRIGHT_PATH, '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) {
    if (!c) continue;
    try { return require(c); } catch { /* próximo */ }
  }
  return null;
}
const pw = acharPlaywright();

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

/** Monta os 4 arquivos do sistema a partir do fixture plano do CLI. */
async function arquivosExemplo() {
  const d = JSON.parse(await readFile(join(AQUI, 'fixture-exemplo-dados.json'), 'utf-8'));
  const notas = {};
  for (const n of d.nfes) { const { chave, ...resto } = n; notas[chave] = resto; }
  return {
    'dados/estoque/cadastro.json': { versao: 1, lojas: { '11222333000181': 'Forno Di Roma' }, insumos: d.insumos, produtos: d.produtos, fichas: d.fichas, mapeamento: d.mapeamento },
    'dados/estoque/nfe_itens.json': { versao: 1, notas },
    'dados/estoque/vendas.json': { versao: 1, vendas: d.vendas.map(v => ({ ...v, loja: '' })) },
    'dados/estoque/contagens.json': { versao: 1, contagens: d.contagens.map(c => ({ ...c, loja: '' })) },
    'dados/contas.json': { contas: [], notas: {
      '35260912345678000190550010000001231000001231': { status: 'aprovada', forn: 'LATICINIOS BOA VISTA LTDA', cnpj: '12345678000190', nf: '123', emissao: '2026-09-02', vnf: 4152.5, sem_xml: false },
      '99999999999999999999999999999999999999999999': { status: 'aprovada', forn: 'FORNECEDOR SEM XML', cnpj: '1', nf: '777', emissao: '2026-09-25', vnf: 10, sem_xml: true },
      '88888888888888888888888888888888888888888888': { status: 'cancelada', forn: 'CANCELADA', cnpj: '2', nf: '555', emissao: '2026-09-26', vnf: 5, sem_xml: false },
    } },
  };
}

function servir(raiz, virtuais) {
  const srv = createServer(async (req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
    if (virtuais[caminho]) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(virtuais[caminho]));
    }
    try {
      const alvo = resolve(raiz, caminho || 'index.html');
      if (!alvo.startsWith(raiz)) { res.writeHead(403); return res.end(); }
      res.writeHead(200, { 'content-type': TIPOS[extname(alvo)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(alvo));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

let navegador, servidor;
test.before(async () => {
  if (!pw) return;
  servidor = await servir(RAIZ, await arquivosExemplo());
  navegador = await pw.chromium.launch();
});
test.after(async () => { if (navegador) await navegador.close(); if (servidor) servidor.srv.close(); });

async function abrir(contexto, hash = '') {
  const pagina = await contexto.newPage();
  const errosConsole = [];
  pagina.on('console', m => { if (m.type() === 'error') errosConsole.push(m.text()); });
  pagina.on('pageerror', e => errosConsole.push(String(e)));
  await pagina.goto(`${servidor.base}/estoque.html${hash}`);
  await pagina.waitForFunction(() => window.__estoque && Object.keys(window.__estoque.estado.arquivos).length === 4);
  return { pagina, errosConsole };
}

test('conciliação na página bate com o CLI e a UI mostra pendências', { skip: !pw && 'Playwright não encontrado' }, async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1200, height: 900 } });
  const { pagina, errosConsole } = await abrir(contexto);
  await pagina.fill('#c-de', '2026-09-01');
  await pagina.fill('#c-ate', '2026-09-30');
  await pagina.click('[data-acao="calcular"]');
  await pagina.waitForSelector('#c-saida .cards');
  const cards = await pagina.$$eval('#c-saida .card .v', els => els.map(e => e.textContent));
  assert.deepEqual(cards, ['1.440', 'R$ 57.280,00', 'R$ 8.002,50', 'R$ 10.526,15', 'R$ 10.608,52', 'R$ 82,37']);
  const mussarela = await pagina.$$eval('#c-saida table tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)).find(c => c[0] === 'Mussarela'));
  assert.deepEqual(mussarela, ['Mussarela', 'kg', '50,000', '160,000', '196,000', '14,000', '11,500', '-2,500', '-1,3%']);
  assert.ok(await pagina.textContent('#c-saida'), /DETERGENTE NEUTRO 5L/);
  assert.match(await pagina.textContent('#c-saida'), /Pizza Portuguesa/);
  assert.match(await pagina.textContent('#c-saida'), /sem ficha técnica/);
  // filtro por loja: NF-e do CNPJ cadastrado continua; vendas/contagens (loja '') saem
  await pagina.selectOption('#c-loja', 'Forno Di Roma');
  await pagina.click('[data-acao="calcular"]');
  const cardsLoja = await pagina.$$eval('#c-saida .card .v', els => els.map(e => e.textContent));
  assert.equal(cardsLoja[0], '0');
  assert.equal(cardsLoja[2], 'R$ 8.002,50');
  await pagina.screenshot({ path: process.env.SCREENSHOT_CONCILIACAO || join(AQUI, '_conciliacao.tmp.png'), fullPage: true });
  assert.deepEqual(errosConsole, []);
  await contexto.close();
});

test('NF-es: cruza com o painel, importa XML pelo input e marca para salvar', { skip: !pw && 'Playwright não encontrado' }, async () => {
  const contexto = await navegador.newContext({ viewport: { width: 420, height: 860 }, isMobile: true, hasTouch: true });
  const { pagina, errosConsole } = await abrir(contexto, '#nfes');
  await pagina.waitForSelector('#n-lista details');
  let texto = await pagina.textContent('#n-lista');
  assert.match(texto, /NF 777.*XML ainda não chegou/s);
  assert.match(texto, /NF 555.*cancelada no painel/s);
  assert.match(texto, /NF 4471.*1 item\(ns\) sem mapeamento/s);
  assert.match(texto, /NF 123.*3 item\(ns\) no estoque/s);
  assert.match(texto, /não está na triagem do painel/);
  // remover e reimportar a nota 131 pelo input de arquivo
  await pagina.click('details:has-text("NF 131") summary');
  pagina.once('dialog', d => d.accept());
  await pagina.click('[data-acao="nfe-remover"][data-chave="35260912345678000190550010000001311000001314"]');
  await pagina.waitForFunction(() => !window.__estoque.estado.arquivos.nfe_itens.notas['35260912345678000190550010000001311000001314']);
  assert.equal(await pagina.textContent('#btn-salvar'), 'Salvar (1)');
  await pagina.setInputFiles('#n-arquivos', [join(AQUI, 'xml', 'nfe-000131-laticinios.xml'), join(AQUI, 'xml', 'nfe-000123-laticinios.xml')]);
  await pagina.waitForFunction(() => Boolean(window.__estoque.estado.arquivos.nfe_itens.notas['35260912345678000190550010000001311000001314']));
  assert.match(await pagina.textContent('#toast'), /1 nota\(s\) importada\(s\) · 1 já estava/);
  // a nota voltou com os mesmos itens (e com arquivo/importada_em novos, por isso continua "a salvar")
  const reimportada = await pagina.evaluate(() => window.__estoque.estado.arquivos.nfe_itens.notas['35260912345678000190550010000001311000001314']);
  assert.equal(reimportada.itens.length, 1);
  assert.equal(reimportada.arquivo, 'nfe-000131-laticinios.xml');
  assert.equal(await pagina.textContent('#btn-salvar'), 'Salvar (1)');
  // "só pendências" deixa 4471 (item sem mapeamento) e 777 (falta XML? não: sem_xml=true não é pendência) -> só 4471
  await pagina.check('#n-so-pendentes');
  texto = await pagina.textContent('#n-lista');
  assert.match(texto, /NF 4471/);
  assert.doesNotMatch(texto, /NF 123/);
  assert.doesNotMatch(texto, /NF 777/);
  // mapear o detergente a partir da lista: cria linha no mapeamento com cnpj+cprod
  await pagina.click('details:has-text("NF 4471") summary');
  await pagina.click('[data-acao="mapear"][data-cprod="C01"]');
  await pagina.waitForSelector('#aba-mapeamento.ativa');
  const ultimo = await pagina.$$eval('#m-lista .mapa-linha', cs => { const c = cs[cs.length - 1]; return ['cnpj', 'cprod', 'ean', 'texto', 'fator'].map(n => c.querySelector(`[data-campo="${n}"]`).value); });
  assert.deepEqual(ultimo, ['98765432000110', 'C01', '', '', '']);
  assert.match(await pagina.textContent('#m-lista .mapa-linha:last-child'), /item: DETERGENTE NEUTRO 5L/);
  assert.deepEqual(errosConsole, []);
  await pagina.screenshot({ path: join(AQUI, '_nfes-celular.tmp.png'), fullPage: true });
  await contexto.close();
});

test('vendas, contagem, ficha e rascunho sobrevivem ao recarregar', { skip: !pw && 'Playwright não encontrado' }, async () => {
  const contexto = await navegador.newContext({ viewport: { width: 420, height: 860 }, isMobile: true, hasTouch: true });
  const { pagina, errosConsole } = await abrir(contexto, '#vendas');
  // venda pelo formulário (soma com a existente do mesmo dia/produto/origem)
  await pagina.fill('#v-data', '2026-09-30');
  await pagina.fill('#v-produto', 'Pizza Mussarela');
  await pagina.fill('#v-qtd', '5');
  await pagina.fill('#v-origem', 'balcao');
  await pagina.click('#v-form button[type=submit]');
  await pagina.waitForFunction(() => window.__estoque.estado.arquivos.vendas.vendas.find(v => v.data === '2026-09-30' && v.produto === 'Pizza Mussarela' && v.origem === 'balcao')?.quantidade === 35);
  // contagem em kg converte para g
  await pagina.click('#abas button[data-aba="contagem"]');
  await pagina.fill('#k-data', '2026-10-05');
  await pagina.fill('#k-tabela input[data-insumo="Mussarela"]', '7.5'); // o teclado pt-BR digita "7,5"; o campo numérico normaliza
  await pagina.click('[data-acao="contagem-gravar"]');
  await pagina.waitForFunction(() => window.__estoque.estado.arquivos.contagens.contagens.some(c => c.data === '2026-10-05' && c.insumo === 'Mussarela' && c.quantidade === 7500));
  // ficha: novo produto com dois ingredientes
  await pagina.click('#abas button[data-aba="fichas"]');
  await pagina.click('[data-acao="produto-novo"]');
  await pagina.fill('#f-nome', 'Pizza Dupla');
  await pagina.fill('#f-preco', '70');
  await pagina.click('[data-acao="ingrediente-novo"]');
  await pagina.selectOption('#f-editor select[data-i="0"]', 'Mussarela');
  await pagina.fill('#f-editor input[data-i="0"]', '400');
  await pagina.click('[data-acao="ingrediente-novo"]');
  await pagina.selectOption('#f-editor select[data-i="1"]', 'Farinha de trigo');
  await pagina.fill('#f-editor input[data-i="1"]', '180');
  await pagina.click('[data-acao="produto-salvar"]');
  await pagina.waitForFunction(() => window.__estoque.estado.arquivos.cadastro.fichas.filter(f => f.produto === 'Pizza Dupla').length === 2);
  assert.equal(await pagina.textContent('#btn-salvar'), 'Salvar (3)');
  // rascunho: recarregar a página mantém as 3 alterações
  await pagina.reload();
  await pagina.waitForFunction(() => window.__estoque && Object.keys(window.__estoque.estado.arquivos).length === 4);
  await pagina.waitForFunction(() => document.getElementById('btn-salvar').textContent === 'Salvar (3)');
  const estado = await pagina.evaluate(() => {
    const a = window.__estoque.estado.arquivos;
    return [a.cadastro.produtos.some(p => p.nome === 'Pizza Dupla'), a.contagens.contagens.some(c => c.data === '2026-10-05'), a.vendas.vendas.find(v => v.data === '2026-09-30' && v.origem === 'balcao' && v.produto === 'Pizza Mussarela').quantidade];
  });
  assert.deepEqual(estado, [true, true, 35]);
  // sem token, Salvar manda para Ajustes
  await pagina.click('#btn-salvar');
  await pagina.waitForSelector('#aba-ajustes.ativa');
  assert.match(await pagina.textContent('#toast'), /Conecte um token/);
  assert.deepEqual(errosConsole, []);
  await contexto.close();
});
