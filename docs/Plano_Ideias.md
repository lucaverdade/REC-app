# REC — plano de ação das ideias aprovadas (03/11/2026)

Aprovadas pelo Luca: todas do `Estudo_Ideias_Apps.md` **menos D1 (recordes) e D2 (ritmo de natação)**; F4 (clima) entrou depois. Nutrição (N) fica para depois. Strava (B7) fora do app.

## Fase 1 — FEITA em 03/11 (E1, E2, C1, C2, F4)

| F4 | **Clima de Aracaju** | Modo prova | Open-Meteo, sem chave: até 15 dias antes mostra o que costuma fazer (29/11 ± 7 dias, 10 anos, 5–13 h); depois, previsão hora a hora (temperatura, sensação, umidade, vento, chance de chuva), cache de 3 h. |

## Fase 1 — detalhes (o diário precisa de dias de dados)
| # | Ideia | Onde aparece | Como |
|---|---|---|---|
| 1 | **E1 · Diário de hábitos** | Hoje, abaixo de "Como me sinto" | Marcações em um toque: álcool, cafeína depois das 16 h, jantar tarde, tela tarde, calor, viagem, doente, estresse alto. Salvo por dia no servidor (tabela nova). Marca à noite; vale para o REC da manhã seguinte. |
| 2 | **E2 · Impacto no REC** | Tendências, bloco novo "O que mexe no meu REC" | Para cada marcação: REC médio do dia seguinte com × sem. Só mostra com ≥ 5 dias marcados e ≥ 5 sem; diferença em pontos + quantos dias. Sem frase de conselho. |
| 3 | **C1 · Horário para dormir** | Cartão Sono | Meta de hoje à noite + horário típico de acordar (mediana de 14 noites, dia útil × fim de semana) → "deitar até 22:30". Inclui ~15 min para pegar no sono (latência média dos seus dados quando houver). |
| 4 | **C2 · Regularidade do sono** | Cartão Sono + Tendências | Nota 0–100 de consistência (variação de horário de deitar e acordar em 14 noites) e REC médio após noites regulares × irregulares. |

## Fase 2 — FEITA em 03/11 (A2, A6, B5, A1, G1)
Alerta de doença no histórico (backtest 368 dias): 15 dias de alerta em ~6 episódios (dez/25, 11–15/jan, 9–11/fev, 1/mar, jun, 9–11/jul).

## Fase 2 — detalhes
| # | Ideia | Onde aparece | Como |
|---|---|---|---|
| 5 | **A2 · Tendência do HRV (HRV4Training)** | Tendências → "Meu corpo está recuperando?" e chip no Hoje | ln(HRV) média de 7 dias × faixa normal de 60 dias (±0,5 DP) e CV de 7 dias. Classes: adaptando bem (média dentro/acima, CV estável ou caindo), estável, fadiga acumulada (média abaixo + CV caindo), risco de má adaptação (média abaixo + CV subindo). |
| 6 | **A6 · Alerta de doença** | Aviso no topo do Hoje | Pontuação: respiração z ≤ −1, FC repouso z ≤ −1, HRV z ≤ −1, estresse alto, 2 dias seguidos; marcação "doente" do diário reforça. Substitui o padrão atual (respiração + FC). |
| 7 | **B5 · Distribuição de intensidade** | Tendências → "Como treinei?" e Treino (semana) | % do tempo em baixa (abaixo da Z1 + Z1 + Z2), média (Z3) e alta (Z4–Z5) por semana, contra 80/20. |
| 8 | **A1 · Relatório da manhã** | Hoje, primeira abertura do dia até 12 h | Cartão único: REC + direção, noite e dívida, Forma, treino planejado com Strain previsto, a frase do dia e alertas. Toca para fechar; volta no dia seguinte. |
| 9 | **G1 · Resumo da semana** | Hoje (domingo à noite e segunda) e Treino | Números da semana (horas, Strain × faixa, REC médio, HRV × base, sono médio, distribuição 80/20) + texto do chat de treino se existir `web/plan/resumo-<segunda>.md`. |

## Fase 3 — dados segundo a segundo (FIT / detalhes da atividade)
| # | Ideia | Como |
|---|---|---|
| 10 | **Teste da API** | Rota de diagnóstico que tenta os caminhos de detalhe de atividade da Garmin Personal API (detalhes com séries de FC/ritmo/velocidade, voltas/splits, download do FIT) e devolve só o código de resposta e os nomes dos campos — nada de chave nem dados pessoais. O Luca abre a tela Garmin → "Testar detalhes". |
| 11 | **B2 · Desacoplamento aeróbico** | Treinos ≥ 60 min de bike/corrida com ≥ 70% do tempo até a Z2: (ritmo ou velocidade ÷ FC) da 1ª metade × 2ª metade, sem os 10 primeiros min. < 5% = base aeróbica boa. No cartão do treino e em Tendências (evolução). |
| 12 | **B3 · Eficiência** | Velocidade ÷ FC só em sessões comparáveis: rolo indoor Z2 (bike) e corridas planas Z2. Linha de tendência em Tendências. |

Plano B da fase 3: se a API não entregar séries nem voltas, B2/B3 ficam com o que vier por volta (lap); se nem isso, ficam fora até haver exportação.

## Ordem e tempo
- Fase 1 primeiro (o diário precisa começar cedo para o E2 ter dados antes da prova).
- Fase 2 em seguida; A1 e G1 por último dentro dela (juntam o que as outras criam).
- Fase 3 começa pelo teste da API; o resto depende do que vier.
- Até 29/11 nada muda o cálculo do REC; tudo é leitura em volta dele.
