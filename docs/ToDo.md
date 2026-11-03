# REC — ToDo (futuro)

Lista viva do que o Luca pediu para depois.

**Ordem sugerida (03/11)**, pensando na prova em 29/11: 1) previsões de prova; 2) modo prova (semana de 23/11); 3) aba Nutrição; 4) indicadores de forma; 5) Strava (descrições); 6) sono (dívida e regularidade).

**Confirmado (03/11)**: a API entrega todos os campos (14 de 14 no teste de conexão).

## Métricas
- [ ] ~~Strain no padrão hrTSS~~ — **não adotado** (03/11): o Strain fica no TRIMP de Edwards (zonas × 1…5). Reavaliar só se houver potência na bike ou limiar de FC confiável. Ver `Estudo_Carga_Treino.md`, seção 7.
- [x] **Tempo em zonas** (03/11): seção em Tendências e barra em cada treino (Hoje e Treino).
- [x] **Previsões de prova (corrida)** (03/11): regras do Strava (ao ar livre, 24 semanas, recentes pesam mais), motor aberto (VO2máx por pace + FC), tendência 1/3/6 meses, calibração opcional com os números do Strava. **Pendente: o Luca digitar as previsões atuais do Strava** (Tendências → Previsões → Ajustar).
- [x] Sono (03/11, revisado): necessidade pessoal (média de 90 noites sem extremos, como a Oura), dívida de 14 dias com noites recentes pesando mais e faixas da Oura, meta da noite estilo Whoop (necessidade + dívida + treino − cochilo). O REC segue com 7,5 h fixas (spec v1.1); alinhar na calibração.
- [x] Regularidade do sono (03/11): horário médio de deitar/acordar e variação em 14 noites. **Pendente: Garmin → Buscar 90 dias** para preencher os horários.
- [ ] Indicadores de forma: pace na FC 145 (corrida), velocidade na FC 137 (bike), ritmo de natação por 100 m.

- [x] **Zonas de FC por modalidade** (03/11): o Luca criou zonas de ciclismo no Garmin (%HRR; usar FC máx. da bike, ~185–186). Treinos novos já chegam com o tempo em zonas certo.
- [ ] Opcional: recalcular o histórico baixando a FC segundo a segundo (arquivo FIT) e aplicando as zonas de cada esporte.

## Abas e telas
- [x] Strain previsto × feito por sessão e na semana (03/11), estilo TSS planejado × realizado do TrainingPeaks.
- [x] Aba Treino (03/11): semana seg–dom, planejado × executado, REC do dia seguinte. Plano em `web/plan/<segunda>.json` (ver `Formato_Plano.md`). Falta: o chat de treino começar a publicar.
- [ ] Aba Nutrição: registro em dois toques (carbo total, barriga).
- [x] Modo prova (03/11): contagem, checklist escrito pelo Luca e salvo no servidor, carbo e plano de prova vindos de `web/plan/prova.json` (chat de treino). Aparece sozinho a partir de 23/11; prévia pelo rodapé da aba Hoje.
- [x] Avisos de carga (03/11) na aba Hoje: razão aguda/crônica fora de 0,8–1,4; corrida da semana +15% sobre a média de 4 semanas.

## Integrações
- [ ] **Strava no app** (o Luca cria a conexão/API do Strava): trazer o **nome e a descrição** que ele escreve no Strava para cada treino feito, na aba Treino, ao lado do planejado do dia (e do dia seguinte). Sincroniza depois do treino.

## Depois (pode ter custo)
- [ ] Login / Face ID (quando o app for disponibilizado).
- [ ] Widgets e push (app nativo).
