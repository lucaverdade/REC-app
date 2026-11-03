# Estudo: carga de treino, Strain e tendência (Forma)

Data: 03/11/2026. Base: `activities.csv` (Garmin) e `daily_metrics.csv`. Proposta de desenho para o app; nada construído ainda.

## 1. De onde vem a carga hoje
- Cada atividade do Garmin traz um campo **carga** (`activityTrainingLoad`). Ele é baseado em **EPOC**: o consumo de oxigênio extra depois do exercício, estimado pela FC, duração e intensidade. 923 de 926 atividades têm o valor.
- A **carga aguda** do relógio é uma soma ponderada do EPOC dos últimos dias; a **crônica** é a carga de longo prazo. A razão aguda/crônica tem faixas no manual: abaixo de 0,8 baixa, 0,8–1,4 ótima, 1,5–1,9 alta, 2,0+ muito alta.
- Nos seus dados, a **crônica do Garmin ≈ média semanal das últimas 4 semanas** (erro mediano de 7%). A aguda é mais parecida com a soma de 7 dias, mas com decaimento próprio (erro ~23%).

## 2. O achado que muda o desenho
Carga Garmin por hora de treino, em 2026:

| Modalidade | Carga/h (Garmin) | TRIMP por zonas/h | % do tempo em Z1–Z2 |
|---|---|---|---|
| Hyrox | 244 | 149 | 38% |
| Corrida | 91 | 114 | 75% |
| Natação | 69 | 64 | 93% |
| Bike | 30 | 53 | 90% |
| Academia | 13 | 10 | 96% |

- Uma hora de Hyrox vale **8×** uma hora de bike na carga do Garmin (no TRIMP por zonas, ~3×). O EPOC pesa muito a intensidade e quase ignora volume em Z2.
- Consequência: semanas com 8 h de bike aparecem "leves" na carga. Por isso **carga sozinha não basta**: o app mostra **carga e horas por modalidade lado a lado** (já previsto no backlog).
- Alternativa futura: uma carga própria por zonas (TRIMP: minutos em cada zona × peso da zona), mais equilibrada para volume. Fica como opção, não como padrão, para não divergir do relógio.

## 3. Proposta para o app
**Strain do dia (0–21, estilo Whoop)**
- Whoop: escala 0–21 logarítmica (subir de 10 para 20 é muito mais difícil que de 0 para 10), vinda da carga cardiovascular e muscular.
- REC: `Strain = 21 × (1 − e^(−carga do dia / 116))`. O 116 foi calibrado para o seu dia no percentil 95 (carga 225) dar 18.
- Exemplos: carga 13 → 2,2 · 50 → 7,4 · 100 → 12,2 · 150 → 15,3 · 250 → 18,6.
- Strain é só um jeito de ler a carga do dia num número curto. Não entra no REC.

**Forma (estilo Fitness & Freshness do Strava)**
- O Strava usa o modelo de impulso-resposta de Banister: Fitness acumula devagar, Fadiga sobe e cai rápido, Forma = Fitness − Fadiga. O Strava não publica as constantes; uso as clássicas: **42 dias (Fitness) e 7 dias (Fadiga)**, médias exponenciais da carga diária do Garmin.
- Seus números atuais: Fitness 88, Fadiga 95, Forma −6. Na série: Forma +31 em meados de set (semanas leves) e −18 em 24/10 (semana pesada).
- **Ritmo de subida**: variação semanal do Fitness. Últimas 10 semanas: entre −7 e +6 por semana.

**Aba Tendências (abre em 7 dias, atalhos 30 d / 90 d / 1 ano)**
1. **Semana**: barras empilhadas por modalidade com a carga; ao lado, horas por modalidade.
2. **Forma**: linhas finas de Fitness e Fadiga, com a Forma abaixo (cinza/branco; cor continua só no REC).
3. **Razão aguda/crônica** do Garmin com a faixa 0,8–1,4 marcada.
4. REC, HRV e FC de repouso contra a base; sono.

**Avisos de carga (sem conselho genérico, só fato)**
- Razão aguda/crônica fora de 0,8–1,4.
- Volume de corrida da semana mais de 15% acima da média das 4 anteriores (item 16 do backlog).
- REC baixo + carga alta no mesmo dia (leitura conjunta do Estudo da métrica).

## 4. O que copiar de Whoop e Oura (prioridade)
1. **Strain + leitura conjunta com o REC** (Whoop): mostrar Strain do dia ao lado do REC. A "meta de Strain" guiada pela recuperação fica para depois do modo sombra.
2. **Necessidade de sono dinâmica / dívida de sono** (Whoop): necessidade sobe com a carga do dia anterior e com a dívida acumulada. Substitui os 7,5 h fixos depois da calibração.
3. **Balanço do HRV** (Oura): média de 14 dias contra 3 meses. Já previsto como painel de tendência.
4. **Regularidade do sono** (Oura): a API entrega horário de início e fim do sono; dá para mostrar a variação do horário de deitar e acordar.
5. **Diário com marcações** (Whoop): álcool, doença, viagem; com o tempo, o app mostra o efeito médio de cada uma no REC.

## 5. Limites
- A carga do Garmin é estimada pela FC; natação com sensor de pulso tem FC menos confiável.
- As constantes 42/7 são convenção (Banister/Coggan), não ajustadas para você.
- O Strain com k = 116 foi calibrado na sua distribuição de nov/2025 a nov/2026; recalibrar uma vez por temporada.

Fontes: Strava Support (Fitness & Freshness); manual Garmin (Acute Load); WHOOP (How does Strain work 101); análise nos dados exportados.

## 6. Como as empresas calculam a carga (pesquisa de 03/11, tarde)
| Quem | Métrica | Base | Público? |
|---|---|---|---|
| TrainingPeaks | TSS / hrTSS | Potência ou pace contra o limiar; sem potência, FC contra o **limiar de FC (LTHR)**. 1 h no limiar = 100. | Conceito público; fórmula exata do hrTSS não |
| intervals.icu | HRSS ("TRIMP normalizado") | TRIMP de FC normalizado; precisa de FC de repouso e de limiar | Método do Elevate |
| Strava | Relative Effort | Baseado no TRIMP de Banister, tempo em zonas com pesos crescentes, normalizado com a base global do Strava; usa FC máx. | Pesos não publicados |
| Garmin (Firstbeat) | Carga / EPOC | Estimativa do "oxigênio extra" pós-treino a partir da FC | Não |
| Whoop | Strain 0–21 | Carga cardiovascular (FC) + muscular, escala logarítmica | Não |

Leitura:
- O padrão aberto e mais usado para quem não tem potência é o **hrTSS / HRSS**: TRIMP de Banister (FC acima do repouso, com peso exponencial para intensidade) normalizado para **100 = 1 h no limiar de FC**. Na mesma escala do TSS, então as referências do TrainingPeaks (ritmo de 5–8 pontos de Fitness por semana etc.) passam a valer.
- O que o app usa desde 03/11 (minutos por zona × 1…5) é o **TRIMP de Edwards**, método publicado (1993) e base de vários relógios, mas sem normalização pelo limiar.
- Limite conhecido de qualquer carga por FC: subestima intervalos curtos acima do limiar (a FC demora a subir). Vale para o Hyrox.
- Protótipo com limiar estimado (90% de FC máx. 200) deu valores baixos demais. **Decisão pendente**: usar o limiar e as zonas configurados no Garmin (endpoint de zonas da API) antes de trocar.
