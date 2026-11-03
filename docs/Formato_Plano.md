# Formato do plano da semana (para o Claude do chat de treino)

O app REC lê o plano de um arquivo JSON por semana no repositório `lucaverdade/REC-app`:

```
web/plan/AAAA-MM-DD.json      ← data da SEGUNDA-FEIRA da semana
```

Fazer commit na branch `main` publica sozinho (Cloudflare). O app só exibe; não edita.

## Estrutura
```json
{
  "semana": "2026-11-02",
  "fase": "Polimento, semana 2 de 3",
  "notas": "Uma frase curta sobre o foco da semana.",
  "dias": {
    "2026-11-03": [
      { "modalidade": "bike", "titulo": "Rolo regenerativo", "minutos": 60, "zona": "Z1–Z2", "detalhe": "cadência 90+" }
    ],
    "2026-11-04": [
      { "modalidade": "corrida", "titulo": "Limiar 3×8 min", "minutos": 50, "zona": "Z4", "detalhe": "rec 2 min trote", "chave": true },
      { "modalidade": "natacao", "titulo": "Técnica", "minutos": 40 }
    ]
  }
}
```

- `modalidade`: `bike`, `corrida`, `natacao`, `hyrox`, `academia` (aceita variações como "ciclismo", "natação", "força").
- `minutos`: usado para marcar o treino como **feito** (≥ 80% do tempo planejado) ou **parcial**.
- `chave`: opcional; destaca a sessão principal do dia.
- Dias sem treino: omitir a data ou usar lista vazia.

## Como o app compara
Para cada sessão planejada, procura no mesmo dia uma atividade do Garmin da mesma modalidade:
- encontrou e durou ≥ 80% → **feito**; menos → **parcial**;
- não encontrou e o dia já passou → **não feito**; hoje ou futuro → **previsto**.
Atividades sem sessão correspondente aparecem como extras.
