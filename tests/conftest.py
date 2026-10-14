import os
import tempfile

# Must be set before the app is imported: config is read at import time.
os.environ["STYLECAST_MOCK"] = "1"
os.environ["STYLECAST_DATA_DIR"] = tempfile.mkdtemp(prefix="stylecast-test-")
