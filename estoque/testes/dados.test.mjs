// Testes da camada de dados (mesclagem em 3 vias, normalização, conversão para o motor, base64).
import test from 'node:test';
import assert from 'node:assert/strict';

import { base64ParaUtf8, mesclar3, mudou, normalizar, paraMotor, PADROES, rascunhoCarregar, rascunhoLimpar, rascunhoSalvar, Repositorio, utf8ParaBase64 } from '../dados.js';

test('base64 em UTF-8 (acentos e emojis)', () => {
  const t = 'Mussarela — açaí 🍕';
  assert.equal(base64ParaUtf8(utf8ParaBase64(t)), t);
  assert.equal(utf8ParaBase64('abc'), 'YWJj');
});

test('normalizar aceita arquivo vazio, lista pura e campos faltando', () => {
  assert.deepEqual(normalizar('vendas', null), PADROES.vendas());
  assert.deepEqual(normalizar('vendas', [{ data: '2026-09-01' }]).vendas, [{ data: '2026-09-01' }]);
  const c = normalizar('cadastro', { insumos: 'errado', lojas: [] });
  assert.deepEqual(c.insumos, []);
  assert.deepEqual(c.lojas, {});
  assert.deepEqual(c.fichas, []);
  assert.deepEqual(normalizar('nfe_itens', { notas: null }).notas, {});
});

test('mesclar3: alteração local vence, exclusão local é respeitada, novidade remota entra', () => {
  const base = { versao: 1, vendas: [
    { data: '2026-09-01', produto: 'A', quantidade: 1, origem: '', loja: '' },
    { data: '2026-09-01', produto: 'B', quantidade: 2, origem: '', loja: '' },
    { data: '2026-09-01', produto: 'C', quantidade: 3, origem: '', loja: '' },
  ] };
  const local = { versao: 1, vendas: [
    { data: '2026-09-01', produto: 'A', quantidade: 10, origem: '', loja: '' }, // alterado localmente
    // B excluído localmente
    { data: '2026-09-01', produto: 'C', quantidade: 3, origem: '', loja: '' },
    { data: '2026-09-02', produto: 'D', quantidade: 4, origem: '', loja: '' }, // novo local
  ] };
  const remoto = { versao: 1, atualizado: 'x', vendas: [
    { data: '2026-09-01', produto: 'A', quantidade: 1, origem: '', loja: '' },
    { data: '2026-09-01', produto: 'B', quantidade: 2, origem: '', loja: '' },
    { data: '2026-09-01', produto: 'C', quantidade: 30, origem: '', loja: '' }, // alterado remotamente
    { data: '2026-09-03', produto: 'E', quantidade: 5, origem: '', loja: '' },  // novo remoto
  ] };
  const r = mesclar3('vendas', base, local, remoto);
  const porProduto = Object.fromEntries(r.vendas.map(v => [v.produto, v.quantidade]));
  assert.deepEqual(porProduto, { A: 10, C: 30, E: 5, D: 4 });
  assert.equal(r.atualizado, 'x'); // metadados vêm do remoto até a gravação
});

test('mesclar3: objetos chaveados (notas por chave, lojas por cnpj)', () => {
  const base = { notas: { k1: { numero: '1' }, k2: { numero: '2' } } };
  const local = { notas: { k1: { numero: '1' }, k3: { numero: '3' } } };          // k2 excluída, k3 nova
  const remoto = { notas: { k1: { numero: '1', obs: 'robô' }, k2: { numero: '2' }, k4: { numero: '4' } } };
  const r = mesclar3('nfe_itens', base, local, remoto);
  assert.deepEqual(Object.keys(r.notas).sort(), ['k1', 'k3', 'k4']);
  assert.equal(r.notas.k1.obs, 'robô');
  const c = mesclar3('cadastro', { lojas: { a: 'X' } }, { lojas: { a: 'Y' } }, { lojas: { a: 'X', b: 'Z' } });
  assert.deepEqual(c.lojas, { a: 'Y', b: 'Z' });
});

test('mesclar3 sem base (primeira gravação) mantém o remoto e acrescenta o local', () => {
  const r = mesclar3('contagens', null, { contagens: [{ data: '2026-09-30', insumo: 'M', quantidade: 1, loja: '' }] },
    { contagens: [{ data: '2026-08-31', insumo: 'M', quantidade: 2, loja: '' }] });
  assert.equal(r.contagens.length, 2);
});

test('mudou compara só as coleções, não os metadados', () => {
  const a = { versao: 1, atualizado: '1', vendas: [] };
  const b = { versao: 1, atualizado: '2', vendas: [] };
  assert.equal(mudou('vendas', a, b), false);
  assert.equal(mudou('vendas', a, { ...b, vendas: [{}] }), true);
});

test('paraMotor: achata os arquivos e filtra por loja (NF-e pelo CNPJ do destinatário)', () => {
  const arquivos = {
    cadastro: { lojas: { '111': 'Loja A', '222': 'Loja B' }, insumos: [{ nome: 'M', unidade: 'g' }], produtos: [], fichas: [], mapeamento: [] },
    nfe_itens: { notas: { c1: { numero: '1', destinatario_cnpj: '11.1', itens: [] }, c2: { numero: '2', destinatario_cnpj: '222', itens: [] } } },
    vendas: { vendas: [{ data: '2026-09-01', produto: 'P', quantidade: 1, loja: 'Loja A' }, { data: '2026-09-01', produto: 'P', quantidade: 2, loja: 'loja b' }] },
    contagens: { contagens: [{ data: '2026-09-01', insumo: 'M', quantidade: 1, loja: '' }] },
  };
  const tudo = paraMotor(arquivos);
  assert.equal(tudo.nfes.length, 2);
  assert.equal(tudo.vendas.length, 2);
  const a = paraMotor(arquivos, { loja: 'Loja A' });
  assert.deepEqual(a.nfes.map(n => n.chave), ['c1']);
  assert.equal(a.vendas.length, 1);
  assert.equal(a.contagens.length, 0);
  const b = paraMotor(arquivos, { loja: 'LOJA B' });
  assert.deepEqual(b.nfes.map(n => n.chave), ['c2']);
  assert.equal(b.vendas[0].quantidade, 2);
});

test('Repositorio.salvar: conflito 409 recarrega (conteúdo + sha na mesma chamada), mescla e grava com o sha novo', async () => {
  const chamadas = [];
  const fetchFalso = async (url, opts = {}) => {
    chamadas.push([opts.method || 'GET', url, opts.headers?.Accept]);
    const json = (status, corpo) => ({ ok: status < 300, status, statusText: '', json: async () => corpo, text: async () => JSON.stringify(corpo) });
    if (opts.method === 'PUT') {
      const corpo = JSON.parse(opts.body);
      if (corpo.sha === 'sha-velho') return json(409, { message: 'conflict' });
      assert.equal(corpo.sha, 'sha-novo');
      assert.equal(corpo.branch, 'main');
      assert.match(corpo.message, /^estoque: contagem 30\/09 \(daniel\)$/);
      const gravado = JSON.parse(base64ParaUtf8(corpo.content));
      return json(200, { content: { sha: 'sha-final' }, _gravado: gravado });
    }
    if (url.includes('/contents/dados/estoque/contagens.json')) {
      const remoto = { versao: 1, contagens: [{ data: '2026-08-31', insumo: 'M', quantidade: 2, loja: '' }] };
      return json(200, { sha: 'sha-novo', size: 10, content: utf8ParaBase64(JSON.stringify(remoto)) });
    }
    return json(404, { message: 'not found' });
  };
  const repo = new Repositorio({ token: 't', nome: 'daniel', fetchImpl: fetchFalso });
  const base = { dados: { versao: 1, contagens: [] }, sha: 'sha-velho' };
  const local = { versao: 1, contagens: [{ data: '2026-09-30', insumo: 'M', quantidade: 1, loja: '' }] };
  const r = await repo.salvar('contagens', base, local, 'contagem 30/09');
  assert.equal(r.sha, 'sha-final');
  assert.equal(r.mesclado, true);
  assert.equal(r.dados.contagens.length, 2);
  assert.ok(r.dados.atualizado);
  assert.equal(chamadas.filter(c => c[0] === 'PUT').length, 2);
});

test('Repositorio.salvar: 422 que não é de sha não é tratado como conflito (sem retentativa)', async () => {
  let puts = 0;
  const fetchFalso = async (url, opts = {}) => {
    if (opts.method === 'PUT') { puts++; return { ok: false, status: 422, statusText: '', json: async () => ({ message: 'Branch not found' }) }; }
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
  };
  const repo = new Repositorio({ token: 't', nome: 'd', fetchImpl: fetchFalso });
  await assert.rejects(repo.salvar('vendas', { dados: PADROES.vendas(), sha: 'x' }, PADROES.vendas(), 'x'), /Branch not found/);
  assert.equal(puts, 1);
});

test('Repositorio com token lê conteúdo e sha numa chamada só; arquivo grande cai para o raw', async () => {
  const chamadas = [];
  const fetchFalso = async (url, opts = {}) => {
    chamadas.push([url, opts.headers?.Accept]);
    const json = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });
    if (url.includes('cadastro.json')) {
      if (opts.headers?.Accept === 'application/vnd.github.raw+json') return { ok: true, status: 200, text: async () => JSON.stringify({ insumos: [{ nome: 'G', unidade: 'g' }] }) };
      return json(200, { sha: 'sha-grande', size: 5_000_000, content: '', encoding: 'none' });
    }
    if (url.includes('vendas.json')) return json(200, { sha: 'sha-v', size: 20, content: utf8ParaBase64(JSON.stringify({ vendas: [{ data: '2026-09-01' }] })) });
    return json(404, { message: 'not found' });
  };
  const repo = new Repositorio({ token: 't', fetchImpl: fetchFalso });
  const { arquivos, origem } = await repo.carregarTudo();
  assert.equal(origem, 'api');
  assert.equal(arquivos.cadastro.sha, 'sha-grande');
  assert.equal(arquivos.cadastro.dados.insumos[0].nome, 'G');
  assert.equal(arquivos.vendas.sha, 'sha-v');
  assert.equal(arquivos.vendas.dados.vendas.length, 1);
  assert.equal(arquivos.contagens.existe, false);
  assert.ok(chamadas.every(c => c[0].includes('api.github.com')));
});

test('paraMotor: fora ficam a nota cancelada no painel, a marcada cancelada e a de fornecedor ignorado; loja sem CNPJ avisa', () => {
  const arquivos = {
    cadastro: { lojas: { '111': 'Loja A' }, fornecedores_ignorados: { '999': 'Etitec' }, insumos: [], produtos: [], fichas: [], mapeamento: [] },
    nfe_itens: { notas: {
      c1: { numero: '1', emitente_cnpj: '99.9', destinatario_cnpj: '111', itens: [] },
      c2: { numero: '2', emitente_cnpj: '5', destinatario_cnpj: '111', itens: [] },
      c3: { numero: '3', emitente_cnpj: '5', destinatario_cnpj: '111', cancelada: true, itens: [] },
      c4: { numero: '4', emitente_cnpj: '5', destinatario_cnpj: '111', itens: [] },
    } },
    vendas: { vendas: [] }, contagens: { contagens: [] },
  };
  const contas = { notas: { c4: { status: 'cancelada' } } };
  assert.deepEqual(paraMotor(arquivos, { contas }).nfes.map(n => n.numero), ['2']);
  assert.deepEqual(paraMotor(arquivos, { contas, loja: 'Loja A' }).nfes.map(n => n.numero), ['2']);
  const semCnpj = paraMotor(arquivos, { loja: 'Loja B' });
  assert.deepEqual(semCnpj.nfes, []);
  assert.match(semCnpj.avisos[0], /^Loja 'Loja B' sem CNPJ cadastrado: nenhuma NF-e foi considerada/);
  assert.deepEqual(paraMotor(arquivos).avisos, []);
});

test('rascunho guarda a base de onde partiu e a restauração em 3 vias não desfaz o que outro salvou', () => {
  const memoria = new Map();
  globalThis.localStorage = { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: k => memoria.delete(k) };
  try {
    const base = { vendas: { dados: { versao: 1, vendas: [{ data: '2026-09-01', produto: 'A', quantidade: 1, origem: '', loja: '' }, { data: '2026-09-01', produto: 'B', quantidade: 2, origem: '', loja: '' }] }, sha: 's1' } };
    const arquivos = { vendas: { versao: 1, vendas: [{ data: '2026-09-01', produto: 'A', quantidade: 10, origem: '', loja: '' }, { data: '2026-09-01', produto: 'B', quantidade: 2, origem: '', loja: '' }] } };
    assert.equal(rascunhoSalvar(arquivos, base), true);
    const ras = rascunhoCarregar();
    assert.deepEqual(ras.base.vendas, base.vendas.dados);
    assert.equal(ras.shas.vendas, 's1');
    // enquanto isso outra pessoa corrigiu B no servidor
    const remoto = { versao: 1, vendas: [{ data: '2026-09-01', produto: 'A', quantidade: 1, origem: '', loja: '' }, { data: '2026-09-01', produto: 'B', quantidade: 20, origem: '', loja: '' }] };
    const restaurado = mesclar3('vendas', ras.base.vendas, ras.arquivos.vendas, remoto);
    assert.deepEqual(restaurado.vendas.map(v => [v.produto, v.quantidade]), [['A', 10], ['B', 20]]);
    rascunhoLimpar();
    assert.equal(rascunhoCarregar(), null);
  } finally {
    delete globalThis.localStorage;
  }
});

test('Repositorio sem token lê pelo site com cache no-cache e trata 404 como vazio', async () => {
  const chamadas = [];
  const fetchFalso = async (url, opts = {}) => {
    chamadas.push([url, opts.cache]);
    if (url.endsWith('cadastro.json')) return { ok: true, status: 200, json: async () => ({ insumos: [{ nome: 'M', unidade: 'g' }] }) };
    return { ok: false, status: 404 };
  };
  const repo = new Repositorio({ fetchImpl: fetchFalso });
  const { arquivos, origem } = await repo.carregarTudo();
  assert.equal(origem, 'pages');
  assert.equal(arquivos.cadastro.existe, true);
  assert.equal(arquivos.cadastro.dados.insumos.length, 1);
  assert.deepEqual(arquivos.cadastro.dados.fichas, []);
  assert.equal(arquivos.vendas.existe, false);
  assert.deepEqual(arquivos.vendas.dados, PADROES.vendas());
  assert.ok(chamadas.every(c => c[1] === 'no-cache'));
  await assert.rejects(repo.salvar('vendas', null, PADROES.vendas(), 'x'), /sem token/);
});
