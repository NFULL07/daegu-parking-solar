#!/usr/bin/env bash
# 전체 분석 재현 (s0는 전국 원본이 data/raw/uploads, data/raw/khnp 에 있을 때만)
set -e
cd "$(dirname "$0")"
[ -f data/raw/uploads/fileA.csv ] && python3 analysis/s0_prepare.py
python3 analysis/s1_targets.py
python3 analysis/s2_generation.py
python3 analysis/s3_forecast.py
python3 analysis/s3b_nested.py
python3 analysis/s3c_finalize.py
python3 analysis/s4b_window_model.py
python3 analysis/s4_ess.py
python3 analysis/s5_priority.py
python3 analysis/verify.py
