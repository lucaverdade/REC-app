# REC — estudo de outros apps e banco de ideias

03/11/2026. Para o Luca ler e marcar o que vale. Cada ideia tem um **código** (ex.: A3) para responder rápido ("A3 sim, B2 não, C1 depois").

Legenda de esforço: **P** = pequeno (horas) · **M** = médio (1–2 dias) · **G** = grande (vários dias ou depende de terceiros).
"Dados" diz se já temos o necessário (✓) ou se depende de algo novo.

---

## 1. O que os grandes apps fazem (resumo)

| App | O que tem de mais forte | Já temos algo parecido? |
|---|---|---|
| **Whoop** | Recovery, Strain, Sleep Need; **Journal** (marcar álcool, cafeína, viagem, suplementos) com **Behavior Trends** (quanto cada hábito muda o Recovery); check-ins proativos ("priorize o sono antes do evento"); Strength Trainer; Healthspan/idade fisiológica | REC, Strain, sono com dívida. **Sem diário de hábitos** |
| **Oura** | Readiness com contribuintes; **Resilience** (capacidade de aguentar estresse, semanas); estresse diurno; **tags**; idade cardiovascular; Cardio Capacity (VO2); dívida de sono | REC com contribuintes, dívida de sono. Sem resiliência, sem tags |
| **Garmin** | **Training Readiness** (sono, tempo de recuperação, HRV status, carga aguda, histórico de sono e estresse de 3 dias), **Morning Report**, HRV Status, Body Battery, Endurance Score, Hill Score, aclimatação ao calor/altitude, Race Widget | REC e resposta de recuperação. Sem relatório matinal único, sem Body Battery, sem aclimatação |
| **TrainingPeaks** | TSS, Fitness/Fadiga/Forma, **compliance por cor** (planejado × feito), plano anual com fases e meta de Fitness no dia da prova, picos de desempenho | Strain previsto × feito, Forma. Sem meta de Fitness para a prova |
| **intervals.icu** *(conhecimento geral)* | Form %, **desacoplamento aeróbico** (FC sobe para o mesmo ritmo ao longo do treino), **eficiência** (ritmo ÷ FC), índice de polarização, wellness diário, planejado × feito | Forma em %. Sem desacoplamento e eficiência por treino |
| **Strava** | Relative Effort semanal com faixa, Fitness & Freshness, Performance Predictions, melhores esforços, segmentos | Strain semanal com faixa, previsões |
| **HRV4Training** | **Faixa normal** do HRV (base 7 dias × normal 60 dias), **coeficiente de variação (CV)** do HRV, tendência automática: *adaptando bem / estável / risco de má adaptação / fadiga acumulada* | Faixa normal nos cartões. **Sem CV e sem essa classificação** |
| **Athlytic / Bevel** (Apple Watch) | Recovery, Exertion ao longo do dia com **meta de esforço do dia** guiada pela recuperação, journal com correlações, sono com alarme inteligente | Sem meta de Strain do dia |
| **Polar** | Nightly Recharge (ANS charge: HRV + FC + respiração na 1ª parte do sono), Running Program | REC cobre |
| **COROS** | EvoLab: carga, base fitness, limiar estimado, preditor de prova, "nível de maratona" | Previsões cobrem |

---

## 2. Banco de ideias

### A. Recuperação e prontidão
- **A0 · Ideias do Luca (03/11)**:
  - **A0a · Anel do REC segmentado** em 5 faixas de cor, como o da Forma. *P*.
  - **A0b · Resumo do dia entre os dois anéis** no lugar de "média da semana": uma frase que cruza REC e Forma (ex.: "Dia para treinar forte", "Foco em recuperação hoje") e a direção do REC (subindo/caindo). *P*.
  - **A0c · Anel de Strain com meta do dia** (como o app que o Luca usa): o anel enche com o Strain feito e um tracinho marca até onde dá para ir hoje, calculado pelo REC e pela Forma. Mostra quanto já fez e quanto ainda cabe. *M*. Ligado a A3.
- **A1 · Relatório da manhã** (Garmin Morning Report, Whoop). Ao abrir de manhã, um cartão único: REC, noite, Forma, treino planejado do dia e uma frase. *P · Dados ✓*. **Minha opinião: alta prioridade**, junta o que já existe num lugar só.
- **A2 · Tendência do HRV estilo HRV4Training**: base de 7 dias contra o normal de 60 dias + **CV** (quanto o HRV oscila) → classificar em *adaptando bem / estável / risco de má adaptação / fadiga acumulada*. *M · Dados ✓*. **Opinião: alta**, é a leitura mais validada de HRV para atleta e complementa a resposta de recuperação.
- **A3 · Meta de Strain do dia** (Whoop Strain Target, Athlytic Target Exertion): faixa de Strain sugerida conforme REC e Forma. *M · Dados ✓*. **Opinião: média**; precisa ficar em modo sombra (o plano manda).
- **A4 · Resiliência** (Oura): quanto o corpo aguenta estresse, olhando semanas (REC e sono médios × carga). *M · Dados ✓*. Opinião: média; parecido com a resposta de recuperação, mas em horizonte maior.
- **A5 · Body Battery** (Garmin): mostrar o valor da manhã e a curva do dia. *P · Dados: API entrega (não usamos ainda)*. Opinião: baixa; redundante com REC.
- **A6 · Alerta de doença mais completo**: respiração + FC + temperatura (se a API tiver) + queda de HRV. *P · Dados ✓ (sem temperatura)*. Opinião: média.

### B. Carga e treino
- **B1 · Compliance por cor** (TrainingPeaks): cada sessão do plano pintada verde (80–120% do Strain previsto), amarelo, laranja ou vermelho. *P · Dados ✓*. **Opinião: alta**, a aba Treino fica legível de longe.
- **B2 · Desacoplamento aeróbico por treino** (intervals.icu, TrainingPeaks): em treinos longos de Z2, quanto a FC subiu da 1ª para a 2ª metade no mesmo ritmo. < 5% = base aeróbica boa. *M · Dados: precisa da FC e do ritmo segundo a segundo (arquivo FIT da API)*. **Opinião: alta para o 70.3**, é o melhor indicador de base aeróbica e não sofre com o problema de comparar percursos.
- **B3 · Eficiência por treino** (ritmo ou velocidade ÷ FC) só em sessões comparáveis (ex.: rolo indoor Z2, pista). *M · Dados: FIT*. Opinião: média; resolve parte do problema dos indicadores de forma porque compara só sessões iguais.
- **B4 · Meta de Fitness para a prova** (TrainingPeaks ATP): mostrar onde o Fitness e a Forma devem estar em 29/11 e a curva prevista com o plano publicado. *M · Dados ✓ (plano + Strain previsto)*. **Opinião: alta até a prova**.
- **B5 · Distribuição de intensidade / polarização** por semana (80/20). *P · Dados ✓ (tempo em zonas)*. Opinião: média.
- **B6 · Tempo de recuperação após o treino** (Garmin): estimativa de horas até o próximo treino forte. *M · Dados ✓*. Opinião: baixa.
- **B7 · Strava no app**: nome e descrição do treino. *M · depende de você criar a API do Strava*. Já no ToDo.
- **B8 · Recalcular zonas por esporte no histórico** (FIT). *G*. Já no ToDo.

### C. Sono
- **C1 · Horário-alvo para dormir**: a partir da meta de sono e do horário em que você costuma acordar (ex.: "para 7 h 56, deitar até 22:04"). *P · Dados ✓*. **Opinião: alta**, transforma a meta em algo acionável.
- **C2 · Consistência do sono** (Oura/Whoop): nota de regularidade e efeito no REC dos dias com horário irregular. *P · Dados ✓*. Opinião: média.
- **C3 · Fases do sono** (profundo, REM, leve, acordado). *P · Dados: API entrega*. Opinião: baixa; dado de relógio de pulso é pouco preciso por fase.
- **C4 · Alarme inteligente**: não dá em app web. Fora.

### D. Desempenho e evolução
- **D1 · Recordes e melhores esforços** (Strava, Whoop): 5 km, 10 km, maior pedal, maior Strain, com data. *P · Dados ✓ (corrida; bike por distância)*. Opinião: média.
- **D2 · Ritmo de natação por 100 m** em séries iguais (CSS estimado). *M · Dados: FIT/voltas*. Opinião: média.
- **D3 · Previsão de tempo do 70.3** (natação + bike + corrida + transições) a partir de ritmos recentes. *M*. Opinião: média; muita incerteza na bike outdoor.
- **D4 · Idade fisiológica / VO2máx estimado** (Oura, Whoop). *P · Dados ✓ (já calculamos VO2 por corrida)*. Opinião: baixa.

### E. Hábitos (diário)
- **E1 · Diário de marcações** (Whoop Journal, Oura tags): marcar à noite em dois toques: álcool, cafeína tarde, jantar tarde, viagem, calor, doença, tela tarde. *M · Dados novos (você marca)*. **Opinião: alta**; é o que mais ensina sobre você.
- **E2 · Impacto de cada hábito no REC** (Whoop Behavior Trends): depois de ~2 semanas de marcações, "álcool tira em média 12 pontos do seu REC". *M · depende de E1*. **Opinião: alta**, junto com E1.
- **E3 · Nota "como me sinto" correlacionada**: mostrar se a sua nota bate com o REC. *P · Dados ✓*. Opinião: média; ajuda a calibrar o REC.

### F. Prova
- **F1 · Contagem com fase do plano** no topo (base, específico, polimento). *P · Dados ✓ (plano)*. Opinião: média.
- **F2 · Simulado × prova**: comparar o simulado de 07/11 com o plano de prova (ritmos, FC, carbo/h). *M*. Opinião: média.
- **F3 · Aclimatação ao calor** (Garmin): sessões de calor da semana e marcador simples. *P*. Já no backlog original (item 14).
- **F4 · Clima de Aracaju** no modo prova (previsão para o dia). *P · depende de API de clima gratuita*. Opinião: média.


### N. Nutrição
**Situação**: o backlog original definiu a aba Nutrição só para **nutrição dos treinos** (pré, durante, g/h, registro em dois toques) e deixou contagem de calorias **fora do app**. O Luca agora quer avaliar trazer calorias. Abaixo, opções nos dois níveis.

**Nutrição do treino (o que estava previsto)**
- **N1 · Carbo planejado por sessão**: o chat de treino já escreve a nutrição no `detalhe`; passar a mandar campos próprios no plano (`carbo_g_h`, `carbo_total_g`, `pre`, `sodio_mg_h`). O app mostra no cartão do treino e na aba Nutrição. *P · Dados: plano*. **Opinião: alta**, custo baixo e é o que mais importa para o 70.3.
- **N2 · Registro em dois toques depois do treino**: carbo que realmente tomou (g) + barriga (ok / pesada / ruim). *P*. **Opinião: alta**; com N1 vira "planejado × feito" da nutrição.
- **N3 · Progressão do carbo na bike**: gráfico de g/h nos longões até a prova (treinar o intestino). *P · depende de N2*. Opinião: alta até a prova.
- **N4 · Taxa de suor**: peso antes e depois do treino + líquido bebido → litros/hora por modalidade e calor. *P · Dados: o Garmin tem peso se você pesar na balança conectada; senão digitado*. Opinião: média; útil para o plano de hidratação da prova.
- **N5 · Carga de carbo da semana da prova**: já vem no `prova.json`; mostrar na aba Nutrição com check por dia. *P*. Opinião: alta (curto prazo).

**Gasto e ingestão (calorias)**
- **N6 · Gasto calórico do Garmin**: calorias ativas, em repouso (metabolismo basal) e totais por dia e por semana. A API entrega no resumo diário (`data.calories`). *P · Dados: API ✓*. **Opinião: alta**, custo baixo, dá a noção que você pediu.
- **N7 · Calorias por treino**: gasto de cada sessão no cartão do treino. *P · Dados: atividades (campo de calorias, a confirmar)*. Opinião: média.
- **N8 · Registro do que comeu (ingestão)**, três caminhos:
  - **Foto com IA**: tira foto, a IA estima alimentos e gramas. É o mais prático, mas **precisa de IA paga** (visão computacional por API) e a precisão de porção ainda é limitada. Os próprios fabricantes falam em ~15–25% de erro na porção, números não verificados de forma independente. *G · custo mensal*. Fica para a versão com IA.
  - **Código de barras + tabela brasileira**: Open Food Facts (gratuito, produtos industrializados) e Tabela TACO (alimentos in natura). Busca por nome + gramas. *M · grátis*. Mais trabalho de digitar.
  - **Continuar fora do app** (como decidido no backlog) e só importar o total do dia de outro app, se ele exportar. *?*
  **Opinião**: começar por N6 (gasto) e manter ingestão fora do app por enquanto. Se quiser ingestão, o caminho grátis é código de barras + TACO; foto com IA entra junto com a IA no app.
- **N9 · Balanço do dia**: gasto (N6) − ingestão (N8) e carbo por kg nos dias de treino forte. *M · depende de N8*. Opinião: depois.

### G. Visual e uso
- **G1 · Resumo semanal no app** (cartão de domingo à noite com os números da semana; o texto pode vir do chat de treino). *P*. Previsto no backlog (item 10).
- **G2 · Notificações/widgets**: só em app nativo (v2).
- **G3 · Modo claro**: não pedido.

### H. Dados da Garmin que ainda não usamos
Body Battery · SpO2 noturno · passos e minutos de intensidade · hidratação · peso · fases do sono · arquivo FIT de cada atividade (FC e ritmo segundo a segundo, voltas). O FIT destrava B2, B3, B8 e D2.

---

## 3. Minha sugestão de ordem (até a prova)
1. **A1** relatório da manhã
2. **B1** compliance por cor
3. **C1** horário-alvo para dormir
4. **B4** meta de Forma para 29/11
5. **A2** tendência do HRV (CV + classificação)
6. **E1 + E2** diário e impacto dos hábitos
7. **N1 + N2 + N6** nutrição do treino planejada × feita e gasto calórico do Garmin (se mantivermos a aba Nutrição)
8. **B2** desacoplamento aeróbico (depois da prova, se o FIT for simples de baixar)

## 4. Fontes
WHOOP (press release mai/2026; Strain e sono) · Oura (Sleep debt; heart health) · Garmin (Training Readiness, manual; the5krunner) · HRV4Training (CV; normal values; big picture) · Strava (Relative Effort; Performance Predictions; Fitness & Freshness) · TrainingPeaks (glossário; TSS × hrTSS) · lifestack.ai (Bevel × Athlytic) · intervals.icu (conhecimento geral sobre os recursos) · Nutrola (métodos de contagem de calorias; números do fabricante, não verificados).
