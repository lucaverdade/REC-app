# REC — estado da construção e decisões novas (03/11/2026, tarde)

Complementa `App_Backlog_e_Especificacao_REC.md`. Onde houver conflito, vale este arquivo.

## Construído
- **Infra**: Cloudflare Worker + D1, publicado a partir do GitHub (`lucaverdade/REC-app`, branch `main`). Tabelas criadas sozinhas no primeiro acesso.
- **Garmin Personal API**: token por chave pessoal (secret `GARMIN_API_KEY`), HRV, estresse e resumo diário por faixa de datas, sono por dia, atividades. Confirmados com dados reais: HRV, sono, score do sono, estresse. Ajustados (aguardando novo teste): FC de repouso (`data.heartRate`) e respiração com decimais (`data.respiration`).
- **Histórico pela API** (tela Garmin → Puxar histórico), sem importar export. Retoma de onde parou e espera sozinho quando a Garmin limita chamadas.
- **Atualização na hora em que acorda**: o app busca a noite ao abrir; rotina a cada 15 min das 04:00 às 10:45 só enquanto a noite não chegou.
- **Aba Hoje**: anel do REC, contribuintes ao tocar, semana, avisos, comentário por regras, treino do dia com Strain, Forma do dia, nota opcional.
- **Aba Tendências**: Fitness, Fadiga e Forma com explicação e gráfico; carga por dia/semana; horas, carga e sessões por modalidade; razão aguda/crônica; Strain por dia; REC, HRV e FC de repouso contra a base; sono. Períodos 7 d / 30 d / 90 d / 1 ano.

## Decisões novas
- **Sem código de acesso por enquanto** (decisão do Luca). `APP_TOKEN` é opcional: se cadastrado, o app volta a pedir código. Login e Face ID ficam para quando o app for disponibilizado.
- **Strain = carga do treino por zonas de FC** (03/11, tarde): minutos em cada zona do Garmin × peso (Z1 = 1 … Z5 = 5) + 0,5 por minuto abaixo da Z1. Substitui a carga do Garmin (EPOC), que não crescia com a duração: bike de 2 h 50 em 01/11 = 127 no Garmin e 344 por zonas; Hyrox de 41 min = 242 no Garmin e 118 por zonas. Strain e carga passam a ser a mesma coisa (um número só). Fitness, Fadiga e Forma usam o Strain.
- **Forma em %** do Fitness, com faixas de Joe Friel (via intervals.icu): < −30% muito cansado, −30 a −10% em bloco de treino, −10 a +5% equilibrado, +5 a +20% descansado, > +20% perdendo forma (nomes escolhidos pelo Luca em 03/11).
- **Tendências por período de calendário**: Semana (seg–dom), Mês, 3 meses, 6 meses, 1 ano, com setas para voltar; mostra a variação de Fitness, Fadiga e Forma no período. Strain em barras de uma cor; Volume só em tabela.
- **Hoje**: medidor semicircular da Forma com as faixas; deslizar para a direita volta um dia (até 7 dias).
- **Forma no método TrainingPeaks**: Fitness = média ponderada de 42 dias da carga do Garmin; Fadiga = 7 dias; Forma = Fitness − Fadiga de ontem (forma ao acordar). Ritmo mostrado em % do Fitness em 7 dias. Detalhes em `Estudo_Carga_Treino.md`.
- **Strava fica para depois**, só para as descrições dos treinos (o que o Luca achou da sessão). Garmin cobre as atividades.
- **Previsão de prova**: calcular no app pela fórmula de Riegel a partir dos melhores esforços recentes de corrida. Fonte a definir (voltas/splits do Garmin ou Strava).

## Cores (03/11, pedido do Luca: "minimalista, chique")
- Fundo preto, texto branco/cinza. Destaque de interface azul-gelo (`#8fb6ec`): aba ativa, seletores, links.
- Modalidades (validadas para daltonismo e contraste sobre o preto): bike `#3f93d4`, corrida `#d2764a`, natação `#1f9e90`, Hyrox `#a86fd6`, academia cinza `#6e6e74` (à parte).
- Fitness azul `#5e97e0`, Fadiga rosé `#d46a94`; Forma positiva em azul, negativa em rosé.
- REC mantém o semáforo, levemente dessaturado (`#e2584f`, `#e7be45`, `#3fbf7f`). Inspiração: Oura usa uma cor por métrica, todas dessaturadas sobre preto.
- Gráficos com cor própria e degradê: Strain laranja, HRV verde-menta, FC de repouso âmbar, sono lavanda, REC com bolinhas no semáforo; faixas da Forma de rosé (risco) a azul (descansado).

## Falta
Lista completa e viva em `ToDo.md`. Próximo passo: hrTSS com as zonas do Garmin.

## Falta (ordem sugerida, versão antiga)
1. Confirmar FC de repouso e respiração no teste real da Garmin.
2. Aba Treino (plano da semana publicado pelo Claude, planejado × executado, impacto no REC do dia seguinte).
3. Modo prova (semana de Aracaju) e previsão de prova.
4. Aba Nutrição (registro em dois toques).
5. Strava: descrições dos treinos.
6. Avisos de carga (razão fora de 0,8–1,4; corrida +15% na semana).

## Tendências (03/11, repaginada)
Cada bloco responde uma pergunta, com uma frase no topo que lê o gráfico:
1. **Strain semanal** (faixa 0,8–1,3 × média de 3 semanas; toque mostra os treinos da semana).
2. **Estou evoluindo?** Um gráfico: Fitness (área azul) + Fadiga (linha rosa) + faixa colorida da Forma por dia. Janela 2/3/6 meses/1 ano.
3. **Previsões de prova** com linha de melhora/piora.
4. **Como treinei?** Período de calendário (semana…1 ano, com navegação): horas por modalidade, sessões, Strain e tempo em zonas numa barra única.
5. **Meu corpo está recuperando?** Cartões REC, HRV, FC de repouso e sono com média de 7 dias, frase contra a base e mini-gráfico com a faixa normal (60 dias anteriores); toque amplia.
Saíram: calendário de Strain por dia, gráficos separados de Forma e os gráficos de recuperação por período curto.

### Resposta "Meu corpo está recuperando?" (03/11, v2 com pesos)
Regras em `src/verdict.ts`, sem IA. Usa os z do REC (cada sinal contra o normal do Luca): HRV 2, sono 1,5, FC 1, respiração 0,7, estresse 0,5.
- Nível = média ponderada dos últimos 7 dias (recentes pesam mais, meia-vida 3 dias): ≥ +0,30 recuperando bem; −0,20 a +0,30 dentro do normal; −0,50 a −0,20 um pouco abaixo; −0,90 a −0,50 abaixo; < −0,90 não está recuperando.
- Tendência: últimos 3 dias × 4 anteriores (±0,30).
- Motivos: até 2 sinais que mais puxaram para baixo (peso × z ≤ −0,4) e o que mais ajudou, com os números do Luca.
- Carga: cruza o nível com a faixa da Forma e os dias com Fadiga acima do Fitness. Respiração + FC acima do normal 2 dias seguidos = padrão de início de doença.
- Recalcula a cada noite nova.
