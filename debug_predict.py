import sys
from pathlib import Path

# Add project root to sys.path
root = Path(__file__).resolve().parent
sys.path.append(str(root))

from BE.services.ml_service import ml_service
import logging

logging.basicConfig(level=logging.INFO)

if len(sys.argv) > 1:
    test_img = Path(sys.argv[1]).resolve()
else:
    test_img = root / "ML" / "data" / "test_images" / "test.jpg"

if not test_img.exists():
    print(f"File not found: {test_img}")
    sys.exit(1)

print(f"Testing prediction on: {test_img}")
try:
    res = ml_service.predict(test_img)
    print("SUCCESS")
    print(res)
except Exception as e:
    print("FAILED")
    import traceback
    traceback.print_exc()
