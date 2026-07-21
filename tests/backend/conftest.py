import os
import sys

# 让 tests/backend 下的用例能 import 仓库根的 api_fallback / server2
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
