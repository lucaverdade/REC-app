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

## Publicar (Cloudflare, plano gratuito, sem linha de comando)
1. Banco D1 `rec` criado no painel (o ID já está em `wrangler.jsonc`).
2. Workers & Pages → Create → Import a repository → `REC-app` → Deploy. Todo push na `main` publica sozinho.
3. Worker `rec` → Settings → Variables and Secrets: secrets `APP_TOKEN` (código de acesso do app) e `GARMIN_API_KEY`.
4. Abrir a URL no Safari do iPhone → Compartilhar → Adicionar à Tela de Início.
5. No app: rodapé → Garmin → **Puxar histórico** (uma vez) e **Testar conexão**.

As tabelas são criadas sozinhas no primeiro acesso. O seed por CSV (`npm run seed`) continua disponível só para testes locais.

## Garmin
- Endpoints conforme o cliente oficial `garmin/connect-personal-api-python`.
- `worker/garmin.ts`: troca chave → token (24 h, cache em memória), HRV, estresse e resumo diário por faixa de datas, sono por dia, atividades.
- Teste local sem chave real: `npm run mock:garmin` e, no `.dev.vars`, `GARMIN_API_KEY=qualquer` + `GARMIN_BASE_URL=http://127.0.0.1:9999`.
