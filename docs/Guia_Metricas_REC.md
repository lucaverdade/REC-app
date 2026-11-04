# Guia das métricas do REC

Referência única de **o que cada número significa, como é calculado e como ler**, para conferir se o app está certo e se o Luca está melhorando. Atualizado em 03/11/2026. Código citado entre parênteses.

---

## 1. Princípio
Todo número do app compara o Luca **com ele mesmo**: cada sinal é medido contra a média recente dele (a "base"), não contra uma tabela da população. "Normal" = dentro da variação típica dele.

## 2. Sinais do corpo (manhã)
| Sinal | O que mede | Bom | Ruim | Base usada |
|---|---|---|---|---|
| **HRV** (ms) | Variação entre batimentos no sono; mais alta = sistema nervoso mais relaxado | acima da base | abaixo da base | média de ln(HRV) dos 120 dias anteriores (REC); faixa visual: ±1 desvio em 60 dias |
| **FC de repouso** (bpm) | Batimentos em repouso | igual ou abaixo da base | acima da base (≥ 2 bpm já conta) | mediana dos 120 dias anteriores; faixa visual: ±1 desvio em 60 dias (mín. 1 bpm) |
| **Sono** (h) | Horas dormidas na noite | ≥ necessidade | < necessidade | REC: 7,5 h fixas (spec v1.1). Cartão de sono: necessidade pessoal = média das últimas 90 noites sem os 10% extremos (~7 h 25) |
| **Respiração** (rpm) | Respirações por minuto no sono | igual ou abaixo da base | acima da base | média de 60 dias |
| **Estresse** (Garmin) | Estresse médio do dia anterior | abaixo da base | acima da base | média de 60 dias |

Sinais de alerta clássicos: HRV baixo **junto com** FC alta; respiração e FC acima do normal juntas (padrão de início de doença).

## 3. REC (0–100) — "estou recuperado hoje?"
(`src/rec.ts`, idêntico a `reference/rec_reference.py`)
- Cada sinal vira um **z** (quantos desvios acima/abaixo da base; positivo = melhor), limitado a ±3.
- Pesos: **HRV 2 · sono 1,5 · FC 1 · respiração 0,7 · estresse 0,5**.
- REC = 100 × Φ(média ponderada dos z). z = 0 → 50; +1 → ~84; −1 → ~16.
- Zonas por cor: vermelho 0–33, amarelo 34–66, verde 67–100. Sem HRV ou sem sono → traço.
- **Carga de treino não entra no REC** (nos dados do Luca, sono e rotina mexem mais no HRV que o treino da véspera).
- Modo sombra nas primeiras 6–8 semanas: os portões do plano (HRV ≥ 100, FC ≤ 41) continuam valendo.

## 4. Strain — "quanto o treino custou"
(`worker/index.ts`, STRAIN_SQL; `src/load.ts`)
- **Strain de um treino = Σ minutos em cada zona de FC × peso da zona**: abaixo da Z1 = 0,5; Z1 = 1; Z2 = 2; Z3 = 3; Z4 = 4; Z5 = 5. É o **TRIMP de Edwards** (1993).
- Cresce com duração e intensidade. Como usa a FC, o mesmo treino vale menos quando o condicionamento melhora.
- Zonas por modalidade conforme o Garmin (bike tem zonas próprias desde 03/11, %HRR com FC máx. da bike ~185).
- Por que não a carga do Garmin (EPOC): não crescia com a duração (2 h 50 de bike = 127 vs Hyrox 41 min = 242). Teste com 277 treinos com RPE: **TRIMP 0,82** de correlação com o esforço percebido (RPE × minutos) vs **EPOC 0,52**.
- Limite: qualquer carga por FC subestima intervalos curtos acima do limiar (Hyrox).
- Rótulos do dia (vs o dia médio = Fitness): < 0,5× leve · até 1,25× moderado · até 2× pesado · acima muito pesado.

## 5. Fitness, Fadiga e Forma — "estou evoluindo?"
(`src/load.ts`; modelo de Banister, como TrainingPeaks/Strava)
- **Fitness** = média exponencial do Strain diário com constante de **42 dias**. Mede quanto treino o corpo está acostumado a fazer; anda 1/42 (~2,4%) por dia na direção do Strain do dia. Ler em semanas, não por dia.
- **Fadiga** = mesma conta com **7 dias**. Sobe e desce rápido.
- **Forma** = (Fitness − Fadiga de ontem) ÷ Fitness, em %. É como o Luca acorda, antes do treino do dia.

| Forma | Nome no app | Leitura |
|---|---|---|
| < −30% | Muito cansado | carga muito acima do costume |
| −30% a −10% | Em bloco de treino | fadiga acima do fitness; normal em bloco |
| −10% a +5% | Equilibrado | treinando no ritmo de costume |
| +5% a +20% | Descansado | cansaço saindo; alvo de polimento |
| > +20% | Perdendo forma | carga baixa há tempo |

Faixas de Joe Friel, adaptadas em % pelo intervals.icu. **Ganho real**: o Fitness sobe na carga, mas o corpo só "entrega" quando a Fadiga cai (supercompensação). O modelo não sabe se o corpo absorveu o treino; quem diz isso são os sinais do item 2.

## 6. Strain semanal e faixa — "a carga está subindo no ritmo certo?"
(`strainWeeksPayload`)
- Faixa da semana = **0,8 a 1,3 × média de Strain das 3 semanas anteriores** (Strava usa média de 3 semanas; 0,8–1,3 é a faixa de referência da razão aguda/crônica, Gabbett).
- Abaixo = semana leve (recuperação/polimento) · Dentro = progressão gradual · Acima (até 1,5×) = cresceu rápido · Bem acima (> 1,5×) = salto grande.
- Aviso na aba Hoje: Strain de 7 dias fora de 0,8–1,4 da média semanal de 4 semanas; corrida da semana +15% sobre a média de 4 semanas.

## 7. Sono — base, dívida e meta (revisado 04/11)
(`src/sleep.ts`)
- **Base pela resposta do HRV** (não pelo hábito; antes era a média de 90 noites = 7 h 25): HRV de cada noite contra a base de 60 dias; platô = HRV médio das noites ≥ 7 h 30; base = menor duração t (6 h 30–8 h 30) cujo HRV médio entre t ± 30 min fica a até 1,5 ponto do platô. Últimas 180 noites, refeita no 1º dia de cada mês, limitada a 7 h–8 h 30. Nov/2026: **7 h 45** (abaixo de 7 h o HRV fica ~+1,6% da base; com 7 h ou mais, ~+8,4%).
- Análise de 04/11 (347 noites): abaixo de 7 h o HRV cai; de 7 h a 8 h 30 o ganho é ~1%/h; em semanas de carga alta o HRV rende mais com 8–8,5 h (+8%) do que com 7–7,5 h.
- **Dívida**: 14 dias contra a base, noites recentes pesam mais (meia-vida 7 dias); cochilos contam. Faixas Oura: baixa < 2 h, moderada 2–5 h, alta > 5 h.
- **Meta da noite (muda todo dia)**: base + 30 min se a Forma está em bloco de treino ou muito cansado + até 30 min pela dívida + até 30 min pelo treino do dia − cochilo; acréscimos no máximo +1 h.
- **Deitar até** e **regularidade**: ver 8d.

## 8. "Meu corpo está recuperando?" — a resposta
(`src/verdict.ts`)
- Mesmos z e pesos do REC, média ponderada dos **últimos 7 dias** (meia-vida 3 dias).

| Nota | Resposta |
|---|---|
| ≥ +0,30 | Sim, está recuperando bem |
| −0,20 a +0,30 | Sim, dentro do seu normal |
| −0,50 a −0,20 | Um pouco abaixo do normal |
| −0,90 a −0,50 | Abaixo do normal |
| < −0,90 | Não está recuperando |

- Tendência: últimos 3 dias × 4 anteriores (±0,30 = melhorando/piorando).
- Motivos: até 2 sinais que mais puxaram para baixo (peso × z ≤ −0,4) e o que mais ajudou, com os números.
- Carga × recuperação:

| Forma | Recuperação ok | Recuperação caindo/baixa |
|---|---|---|
| Muito cansado | segurando a carga por enquanto | carga acima do que absorve |
| Em bloco de treino | bloco sendo absorvido | no limite / acima do que absorve |
| Equilibrado | corpo acompanhando | queda vem de fora do treino |
| Descansado / perdendo forma | recuperado | queda vem de fora do treino |

- Respiração + FC acima do normal 2 dias seguidos → "padrão de início de doença", acima de qualquer leitura de carga.
- Recalcula a cada noite nova.

## 8b. Resumo do dia e meta de Strain
(`src/daily.ts`)
- Frase entre os anéis: cruza a cor do REC (verde/amarelo/vermelho) com a Forma (descansado ou equilibrado / em bloco de treino / muito cansado). Ex.: amarelo + bloco = "Treino moderado; o forte fica para quando o REC subir".
- Direção do REC: dias seguidos subindo ou caindo (diferença mínima de 2 pontos).
- **Meta de Strain do dia v2** (`src/target.ts`, 03/11): olha dia, semana e tendência.
  - Base = Fitness de ontem (seu Strain médio diário, 42 dias).
  - × REC de hoje (verde 1,4 · amarelo 1,0 · vermelho 0,5) × recuperação dos últimos 7 dias (bem 1,1 · normal 1,0 · um pouco abaixo 0,9 · abaixo 0,8 · não recuperando 0,65).
  - × carga recente: muito cansado 0,75 / descansado 1,15; Fadiga +15% em 3 dias 0,9; razão aguda/crônica > 1,3 → 0,85, < 0,8 → 1,1; ontem ≥ 1,8 × Fitness → 0,85.
  - Limite da semana: teto = 1,3 × média das 3 semanas anteriores; o que sobra (teto − feito de seg. até ontem) ÷ dias restantes × 1,8 limita a meta (mínimo 0,3 × Fitness).
  - O plano do treinador não muda a meta; o app só mostra se a sessão planejada está acima, dentro ou abaixo.
  - Backtest 120 dias (03/11): passar da meta não derrubou o REC do dia seguinte (+2,3 vs −4,6 pontos), coerente com o estudo: carga da véspera mexe pouco no REC. A meta é guia de carga, não previsão do REC.

## 8c. Strain previsto e Forma até a prova
- Strain previsto de uma sessão planejada = minutos × mediana do seu Strain por minuto em treinos da mesma modalidade e mesma zona predominante (onde ficou mais tempo; abaixo da Z1 conta como Z1) nos últimos 120 dias, com 3+ treinos. Sem isso: o `strain` do plano; sem ele, minutos × peso da zona. Ex. 03/11: bike leve 60 min "Z1" → 38 (plano dizia 60; feito 31).
- Forma até a prova: o mesmo modelo de Fitness (42 dias) e Fadiga (7 dias) continua dia a dia com o Strain previsto do plano publicado (dia sem sessão = descanso), até onde há plano. Alvo no dia da prova: Descansado (+5% a +20%).

## 8d. Leituras novas (03/11)
- **Tendência do HRV** (`src/hrvtrend.ts`, HRV4Training): média de 7 noites do ln(HRV) × faixa normal (média dos 60 dias anteriores ± 0,5 DP); CV de 7 dias × CV típico (mediana de 60 dias). Acima → adaptando bem; dentro → estável; abaixo + CV subindo (> 1,25× o típico ou 7 dias antes) → risco de má adaptação; abaixo sem CV subindo → fadiga acumulada.
- **Alerta de doença** (`src/illness.ts`): dia suspeito = 2+ sinais com z ≤ −1 entre respiração, FC de repouso, HRV e estresse, incluindo respiração ou FC. Alerta com 2 dias seguidos suspeitos, ou 1 dia + "Doente" marcado no diário.
- **Intensidade 80/20**: leve = abaixo da Z1 + Z1 + Z2; média = Z3; alta = Z4 + Z5 (academia fora).
- **Diário de hábitos e impacto** (`src/habits.ts`): REC da manhã seguinte com × sem cada marcação, desde o primeiro uso; precisa de 5 dias de cada lado. Horário irregular = deitar ou acordar > 60 min da mediana das 14 noites anteriores.
- **Deitar até** (`src/sleep.ts`): acordar típico (mediana, mesmo tipo de dia) − meta da noite − tempo acordado na cama (mediana) − 15 min. **Regularidade** = 100 − 1,2 × média dos desvios de deitar e acordar (min).

## 8f. Leituras inspiradas em Garmin, Oura, Whoop e Strava (04/11) — `src/insights.ts`
- **Status de treino** (Garmin Training Status): Sobrecarga se razão aguda/crônica > 1,5 ou (Forma < −30% e HRV em fadiga/risco); Pico se Forma ≥ +5% e Fitness em 4 semanas ≥ −5%; Carga sem resposta se Fitness 4 sem ≥ +5% e HRV em fadiga/risco; Produtivo se Fitness 4 sem ≥ +5%; Recuperando se razão < 0,8; Perdendo forma se Fitness 4 sem ≤ −5%; senão Mantendo.
- **Foco da carga** (Garmin Load Focus): Strain de 4 semanas dividido em aeróbico leve (abaixo da Z1 × 0,5 + Z1 + Z2 × 2), aeróbico forte (Z3 × 3 + Z4 × 4) e anaeróbico (Z5 × 5). Referência: 55–75%, 20–40%, 3–12%.
- **Estresse acumulado** (Oura Cumulative Stress): 31 dias. Média dos z do REC (HRV 2, sono 1,5, estresse 1,5, FC 1; só o lado ruim) + aumento de noites irregulares contra os 90 dias anteriores (0,5) + dias com Fadiga acima do Fitness (0,5). < 0,15 baixo, < 0,4 moderado, senão alto.
- **Destaques do treino** (Strava): maior Strain da modalidade em 6 semanas; mais longo desde…; FC média ≥ 5 bpm diferente dos treinos do mesmo tipo (rua × indoor) e duração parecida (±25%) em 90 dias. Sem comparar ritmo (vento, subida, calor).
- **Aviso da véspera** (Whoop): a partir das 17 h, sessões de amanhã (plano) e a meta de sono/horário de deitar.
- **Idade fitness e VO2máx**: valores da Garmin (`/fitnessage-service/fitnessage/v2/{data}`, mensal; `vO2MaxValue` das atividades).

## 9. Previsões de prova (corrida)
(`src/predict.ts`)
- Regras do Strava: só corridas ao ar livre, janela de 24 semanas, mínimo 10 corridas, recentes pesam mais, percurso plano.
- Motor: VO2máx de cada corrida pelo pace e pela % da FC de reserva (Daniels/Swain), média ponderada da metade melhor (meia-vida 6 semanas), tempo pela curva de Daniels. Calibração opcional com os números do Strava.

## 10. Como conferir se está certo
- **REC**: `npm test` compara o TS com o Python em todos os dias (tolerância 1e-9).
- **Strain**: correlação com RPE × minutos (refazer a cada temporada; esperado ≥ 0,75).
- **Forma**: antes de provas boas, a Forma deveria estar em "Descansado"; antes de provas ruins, abaixo de −10%.
- **Resposta de recuperação**: com 40–60 notas "como me sinto", comparar o nível da resposta com a nota média da semana; ajustar limites se discordarem.
- **Previsões**: comparar com o tempo real de cada prova.

## 11. Fontes
TrainingPeaks (glossário de métricas; TSS × hrTSS) · Strava (Fitness & Freshness; Relative Effort; Performance Predictions) · Garmin (Acute Load) · Whoop (Strain; Sleep need) · Oura (Sleep debt; design) · intervals.icu (Form %, HRSS) · Edwards (1993, TRIMP por zonas) · Banister (modelo impulso-resposta) · Gabbett (razão aguda/crônica) · Daniels & Gilbert (VO2 e tempo de prova).
