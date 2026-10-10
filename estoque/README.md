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
Contagem feita de madrugada (antes das 5h) é sugerida com a data de ontem, o dia do fechamento.
Com token conectado, "Gravar contagem" já publica no GitHub.

**O que fica fora do cálculo:** notas com status *cancelada* na triagem do painel, notas marcadas
`cancelada: true` em `nfe_itens.json` e notas de fornecedores marcados como "fora do estoque"
(equipamentos, serviços — aba NF-es → "Ignorar este fornecedor"; lista em Ajustes).

**Lojas:** com CNPJs cadastrados em Ajustes, o seletor de loja filtra vendas, contagens e NF-es
(pelo CNPJ do destinatário). Sem loja escolhida, as contagens do mesmo dia de lojas diferentes são
somadas, como no CLI. A última loja escolhida fica lembrada no aparelho.

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
  repositório. Fine-grained tokens vencem: a página mostra o vencimento quando faltam 14 dias e, se
  o GitHub recusar o token, avisa e mantém as alterações no aparelho até você colar um token novo.
  O repositório é público: os dados em `dados/` são visíveis a qualquer um, com ou sem esta página.
- A página não grava um cadastro inválido (ex.: mapeamento sem insumo), porque isso travaria a
  importação do robô.
- Os módulos `estoque/*.js` podem ficar até ~10 min em cache no site depois de uma publicação; se a
  página abrir com erro logo após uma atualização, recarregue depois de alguns minutos.

## O que passa a ser público

O repositório `notas` é público e o GitHub Pages serve tudo que está nele. Hoje já estão públicos os
totais das NF-es, as contas a pagar e os repasses. Com esta página passam a ficar públicos também,
em `dados/estoque/`:

- `cadastro.json`: a ficha técnica de cada pizza (quanto de cada insumo), os preços de venda, os
  CNPJs das lojas e o mapeamento de itens;
- `nfe_itens.json`: cada item comprado, com quantidade e preço pago por fornecedor;
- `vendas.json`: vendas por dia, produto, origem e loja; `contagens.json`: o estoque contado.

Cifrar `estoque.html` protege a abertura da página, não esses arquivos. Se isso não for aceitável,
as saídas são tornar o repositório privado (Pages em repositório privado exige plano pago do GitHub)
ou cifrar os JSON com a mesma senha da página (a página e o CLI já têm as primitivas; não está feito).

## Proteger com senha (como o painel)

A fonte de `estoque.html` está em claro neste repositório (e no histórico), então a versão cifrada
serve como barreira de senha na abertura, não para esconder o código. Para gerá-la, no mesmo
formato de `index.html` (PBKDF2-SHA256 + AES-GCM, decifrado no navegador):

```bash
python3 ferramentas/cifrar_pagina.py estoque.html --saida estoque.html
```

A senha é pedida no terminal (ou `--senha-env NOME_DA_VARIAVEL`). Guarde a versão em claro fora do
repositório, como já é feito com o painel. A senha lembrada fica na chave `fdr_est_pw`; se a senha
for a mesma do painel, a página abre sozinha com a senha já lembrada dele (sem apagar nada se for
diferente). A página tem manifesto próprio (`estoque.webmanifest`), então "Adicionar à Tela de
Início" cria um ícone **Estoque** separado do painel; o manifesto do painel também ganhou atalhos
(toque longo no ícone, no Android).

## Estrutura e testes

- `estoque/motor.js` — o cálculo (porte fiel de `pizzaria/conciliacao.py`; mesmos textos de alerta).
- `estoque/nfe.js` — leitura do XML de NF-e (layout 3.10/4.00, com ou sem `nfeProc`).
- `estoque/dados.js` — leitura/gravação (Pages ou API), mesclagem em 3 vias, rascunho, token.
- `estoque/testes/` — `node --test estoque/testes/` (Node 20+). Os testes de motor e dados não
  precisam de nada; os de navegador (`navegador.test.mjs`, `pagina.test.mjs`) usam o Playwright
  se estiver instalado (`npm i -g playwright && npx playwright install chromium`) e pulam se não.
  `fixture-exemplo-*.json` são a saída do CLI Python sobre `exemplos/` do gestao-pizzaria: o teste
  de paridade garante que a página e o CLI dão o mesmo resultado.
