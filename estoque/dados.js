// Camada de dados da página de estoque.
//
// Leitura: sem token, pelo próprio site (GitHub Pages) com cache:'no-cache'; com token, pela API
// do GitHub (sempre fresca e devolve o sha de cada arquivo). Gravação: PUT na Contents API com o
// sha carregado; em conflito (alguém — o robô, outro sócio — gravou antes) recarrega, mescla em
// 3 vias por chave (base carregada × local × remoto) e tenta de novo. O token nunca vai para o
// repositório: fica no localStorage (lembrar neste aparelho) ou só na sessionStorage.

export const OWNER_PADRAO = 'fornodiroma';
export const REPO_PADRAO = 'notas';
export const BRANCH_PADRAO = 'main';
export const PASTA = 'dados/estoque';

export const ARQUIVOS = {
  cadastro: `${PASTA}/cadastro.json`,
  nfe_itens: `${PASTA}/nfe_itens.json`,
  vendas: `${PASTA}/vendas.json`,
  contagens: `${PASTA}/contagens.json`,
};

export const PADROES = {
  cadastro: () => ({ versao: 1, atualizado: null, lojas: {}, insumos: [], produtos: [], fichas: [], mapeamento: [] }),
  nfe_itens: () => ({ versao: 1, atualizado: null, notas: {} }),
  vendas: () => ({ versao: 1, atualizado: null, vendas: [] }),
  contagens: () => ({ versao: 1, atualizado: null, contagens: [] }),
};

const CHAVE_CONFIG = 'fdr_est_gh';
const CHAVE_RASCUNHO = 'fdr_est_rascunho';
const LIMITE_RASCUNHO = 2_000_000; // bytes de JSON no localStorage

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function utf8ParaBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ParaUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

export function agoraIso() {
  const d = new Date();
  const tz = -d.getTimezoneOffset();
  const sinal = tz >= 0 ? '+' : '-';
  const p = n => String(Math.abs(n)).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sinal}${p(Math.trunc(tz / 60))}:${p(tz % 60)}`;
}

export function serializar(dados) {
  return JSON.stringify(dados, null, 1) + '\n';
}

export const clonar = x => JSON.parse(JSON.stringify(x));

const k = s => String(s ?? '').trim().toLowerCase();

/** Como cada arquivo é indexado para a mesclagem: [caminho da coleção, função de chave] */
export const COLECOES = {
  cadastro: [
    ['insumos', r => k(r.nome)],
    ['produtos', r => k(r.nome)],
    ['fichas', r => `${k(r.produto)}|${k(r.insumo)}`],
    ['mapeamento', r => `${r.cnpj || ''}|${r.cprod || ''}|${r.ean || ''}|${k(r.texto)}`],
    ['lojas', null], // objeto cnpj -> nome
  ],
  nfe_itens: [['notas', null]],
  vendas: [['vendas', r => `${r.data}|${k(r.produto)}|${k(r.origem)}|${k(r.loja)}`]],
  contagens: [['contagens', r => `${r.data}|${k(r.insumo)}|${k(r.loja)}`]],
};

function indexar(lista, chaveFn) {
  const m = new Map();
  for (const r of lista || []) m.set(chaveFn(r), r);
  return m;
}

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Mesclagem em 3 vias por chave: o que mudou localmente em relação à base (inclusive exclusões)
 * prevalece; o resto vem do remoto. Devolve um novo objeto.
 */
export function mesclar3(nome, base, local, remoto) {
  const resultado = clonar(remoto || PADROES[nome]());
  for (const [campo, chaveFn] of COLECOES[nome]) {
    if (chaveFn == null) {
      // objeto chaveado (lojas, notas)
      const b = (base || {})[campo] || {}, l = (local || {})[campo] || {}, r = (remoto || {})[campo] || {};
      const saida = {};
      const chaves = new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]);
      for (const c of chaves) {
        const mudouLocal = !igual(b[c], l[c]);
        const valor = mudouLocal ? l[c] : r[c];
        if (valor !== undefined) saida[c] = valor;
      }
      resultado[campo] = saida;
    } else {
      const b = indexar((base || {})[campo], chaveFn), l = indexar((local || {})[campo], chaveFn), r = indexar((remoto || {})[campo], chaveFn);
      const saida = [];
      const vistos = new Set();
      // ordem: remoto primeiro (preserva a ordem publicada), depois o que só existe localmente
      for (const [c, reg] of r) {
        vistos.add(c);
        const mudouLocal = !igual(b.get(c), l.get(c));
        const valor = mudouLocal ? l.get(c) : reg;
        if (valor !== undefined) saida.push(valor);
      }
      for (const [c, reg] of l) {
        if (vistos.has(c)) continue;
        if (!igual(b.get(c), reg)) saida.push(reg); // novo ou alterado localmente
        // se existia na base e sumiu do remoto sem mudança local: foi excluído remotamente, fica fora
      }
      resultado[campo] = saida;
    }
  }
  resultado.versao = 1;
  return resultado;
}

/** Lista dos campos cujo conteúdo difere entre dois estados (para saber o que salvar). */
export function mudou(nome, a, b) {
  for (const [campo] of COLECOES[nome]) if (!igual((a || {})[campo], (b || {})[campo])) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Configuração (token) e rascunho
// ---------------------------------------------------------------------------

export function carregarConfig() {
  for (const st of [sessionStorage, localStorage]) {
    try {
      const txt = st.getItem(CHAVE_CONFIG);
      if (txt) return { ...JSON.parse(txt), lembrado: st === localStorage };
    } catch { /* ignora */ }
  }
  return { token: '', nome: '', owner: OWNER_PADRAO, repo: REPO_PADRAO, branch: BRANCH_PADRAO, lembrado: false };
}

export function salvarConfig(cfg, lembrar) {
  const limpo = { token: cfg.token || '', nome: cfg.nome || '', owner: cfg.owner || OWNER_PADRAO, repo: cfg.repo || REPO_PADRAO, branch: cfg.branch || BRANCH_PADRAO };
  try {
    sessionStorage.setItem(CHAVE_CONFIG, JSON.stringify(limpo));
    if (lembrar) localStorage.setItem(CHAVE_CONFIG, JSON.stringify(limpo));
    else localStorage.removeItem(CHAVE_CONFIG);
  } catch { /* armazenamento indisponível */ }
}

export function esquecerConfig() {
  try { sessionStorage.removeItem(CHAVE_CONFIG); localStorage.removeItem(CHAVE_CONFIG); } catch { /* ignora */ }
}

export function rascunhoCarregar() {
  try {
    const txt = localStorage.getItem(CHAVE_RASCUNHO);
    return txt ? JSON.parse(txt) : null;
  } catch { return null; }
}

/** Guarda só os arquivos alterados. Devolve false se não coube. */
export function rascunhoSalvar(arquivos, base) {
  const alterados = {};
  for (const nome of Object.keys(ARQUIVOS)) if (mudou(nome, arquivos[nome], base[nome]?.dados)) alterados[nome] = arquivos[nome];
  if (!Object.keys(alterados).length) { rascunhoLimpar(); return true; }
  const txt = JSON.stringify({ quando: agoraIso(), arquivos: alterados, shas: Object.fromEntries(Object.keys(ARQUIVOS).map(n => [n, base[n]?.sha || null])) });
  if (txt.length > LIMITE_RASCUNHO) return false;
  try { localStorage.setItem(CHAVE_RASCUNHO, txt); return true; } catch { return false; }
}

export function rascunhoLimpar() {
  try { localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* ignora */ }
}

// ---------------------------------------------------------------------------
// Repositório (leitura/gravação)
// ---------------------------------------------------------------------------

export class ErroGitHub extends Error {
  constructor(mensagem, status, corpo) { super(mensagem); this.status = status; this.corpo = corpo; }
}

export class Repositorio {
  constructor({ owner = OWNER_PADRAO, repo = REPO_PADRAO, branch = BRANCH_PADRAO, token = '', nome = '', fetchImpl = null, basePages = '' } = {}) {
    this.owner = owner; this.repo = repo; this.branch = branch; this.token = token || ''; this.nome = nome || '';
    this.fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.basePages = basePages; // '' = relativo à página
  }

  get temToken() { return Boolean(this.token); }

  cabecalhos(extra = {}) {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
  }

  urlApi(caminho) {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${caminho}`;
  }

  async _api(url, opcoes = {}) {
    const r = await this.fetch(url, { ...opcoes, headers: this.cabecalhos(opcoes.headers || {}) });
    if (!r.ok) {
      let corpo = null;
      try { corpo = await r.json(); } catch { /* sem corpo */ }
      const msg = corpo?.message || r.statusText || `HTTP ${r.status}`;
      throw new ErroGitHub(msg, r.status, corpo);
    }
    return r;
  }

  /** Confere o token: devolve { login, podeEscrever }. */
  async verificarAcesso() {
    const quem = await (await this._api('https://api.github.com/user')).json();
    const repo = await (await this._api(`https://api.github.com/repos/${this.owner}/${this.repo}`)).json();
    return { login: quem.login, podeEscrever: Boolean(repo.permissions?.push) };
  }

  /** sha de cada arquivo da pasta (via listagem; null se não existir). */
  async shas() {
    const saida = Object.fromEntries(Object.keys(ARQUIVOS).map(n => [n, null]));
    try {
      const lista = await (await this._api(`${this.urlApi(PASTA)}?ref=${encodeURIComponent(this.branch)}`)).json();
      for (const e of lista) {
        const nome = Object.keys(ARQUIVOS).find(n => ARQUIVOS[n] === `${PASTA}/${e.name}`);
        if (nome) saida[nome] = e.sha;
      }
    } catch (e) {
      if (!(e instanceof ErroGitHub && e.status === 404)) throw e;
    }
    return saida;
  }

  /** Lê um arquivo JSON: pela API (raw) com token, senão pelo site. Devolve { dados, sha, existe }. */
  async carregarArquivo(nome, shaConhecido = undefined) {
    const caminho = ARQUIVOS[nome];
    if (this.temToken) {
      try {
        const r = await this._api(`${this.urlApi(caminho)}?ref=${encodeURIComponent(this.branch)}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
        const texto = await r.text();
        return { dados: normalizar(nome, JSON.parse(texto)), sha: shaConhecido ?? null, existe: true };
      } catch (e) {
        if (e instanceof ErroGitHub && e.status === 404) return { dados: PADROES[nome](), sha: null, existe: false };
        throw e;
      }
    }
    const r = await this.fetch(`${this.basePages}${caminho}`, { cache: 'no-cache' });
    if (r.status === 404) return { dados: PADROES[nome](), sha: null, existe: false };
    if (!r.ok) throw new Error(`não consegui ler ${caminho} (HTTP ${r.status})`);
    return { dados: normalizar(nome, await r.json()), sha: null, existe: true };
  }

  /** contas.json do painel (só leitura): devolve o objeto ou null se não existir. */
  async carregarContas() {
    try {
      if (this.temToken) {
        const r = await this._api(`${this.urlApi('dados/contas.json')}?ref=${encodeURIComponent(this.branch)}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
        return JSON.parse(await r.text());
      }
      const r = await this.fetch(`${this.basePages}dados/contas.json`, { cache: 'no-cache' });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  /** Carrega os 4 arquivos (+ shas quando há token). Devolve { arquivos: {nome: {dados, sha, existe}}, origem }. */
  async carregarTudo() {
    const shas = this.temToken ? await this.shas() : {};
    const entradas = await Promise.all(Object.keys(ARQUIVOS).map(async n => [n, await this.carregarArquivo(n, shas[n] ?? null)]));
    return { arquivos: Object.fromEntries(entradas), origem: this.temToken ? 'api' : 'pages' };
  }

  /**
   * Grava um arquivo. base = {dados, sha} carregado; local = dados atuais. Em conflito, mescla com o
   * remoto e tenta de novo (uma vez). Devolve { dados, sha, mesclado } com o que ficou publicado.
   */
  async salvar(nome, base, local, mensagem) {
    if (!this.temToken) throw new Error('sem token do GitHub: configure em Ajustes ou baixe o JSON');
    let sha = base?.sha ?? null;
    let dados = clonar(local);
    let mesclado = false;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      dados.versao = 1;
      dados.atualizado = agoraIso();
      const corpo = { message: `estoque: ${mensagem} (${this.nome || 'página'})`, content: utf8ParaBase64(serializar(dados)), branch: this.branch };
      if (sha) corpo.sha = sha;
      try {
        const r = await this._api(this.urlApi(ARQUIVOS[nome]), { method: 'PUT', body: JSON.stringify(corpo), headers: { 'Content-Type': 'application/json' } });
        const resp = await r.json();
        return { dados, sha: resp.content?.sha || null, mesclado };
      } catch (e) {
        const conflito = e instanceof ErroGitHub && (e.status === 409 || e.status === 422);
        if (!conflito || tentativa === 1) throw e;
        // alguém gravou antes: recarrega, mescla e tenta de novo
        const shas = await this.shas();
        const remoto = await this.carregarArquivo(nome, shas[nome]);
        dados = mesclar3(nome, base?.dados, local, remoto.dados);
        sha = remoto.sha;
        mesclado = true;
      }
    }
    throw new Error('não consegui gravar');
  }
}

/** Garante o formato esperado mesmo que o arquivo esteja incompleto ou num formato antigo. */
export function normalizar(nome, bruto) {
  const padrao = PADROES[nome]();
  if (bruto == null || typeof bruto !== 'object') return padrao;
  if (Array.isArray(bruto)) {
    // formato "lista pura" (como lancamentos.json)
    const campo = COLECOES[nome][0][0];
    return { ...padrao, [campo]: bruto };
  }
  const saida = { ...padrao, ...bruto };
  for (const [campo, chaveFn] of COLECOES[nome]) {
    if (chaveFn == null) { if (!saida[campo] || typeof saida[campo] !== 'object' || Array.isArray(saida[campo])) saida[campo] = {}; }
    else if (!Array.isArray(saida[campo])) saida[campo] = [];
  }
  return saida;
}

/** Converte os 4 arquivos no formato que o motor espera (listas por nome + notas por chave). */
export function paraMotor(arquivos, { loja = '' } = {}) {
  const cad = arquivos.cadastro || PADROES.cadastro();
  const lojas = cad.lojas || {};
  const filtraLoja = r => !loja || k(r.loja) === k(loja);
  let notas = Object.entries((arquivos.nfe_itens || PADROES.nfe_itens()).notas || {}).map(([chave, n]) => ({ chave, ...n }));
  if (loja) {
    const cnpjs = new Set(Object.entries(lojas).filter(([, nome]) => k(nome) === k(loja)).map(([cnpj]) => cnpj));
    notas = notas.filter(n => cnpjs.has(String(n.destinatario_cnpj || '').replace(/\D/g, '')));
  }
  return {
    insumos: cad.insumos || [],
    produtos: cad.produtos || [],
    fichas: cad.fichas || [],
    mapeamento: cad.mapeamento || [],
    nfes: notas,
    vendas: ((arquivos.vendas || PADROES.vendas()).vendas || []).filter(filtraLoja),
    contagens: ((arquivos.contagens || PADROES.contagens()).contagens || []).filter(filtraLoja),
  };
}
