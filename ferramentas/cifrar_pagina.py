#!/usr/bin/env python3
"""Gera a versão protegida por senha de uma página, no mesmo formato do painel (index.html).

O HTML é comprimido (gzip), cifrado com AES-GCM-256 (chave derivada da senha por
PBKDF2-SHA256, 300.000 iterações) e embutido numa tela de senha idêntica à do painel:
a decifragem acontece no navegador, nada sai do aparelho.

Uso:
    python3 ferramentas/cifrar_pagina.py estoque.html --saida estoque.html
    (a senha é pedida no terminal; ou passe --senha-env NOME_DA_VARIAVEL)

Requer o pacote `cryptography` (pip install cryptography).

ATENÇÃO: guarde a versão em claro fora do repositório (como já é feito com o painel);
a saída substitui o arquivo original se --saida for o mesmo caminho.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import gzip
import html
import json
import os
import sys
from pathlib import Path

ITERACOES = 300000

MODELO = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="manifest" href="__MANIFEST__">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Forno D'Ouro">
<meta name="theme-color" content="#1c1813">
<meta name="description" content="__DESCRICAO__">
<meta name="robots" content="noindex">
<title>__TITULO__</title>
<style>
body{font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;color:#ece6dc;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;
background:radial-gradient(1000px 600px at 70% -10%, #35231c 0%, #16130f 55%)}
.card{background:#211d18;border:1px solid #3a332b;border-radius:18px;padding:36px 30px;
max-width:360px;width:90%;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.5)}
.logo{font-size:30px;background:linear-gradient(160deg,#e3b84e,#9a6f14);border-radius:16px;width:62px;height:62px;
display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
h1{font-size:17px;margin:0;letter-spacing:.05em}
.tag{font-size:10px;color:#b3a998;letter-spacing:.16em;text-transform:uppercase;margin:2px 0 6px}
p{color:#8a8175;font-size:12.5px;margin:0 0 20px;line-height:1.5}
input{width:100%;box-sizing:border-box;padding:13px;border-radius:10px;border:1px solid #3a332b;
background:#16130f;color:#ece6dc;font-size:16px;text-align:center;margin-bottom:12px;outline:none}
input:focus{border-color:#d4a437}
button{width:100%;padding:13px;border:none;border-radius:10px;background:linear-gradient(160deg,#d8a93a,#b8860b);color:#231b0a;
font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.03em}
button:hover{filter:brightness(1.08)}
.err{color:#e06a4f;font-size:12.5px;min-height:16px;margin-top:10px}
.lembrar{display:flex;align-items:center;justify-content:center;gap:7px;color:#b3a998;font-size:12px;margin-bottom:12px;cursor:pointer;user-select:none}
.lembrar input{width:auto;margin:0;accent-color:#b8860b}
.hint{display:none;margin-top:18px;padding:12px;border:1px dashed #3a332b;border-radius:10px;color:#b3a998;font-size:12px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
<div class="logo">__LOGO__</div>
<h1>FORNO D&#39;OURO</h1>
<div class="tag">__TAG__</div>
<p>__PARAGRAFO__</p>
<input id="pw" type="password" placeholder="senha" autofocus>
<label class="lembrar"><input id="lembrar" type="checkbox" checked> Lembrar a senha neste aparelho</label>
<button onclick="abrir()">Entrar</button>
<div class="err" id="err"></div>
<div class="hint" id="hint">&#128241; Para instalar como aplicativo (&iacute;cone separado do painel): toque em <b>Compartilhar</b> <span style="opacity:.8">(&#x2B06;&#xFE0E;)</span> e depois em <b>&ldquo;Adicionar &agrave; Tela de In&iacute;cio&rdquo;</b>.<br>Na primeira abertura do app, digite a senha uma vez.</div>
</div>
<script>
const P = __P__;
const CHAVE = __CHAVE__;
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function tentar(senha, guardar){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha),
    'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:b64(P.salt), iterations:P.iter, hash:'SHA-256'},
    km, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const claro = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64(P.nonce)}, key, b64(P.data));
  const ds = new DecompressionStream('gzip');
  const html = await new Response(new Response(claro).body.pipeThrough(ds)).text();
  if (guardar) { try { localStorage.setItem(CHAVE, senha); } catch(e){} }
  document.open(); document.write(html); document.close();
}
async function abrir(){
  const s = document.getElementById('pw').value;
  const lembrar = document.getElementById('lembrar').checked;
  sessionStorage.setItem(CHAVE, s);
  if (lembrar) localStorage.setItem(CHAVE, s);
  try { await tentar(s); }
  catch(e){
    sessionStorage.removeItem(CHAVE); localStorage.removeItem(CHAVE);
    const el = document.getElementById('err'); if (el) el.textContent = 'Senha incorreta.';
  }
}
document.getElementById('pw').addEventListener('keydown', e => { if(e.key==='Enter') abrir(); });
const salva = localStorage.getItem(CHAVE) || sessionStorage.getItem(CHAVE);
if (salva) tentar(salva).catch(()=>{ sessionStorage.removeItem(CHAVE); localStorage.removeItem(CHAVE); });
else if (CHAVE !== 'fdr_pw') {
  // mesma senha do painel? tenta a senha lembrada dele sem apagar nada se falhar
  const doPainel = localStorage.getItem('fdr_pw') || sessionStorage.getItem('fdr_pw');
  if (doPainel) tentar(doPainel, true).catch(()=>{});
}
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
if (!standalone && /iPhone|iPad|iPod/.test(navigator.userAgent))
  document.getElementById('hint').style.display = 'block';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
</script>
</body>
</html>
"""


def cifrar(html_claro: str, senha: str, iteracoes: int = ITERACOES) -> dict:
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("instale o pacote cryptography: pip install cryptography") from exc

    salt = os.urandom(16)
    nonce = os.urandom(12)
    chave = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iteracoes).derive(senha.encode("utf-8"))
    cifrado = AESGCM(chave).encrypt(nonce, gzip.compress(html_claro.encode("utf-8"), mtime=0), None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"salt": b64(salt), "nonce": b64(nonce), "data": b64(cifrado), "iter": iteracoes}


def montar(p: dict, *, titulo: str, tag: str, descricao: str, paragrafo: str, logo: str, chave_storage: str,
           manifest: str = "estoque.webmanifest") -> str:
    return (
        MODELO.replace("__P__", json.dumps(p))
        .replace("__MANIFEST__", html.escape(manifest))
        .replace("__CHAVE__", json.dumps(chave_storage))
        .replace("__TITULO__", html.escape(titulo))
        .replace("__TAG__", html.escape(tag))
        .replace("__DESCRICAO__", html.escape(descricao))
        .replace("__PARAGRAFO__", paragrafo)
        .replace("__LOGO__", logo)
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("entrada", help="página em claro (HTML completo)")
    ap.add_argument("--saida", required=True, help="arquivo de saída (pode ser o mesmo da entrada)")
    ap.add_argument("--senha-env", help="nome da variável de ambiente com a senha (senão é pedida no terminal)")
    ap.add_argument("--titulo", default="Estoque — Forno D'Ouro")
    ap.add_argument("--tag", default="Estoque & Conciliação")
    ap.add_argument("--descricao", default="Conciliação de compras (NF-e), estoque e vendas. Acesso restrito aos sócios com senha.")
    ap.add_argument("--paragrafo", default="Compras &middot; estoque &middot; vendas &middot; rendimento das pizzas.<br>Entre com a senha do painel.")
    ap.add_argument("--logo", default="&#128230;", help="emoji/HTML do ícone (padrão: 📦)")
    ap.add_argument("--chave-storage", default="fdr_est_pw",
                    help="chave do localStorage/sessionStorage para lembrar a senha. Com a chave própria (padrão), a página "
                         "ainda tenta a senha lembrada do painel (fdr_pw) e, se for a mesma, abre sozinha sem apagar nada")
    ap.add_argument("--manifest", default="estoque.webmanifest", help="manifesto do PWA referenciado pela página")
    ap.add_argument("--iteracoes", type=int, default=ITERACOES)
    args = ap.parse_args(argv)

    senha = os.environ.get(args.senha_env, "") if args.senha_env else ""
    if not senha:
        senha = getpass.getpass("Senha da página: ")
        if getpass.getpass("Repita a senha: ") != senha:
            print("As senhas não conferem.", file=sys.stderr)
            return 1
    if not senha:
        print("Senha vazia.", file=sys.stderr)
        return 1

    claro = Path(args.entrada).read_text(encoding="utf-8")
    if "const P = {" in claro and "crypto.subtle.decrypt" in claro:
        print("A entrada já parece ser uma página cifrada; informe a versão em claro.", file=sys.stderr)
        return 1
    p = cifrar(claro, senha, args.iteracoes)
    saida = montar(p, titulo=args.titulo, tag=args.tag, descricao=args.descricao, paragrafo=args.paragrafo,
                   logo=args.logo, chave_storage=args.chave_storage, manifest=args.manifest)
    Path(args.saida).write_text(saida, encoding="utf-8")
    print(f"{args.saida}: {len(claro):,} bytes em claro -> {len(saida):,} bytes cifrados ({args.iteracoes} iterações)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
