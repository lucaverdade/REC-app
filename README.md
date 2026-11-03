# REC

App pessoal de recuperação e treino (PWA, iPhone, usuário único).
Cloudflare Worker (API + rotina da manhã) + D1 (SQLite) + app web em `web/`, tudo num deploy só.

## Estrutura
- `src/rec.ts` — cálculo do REC v1.1 (porte fiel da referência Python).
- `src/today.ts` — contribuintes, comentário por regras e avisos da aba Hoje.
- `worker/` — API (`/api/today`, `/api/feel`, `/api/refresh`), rotina agendada (07:30 e 09:00 de Brasília), esquema do banco, integração Garmin (pendente).
- `web/` — PWA: aba Hoje.
- `reference/rec_reference.py` — implementação de referência.
- `scripts/seed.ts` — gera `data/seed.sql` a partir do export Garmin.

Dados pessoais (CSV, seed, saídas) ficam em `data/`, **fora do git**. Chaves ficam só em secrets do Cloudflare.

## Paridade TS × Python
Com os CSVs em `data/`:
```
npm run ref    # saída da referência Python
npm test       # compara todos os dias; tolerância 1e-9
```

## Rodar local
```
npm install
echo "APP_TOKEN=um-codigo-local" > .dev.vars
npm run seed && npm run db:schema:local && npm run db:seed:local
npm run dev    # http://localhost:8787
```

## Publicar (Cloudflare, plano gratuito)
1. `npx wrangler login`
2. `npx wrangler d1 create rec` → copie o `database_id` para `wrangler.jsonc`.
3. `npm run db:schema:remote && npm run db:seed:remote`
4. `npx wrangler secret put APP_TOKEN` (código de acesso do app) e, quando a integração estiver pronta, `npx wrangler secret put GARMIN_API_KEY`.
5. `npm run deploy` → abra a URL no Safari do iPhone → Compartilhar → Adicionar à Tela de Início.
