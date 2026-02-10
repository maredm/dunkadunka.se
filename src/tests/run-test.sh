#!/bin/bash
# Run POLQA test for rec2.wav and ref2.wav
# Expected result: MOS-LQO score of 4.2

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
node polqa-test.js
