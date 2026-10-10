// Leitura de XML de NF-e (modelo 55) / NFC-e (65), layout 3.10 e 4.00, com ou sem nfeProc.
// Porte de pizzaria/nfe.py. Usa DOMParser (navegador). Só extrai o que o estoque precisa.

import { normalizarData, somenteDigitos } from './motor.js';

export class NFeInvalida extends Error {}

const local = el => el.localName || el.nodeName.replace(/^.*:/, '');

function filho(el, caminho) {
  let atual = el;
  for (const parte of caminho.split('/')) {
    if (!atual) return null;
    let proximo = null;
    for (const f of atual.children) {
      if (local(f) === parte) { proximo = f; break; }
    }
    atual = proximo;
  }
  return atual;
}

const texto = (el, caminho, padrao = '') => {
  const achado = filho(el, caminho);
  return achado && achado.textContent != null ? achado.textContent.trim() : padrao;
};
const num = (el, caminho, padrao = 0) => {
  const t = texto(el, caminho);
  return t ? Number(t) : padrao;
};

function primeiro(raiz, nome) {
  if (local(raiz) === nome) return raiz;
  const todos = raiz.getElementsByTagName('*');
  for (const el of todos) if (local(el) === nome) return el;
  return null;
}

const ean = v => somenteDigitos(v); // "SEM GTIN" vira ""

/**
 * lerNfeTexto(xml, origem?) -> { chave, modelo, serie, numero, data_emissao, emitente_cnpj,
 *   emitente_nome, destinatario_cnpj, valor_total, itens[] }
 * Lança NFeInvalida se o XML não for uma NF-e reconhecível.
 */
export function lerNfeTexto(xml, origem = '<texto>', parser = null) {
  const dp = parser || new DOMParser();
  const doc = dp.parseFromString(String(xml).replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || !doc.documentElement) {
    throw new NFeInvalida(`${origem}: XML inválido`);
  }
  const inf = primeiro(doc.documentElement, 'infNFe');
  if (!inf) throw new NFeInvalida(`${origem}: elemento infNFe não encontrado (não é uma NF-e?)`);

  let chave = somenteDigitos(inf.getAttribute('Id') || '');
  if (!chave) chave = somenteDigitos(texto(primeiro(doc.documentElement, 'infProt'), 'chNFe'));
  if (chave.length !== 44) throw new NFeInvalida(`${origem}: chave de acesso inválida ('${chave}')`);

  const ide = filho(inf, 'ide');
  const emissao = texto(ide, 'dhEmi') || texto(ide, 'dEmi');
  if (!emissao) throw new NFeInvalida(`${origem}: data de emissão não encontrada`);
  const data = normalizarData(emissao);
  if (!data) throw new NFeInvalida(`${origem}: data de emissão inválida ('${emissao}')`);

  const emit = filho(inf, 'emit');
  const dest = filho(inf, 'dest');

  const itens = [];
  for (const det of inf.children) {
    if (local(det) !== 'det') continue;
    const prod = filho(det, 'prod');
    if (!prod) continue;
    itens.push({
      n_item: Number(det.getAttribute('nItem') || itens.length + 1),
      cprod: texto(prod, 'cProd'),
      xprod: texto(prod, 'xProd'),
      ncm: texto(prod, 'NCM'),
      ean: ean(texto(prod, 'cEAN')) || ean(texto(prod, 'cEANTrib')),
      cfop: texto(prod, 'CFOP'),
      ucom: texto(prod, 'uCom'),
      qcom: num(prod, 'qCom'),
      vuncom: num(prod, 'vUnCom'),
      vprod: num(prod, 'vProd'),
      utrib: texto(prod, 'uTrib'),
      qtrib: num(prod, 'qTrib'),
    });
  }

  return {
    chave,
    modelo: texto(ide, 'mod'),
    serie: texto(ide, 'serie'),
    numero: texto(ide, 'nNF'),
    data_emissao: data,
    emitente_cnpj: somenteDigitos(texto(emit, 'CNPJ') || texto(emit, 'CPF')),
    emitente_nome: texto(emit, 'xNome'),
    destinatario_cnpj: somenteDigitos(texto(dest, 'CNPJ') || texto(dest, 'CPF')),
    valor_total: num(inf, 'total/ICMSTot/vNF'),
    itens,
  };
}

/** Lê um File/Blob (input type=file ou drag & drop) como texto UTF-8 e interpreta a NF-e. */
export async function lerNfeArquivo(arquivo) {
  const buf = await arquivo.arrayBuffer();
  let xml;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    xml = new TextDecoder('iso-8859-1').decode(buf);
  }
  return lerNfeTexto(xml, arquivo.name || '<arquivo>');
}
