// Testes do motor de conciliação. Rodar: node --test estoque/testes/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  brl, conciliar, encontrarMapeamento, fatorParaBase, fmt, normalizarData, normalizarUnidade,
  normalizarUnidadeBase, numero, paraExibicao, pct, prepararDados, qtd, rotuloExibicao,
} from '../motor.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = nome => JSON.parse(readFileSync(join(AQUI, nome), 'utf-8'));

// ---------------------------------------------------------------------------
// Unidades e formatação
// ---------------------------------------------------------------------------

test('unidades: normalização e fatores', () => {
  assert.equal(normalizarUnidade(' kg. '), 'KG');
  assert.equal(normalizarUnidade('PÇ'), 'PC');
  assert.equal(normalizarUnidade(null), '');
  assert.equal(fatorParaBase('KG', 'g'), 1000);
  assert.equal(fatorParaBase('g', 'g'), 1);
  assert.equal(fatorParaBase('LT', 'ml'), 1000);
  assert.equal(fatorParaBase('UN', 'un'), 1);
  assert.equal(fatorParaBase('CX', 'g'), null);
  assert.equal(fatorParaBase('KG', 'un'), null);
  assert.equal(fatorParaBase('UN', 'g'), null);
  assert.equal(normalizarUnidadeBase('G'), 'g');
  assert.equal(normalizarUnidadeBase('gramas'), 'g');
  assert.equal(normalizarUnidadeBase('Unidade'), 'un');
  assert.throws(() => normalizarUnidadeBase('kg'), /unidade base inválida/);
  assert.deepEqual(paraExibicao(1500, 'g'), [1.5, 'kg']);
  assert.deepEqual(paraExibicao(250, 'ml'), [0.25, 'L']);
  assert.deepEqual(paraExibicao(null, 'g'), [null, 'kg']);
});

test('formatação brasileira', () => {
  assert.equal(fmt(1234.5), '1.234,50');
  assert.equal(fmt(-2.5, 3), '-2,500');
  assert.equal(fmt(1234567.891, 0), '1.234.568');
  assert.equal(brl(30), 'R$ 30,00');
  assert.equal(brl(null), '-');
  assert.equal(pct(0.184), '18,4%');
  assert.equal(qtd(11500, 'g'), '11,500');
  assert.equal(qtd(38, 'un'), '38');
  assert.equal(qtd(2.5, 'un'), '2,50');
});

test('números e datas', () => {
  assert.equal(numero('1.234,56'), 1234.56);
  assert.equal(numero('1,234.56'), 1234.56);
  assert.equal(numero('1234.56'), 1234.56);
  assert.equal(numero('1,5'), 1.5);
  assert.equal(numero('R$ 55,00'), 55);
  assert.equal(numero(''), null);
  assert.equal(numero('abc'), null);
  assert.equal(numero(7), 7);
  assert.equal(normalizarData('2026-09-30'), '2026-09-30');
  assert.equal(normalizarData('30/09/2026'), '2026-09-30');
  assert.equal(normalizarData('30/09/26'), '2026-09-30');
  assert.equal(normalizarData('2026-09-02T09:15:00-03:00'), '2026-09-02');
  assert.equal(normalizarData('31/13/2026'), null);
  assert.equal(normalizarData(''), null);
});

test('mapeamento: prioridade cnpj+cprod > ean > cprod > texto mais longo', () => {
  const maps = [
    { cnpj: '', cprod: '', ean: '', texto: 'TOMATE', insumo_id: 1 },
    { cnpj: '', cprod: '', ean: '', texto: 'MOLHO DE TOMATE', insumo_id: 2 },
    { cnpj: '', cprod: '', ean: '789', texto: '', insumo_id: 3 },
    { cnpj: '', cprod: 'X1', ean: '', texto: '', insumo_id: 4 },
    { cnpj: '111', cprod: 'X1', ean: '', texto: '', insumo_id: 5 },
  ];
  const item = (o) => ({ emitente_cnpj: '', cprod: '', ean: '', xprod: '', ...o });
  assert.equal(encontrarMapeamento(item({ xprod: 'MÓLHO DE TOMATE PELADO' }), maps).insumo_id, 2);
  assert.equal(encontrarMapeamento(item({ xprod: 'TOMATE CAIXA' }), maps).insumo_id, 1);
  assert.equal(encontrarMapeamento(item({ xprod: 'TOMATE', cprod: 'X1' }), maps).insumo_id, 4);
  assert.equal(encontrarMapeamento(item({ xprod: 'TOMATE', ean: '789', cprod: 'X1' }), maps).insumo_id, 3);
  assert.equal(encontrarMapeamento(item({ xprod: 'TOMATE', ean: '789', cprod: 'X1', emitente_cnpj: '111' }), maps).insumo_id, 5);
  assert.equal(encontrarMapeamento(item({ xprod: 'TOMATE', cprod: 'X1', emitente_cnpj: '999' }), maps).insumo_id, 4);
  assert.equal(encontrarMapeamento(item({ xprod: 'DETERGENTE' }), maps), null);
});

// ---------------------------------------------------------------------------
// Cenário controlado (espelho de tests/test_conciliacao.py do CLI Python)
// ---------------------------------------------------------------------------

function cenario() {
  return {
    insumos: [
      { nome: 'Mussarela', unidade: 'g' }, { nome: 'Molho', unidade: 'ml' },
      { nome: 'Lata', unidade: 'un' }, { nome: 'Orégano', unidade: 'g' },
    ],
    produtos: [{ nome: 'Pizza', preco: 50 }, { nome: 'Refri', preco: 8 }, { nome: 'Sem ficha', preco: 20 }],
    fichas: [
      { produto: 'Pizza', insumo: 'Mussarela', quantidade: 150 },
      { produto: 'Pizza', insumo: 'Molho', quantidade: 80 },
      { produto: 'Refri', insumo: 'Lata', quantidade: 1 },
    ],
    mapeamento: [
      { texto: 'MUSSARELA', insumo: 'Mussarela' },
      { cnpj: '111', cprod: 'M1', insumo: 'Molho', fator: 3000 },
      { ean: '789', insumo: 'Lata' },
      { texto: 'OREGANO', insumo: 'Orégano' },
    ],
    nfes: [
      { chave: 'A', numero: '1', data_emissao: '2026-08-10', emitente_cnpj: '111', emitente_nome: 'F1', valor_total: 1000,
        itens: [{ n_item: 1, cprod: 'M1', xprod: 'MOLHO BALDE', ucom: 'BD', qcom: 2, vprod: 60, utrib: 'BD', qtrib: 2 }] },
      { chave: 'B', numero: '2', data_emissao: '2026-09-05', emitente_cnpj: '111', emitente_nome: 'F1', valor_total: 3730,
        itens: [
          { n_item: 1, cprod: 'Q9', xprod: 'MUSSARELA FATIADA', ucom: 'KG', qcom: 100, vprod: 3250, utrib: 'KG', qtrib: 100 },
          { n_item: 2, cprod: 'Z1', xprod: 'OREGANO PACOTE', ucom: 'PCT', qcom: 2, vprod: 30, utrib: 'PCT', qtrib: 2 },
          { n_item: 3, cprod: 'X1', xprod: 'DETERGENTE', ucom: 'UN', qcom: 1, vprod: 10, utrib: 'UN', qtrib: 1 },
        ] },
      { chave: 'C', numero: '3', data_emissao: '2026-09-20', emitente_cnpj: '222', emitente_nome: 'F2', valor_total: 400,
        itens: [{ n_item: 1, cprod: 'R1', xprod: 'REFRI LATA CX12', ean: '789', ucom: 'CX', qcom: 10, vprod: 400, utrib: 'UN', qtrib: 120 }] },
    ],
    vendas: [
      { data: '2026-09-10', produto: 'Pizza', quantidade: 300 },
      { data: '2026-09-20', produto: 'Pizza', quantidade: 200, valor_unitario: 48, origem: 'ifood' },
      { data: '2026-09-20', produto: 'Refri', quantidade: 100 },
      { data: '2026-09-20', produto: 'Sem ficha', quantidade: 5 },
      { data: '2026-10-01', produto: 'Pizza', quantidade: 999 },
    ],
    contagens: [
      { data: '2026-08-15', insumo: 'Mussarela', quantidade: 5000 },
      { data: '2026-08-31', insumo: 'Mussarela', quantidade: 20000 },
      { data: '2026-08-31', insumo: 'Molho', quantidade: 10000 },
      { data: '2026-09-30', insumo: 'Mussarela', quantidade: 42000 },
      { data: '2026-09-30', insumo: 'Molho', quantidade: 1500 },
    ],
  };
}

const quase = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);

test('cenário: mussarela', () => {
  const c = conciliar(cenario(), '2026-09-01', '2026-09-30');
  const m = c.insumos.find(l => l.insumo === 'Mussarela');
  assert.equal(m.estoque_inicial, 20000);
  assert.equal(m.data_contagem_inicial, '2026-08-31');
  assert.equal(m.compras, 100000);
  assert.equal(m.consumo_teorico, 500 * 150);
  assert.equal(m.estoque_teorico, 20000 + 100000 - 75000);
  assert.equal(m.contagem_final, 42000);
  assert.equal(m.divergencia, -3000);
  quase(m.divergencia_pct, -3000 / 75000);
  quase(m.custo_unitario, 3250 / 100000);
  assert.equal(m.origem_custo, 'período');
  quase(m.custo_consumo_teorico, 75000 * 0.0325);
  assert.equal(m.consumo_real, 78000);
  quase(m.custo_divergencia, -3000 * 0.0325);
  assert.equal(m.consumo_por_produto, 150);
  quase(m.rende_compras, 100000 / 150);
  quase(m.rende_estoque, 42000 / 150);
  assert.deepEqual(m.produtos_que_usam, ['Pizza']);
});

test('cenário: molho com custo anterior e fator; lata sem contagem; insumo parado não aparece', () => {
  const c = conciliar(cenario(), '2026-09-01', '2026-09-30');
  const mo = c.insumos.find(l => l.insumo === 'Molho');
  assert.equal(mo.compras, 0);
  assert.equal(mo.consumo_teorico, 500 * 80);
  assert.equal(mo.estoque_teorico, 10000 - 40000);
  assert.equal(mo.origem_custo, 'anterior');
  quase(mo.custo_unitario, 60 / 6000);
  assert.equal(mo.estoque_atual, 1500);

  const la = c.insumos.find(l => l.insumo === 'Lata');
  assert.equal(la.compras, 120);
  assert.equal(la.consumo_teorico, 100);
  assert.equal(la.contagem_final, null);
  assert.equal(la.divergencia, null);
  assert.equal(la.custo_consumo_real, null);
  assert.equal(la.estoque_atual, 20);
  assert.equal(la.estoque_inicial, 0);
  assert.equal(la.data_contagem_inicial, null);

  assert.equal(c.insumos.find(l => l.insumo === 'Orégano'), undefined);
  assert.deepEqual(c.insumos.map(l => l.insumo), ['Lata', 'Molho', 'Mussarela']);
});

test('cenário: pendentes, produtos e resumo', () => {
  const c = conciliar(cenario(), '2026-09-01', '2026-09-30');
  assert.deepEqual(
    c.pendentes.map(p => [p.xprod, p.motivo.slice(0, 12)]),
    [['OREGANO PACOTE', "unidade 'PCT"], ['DETERGENTE', 'sem mapeamen']],
  );
  assert.equal(c.resumo.compras_pendentes, 40);

  const p = Object.fromEntries(c.produtos.map(l => [l.produto, l]));
  assert.equal(p.Pizza.vendidos, 500);
  assert.equal(p.Pizza.receita, 300 * 50 + 200 * 48);
  quase(p.Pizza.custo_ficha, 150 * 0.0325 + 80 * 0.01);
  assert.equal(p.Pizza.pode_fazer, 18);
  assert.equal(p.Pizza.limitado_por, 'Molho');
  assert.equal(p.Refri.pode_fazer, 20);
  assert.equal(p['Sem ficha'].tem_ficha, false);
  assert.equal(p['Sem ficha'].pode_fazer, null);
  assert.deepEqual(c.produtos.map(l => l.produto), ['Pizza', 'Refri', 'Sem ficha']);

  const r = c.resumo;
  assert.equal(r.produtos_vendidos, 605);
  assert.equal(r.receita, 15000 + 9600 + 800 + 100);
  assert.equal(r.qtd_nfes, 2);
  assert.equal(r.compras_nfe_total, 3730 + 400);
  assert.equal(r.compras_conciliadas, 3250 + 400);
  const cmvTeo = 75000 * 0.0325 + 40000 * 0.01 + 100 * (400 / 120);
  quase(r.cmv_teorico, cmvTeo);
  const cmvReal = 78000 * 0.0325 + (10000 - 1500) * 0.01 + 100 * (400 / 120);
  quase(r.cmv_real, cmvReal);
  quase(r.perda, cmvReal - cmvTeo);
  assert.deepEqual([r.insumos_com_contagem_final, r.insumos_total], [2, 3]);
});

test('cenário: alertas com os mesmos textos do CLI', () => {
  const c = conciliar(cenario(), '2026-09-01', '2026-09-30');
  const texto = c.alertas.join('\n');
  assert.match(texto, /2 item\(ns\) de NF-e não entraram no estoque por falta de mapeamento \(R\$ 40,00\)/);
  assert.match(texto, /Produto 'Sem ficha' vendido \(5 un\) sem ficha técnica/);
  assert.match(texto, /Sem contagem inicial \(anterior a 01\/09\/2026\) para: Lata\./);
  assert.match(texto, /Sem contagem final em 30\/09\/2026 para: Lata\./);
  assert.match(texto, /Estoque teórico negativo para: Molho\./);
  assert.deepEqual(c.problemas, []);
});

test('período inválido e datas em DD/MM/AAAA', () => {
  assert.throws(() => conciliar(cenario(), '2026-09-30', '2026-09-01'), /anterior à inicial/);
  assert.throws(() => conciliar(cenario(), '', '2026-09-01'), /informe as datas/);
  const c = conciliar(cenario(), '01/09/2026', '30/09/2026');
  assert.equal(c.de, '2026-09-01');
  assert.equal(c.ate, '2026-09-30');
});

test('prepararDados: problemas de cadastro são relatados, não derrubam o cálculo', () => {
  const d = cenario();
  d.insumos.push({ nome: 'Errado', unidade: 'kg' });
  d.fichas.push({ produto: 'Pizza', insumo: 'Nao existe', quantidade: 10 });
  d.contagens.push({ data: '2026-09-30', insumo: 'Nao existe', quantidade: 1 });
  d.contagens.push({ data: '2026-09-30', insumo: 'Mussarela', quantidade: 41, unidade: 'kg' });
  d.mapeamento.push({ insumo: 'Mussarela' });
  d.vendas.push({ data: 'xx', produto: 'Pizza', quantidade: 1 });
  d.nfes.push({ chave: 'B', numero: '2', data_emissao: '2026-09-05', itens: [] });
  const { tabelas, problemas } = prepararDados(d);
  assert.equal(problemas.length, 6);
  assert.match(problemas[0], /Insumo 'Errado': unidade base inválida/);
  assert.match(problemas.join('\n'), /insumo 'Nao existe' não cadastrado/);
  assert.match(problemas.join('\n'), /sem cnpj\+cprod, ean ou texto/);
  assert.match(problemas.join('\n'), /Venda ignorada/);
  assert.match(problemas.join('\n'), /NF-e 2 repetida/);
  // contagem com unidade kg converte e substitui a anterior do mesmo dia
  const c = conciliar(d, '2026-09-01', '2026-09-30');
  assert.equal(c.insumos.find(l => l.insumo === 'Mussarela').contagem_final, 41000);
  assert.equal(tabelas.nfes.length, 3);
});

test('vendas com e sem valor no mesmo dia/produto/origem usam preço médio (como o CLI)', () => {
  const d = cenario();
  d.vendas = [
    { data: '2026-09-10', produto: 'Pizza', quantidade: 10, valor_unitario: 40 },
    { data: '2026-09-10', produto: 'Pizza', quantidade: 10 },
  ];
  const c = conciliar(d, '2026-09-01', '2026-09-30');
  assert.equal(c.produtos.find(p => p.produto === 'Pizza').receita, 20 * 40);
});

test('contagens de lojas diferentes no mesmo dia são somadas (como o CLI); nota cancelada fica fora; avisos entram primeiro', () => {
  const d = cenario();
  d.contagens.push(
    { data: '2026-09-30', insumo: 'Mussarela', quantidade: 1000, loja: 'A' },
    { data: '2026-09-30', insumo: 'Mussarela', quantidade: 2000, loja: 'B' },
    { data: '2026-09-30', insumo: 'Mussarela', quantidade: 2500, loja: 'b' }, // mesma loja (caixa diferente): substitui
  );
  d.nfes[1].cancelada = true; // a nota com os 100 kg de mussarela
  d.avisos = ['aviso de teste'];
  const c = conciliar(d, '2026-09-01', '2026-09-30');
  const m = c.insumos.find(l => l.insumo === 'Mussarela');
  assert.equal(m.contagem_final, 42000 + 1000 + 2500);
  assert.equal(m.compras, 0);
  assert.equal(c.resumo.qtd_nfes, 1);
  assert.equal(c.alertas[0], 'aviso de teste');
  assert.equal(rotuloExibicao('<img>'), '?');
  assert.deepEqual(paraExibicao(1, 'x'), [1, '?']);
});

// ---------------------------------------------------------------------------
// Paridade com o CLI Python (saída --json sobre exemplos/ do gestao-pizzaria)
// ---------------------------------------------------------------------------

test('paridade com o CLI Python no conjunto de exemplo', () => {
  const dados = ler('fixture-exemplo-dados.json');
  const esperado = ler('fixture-exemplo-esperado.json');
  const obtido = conciliar(dados, esperado.de, esperado.ate);

  const IGNORAR = new Set(['insumo_id', 'produto_id']); // ids internos: ordem de criação difere entre CLI e JS
  const comparar = (a, b, caminho) => {
    if (typeof a === 'number' && typeof b === 'number') {
      assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)), `${caminho}: ${a} != ${b}`);
    } else if (Array.isArray(a) || Array.isArray(b)) {
      assert.ok(Array.isArray(a) && Array.isArray(b), `${caminho}: tipos diferentes`);
      assert.equal(a.length, b.length, `${caminho}: tamanhos ${a.length} != ${b.length}`);
      a.forEach((x, i) => comparar(x, b[i], `${caminho}[${i}]`));
    } else if (a && typeof a === 'object') {
      assert.ok(b && typeof b === 'object', `${caminho}: esperado objeto`);
      for (const k of Object.keys(b)) if (!IGNORAR.has(k)) comparar(a[k], b[k], `${caminho}.${k}`);
      for (const k of Object.keys(a)) assert.ok(k in b, `${caminho}.${k}: campo extra no JS`);
    } else {
      assert.equal(a, b, caminho);
    }
  };
  const { problemas, ...semProblemas } = obtido;
  assert.deepEqual(problemas, []);
  comparar(semProblemas, esperado, 'conciliacao');
});
