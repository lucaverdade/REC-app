"""REC v1.1 - implementação de referência (Luca, 03/11/2026).
Uso: python3 rec_reference.py daily_metrics.csv
Colunas usadas: date, hrv, rhr, sleep_h, resp, stress. Resto é contexto.
Regras: ver Estudo_Metrica_Recovery.md e App_Backlog_e_Especificacao_REC.md."""
import sys
import numpy as np, pandas as pd
from math import erf, sqrt

def zscore(x, w, minp, floor, med=False, neg=False):
    s = x.shift(1).rolling(w, min_periods=minp)
    base = s.median() if med else s.mean()
    z = (x - base) / s.std().clip(lower=floor)
    return (-z if neg else z).clip(-3, 3)

def rec(df):
    df = df.asfreq('D')
    lnh = np.log(df.hrv.where(df.hrv > 40))
    rhr = df.rhr.where(df.rhr > 30)
    resp = df.resp.where(df.resp > 8)
    stress_prev = df.stress.where(df.stress > 0).shift(1)      # estresse do dia D-1
    Z = pd.DataFrame({
        'hrv':    zscore(lnh, 120, 30, 0.04),
        'rhr':    zscore(rhr, 120, 20, 1.0, med=True, neg=True),
        'sleep':  ((df.sleep_h.clip(upper=9) - 7.5) / 1.0).clip(-3, 1.5),   # necessidade 7,5 h (suposição)
        'resp':   zscore(resp, 60, 20, 0.4, neg=True),
        'stress': zscore(stress_prev, 60, 20, 3.0, neg=True),
    })
    W = pd.Series({'hrv': 2.0, 'rhr': 1.0, 'sleep': 1.5, 'resp': 0.7, 'stress': 0.5})
    ok = Z.notna()
    wsum = (ok * W).sum(axis=1)
    z = (Z.fillna(0) * W).sum(axis=1) / wsum
    # regra: sem HRV ou sem sono -> traço (NaN); abaixo de 50% do peso -> NaN
    valid = (wsum >= W.sum() / 2) & ok.hrv & ok.sleep
    cdf = np.vectorize(lambda t: 0.5 * (1 + erf(t / sqrt(2))))
    out = pd.Series(np.where(valid, cdf(z.fillna(0).values) * 100, np.nan), index=df.index, name='REC')
    return pd.concat([Z.add_prefix('z_'), out], axis=1)

if __name__ == '__main__':
    df = pd.read_csv(sys.argv[1], parse_dates=['date']).set_index('date').sort_index()
    r = rec(df)
    print(r.tail(10).round(2))
