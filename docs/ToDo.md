# REC — ToDo (futuro)

Lista viva do que o Luca pediu para depois.

**Feitos em 03/11**: previsões de prova, modo prova, sono. **Próximos**: aba Nutrição; Strava (descrições); recalcular zonas por esporte no histórico (opcional).

**Confirmado (03/11)**: a API entrega todos os campos (14 de 14 no teste de conexão).

## Métricas
- [ ] ~~Strain no padrão hrTSS~~ — **não adotado** (03/11): o Strain fica no TRIMP de Edwards (zonas × 1…5). Reavaliar só se houver potência na bike ou limiar de FC confiável. Ver `Estudo_Carga_Treino.md`, seção 7.
- [x] **Tempo em zonas** (03/11): seção em Tendências e barra em cada treino (Hoje e Treino).
- [x] **Previsões de prova (corrida)** (03/11): regras do Strava (ao ar livre, 24 semanas, recentes pesam mais), motor aberto (VO2máx por pace + FC), tendência 1/3/6 meses, calibração opcional com os números do Strava. **Pendente: o Luca digitar as previsões atuais do Strava** (Tendências → Previsões → Ajustar).
- [x] Sono (03/11, revisado): necessidade pessoal (média de 90 noites sem extremos, como a Oura), dívida de 14 dias com noites recentes pesando mais e faixas da Oura, meta da noite estilo Whoop (necessidade + dívida + treino − cochilo). O REC segue com 7,5 h fixas (spec v1.1); alinhar na calibração.
- [x] Regularidade do sono (03/11): horário médio de deitar/acordar e variação em 14 noites. **Pendente: Garmin → Buscar 90 dias** para preencher os horários.
- [ ] ~~Indicadores de forma~~ — descartado (03/11): pace e velocidade dependem de elevação, calor, vento e indoor × outdoor. A previsão de prova já mede adaptação na corrida.

- [x] **Zonas de FC por modalidade** (03/11): o Luca criou zonas de ciclismo no Garmin (%HRR; usar FC máx. da bike, ~185–186). Treinos novos já chegam com o tempo em zonas certo.
- [ ] Opcional: recalcular o histórico de zonas com o arquivo FIT (a Personal API entrega o arquivo original em `/download-service/files/activity/{id}`, ZIP com .fit).

- [x] Strain semanal com faixa (03/11), estilo Relative Effort do Strava: faixa = 0,8–1,3 × média das 3 semanas anteriores; 16 semanas em Tendências.

- [x] **Strain previsto pelo histórico** (03/11): minutos × Strain/min típico em treinos parecidos (modalidade + zona predominante, 120 dias); vence o `strain` do plano. Ainda conferir a partir de 04/11 com as zonas novas. Pedido original: **Conferir Strain previsto × feito a partir de 04/11** (zonas de ciclismo e natação atualizadas no Garmin em 03/11). Se continuar desproporcional: (a) chat de treino informar `strain` em toda sessão usando as zonas do Garmin; (b) app estimar o previsto pelo histórico (Strain/min médio de sessões da mesma modalidade e zona) quando o plano não trouxer `strain`. Caso de 03/11: rolo planejado "Z1" 60 min → previsto 60 (60 × 1); feito 31 (58,6 min abaixo da Z1 a 0,5/min, zonas antigas, FC média 107).

- [x] **Meta de Strain do dia v2** (03/11, `src/target.ts`; ver Guia 8b). Itens (c) e (d) entraram como "ontem pesado" e comparação com o plano. Pedido original: Hoje: Fitness (carga de 42 dias) × fator do REC (que já usa bases de 60–120 dias) × ajuste da Forma. Melhorar com: (a) quanto ainda cabe na **faixa semanal** (0,8–1,3 × média de 3 semanas) dividido pelos dias que faltam; (b) razão aguda/crônica e tendência da Fadiga; (c) dias desde o último dia pesado; (d) Strain previsto da sessão do plano; (e) a resposta de recuperação de 7 dias, não só o REC do dia. Validar contra o histórico: dias em que o Strain passou da meta deveriam ser seguidos de REC mais baixo.

## Abas e telas
- [x] Strain previsto × feito por sessão e na semana (03/11), estilo TSS planejado × realizado do TrainingPeaks.
- [x] Aba Treino (03/11): semana seg–dom, planejado × executado, REC do dia seguinte. Plano em `web/plan/<segunda>.json` (ver `Formato_Plano.md`). Falta: o chat de treino começar a publicar.
- [ ] Aba Nutrição: registro em dois toques (carbo total, barriga).
- [x] Modo prova (03/11): contagem, checklist escrito pelo Luca e salvo no servidor, carbo e plano de prova vindos de `web/plan/prova.json` (chat de treino). Aparece sozinho a partir de 23/11; prévia pelo rodapé da aba Hoje.
- [x] Avisos de carga (03/11) na aba Hoje: razão aguda/crônica fora de 0,8–1,4; corrida da semana +15% sobre a média de 4 semanas.

- [x] **Aviso de sincronização** (03/11): no topo da aba Hoje quando a última busca falhou, a noite não chegou até 11:00 ou a busca automática parou há mais de 90 min.
- [x] **Forma até a prova** (03/11): no Modo prova, Forma real de 14 dias + projetada com o Strain previsto do plano publicado; mostra a Forma prevista em 29/11 quando o plano das últimas semanas existir.

- [x] **Fase 1 das ideias** (03/11): diário de hábitos, "O que mexe no meu REC" (com horário irregular automático), deitar até, nota de regularidade, clima de Aracaju. Fase 2 feita em 03/11 (tendência do HRV, alerta de doença, 80/20, relatório da manhã, resumo da semana). Fase 3 (desacoplamento e eficiência) feita e **removida** em 03/11: métrica volátil demais fora de treino controlado.

- [x] **Tendências em 3 abas** (04/11): Carga, Corpo e Prova; resposta de uma frase no topo; blocos fechados que abrem ao tocar (carregam ao abrir); última aba lembrada.
- [x] **Cartão do treino para compartilhar** (04/11): toque no treino na aba Hoje → story 9:16 (Strain, duração, distância, ritmo, calorias ativas, FC, zonas, REC e Forma). Campos novos da Garmin: nome, calorias (ativas = total − basal), subida, velocidade, potência, cadência, TE anaeróbico.
- [ ] Cartão de compartilhar v2: botão "Salvar imagem" e escolha dos números.
- [x] **Strain do dia sem %** (04/11): anel mostra o número; meta = tracinho; excesso em outra cor.

## Integrações
- [ ] **Strava no app** (o Luca cria a conexão/API do Strava): trazer o **nome e a descrição** que ele escreve no Strava para cada treino feito, na aba Treino, ao lado do planejado do dia (e do dia seguinte). Sincroniza depois do treino.

## Visual
- [x] **Temas de cor** (03/11): Preto, Grafite, Verde-escuro, Azul-marinho; rodapé da aba Hoje → Tema; guardado no aparelho. Pedido original: **Temas de cor**: sair do preto puro para tons escuros (cinza grafite, verde muito escuro, azul-marinho) e deixar escolher entre 3 temas pré-definidos num ajuste do app (guardado no aparelho).

## Depois (pode ter custo)
- [ ] Login / Face ID (quando o app for disponibilizado).
- [ ] Widgets e push (app nativo).
