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
- [x] **Zonas do histórico recalculadas** (04/11): Garmin → Zonas do histórico → Recalcular. Lê o FIT de cada treino (bike, corrida, natação, Hyrox; último ano, até 02/11) no navegador e refaz o tempo em zona com as zonas atuais por modalidade (`/biometric-service/heartRateZones`). Guarda as zonas originais (`z_orig`) para desfazer; buscas novas na Garmin não sobrescrevem as recalculadas. **Pendente: o Luca rodar e conferir.**

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
- [x] Cartão de compartilhar v2 (04/11): "Salvar imagem" (PNG 1080×1920 em canvas; no iPhone abre a folha de compartilhar) e escolha de até 6 números + blocos, guardada no aparelho.
- [x] **Strain do dia sem %** (04/11): anel mostra o número; meta = tracinho; excesso em outra cor.

- [x] **F1 fase do plano** (04/11) na aba Hoje.
- [x] **F3 aclimatação ao calor** (04/11): sessões do plano marcadas como calor + rua ≥ 28 °C em Brasília (Open-Meteo), últimos 14 dias; modo prova e Tendências → Prova.
- [x] **H SpO2** (04/11): mostrado e retirado no mesmo dia (não entra no REC). O app só guarda o valor da Garmin, sem tela.
- [ ] **Validar Body Battery × REC (por volta de 25/11)**: o app guarda Body Battery ao acordar e máximo do dia desde 04/11, sem mostrar. Cruzar com o REC (correlação e dias em que discordam) e reportar ao Luca.

- [x] **I1–I6** (04/11): status de treino, foco da carga, destaques do treino, aviso da véspera, estresse acumulado (31 dias), idade fitness e VO2máx da Garmin. Ver Guia 8f. Idade fitness: confirmar se a Garmin entrega para a chave pessoal.

- [x] **Velocidade** (04/11): respostas GET guardadas no D1 por versão dos dados (`api_cache`); qualquer escrita invalida; a rotina aquece Hoje e Tendências depois de buscar dados. Aba Hoje: ~140 ms → ~15 ms no teste local.
- [x] **Coerência das leituras** (04/11): status de treino só diz "corpo cansado" com duas confirmações (HRV + recuperação de 7 dias); respostas das abas citam os sinais de apoio; tabela "qual leitura responde o quê" no Guia (8.0).
- [x] **Completar treinos (12 meses)** (04/11): Garmin → Completar treinos troca as linhas do CSV pelas da API (sem duplicar), em janelas de 31 dias. **Pendente: o Luca rodar (antes de recalcular zonas).**
- [ ] **Calibrar e testar sempre (pedido do Luca, contínuo)**: toda mudança de métrica roda backtest de 12 meses (média, DP, zonas, maiores diferenças) antes de subir; conferir REC e Prontidão × "Como me sinto" todo mês; recalibrar pesos depois da prova.
- [x] **Cor da Prontidão** (04/11): opção C3, arco cheio com cor contínua brasa → rosa-claro → lavanda → azul → gelo; o número leva a mesma cor. Tendências → Corpo → "O REC acerta?" agora mostra também Prontidão × como me sinto.
- [x] **Visual v3** (05/11, estudo Whoop/Oura/Garmin/Bevel): Hoje com anel da Prontidão, uma frase do dia (resumo + alertas + meta), três portas (Sono → noite em detalhe com "hoje à noite"; Strain → meta, treinos, carga e curva do dia; Corpo → sinais do REC e 7 dias), linha Fitness · Fadiga · Forma, treinos planejado × feito numa lista e Registro do dia (nota em um toque + diário). Prova em "Até lá | No dia". Cores com significado fixo (Fitness/Fadiga/HRV/FC/carbo em branco e cinza) e texto com mais contraste.
- [x] **Strain v3** (05/11): TRIMP exponencial pela FC média na escala do Relative Effort do Strava (correlação 0,98 em 160 treinos); histórico todo recalculado. Ver Guia 8h.
- [x] **Relatório do treinador** (04/11): o servidor publica `relatorio/ultimo.md` e `relatorio/AAAA-MM-DD.md` no GitHub (manhã quando a noite chega + 20 h); prévia e "Enviar agora" em Ajustes → Relatório do treinador. **Pendente (Luca): token do GitHub (fine-grained, só REC-app, Contents read/write) como secret `GITHUB_TOKEN` no Cloudflare; Build watch paths excluindo `relatorio/*`; instrução no projeto do chat de treino.**
- [x] **Abas reorganizadas (04/11, v3)**: Tendências virou **Corpo** (painel rolável com gráficos à vista e um seletor 7D/1M/3M/6M/1A: resumo, Prontidão e REC, HRV, FC de repouso, sono, estresse, o que mexe no REC, ano em quadradinhos). **Treino** ganhou Semana | Mês | Evolução: calendário do mês (círculo = Strain, cor = modalidade, tracinho = Prontidão) e Evolução com Strain semanal, Fitness/Fadiga/Forma, **Strain × Prontidão** (dispersão, 6 meses), zonas, volume, foco e VO2máx. "O REC acerta?" foi para Ajustes.
- [x] **Noite em detalhe** (`#sono/<data>`): fases (hipnograma), FC da noite, minutos por fase × 14 noites, HRV/FC/respiração. Fases guardadas a partir de 04/11 (tabela `sleep_stages`); noites antigas via Garmin → Avançado → Buscar de novo os últimos 90 dias. **Conferir se a API pessoal manda `sleepLevels`/`sleepHeartRate`.**
- [x] **Revisão da semana** (`#semana/<segunda>`): Prontidão média × semana anterior, dia a dia (Strain + Prontidão), melhor dia, pior noite, treino mais pesado, números e texto do chat de treino.
- [x] **Tendências v2 + Zonas de treino** (04/11): tela inicial com resumo (Corpo e Carga) e lista agrupada (Corpo, Treino, Histórico) com o valor de hoje em cada linha; cada métrica abre na própria tela (`#tend/<id>`). Zonas de treino estilo Strava: % em cada zona de FC por modalidade, faixas em bpm do Garmin, 7D/1M/3M/6M/1A e diferença vs. período anterior (`/api/zones-dist`). Zonas por pace ficam de fora: a API não entrega o ritmo segundo a segundo.
- [x] **Pacote 04/11 (1–6)**: Prontidão no relatório da manhã, cartão para compartilhar, meta de Strain e aba Prova; manhã sem a noite mostra a Prontidão de ontem apagada; widget do iPhone (Scriptable, `web/widget-rec.js`, rota `/api/widget`); calibração automática (`/api/backtest`, retrato mensal no cron, `npm run backtest -- <url>`, aviso no cartão "O REC acerta?"); reta final na aba Prova (a partir de 28 dias) + taper do plano (`prova.json` → `taper`); relatório da prova (`#relatorio/<data>`, também para qualquer treino combinado a partir do ano em quadradinhos).
- [x] **Prontidão** (04/11): anel grande do Hoje (REC 55% + carga de 7 dias 20% + treino de ontem 10% + sono acumulado 15%, contra o normal do Luca; fixa na manhã; teto REC + 15). Ver Guia 8g. Recalibrar pesos depois da prova com "Como me sinto".
- [x] **Visual 04/11**: engrenagem → Ajustes (Garmin, Tema); anel animado; escala de texto; diário em uma linha; Seu dia e ano em quadradinhos legíveis; Sono e cartão de Tendências com detalhe no ⓘ.
- [x] **Tela Garmin repaginada** (04/11): diagnóstico com uma linha por parte dos dados (conexão, noite de hoje, dias, horários de sono, treinos do último ano, zonas do histórico, REC), cada uma ✓ / ! / ×. Um botão só, "Completar o que falta", roda na ordem certa (dias → horários → treinos → zonas → REC) e só o que falta; o servidor guarda os intervalos já pedidos (`fetched`) para um dia que a Garmin não tem não virar pendência eterna. Erros de zona: o botão tenta de novo (`/api/zones/retry`). Resto foi para "Avançado" (testar conexão, ver zonas, testar 1 treino, buscar 90 dias de novo, voltar às zonas originais com confirmação, últimas buscas). **Pendente: o Luca abrir Garmin e tocar em Completar o que falta.**
- [x] **Calibração do REC preparada** (04/11): Tendências → Corpo → "O REC acerta?": REC × "como me sinto", progresso até 40 notas, REC médio por faixa de nota e o sinal que mais acompanha. **Calibrar de fato depois de Aracaju.**

- [x] **Aba Prova** (04/11) no lugar de Nutrição (que volta depois): contagem, Forma até a prova, previsões, calor, clima, checklist, carbo e plano de prova. Tendências ficou com Carga e Corpo.
- [x] **O ano em quadradinhos** (04/11): Tendências → Carga; REC, Strain ou sono por dia em 53 semanas; toque mostra o dia.
- [x] **Linha do tempo do dia** (04/11): aba Hoje → "Seu dia": sono, treinos, FC (`/wellness-service/wellness/dailyHeartRate`) e estresse (`/wellness-service/wellness/dailyStress/{data}`, se a chave tiver acesso) em médias de 5 min, guardadas por dia (`intraday`).

## Ideias para depois (04/11, "fora da cartola")
- [ ] Widget no iPhone pelo app Scriptable lendo o REC (precisa fechar o acesso antes).
- [ ] Atalhos da Siri: "nota 7", "álcool hoje" (precisa fechar o acesso antes).
- [ ] Resumo diário publicado no repositório para o chat de treino ler (chave do GitHub só para esse arquivo, em segredo no servidor).
- [ ] Experimentos: testar um hábito por 2 semanas e comparar REC/HRV/sono antes × durante.
- [ ] Dia da prova ao vivo: linha do tempo da manhã, plano por etapa e carbo por hora.
- [ ] Relatório da prova (multiesporte da Garmin: etapas e transições × plano) e dias até o REC/HRV voltarem à base.
- [ ] Planejador da temporada (provas, fases e Fitness-alvo por data) — 2027.
- [ ] Retrospectiva da temporada em story (horas, km, recordes, evolução) — dezembro.
- [ ] Segurança: Cloudflare Access (login por e-mail) antes de widget/atalhos.

## Integrações
- [ ] **Strava no app** (o Luca cria a conexão/API do Strava): trazer o **nome e a descrição** que ele escreve no Strava para cada treino feito, na aba Treino, ao lado do planejado do dia (e do dia seguinte). Sincroniza depois do treino.

## Visual
- [x] **Temas de cor** (03/11): Preto, Grafite, Verde-escuro, Azul-marinho; rodapé da aba Hoje → Tema; guardado no aparelho. Pedido original: **Temas de cor**: sair do preto puro para tons escuros (cinza grafite, verde muito escuro, azul-marinho) e deixar escolher entre 3 temas pré-definidos num ajuste do app (guardado no aparelho).

## Depois (pode ter custo)
- [ ] Login / Face ID (quando o app for disponibilizado).
- [ ] Widgets e push (app nativo).
