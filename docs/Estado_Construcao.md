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
- **Strain redefinido**: não é mais 0–21. Strain = carga do dia ÷ carga de um dia pesado do Luca (percentil 95 dos dias com treino nos últimos 365 dias) × 100. 100 = dia pesado; pode passar de 100.
- **Forma no método TrainingPeaks**: Fitness = média ponderada de 42 dias da carga do Garmin; Fadiga = 7 dias; Forma = Fitness − Fadiga de ontem (forma ao acordar). Ritmo mostrado em % do Fitness em 7 dias. Detalhes em `Estudo_Carga_Treino.md`.
- **Carga e horas lado a lado**: a carga do Garmin (EPOC) pesa intensidade; 1 h de Hyrox ≈ 8 h de bike em Z2.
- **Strava fica para depois**, só para as descrições dos treinos (o que o Luca achou da sessão). Garmin cobre as atividades.
- **Previsão de prova**: calcular no app pela fórmula de Riegel a partir dos melhores esforços recentes de corrida. Fonte a definir (voltas/splits do Garmin ou Strava).

## Falta (ordem sugerida)
1. Confirmar FC de repouso e respiração no teste real da Garmin.
2. Aba Treino (plano da semana publicado pelo Claude, planejado × executado, impacto no REC do dia seguinte).
3. Modo prova (semana de Aracaju) e previsão de prova.
4. Aba Nutrição (registro em dois toques).
5. Strava: descrições dos treinos.
6. Avisos de carga (razão fora de 0,8–1,4; corrida +15% na semana).
