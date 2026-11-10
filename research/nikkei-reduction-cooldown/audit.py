"""Reuse the independent scalar cash-accounting oracle on this study's ledgers."""

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("turnover_cash_oracle", root.parent / "nikkei-switch-turnover/audit.py")
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
oracle.ROOT = root
oracle.main()
