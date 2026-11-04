# Formato do plano da semana (para o Claude do chat de treino)

O app REC lê o plano de um arquivo JSON por semana no repositório `lucaverdade/REC-app`:

```
web/plan/AAAA-MM-DD.json      ← data da SEGUNDA-FEIRA da semana
```

Fazer commit na branch `main` publica sozinho (Cloudflare) em 1–2 minutos. O app só exibe; não edita.

## Como publicar
- **Um arquivo por semana**, nomeado pela segunda-feira (ex.: semana de 9 a 15/11 → `web/plan/2026-11-09.json`).
- **Mudou algo na semana?** Reescreva o arquivo inteiro da semana (não existe edição parcial).
- **Caminho A (com acesso de escrita ao repositório):** criar/atualizar o arquivo e fazer commit na `main` com a mensagem `Plano da semana AAAA-MM-DD`.
- **Caminho B (sem acesso de escrita):** entregar o JSON completo num bloco de código, com o nome do arquivo. O Luca cola em github.com/lucaverdade/REC-app → `web/plan/` → Add file → Create new file → Commit.
- Antes de entregar, conferir que é JSON válido (aspas duplas, sem vírgula sobrando, sem comentários).

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
- `zona`: usada também para o **Strain previsto** = minutos × peso médio da zona ("Z2" → 2/min; "Z1–Z2" → 1,5/min; sem zona → 2/min). Pesos: abaixo da Z1 = 0,5/min, Z1 = 1, Z2 = 2, Z3 = 3, Z4 = 4, Z5 = 5. Para sessões com blocos de intensidade diferente, informe `strain` somando os blocos (ex.: 15 min Z1 + 4×8 min Z4 + 12 min de recuperação Z1 + 10 min Z1 = 15 + 128 + 12 + 10 ≈ 165). Zonas de FC por modalidade, como configuradas no Garmin do Luca (bike tem zonas próprias).
- `strain`: opcional. **Desde 03/11 o app prefere o histórico**: Strain previsto = minutos × Strain por minuto típico do Luca em treinos parecidos (mesma modalidade e zona predominante, últimos 120 dias, 3+ treinos). O `strain` do plano só vale quando não há 3 treinos parecidos (ex.: bike em Z3 com as zonas novas). Continue informando em sessões com blocos de intensidade.
- Dias sem treino: omitir a data ou usar lista vazia.

## Como o app compara
Para cada sessão planejada, procura no mesmo dia uma atividade do Garmin da mesma modalidade:
- encontrou e durou ≥ 80% → **feito**; menos → **parcial**;
- não encontrou e o dia já passou → **não feito**; hoje ou futuro → **previsto**.
Atividades sem sessão correspondente aparecem como extras.


# Modo prova: `web/plan/prova.json`

Publicado pelo chat de treino quando quiser (o app mostra "ainda não publicado" enquanto não existir).

```json
{
  "carbo": [
    { "data": "2026-11-27", "gramas": 500, "nota": "texto curto opcional" },
    { "data": "2026-11-28", "gramas": 550 }
  ],
  "pace": {
    "natacao": "texto curto (ex.: ritmo/esforço por trecho)",
    "bike": "texto curto (ex.: faixa de FC ou potência)",
    "corrida": "texto curto (ex.: pace por bloco de km)",
    "nutricao": "texto curto (ex.: g/h de carbo, sódio, quando)"
  },
  "notas": "Uma frase opcional."
}
```
- Todos os campos são opcionais.
- O **checklist não vem daqui**: o Luca escreve os próprios itens no app (Modo prova), e eles ficam salvos no servidor.


## Resumo da semana (opcional)
Arquivo `web/plan/resumo-<segunda>.md` (ex.: `resumo-2026-11-02.md`), texto curto escrito pelo chat de treino. O app mostra junto com os números da semana: na aba Hoje no domingo a partir das 18 h e na segunda, e na aba Treino ao abrir a semana. Formato aceito: parágrafos, `**negrito**`, listas com `- ` e uma linha de título com `#`. Sem HTML.

## Sessões de calor (aclimatação)
Marque a sessão com `"calor": true` (ou título começando com "Calor", ex.: "Calor 1 (sem casaco)"). O app conta como sessão no calor quando ela é feita, e mostra no modo prova e em Tendências → Prova. Treinos na rua com ≥ 28 °C em Brasília também contam sozinhos.

## Fase
O campo `fase` da semana aparece na aba Hoje, logo abaixo da data.
