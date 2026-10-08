# Na Validade

Controle de lotes e datas de validade para redes de supermercados: escanear o produto, cadastrar o lote (quantidade e validade), acompanhar os vencimentos (FEFO), receber alertas e registrar retiradas e perdas.

- **Frontend** (`src/`): React 19 + TypeScript + Vite + Tailwind CSS v4, TanStack Query, leitura de código de barras com ZXing. Mobile-first.
- **API** (`server/`): Node.js 22 + Fastify 5 + TypeScript, Drizzle ORM, PostgreSQL 16, Zod, Argon2id, sessão em cookie HttpOnly.
- **Código compartilhado** (`shared/`): cargos/permissões, motivos de retirada, status de validade e validações (CPF, CNPJ, e-mail, telefone, GTIN).

O plano de arquitetura e as decisões estão em [`docs/PLANO.md`](docs/PLANO.md).

## Publicar (grátis, para testes)

Passo a passo em [PUBLICAR.md](PUBLICAR.md) (GitHub + Neon + Render, com `render.yaml`).

## Rodando localmente

```bash
# 1. PostgreSQL 16
docker run -d --name navalidade-pg -p 5432:5432 \
  -e POSTGRES_USER=navalidade -e POSTGRES_PASSWORD=navalidade -e POSTGRES_DB=navalidade postgres:16
docker exec navalidade-pg createdb -U navalidade navalidade_test   # banco dos testes

# 2. API (porta 3333)
cd server
cp .env.example .env
npm install
npm run db:migrate
npm run dev

# 3. Frontend (porta 5173, com proxy de /api para a API)
cd ..
npm install
npm run dev
```

## Verificações

```bash
npm run build && npm run lint          # frontend: typecheck + build + lint
cd server && npm run typecheck && npm test   # API: typecheck + testes de permissões, isolamento, FEFO, retirada e histórico
```

## Perfis de acesso

| Perfil | Pode |
| --- | --- |
| Administrador | tudo: lojas, usuários, produtos, lotes, relatórios, configurações e arquivamento |
| Gerente | cadastrar produtos e lotes, marcar retiradas, ver relatórios das suas lojas |
| Funcionário | escanear, consultar, cadastrar lotes e marcar retiradas nas suas lojas (cadastrar produto só se o administrador liberar) |

As permissões são verificadas na API; a interface apenas esconde o que a pessoa não pode fazer.
