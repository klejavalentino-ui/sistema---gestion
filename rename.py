import os
import re

files_to_update = [
    "arca_client.py",
    "main.py",
    "static/js/app.js",
    "templates/index.html"
]

replacements = {
    "GestioSmart": "Datamargen",
    "gestiosmart": "datamargen",
    "GESTIOSMART": "DATAMARGEN"
}

for file_path in files_to_update:
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Apply replacements
        for old, new in replacements.items():
            content = content.replace(old, new)
            
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated {file_path}")
    else:
        print(f"File not found: {file_path}")
