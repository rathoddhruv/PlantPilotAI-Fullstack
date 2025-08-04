from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import subprocess
from pathlib import Path
import time

WATCH_FILE = Path("class_names.txt")

class WatchHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if Path(event.src_path).resolve() == WATCH_FILE.resolve():
            print("🔄 class_names.txt changed, regenerating YAML...")
            subprocess.run(["python", "generate_dataset_yaml.py"])

observer = Observer()
observer.schedule(WatchHandler(), path=".", recursive=False)
observer.start()

print("👀 Watching class_names.txt for changes...")
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    observer.stop()
observer.join()
