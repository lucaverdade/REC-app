# REC

App pessoal de recuperação e treino (PWA, iPhone, usuário único).

- `reference/rec_reference.py` — implementação de referência do REC v1.1. O app deve reproduzir estes números.
- Dados pessoais (CSV, export Garmin) **não** entram no repositório. Chaves ficam só em secrets da hospedagem.

Verificação: `python3 reference/rec_reference.py <daily_metrics.csv>` → REC de 2026-11-03 ≈ 51,86.

## Paridade TS × Python
`src/rec.ts` é o cálculo usado pelo app. Com os CSVs em `data/` (fora do git):

```
npm run ref    # gera data/reference_out.json pela referência Python
npm test       # compara todos os dias; tolerância 1e-9
```
