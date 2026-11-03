"""Gera data/reference_out.json a partir do CSV, usando a referência Python.
Uso: python3 scripts/dump_reference.py data/daily_metrics.csv"""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'reference'))
import pandas as pd
from rec_reference import rec
df = pd.read_csv(sys.argv[1], parse_dates=['date']).set_index('date').sort_index()
r = rec(df)
out = [{'date': d.strftime('%Y-%m-%d'), **{k: (None if pd.isna(v) else float(v)) for k, v in row.items()}}
       for d, row in r.iterrows()]
json.dump(out, open(os.path.join(os.path.dirname(sys.argv[1]), 'reference_out.json'), 'w'))
print(len(out), 'dias')
