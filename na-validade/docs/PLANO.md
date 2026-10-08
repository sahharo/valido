# Na Validade — Diagnóstico e plano de implementação

## 1. Diagnóstico do projeto atual

**Stack:** React 19 + TypeScript + Vite + Tailwind v4 (frontend, PWA). Leitura de código de barras com ZXing. Banco **Dexie/IndexedDB dentro do navegador**. **Não existe backend.**

**O que já funciona (e será preservado):**
- Login por e-mail, telefone, CPF ou CNPJ; cadastro em 2 passos (pessoa → lojas, 1 a 50); validação de CPF/CNPJ/telefone/e-mail com sugestão de domínio.
- Scanner por câmera + código digitado; busca no Open Food Facts quando o código é novo.
- Dashboard com 4 indicadores, lista de lotes com busca e filtro de status, filtro por loja, perfil, exportação CSV, confirmação de ações dentro do app.
- Design (cores suaves, cartões arredondados, fonte Nunito, barra inferior com botão central de escanear).

**Problemas técnicos encontrados:**

| # | Problema | Impacto |
|---|----------|---------|
| 1 | Sem backend: dados ficam só no navegador de cada aparelho | Lojas não compartilham dados; permissões não podem ser garantidas; limpar o navegador apaga tudo |
| 2 | "Sessão" é apenas o id do usuário no `localStorage` | Qualquer pessoa com acesso ao aparelho pode se passar por outro usuário |
| 3 | Não existe a entidade **Empresa**; a loja pertence à pessoa | Impossível ter vários usuários na mesma rede |
| 4 | Cargo é só um texto; não há permissões | Qualquer usuário pode fazer qualquer ação |
| 5 | Produto identificado só pelo código de barras e compartilhado entre todas as contas do aparelho; lote aponta para o código, não para o produto | Mistura dados entre empresas; não há unidade nem custo |
| 6 | Lote sem número do lote, quem cadastrou, status, quem retirou, motivo | Sem rastreabilidade |
| 7 | "Excluir lote" e "Apagar todos os lotes" apagam de verdade | Perde histórico — contraria o requisito 11 |
| 8 | "Retirar" não pede motivo nem quantidade e não grava histórico | Impossível calcular perdas |
| 9 | Produtos de exemplo usam códigos de barras reais com nomes inventados | Conflita com produtos reais (ex.: 7891000100103) |
| 10 | Dashboard mostra só 8 lotes, sem tabela, sem consolidação por loja, sem desempate por quantidade | Gestor não vê o todo |
| 11 | Open Food Facts consultado direto do celular a cada leitura, sem cache e sem identificação | Risco de bloqueio por limite de uso |
| 12 | Código digitado não tem validação do dígito verificador EAN/GTIN; scanner aceita QR Code e outros formatos | Cadastros com código errado |
| 13 | Faixa "30 dias" em azul; "Vence hoje" separado | Divergente da semântica 🔴🟠🟡🟢 |

## 2. Avaliação de APIs de produtos (EAN/GTIN)

| Fonte | Custo / chave | Licença | Cobertura BR | Observações |
|-------|---------------|---------|--------------|-------------|
| **Open Food Facts** (+ Open Beauty Facts / Open Products Facts) | Grátis, sem chave | Dados ODbL (exige atribuição) | Boa para marcas grandes, irregular para regionais | Colaborativo, sem SLA. Limite documentado ~100 consultas de produto/min por IP; exige User-Agent identificado |
| Cosmos (Bluesoft) | Token, planos pagos | Proprietária | Muito boa | Fora da política de usar só open source; pode ser plugado no futuro se desejarem |
| GS1 Brasil (Verified by GS1) | Pago / associação | Proprietária | Oficial | Indicado para escala enterprise |
| UPCitemdb | Grátis limitado (~100/dia) | Proprietária | Fraca no BR | Não recomendado |

**Decisão:** Open Food Facts como **fonte auxiliar**, consultado **pelo servidor** (com cache e User-Agent), através de uma interface de "provedor" que permite trocar ou somar provedores no futuro. O **banco interno é sempre a fonte principal**: interno → externo → sugestão → usuário confirma/edita → salva no interno.

## 3. Arquitetura proposta

```
Celular / Computador (PWA React)  ──HTTPS──▶  API (Node.js + Fastify + TypeScript)  ──▶  PostgreSQL
                                                  │
                                                  └──▶ Open Food Facts (auxiliar, com cache)
```

- **Backend:** Node.js 22, Fastify, Zod (validação de toda entrada), Drizzle ORM + migrações SQL versionadas, PostgreSQL 16 (Docker em dev). Tudo open source.
- **Autenticação:** senha com **Argon2id**; sessão por token aleatório em cookie `HttpOnly` + `SameSite`, guardado com hash no banco (revogável); limite de tentativas de login; verificação de origem em requisições que alteram dados.
- **Autorização no servidor:** toda consulta filtra por `empresa` da sessão e pelas lojas permitidas ao usuário; permissões por papel verificadas em cada rota. O frontend só esconde botões — quem decide é o servidor.
- **Frontend:** mantém React/Tailwind/design atual; troca Dexie por chamadas à API com TanStack Query (atualiza o dashboard na hora após salvar).
- **Produção:** o próprio servidor entrega o frontend compilado → um único serviço + um banco.

## 4. Modelo de dados

```
empresas ─┬─< lojas ─────────────┐
          ├─< usuarios >─< usuario_lojas
          ├─< produtos (código de barras único por empresa)
          ├─< entradas (entrada de mercadoria — cabeçalho)
          ├─< lotes (produto + loja + nº lote + quantidade + validade + status)
          ├─< movimentacoes (histórico imutável: entrada, retirada, ajuste, arquivamento)
          ├─< notificacoes
          └─< auditoria
```

- **Produto ≠ Lote.** Validade, quantidade e número do lote pertencem ao **lote**. Um produto tem vários lotes, em várias lojas.
- **Lote:** `id, empresa, produto, loja, numero_lote, quantidade_inicial, quantidade_atual, data_validade, custo_unitario, observacoes, status (ativo/retirado/arquivado), entrada_id, origem (manual/ocr), criado_por, criado_em, retirado_em, retirado_por, motivo_retirada, arquivado_em`.
- **Movimentação:** cada retirada grava quem, quando, motivo, quantidade, lote, produto, loja, custo unitário e **valor da perda**. Retirada parcial é permitida (ex.: 5 de 20 unidades danificadas).
- **Nada é apagado:** "excluir" vira **arquivar** (soft delete, só Administrador).
- **Entrada de mercadoria:** tabela `entradas` já existe; cada lote pode apontar para uma entrada. A tela "Nova entrada" com vários itens fica para depois sem mudar o banco.

## 5. Permissões

| Ação | Administrador | Gerente | Funcionário |
|------|:---:|:---:|:---:|
| Escanear / consultar produtos e lotes | ✅ | ✅ | ✅ |
| Cadastrar lote (quantidade, validade) | ✅ | ✅ | ✅ |
| Marcar lote como retirado | ✅ | ✅ | ✅ |
| Cadastrar / editar produto | ✅ | ✅ | ⚙️ configurável* |
| Relatórios | ✅ todas as lojas | ✅ suas lojas | — |
| Gerenciar lojas e usuários | ✅ | — | — |
| Configurações da empresa | ✅ | — | — |
| Arquivar informações | ✅ | — | — |

\* Pelo requisito, funcionário não cadastra produto. Como isso pode travar a rotina ("produto não encontrado"), haverá uma configuração da empresa "Funcionários podem cadastrar produtos novos", **desligada por padrão**.

Gerente e Funcionário só enxergam as lojas às quais foram vinculados. Quem cria a conta vira **Administrador** da empresa; o "cargo" do cadastro continua existindo como informação descritiva.

## 6. Status de validade (cores + ícone + texto)

| Status | Regra | Cor | Ícone/Texto |
|--------|-------|-----|-------------|
| Vencido | < hoje | 🔴 vermelho | ⚠ "Venceu há X dias" |
| Até 7 dias | hoje … 7 dias | 🟠 laranja | ⏱ "Vence hoje/amanhã/em X dias" |
| Até 30 dias | 8 … 30 dias | 🟡 amarelo | 📅 "Vence em X dias" |
| Em dia | > 30 dias | 🟢 verde | ✓ "Em dia" |

Nunca só cor: sempre ícone e texto juntos.

## 7. Telas (mobile-first)

Barra inferior: **Início · Lotes · [Escanear] · Relatórios · Ajustes** (Relatórios oculto para Funcionário).

- **Início:** saudação; 4 cartões; "Produtos que precisam de atenção" (vencidos → menor validade → maior quantidade) com [Ver lote]; tabela "Próximos vencimentos"; em "Todas as lojas", tabela por loja (Vencidos / 7 dias / 30 dias); perda do mês (Admin/Gerente); sino de notificações.
- **Escanear:** câmera (EAN-13, EAN-8, UPC, Code128) ou digitar (com validação do dígito verificador) → produto encontrado (com lotes FEFO) → cadastrar lote. Não encontrado → "Produto não encontrado" + [+ Cadastrar produto] com código preenchido e sugestão do Open Food Facts → salva → segue direto para o lote.
- **Lotes:** busca (nome, código, nº do lote) e filtros (loja, categoria, status, período de validade); ordem FEFO; detalhe do lote com histórico; retirar com motivo e quantidade; arquivar (Admin).
- **Relatórios:** filtros por período e loja; perdas (quantidade, valor, por produto/categoria/loja/motivo); validade (vencidos, 7 e 30 dias); histórico de retiradas (quem, quando, motivo); exportar CSV.
- **Ajustes:** meu perfil; lojas (Admin); usuários e papéis (Admin); configurações da empresa (Admin); sair.

## 8. Notificações

Alertas gerados no servidor uma vez por dia por loja (ex.: "5 lotes vencem nos próximos 3 dias na Loja Campo Belo", "2 lotes estão vencidos"), guardados na tabela `notificacoes` e exibidos no sino. Envio passa por uma interface de **canal**: hoje "no app"; push, e-mail, WhatsApp e relatórios automáticos entram como novos canais sem mudar o resto.

## 9. Preparação para IA (Fase 4 — não implementada agora)

- **Assistente:** as perguntas ("maior risco de perda", "loja com mais vencidos", "categoria com mais perdas", "o que priorizar hoje") viram **consultas determinísticas no banco** em um módulo `insights` usado pelos relatórios. Um assistente futuro só poderá responder chamando essas consultas → respostas baseadas em dados reais, nunca inventadas.
- **OCR de lote/validade:** o lote já tem o campo `origem` (manual/ocr) e o formulário de lote aceita valores sugeridos que o usuário confirma antes de salvar. O leitor por foto entra depois, sem mudar o banco.

## 10. Fora do MVP (de propósito)

Push/e-mail/WhatsApp reais, tela completa de entrada de mercadoria com vários itens, recuperação de senha por e-mail, assistente de IA, OCR, publicação em produção. A estrutura fica pronta para todos.

## 11. Dados de exemplo

Os produtos de exemplo com códigos reais e nomes inventados **serão removidos** do app. Para testes haverá um script de desenvolvimento separado, que nunca roda em produção.

## 12. Ordem de execução e validação

1. **Fase 1 (core):** backend, banco e migrações, autenticação segura, empresa/lojas/usuários, produto, lote, scanner + validação EAN, produto não encontrado + Open Food Facts, cadastro de lote, dashboard, lotes, retirada com motivo, histórico.
2. **Fase 2 (operação):** permissões completas, multi-loja consolidado, filtros, notificações no app, FEFO, base de entrada de mercadoria.
3. **Fase 3 (gestão):** relatórios, perdas financeiras, indicadores por loja e categoria.
4. **Fase 4 (IA):** apenas a preparação descrita acima.

Ao fim de cada fase: compilação (TypeScript), lint, **testes automáticos do servidor** (permissões e isolamento entre empresas), teste do fluxo completo no navegador em tamanho de celular, e conferência do banco.
