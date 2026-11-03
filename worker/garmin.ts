// Garmin Personal API — integração ainda NÃO implementada.
// A chave fica no secret GARMIN_API_KEY do Worker (nunca no código, no repo ou em logs).
// Próximo passo: com a documentação da API em mãos, implementar a troca chave → token de 24 h
// e a busca de sono, HRV, FC de repouso, estresse e atividades; depois comparar 120+ dias
// com o export (scripts de conferência). Enquanto isso, o plano B é reimportar o export.

export interface GarminDay {
  date: string;
  hrv?: number | null; rhr?: number | null; sleep_h?: number | null; sleep_score?: number | null;
  resp?: number | null; stress?: number | null;
}

export type SyncResult =
  | { status: 'sem_chave' }
  | { status: 'nao_implementado' }
  | { status: 'ok'; days: GarminDay[] };

export async function fetchRecentDays(env: { GARMIN_API_KEY?: string }, _sinceDate: string): Promise<SyncResult> {
  if (!env.GARMIN_API_KEY) return { status: 'sem_chave' };
  return { status: 'nao_implementado' };
}
