-- REC — esquema D1 (SQLite)

CREATE TABLE IF NOT EXISTS daily_metrics (
  date        TEXT PRIMARY KEY,   -- manhã em que acordou (AAAA-MM-DD)
  hrv         REAL,               -- HRV noturno (ms)
  rhr         REAL,               -- FC de repouso (bpm)
  sleep_h     REAL,
  sleep_score REAL,
  resp        REAL,               -- respiração no sono (rpm)
  stress      REAL,               -- estresse médio do dia
  sleep_hr    REAL,
  acute       REAL,
  chronic     REAL,
  acwr        REAL,
  source      TEXT NOT NULL DEFAULT 'export',  -- export | garmin_api
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id      TEXT PRIMARY KEY,       -- data + hora + tipo (export) ou id Garmin
  date    TEXT NOT NULL,
  time    TEXT,
  type    TEXT NOT NULL,          -- tipo Garmin bruto
  sport   TEXT NOT NULL,          -- bike | corrida | natacao | hyrox | academia | outro
  min     REAL, km REAL, avghr REAL, maxhr REAL,
  load    REAL, te_aer REAL,
  rpe     REAL,                   -- 0–10
  feel    REAL,                   -- 0–100 (padrão do relógio = 50)
  z1 REAL, z2 REAL, z3 REAL, z4 REAL, z5 REAL   -- minutos em cada zona
);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);

CREATE TABLE IF NOT EXISTS rec_daily (
  date        TEXT PRIMARY KEY,
  rec         REAL,               -- NULL = traço
  z_hrv REAL, z_rhr REAL, z_sleep REAL, z_resp REAL, z_stress REAL,
  v_hrv REAL, v_rhr REAL, v_sleep REAL, v_resp REAL, v_stress REAL,
  b_hrv REAL, b_rhr REAL, b_sleep REAL, b_resp REAL, b_stress REAL,
  version     TEXT NOT NULL DEFAULT 'v1.1',
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- nota opcional "como me sinto" (1–10); nunca entra no REC
CREATE TABLE IF NOT EXISTS feel_notes (
  date       TEXT PRIMARY KEY,
  value      INTEGER NOT NULL CHECK (value BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- diário de hábitos (marcado à noite; vale para o REC da manhã seguinte)
CREATE TABLE IF NOT EXISTS habit_tags (
  date TEXT NOT NULL,
  tag  TEXT NOT NULL,
  PRIMARY KEY (date, tag)
);

-- registro de execução da rotina diária
CREATE TABLE IF NOT EXISTS sync_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  trigger TEXT NOT NULL,          -- cron | manual | open
  status  TEXT NOT NULL,          -- ok | erro | sem_dados
  detail  TEXT
);

-- configurações pequenas (ex.: calibração das previsões de prova)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
