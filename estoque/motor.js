// Motor de conciliação compras (NF-e) × estoque × vendas.
// Porte fiel de pizzaria/conciliacao.py, unidades.py e formato.py do repositório
// fornodiroma/gestao-pizzaria. Puro: sem DOM, sem rede, sem dependências.
//
//   estoque teórico final = estoque inicial (contagem) + compras (NF-e) − consumo teórico
//   consumo teórico       = Σ produtos vendidos × quantidade na ficha técnica
//   divergência           = contagem física final − estoque teórico final
//
// Entrada de conciliar(): objeto com listas por NOME (ver prepararDados), datas AAAA-MM-DD.

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

export const UNIDADES_BASE = ['g', 'ml', 'un'];
export const EXIBICAO = { g: ['kg', 1000], ml: ['L', 1000], un: ['un', 1] };

const FATORES = {
  g: { KG: 1000, KILO: 1000, QUILO: 1000, KGS: 1000, G: 1, GR: 1, GRAMA: 1, GRAMAS: 1, MG: 0.001 },
  ml: { L: 1000, LT: 1000, LTS: 1000, LITRO: 1000, LITROS: 1000, ML: 1 },
  un: { UN: 1, UND: 1, UNID: 1, UNIDADE: 1, UNIDADES: 1, PC: 1, PCA: 1, PECA: 1, PECAS: 1 },
};
const SINONIMOS_BASE = {
  g: 'g', gr: 'g', grama: 'g', gramas: 'g',
  ml: 'ml', mililitro: 'ml',
  un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un',
};

/** Remove acentos e qualquer caractere fora do ASCII (igual ao Python: NFKD + encode ascii ignore). */
export function semAcentos(texto) {
  return String(texto ?? '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
}

export function somenteDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

export function normalizarUnidade(unidade) {
  return semAcentos(unidade).trim().toUpperCase().replace(/\.+$/, '').replace(/ /g, '');
}

export function normalizarUnidadeBase(unidade) {
  const chave = semAcentos(unidade).trim().toLowerCase().replace(/\.+$/, '');
  if (Object.prototype.hasOwnProperty.call(SINONIMOS_BASE, chave)) return SINONIMOS_BASE[chave];
  throw new Error(
    `unidade base inválida: '${unidade}'. Use g (gramas), ml (mililitros) ou un (unidades). ` +
    'Insumos pesados em kg devem ser cadastrados em g.',
  );
}

/** Quantas unidades base há em 1 unidade da NF-e; null se não for conversível. */
export function fatorParaBase(unidadeNfe, unidadeBase) {
  const tabela = FATORES[unidadeBase] || {};
  const chave = normalizarUnidade(unidadeNfe);
  return Object.prototype.hasOwnProperty.call(tabela, chave) ? tabela[chave] : null;
}

export function paraExibicao(quantidade, unidadeBase) {
  const [rotulo, divisor] = EXIBICAO[unidadeBase] || ['?', 1];
  return [quantidade == null ? null : quantidade / divisor, rotulo];
}

export function rotuloExibicao(unidadeBase) {
  return (EXIBICAO[unidadeBase] || ['?', 1])[0]; // unidade desconhecida nunca vai crua para o HTML
}

// ---------------------------------------------------------------------------
// Formatação no padrão brasileiro (porte de formato.py)
// ---------------------------------------------------------------------------

export function fmt(valor, casas = 2) {
  if (valor == null || Number.isNaN(valor)) return '-';
  let s = Number(valor).toFixed(casas);
  const negativo = s.startsWith('-');
  if (negativo) s = s.slice(1);
  const [inteiro, decimal] = s.split('.');
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (negativo ? '-' : '') + agrupado + (decimal != null ? ',' + decimal : '');
}

export function brl(valor) {
  return valor == null ? '-' : `R$ ${fmt(valor)}`;
}

export function pct(valor, casas = 1) {
  return valor == null ? '-' : `${fmt(valor * 100, casas)}%`;
}

/** Quantidade na unidade base exibida em kg / L / un. */
export function qtd(valor, unidadeBase) {
  const [v, rotulo] = paraExibicao(valor, unidadeBase);
  if (v == null) return '-';
  if (rotulo === 'un') return fmt(v, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2);
  return fmt(v, 3);
}

export function pizzas(valor) {
  return valor == null ? '-' : `≈ ${fmt(valor, 0)}`;
}

/** Equivalente ao ``{:g}`` do Python para os casos usuais (até 6 algarismos significativos). */
function fmtG(n) {
  return String(Number(Number(n).toPrecision(6)));
}

export function dataBR(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Aceita AAAA-MM-DD, AAAA-MM-DDTHH:MM..., DD/MM/AAAA, DD/MM/AA e DD-MM-AAAA. Devolve AAAA-MM-DD ou null. */
export function normalizarData(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/) || t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return valida(m[1], m[2], m[3]);
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return valida(ano, m[2].padStart(2, '0'), m[1].padStart(2, '0'));
  }
  return null;
  function valida(a, me, d) {
    const dt = new Date(Date.UTC(+a, +me - 1, +d));
    if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +me - 1 || dt.getUTCDate() !== +d) return null;
    return `${a}-${me}-${d}`;
  }
}

/** "1.234,56" -> 1234.56; "1,5" -> 1.5; "1234.56" -> 1234.56; vazio -> null. */
export function numero(texto) {
  if (texto == null) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  let t = String(texto).trim().replace(/R\$/g, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Resolução de item de NF-e -> insumo
// ---------------------------------------------------------------------------

function normalizarTexto(t) {
  return semAcentos(t).toUpperCase().trim();
}

/** Prioridade: cnpj+cprod > ean > cprod (sem cnpj) > texto mais longo contido na descrição. */
export function encontrarMapeamento(item, mapeamentos) {
  const cnpj = item.emitente_cnpj || '';
  const cprod = String(item.cprod || '').trim();
  const ean = item.ean || '';
  const xprod = normalizarTexto(item.xprod);

  for (const m of mapeamentos) {
    if (m.cnpj && m.cprod && m.cnpj === cnpj && m.cprod === cprod) return m;
  }
  if (ean) {
    for (const m of mapeamentos) if (m.ean && m.ean === ean) return m;
  }
  if (cprod) {
    for (const m of mapeamentos) if (m.cprod && !m.cnpj && m.cprod === cprod) return m;
  }
  const candidatos = mapeamentos.filter(m => m.texto && xprod.includes(normalizarTexto(m.texto)));
  if (candidatos.length) return candidatos.reduce((a, b) => (b.texto.length > a.texto.length ? b : a));
  return null;
}

/** Devolve [insumo_id, quantidade na unidade base, motivo_pendente]. */
export function resolverItem(item, mapeamentos, insumos) {
  const m = encontrarMapeamento(item, mapeamentos);
  if (m == null) return [null, 0, 'sem mapeamento para este item'];
  const insumo = insumos.get(m.insumo_id);
  const unidade = insumo.unidade;
  if (m.fator) return [m.insumo_id, Number(item.qcom || 0) * Number(m.fator), ''];
  if (item.utrib && item.qtrib) {
    const f = fatorParaBase(item.utrib, unidade);
    if (f != null) return [m.insumo_id, Number(item.qtrib) * f, ''];
  }
  const f = fatorParaBase(item.ucom, unidade);
  if (f != null) return [m.insumo_id, Number(item.qcom || 0) * f, ''];
  return [
    null, 0,
    `unidade '${item.ucom}' não conversível para '${unidade}' (${insumo.nome}); informe o fator no mapeamento`,
  ];
}

// ---------------------------------------------------------------------------
// Preparação dos dados (equivalente às importações do CLI)
// ---------------------------------------------------------------------------

const chaveNome = n => String(n ?? '').trim().toLowerCase();
/** Ordenação como o SQLite com COLLATE NOCASE (só dobra A-Z). */
const nocase = s => String(s).replace(/[A-Z]/g, c => c.toLowerCase());
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const soma = xs => { let s = 0; for (const x of xs) s += x; return s; };
const pctDe = (parte, total) => (total ? parte / total : null);

/**
 * Converte os JSON por nome (cadastro, NF-es, vendas, contagens) nas tabelas internas por id.
 * Devolve { tabelas, problemas }. Problemas de cadastro não impedem o cálculo: o registro é ignorado.
 */
export function prepararDados(dados) {
  const d = dados || {};
  const problemas = [];

  // insumos (ordenados por nome como o SQLite NOCASE)
  const insumos = new Map();
  const insumoPorNome = new Map();
  const listaInsumos = [...(d.insumos || [])]
    .map((i, idx) => ({ ...i, _idx: idx }))
    .sort((a, b) => cmpStr(nocase(a.nome ?? ''), nocase(b.nome ?? '')) || a._idx - b._idx);
  for (const i of listaInsumos) {
    const nome = String(i.nome ?? '').trim();
    if (!nome) { problemas.push('Insumo sem nome no cadastro: ignorado.'); continue; }
    if (insumoPorNome.has(chaveNome(nome))) { problemas.push(`Insumo duplicado no cadastro: '${nome}'.`); continue; }
    let unidade;
    try { unidade = normalizarUnidadeBase(i.unidade); } catch (e) { problemas.push(`Insumo '${nome}': ${e.message}`); continue; }
    const obj = { id: insumos.size + 1, nome, unidade };
    insumos.set(obj.id, obj);
    insumoPorNome.set(chaveNome(nome), obj);
  }
  const acharInsumo = (nome, contexto) => {
    const obj = insumoPorNome.get(chaveNome(nome));
    if (!obj) problemas.push(`${contexto}: insumo '${String(nome ?? '').trim()}' não cadastrado; registro ignorado.`);
    return obj;
  };

  // produtos: cadastro + os citados em fichas e vendas (como o CLI, que os cria ao importar)
  const nomesProdutos = new Map(); // chave -> {nome, preco}
  for (const p of d.produtos || []) {
    const nome = String(p.nome ?? '').trim();
    if (!nome) { problemas.push('Produto sem nome no cadastro: ignorado.'); continue; }
    const k = chaveNome(nome);
    if (nomesProdutos.has(k)) { problemas.push(`Produto duplicado no cadastro: '${nome}'.`); continue; }
    const preco = numero(p.preco);
    nomesProdutos.set(k, { nome, preco: preco == null ? null : preco });
  }
  for (const f of d.fichas || []) {
    const nome = String(f.produto ?? '').trim();
    if (nome && !nomesProdutos.has(chaveNome(nome))) nomesProdutos.set(chaveNome(nome), { nome, preco: null });
  }
  for (const v of d.vendas || []) {
    const nome = String(v.produto ?? '').trim();
    if (!nome) continue;
    const k = chaveNome(nome);
    if (!nomesProdutos.has(k)) nomesProdutos.set(k, { nome, preco: null });
    const p = nomesProdutos.get(k);
    const valor = numero(v.valor_unitario);
    if (p.preco == null && valor != null) p.preco = valor; // igual ao importar_vendas do CLI
  }
  const produtos = new Map();
  const produtoPorNome = new Map();
  const listaProdutos = [...nomesProdutos.values()]
    .map((p, idx) => ({ ...p, _idx: idx }))
    .sort((a, b) => cmpStr(nocase(a.nome), nocase(b.nome)) || a._idx - b._idx);
  for (const p of listaProdutos) {
    const obj = { id: produtos.size + 1, nome: p.nome, preco: p.preco };
    produtos.set(obj.id, obj);
    produtoPorNome.set(chaveNome(p.nome), obj);
  }

  // fichas técnicas: produto -> Map(insumo_id -> quantidade); duplicatas somam
  const fichas = new Map();
  for (const f of d.fichas || []) {
    const prod = produtoPorNome.get(chaveNome(f.produto));
    if (!prod) { problemas.push('Ficha técnica sem produto: linha ignorada.'); continue; }
    const ins = acharInsumo(f.insumo, `Ficha técnica de '${prod.nome}'`);
    if (!ins) continue;
    const q = numero(f.quantidade);
    if (q == null || q <= 0) { problemas.push(`Ficha técnica de '${prod.nome}' / '${ins.nome}': quantidade inválida; ignorada.`); continue; }
    if (!fichas.has(prod.id)) fichas.set(prod.id, new Map());
    const ficha = fichas.get(prod.id);
    ficha.set(ins.id, (ficha.get(ins.id) || 0) + q);
  }

  // mapeamento
  const mapeamentos = [];
  for (const m of d.mapeamento || []) {
    const cnpj = somenteDigitos(m.cnpj);
    const cprod = String(m.cprod ?? '').trim();
    const ean = somenteDigitos(m.ean);
    const texto = String(m.texto ?? '').trim();
    if (!(cprod || ean || texto)) { problemas.push(`Mapeamento para '${m.insumo}' sem cnpj+cprod, ean ou texto: ignorado.`); continue; }
    const ins = acharInsumo(m.insumo, 'Mapeamento');
    if (!ins) continue;
    const fator = numero(m.fator);
    if (fator != null && fator <= 0) { problemas.push(`Mapeamento para '${ins.nome}': fator deve ser maior que zero; ignorado.`); continue; }
    mapeamentos.push({ cnpj, cprod, ean, texto, insumo_id: ins.id, fator: fator == null ? null : fator });
  }

  // NF-es: lista ou objeto {chave: nota}
  const nfes = [];
  const brutas = Array.isArray(d.nfes) ? d.nfes : Object.entries(d.nfes || {}).map(([chave, n]) => ({ chave, ...n }));
  const chavesVistas = new Set();
  for (const n of brutas) {
    if (n.cancelada === true) continue; // cancelada (evento 110111): fica fora do estoque
    const chave = String(n.chave ?? '').replace(/\s/g, '').replace(/^NFe/i, '');
    const data = normalizarData(n.data_emissao ?? n.emissao);
    if (!data) { problemas.push(`NF-e ${n.numero || chave}: data de emissão inválida; ignorada.`); continue; }
    if (chave && chavesVistas.has(chave)) { problemas.push(`NF-e ${n.numero || chave} repetida; só a primeira foi considerada.`); continue; }
    if (chave) chavesVistas.add(chave);
    nfes.push({
      chave,
      numero: String(n.numero ?? ''),
      serie: String(n.serie ?? ''),
      data_emissao: data,
      emitente_cnpj: somenteDigitos(n.emitente_cnpj ?? n.emit_cnpj),
      emitente_nome: String(n.emitente_nome ?? n.emit_nome ?? ''),
      destinatario_cnpj: somenteDigitos(n.destinatario_cnpj ?? n.dest_cnpj),
      valor_total: numero(n.valor_total ?? n.vnf) ?? 0,
      itens: (n.itens || []).map((i, idx) => ({
        n_item: Number(i.n_item ?? i.n ?? idx + 1),
        cprod: String(i.cprod ?? ''),
        xprod: String(i.xprod ?? ''),
        ncm: String(i.ncm ?? ''),
        ean: somenteDigitos(i.ean),
        cfop: String(i.cfop ?? ''),
        ucom: String(i.ucom ?? ''),
        qcom: numero(i.qcom) ?? 0,
        vuncom: numero(i.vuncom) ?? 0,
        vprod: numero(i.vprod) ?? 0,
        utrib: String(i.utrib ?? ''),
        qtrib: numero(i.qtrib) ?? 0,
      })),
    });
  }

  // vendas: somadas por dia/produto/origem com preço médio (igual ao CLI)
  const grupos = new Map();
  for (const v of d.vendas || []) {
    const data = normalizarData(v.data);
    const prod = produtoPorNome.get(chaveNome(v.produto));
    const q = numero(v.quantidade ?? v.qtd);
    if (!data || !prod || q == null || q <= 0) { problemas.push(`Venda ignorada (data, produto ou quantidade inválida): ${JSON.stringify(v)}`); continue; }
    const valor = numero(v.valor_unitario ?? v.valor_unit);
    const origem = String(v.origem ?? '').trim();
    const k = `${data}|${prod.id}|${origem}`;
    if (!grupos.has(k)) grupos.set(k, { data, produto_id: prod.id, origem, quantidade: 0, total: 0, qtdComValor: 0 });
    const g = grupos.get(k);
    g.quantidade += q;
    if (valor != null) { g.total += q * valor; g.qtdComValor += q; }
  }
  const vendas = [...grupos.values()].map(g => ({
    data: g.data, produto_id: g.produto_id, origem: g.origem, quantidade: g.quantidade,
    valor_unitario: g.qtdComValor ? g.total / g.qtdComValor : null,
  }));

  // contagens: a última de cada (data, insumo, loja) vale; depois as lojas são SOMADAS por (data, insumo),
  // igual ao CLI sem --loja (com filtro de loja, só a loja escolhida chega aqui — ver dados.paraMotor)
  const contMap = new Map();
  for (const c of d.contagens || []) {
    const data = normalizarData(c.data);
    const ins = insumoPorNome.get(chaveNome(c.insumo));
    let q = numero(c.quantidade ?? c.qtd);
    if (!data || !ins || q == null || q < 0) { problemas.push(`Contagem ignorada (data, insumo ou quantidade inválida): ${JSON.stringify(c)}`); continue; }
    if (c.unidade) {
      const f = fatorParaBase(c.unidade, ins.unidade);
      if (f == null) { problemas.push(`Contagem de '${ins.nome}' em ${dataBR(data)}: unidade '${c.unidade}' não conversível para '${ins.unidade}'; ignorada.`); continue; }
      q *= f;
    }
    contMap.set(`${data}|${ins.id}|${chaveNome(c.loja)}`, { data, insumo_id: ins.id, quantidade: q });
  }
  const somadas = new Map();
  for (const c of contMap.values()) {
    const kk = `${c.data}|${c.insumo_id}`;
    if (!somadas.has(kk)) somadas.set(kk, { data: c.data, insumo_id: c.insumo_id, quantidade: 0 });
    somadas.get(kk).quantidade += c.quantidade;
  }
  const contagens = [...somadas.values()];

  return { tabelas: { insumos, produtos, fichas, mapeamentos, nfes, vendas, contagens }, problemas };
}

// ---------------------------------------------------------------------------
// Conciliação
// ---------------------------------------------------------------------------

/**
 * conciliar(dados, de, ate) — dados por nome (ver prepararDados); de/ate em AAAA-MM-DD (ou DD/MM/AAAA).
 * Devolve { de, ate, loja, resumo, insumos, produtos, pendentes, alertas, problemas }.
 */
export function conciliar(dados, de, ate, opcoes = {}) {
  const deIso = normalizarData(de);
  const ateIso = normalizarData(ate);
  if (!deIso || !ateIso) throw new Error('informe as datas inicial e final (AAAA-MM-DD ou DD/MM/AAAA)');
  const { tabelas, problemas } = prepararDados(dados);
  const resultado = conciliarTabelas(tabelas, deIso, ateIso);
  resultado.loja = opcoes.loja || null; // os dados já vêm filtrados pela loja (ver dados.paraMotor)
  if (Array.isArray(dados?.avisos) && dados.avisos.length) resultado.alertas.unshift(...dados.avisos);
  resultado.problemas = problemas;
  return resultado;
}

export function conciliarTabelas(t, de, ate) {
  if (ate < de) throw new Error('a data final é anterior à inicial');
  const { insumos, produtos, fichas, mapeamentos } = t;
  const alertas = [];

  // --- contagens ---------------------------------------------------------
  const contagemInicial = new Map();
  const antes = t.contagens.filter(c => c.data < de).sort((a, b) => cmpStr(a.data, b.data));
  for (const c of antes) contagemInicial.set(c.insumo_id, [c.data, c.quantidade]);
  const contagemFinal = new Map();
  for (const c of t.contagens) if (c.data === ate) contagemFinal.set(c.insumo_id, c.quantidade);

  // --- compras (NF-e) ---------------------------------------------------
  const noPeriodo = t.nfes.filter(n => n.data_emissao >= de && n.data_emissao <= ate);
  const itens = [];
  for (const n of noPeriodo) {
    for (const i of n.itens) {
      itens.push({ ...i, chave: n.chave, numero: n.numero, data_emissao: n.data_emissao, emitente_cnpj: n.emitente_cnpj, emitente_nome: n.emitente_nome });
    }
  }
  itens.sort((a, b) => cmpStr(a.data_emissao, b.data_emissao) || cmpStr(a.numero, b.numero) || a.n_item - b.n_item);

  const comprasQtd = new Map();
  const comprasValor = new Map();
  const pendentes = [];
  for (const item of itens) {
    const [iid, q, motivo] = resolverItem(item, mapeamentos, insumos);
    if (iid == null) {
      pendentes.push({
        chave: item.chave, numero: item.numero || '', data_emissao: item.data_emissao,
        emitente_cnpj: item.emitente_cnpj || '', emitente_nome: item.emitente_nome || '',
        n_item: Number(item.n_item), cprod: item.cprod || '', ean: item.ean || '', xprod: item.xprod || '',
        ucom: item.ucom || '', qcom: Number(item.qcom || 0), vprod: Number(item.vprod || 0), motivo,
      });
      continue;
    }
    comprasQtd.set(iid, (comprasQtd.get(iid) || 0) + q);
    comprasValor.set(iid, (comprasValor.get(iid) || 0) + Number(item.vprod || 0));
  }
  const qtdNfes = noPeriodo.length;
  const comprasNfeTotal = soma(noPeriodo.map(n => Number(n.valor_total || 0)));

  // --- vendas -----------------------------------------------------------
  const vendasQtd = new Map();
  const vendasReceita = new Map();
  const produtosSemPreco = new Set();
  for (const v of t.vendas) {
    if (v.data < de || v.data > ate) continue;
    const pid = v.produto_id;
    const q = Number(v.quantidade);
    let valor = v.valor_unitario != null ? v.valor_unitario : produtos.get(pid).preco;
    if (valor == null) { produtosSemPreco.add(produtos.get(pid).nome); valor = 0; }
    vendasQtd.set(pid, (vendasQtd.get(pid) || 0) + q);
    vendasReceita.set(pid, (vendasReceita.get(pid) || 0) + q * Number(valor));
  }

  // --- consumo teórico --------------------------------------------------
  const consumo = new Map();
  const vendidosQueUsam = new Map();
  const produtosSemFicha = [];
  for (const [pid, q] of vendasQtd) {
    const ficha = fichas.get(pid);
    if (!ficha || ficha.size === 0) { produtosSemFicha.push([produtos.get(pid).nome, q]); continue; }
    for (const [iid, porUnidade] of ficha) {
      consumo.set(iid, (consumo.get(iid) || 0) + q * porUnidade);
      vendidosQueUsam.set(iid, (vendidosQueUsam.get(iid) || 0) + q);
    }
  }

  // --- custo unitário ---------------------------------------------------
  const custoUnit = new Map();
  for (const [iid, q] of comprasQtd) if (q > 0) custoUnit.set(iid, [comprasValor.get(iid) / q, 'período']);
  let faltando = [...insumos.keys()].filter(i => !custoUnit.has(i));
  if (faltando.length) {
    const anteriores = [];
    for (const n of t.nfes) {
      if (!(n.data_emissao < de)) continue;
      for (const i of n.itens) anteriores.push({ ...i, chave: n.chave, numero: n.numero, data_emissao: n.data_emissao, emitente_cnpj: n.emitente_cnpj, emitente_nome: n.emitente_nome });
    }
    anteriores.sort((a, b) => cmpStr(b.data_emissao, a.data_emissao) || cmpStr(b.numero, a.numero) || b.n_item - a.n_item);
    for (const item of anteriores) {
      if (!faltando.length) break;
      const [iid, q] = resolverItem(item, mapeamentos, insumos);
      if (iid != null && faltando.includes(iid) && q > 0) {
        custoUnit.set(iid, [Number(item.vprod || 0) / q, 'anterior']);
        faltando = faltando.filter(x => x !== iid);
      }
    }
  }

  // --- linhas por insumo ------------------------------------------------
  const usaInsumo = new Map();
  for (const [pid, ficha] of fichas) {
    for (const iid of ficha.keys()) {
      if (!usaInsumo.has(iid)) usaInsumo.set(iid, []);
      usaInsumo.get(iid).push(produtos.get(pid).nome);
    }
  }

  const linhas = [];
  const semInicial = [], semFinal = [], negativos = [];
  for (const [iid, ins] of insumos) {
    const movimentou = comprasQtd.has(iid) || consumo.has(iid) || contagemInicial.has(iid) || contagemFinal.has(iid);
    if (!movimentou) continue;
    const [dataIni, inicial] = contagemInicial.get(iid) || [null, 0];
    if (dataIni == null) semInicial.push(ins.nome);
    const compras = comprasQtd.get(iid) || 0;
    const cons = consumo.get(iid) || 0;
    const teorico = inicial + compras - cons;
    const final = contagemFinal.has(iid) ? contagemFinal.get(iid) : null;
    if (final == null && (compras || cons)) semFinal.push(ins.nome);
    if (teorico < -1e-9) negativos.push(ins.nome);

    const [custo, origemCusto] = custoUnit.get(iid) || [null, null];
    const divergencia = final != null ? final - teorico : null;
    const consumoReal = final != null ? inicial + compras - final : null;

    const vendidos = vendidosQueUsam.get(iid) || 0;
    let porProduto;
    if (vendidos > 0) {
      porProduto = cons / vendidos;
    } else {
      const qtds = [...fichas.values()].filter(f => f.has(iid)).map(f => f.get(iid));
      porProduto = qtds.length ? soma(qtds) / qtds.length : null;
    }
    const estoqueAtual = final != null ? final : Math.max(teorico, 0);
    const valorCompras = comprasValor.get(iid) || 0;

    linhas.push({
      insumo_id: iid,
      insumo: ins.nome,
      unidade: ins.unidade,
      estoque_inicial: inicial,
      data_contagem_inicial: dataIni,
      compras,
      compras_valor: valorCompras,
      consumo_teorico: cons,
      estoque_teorico: teorico,
      contagem_final: final,
      divergencia,
      divergencia_pct: divergencia != null ? pctDe(divergencia, cons) : null,
      custo_unitario: custo,
      origem_custo: origemCusto,
      custo_compras: valorCompras,
      custo_consumo_teorico: custo != null ? cons * custo : null,
      consumo_real: consumoReal,
      custo_consumo_real: custo != null && consumoReal != null ? consumoReal * custo : null,
      custo_divergencia: custo != null && divergencia != null ? divergencia * custo : null,
      consumo_por_produto: porProduto,
      rende_compras: porProduto ? compras / porProduto : null,
      rende_estoque: porProduto ? estoqueAtual / porProduto : null,
      estoque_atual: estoqueAtual,
      produtos_que_usam: (usaInsumo.get(iid) || []).slice().sort(cmpStr),
    });
  }

  // --- linhas por produto -----------------------------------------------
  const estoqueAtualPorInsumo = new Map(linhas.map(l => [l.insumo_id, l.estoque_atual]));
  const linhasProduto = [];
  for (const [pid, prod] of produtos) {
    const ficha = fichas.get(pid) || new Map();
    const vendidos = vendasQtd.get(pid) || 0;
    if (ficha.size === 0 && !vendidos) continue;
    let custoFicha = 0;
    let pode = null;
    let limitante = null;
    for (const [iid, porUnidade] of ficha) {
      const c = custoUnit.get(iid);
      if (c == null) custoFicha = null;
      else if (custoFicha != null) custoFicha += porUnidade * c[0];
      const disponivel = estoqueAtualPorInsumo.has(iid) ? estoqueAtualPorInsumo.get(iid) : 0;
      const capacidade = porUnidade ? disponivel / porUnidade : 0;
      if (pode == null || capacidade < pode) { pode = capacidade; limitante = insumos.get(iid).nome; }
    }
    if (ficha.size === 0) custoFicha = null;
    let preco = prod.preco;
    const receita = vendasReceita.get(pid) || 0;
    if (preco == null && vendidos) preco = receita ? receita / vendidos : null;
    let margem = null;
    if (preco && custoFicha != null) margem = (preco - custoFicha) / preco;
    linhasProduto.push({
      produto_id: pid, produto: prod.nome, vendidos, receita, preco,
      custo_ficha: custoFicha, margem_pct: margem, tem_ficha: ficha.size > 0,
      pode_fazer: pode != null ? Math.trunc(pode) : null, limitado_por: limitante,
    });
  }
  linhasProduto.sort((a, b) => (b.vendidos - a.vendidos) || cmpStr(a.produto, b.produto));

  // --- resumo -----------------------------------------------------------
  const receita = soma(vendasReceita.values());
  const cmvTeorico = soma(linhas.map(l => l.custo_consumo_teorico || 0));
  const cmvReal = soma(linhas.map(l => (l.custo_consumo_real != null ? l.custo_consumo_real : (l.custo_consumo_teorico || 0))));
  const comprasPendentes = soma(pendentes.map(p => p.vprod));
  const resumo = {
    produtos_vendidos: soma(vendasQtd.values()),
    receita,
    qtd_nfes: qtdNfes,
    compras_nfe_total: comprasNfeTotal,
    compras_conciliadas: soma(comprasValor.values()),
    compras_pendentes: comprasPendentes,
    cmv_teorico: cmvTeorico,
    cmv_real: cmvReal,
    perda: cmvReal - cmvTeorico,
    food_cost_teorico_pct: pctDe(cmvTeorico, receita),
    food_cost_real_pct: pctDe(cmvReal, receita),
    insumos_com_contagem_final: linhas.filter(l => l.contagem_final != null).length,
    insumos_total: linhas.length,
  };

  // --- alertas (textos idênticos aos do CLI) ----------------------------
  if (pendentes.length) {
    alertas.push(
      `${pendentes.length} item(ns) de NF-e não entraram no estoque por falta de mapeamento ` +
      `(${brl(comprasPendentes)}). Veja a seção 'Itens de NF-e pendentes'.`,
    );
  }
  produtosSemFicha.sort((a, b) => cmpStr(a[0], b[0]) || a[1] - b[1]);
  for (const [nome, q] of produtosSemFicha) {
    alertas.push(`Produto '${nome}' vendido (${fmtG(q)} un) sem ficha técnica: o consumo de insumos dele não foi descontado.`);
  }
  for (const nome of [...produtosSemPreco].sort(cmpStr)) {
    alertas.push(`Produto '${nome}' sem preço cadastrado e sem valor na venda: receita considerada R$ 0.`);
  }
  if (semInicial.length) {
    alertas.push(`Sem contagem inicial (anterior a ${dataBR(de)}) para: ${semInicial.join(', ')}. Estoque inicial considerado 0.`);
  }
  if (semFinal.length) {
    alertas.push(`Sem contagem final em ${dataBR(ate)} para: ${semFinal.join(', ')}. Divergência não calculada; o estoque mostrado é o teórico.`);
  }
  if (negativos.length) {
    alertas.push(
      `Estoque teórico negativo para: ${negativos.join(', ')}. ` +
      'Vendeu mais do que havia + comprou: falta contagem inicial, NF-e não importada ou item sem mapeamento.',
    );
  }
  const semCusto = linhas.filter(l => l.custo_unitario == null && (l.consumo_teorico || l.compras)).map(l => l.insumo);
  if (semCusto.length) {
    alertas.push(`Sem custo conhecido (nenhuma NF-e mapeada) para: ${semCusto.join(', ')}. Custos ficam em branco.`);
  }

  return { de, ate, loja: null, resumo, insumos: linhas, produtos: linhasProduto, pendentes, alertas, problemas: [] };
}
