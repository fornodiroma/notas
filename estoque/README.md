# Estoque & Conciliação — `estoque.html`

Página do painel que responde: **"comprei 100 kg de mussarela, isso rende quantas pizzas, quantas
vendi e quanto sumiu?"**. Cruza as NF-es de compra (os XMLs), a ficha técnica das pizzas, as vendas
e a contagem física do estoque.

```
estoque teórico final = contagem inicial + compras (NF-e) − pizzas vendidas × ficha técnica
divergência           = contagem física final − estoque teórico final
```

Tudo roda no navegador (sem servidor): a página lê os JSON de `dados/` e grava de volta no
repositório pela API do GitHub com um token do sócio.

## Como usar no dia a dia

1. **Fichas** — cadastre os insumos (Mussarela em g, Molho em ml, Refrigerante lata em un…) e a
   ficha técnica de cada pizza/produto (quanto de cada insumo vai em 1 unidade vendida).
2. **Mapeamento** — diga como cada item de NF-e vira um insumo: por CNPJ + código do fornecedor,
   código de barras (EAN) ou um trecho da descrição. Para caixa, saco, balde… informe o **fator**
   (quantas g/ml/un há em 1 unidade da nota). KG, G, L, ML e UN convertem sozinhos. A aba sugere os
   itens que ainda não têm mapeamento.
3. **NF-es** — arraste os XMLs de compra (ou toque para escolher). A lista cruza com a triagem do
   painel (`dados/contas.json` → `notas`): mostra as notas aprovadas que ainda não têm itens
   importados, as que o XML ainda não chegou, e os itens sem mapeamento.
4. **Vendas** — registre as pizzas vendidas por dia (formulário ou CSV `data;produto;quantidade;
   valor_unitario;origem;loja`).
5. **Contagem** — no fechamento, conte o estoque e registre com a data daquele dia (em kg / L / un;
   a página converte).
6. **Conciliação** — escolha o período (ex.: mês anterior) e toque em Calcular. Toque em **Salvar**
   para publicar as alterações (precisa do token em Ajustes; sem token dá para baixar os JSON).

**Regra do período:** o estoque inicial é a contagem mais recente *anterior* ao primeiro dia
(ex.: contagem de 31/08 para setembro) e o estoque final é a contagem feita *no* último dia.
Sem contagem inicial a página considera 0 e avisa; sem contagem final mostra só o teórico.

## O relatório

- **Resumo:** vendidos, receita, compras (NF-e), CMV teórico (vendas × ficha × custo) e CMV real
  (inicial + compras − contagem), ambos em % da receita, e a perda em R$.
- **Por insumo:** inicial, compras, consumo teórico, estoque teórico, contagem, divergência (em
  quantidade, % e R$), custo médio pelas NF-es do período (ou da última compra anterior, marcado
  com `*`), quanto vai por pizza, **quantas pizzas as compras rendem** e **quantas o estoque atual
  ainda rende**.
- **Por pizza:** vendidas, receita, custo pela ficha, margem, quantas dá para fazer com o estoque
  atual e qual insumo limita.
- **Pendências e alertas:** itens de NF-e sem mapeamento (com botão para mapear), pizza vendida sem
  ficha, insumo sem contagem, estoque teórico negativo (NF-e faltando ou contagem inicial ausente).

## Arquivos de dados (`dados/estoque/`)

| arquivo          | conteúdo                                                                          |
|------------------|-----------------------------------------------------------------------------------|
| `cadastro.json`  | `lojas` (CNPJ → nome), `insumos` (nome, unidade g/ml/un), `produtos` (nome, preco), `fichas` (produto, insumo, quantidade), `mapeamento` (cnpj, cprod, ean, texto, insumo, fator) |
| `nfe_itens.json` | `notas`: chave de acesso → cabeçalho da NF-e + `itens` (cProd, xProd, NCM, EAN, CFOP, uCom, qCom, vUnCom, vProd, uTrib, qTrib) |
| `vendas.json`    | `vendas`: data, produto, quantidade, valor_unitario, origem, loja                 |
| `contagens.json` | `contagens`: data, insumo, quantidade (na unidade base), loja                     |

Os mesmos arquivos são lidos e escritos pelo CLI Python `pizzaria` (repositório
`fornodiroma/gestao-pizzaria`): o robô local pode importar os XMLs e publicar com
`pizzaria importar nfe pasta/ && pizzaria sincronizar-json ../notas/dados/estoque`, no mesmo fluxo
dos commits "dados locais". A sincronização é uma união por chave: ninguém apaga o que o outro
gravou.

## Gravação, conflitos e cache

- Com token (Ajustes → fine-grained token só para este repositório, permissão *Contents: read and
  write*), a página lê pela API do GitHub (sempre fresca) e grava com `PUT` + `sha`. Se alguém gravou
  antes (robô, outro sócio), ela recarrega, mescla em 3 vias por chave (o que você mudou prevalece,
  o resto vem do remoto, exclusões suas são respeitadas) e grava de novo.
- Sem token, lê pelo site (GitHub Pages, que pode demorar até ~10 min para refletir uma gravação) e
  só permite baixar os JSON.
- O que você altera fica num rascunho no aparelho (localStorage) até salvar; ao reabrir, a página
  restaura e avisa.
- O token fica só no aparelho (sessionStorage, ou localStorage se marcar "lembrar"); nunca entra no
  repositório. O repositório é público: os dados em `dados/` são visíveis a qualquer um, com ou sem
  esta página.

## Proteger com senha (como o painel)

`estoque.html` está em claro. Para servir a versão com a tela de senha, no mesmo formato de
`index.html` (PBKDF2-SHA256 + AES-GCM, decifrado no navegador):

```bash
python3 ferramentas/cifrar_pagina.py estoque.html --saida estoque.html
```

A senha é pedida no terminal (ou `--senha-env NOME_DA_VARIAVEL`). Guarde a versão em claro fora do
repositório, como já é feito com o painel. A senha lembrada fica na chave `fdr_est_pw` (separada da
do painel; use `--chave-storage fdr_pw` só se a senha for a mesma).

## Estrutura e testes

- `estoque/motor.js` — o cálculo (porte fiel de `pizzaria/conciliacao.py`; mesmos textos de alerta).
- `estoque/nfe.js` — leitura do XML de NF-e (layout 3.10/4.00, com ou sem `nfeProc`).
- `estoque/dados.js` — leitura/gravação (Pages ou API), mesclagem em 3 vias, rascunho, token.
- `estoque/testes/` — `node --test estoque/testes/` (Node 20+). Os testes de motor e dados não
  precisam de nada; os de navegador (`navegador.test.mjs`, `pagina.test.mjs`) usam o Playwright
  se estiver instalado (`npm i -g playwright && npx playwright install chromium`) e pulam se não.
  `fixture-exemplo-*.json` são a saída do CLI Python sobre `exemplos/` do gestao-pizzaria: o teste
  de paridade garante que a página e o CLI dão o mesmo resultado.
