import os
import json
import re

protocol_dir = "200 - FUNCTIONS/Protocolos"
models_dir = "200 - FUNCTIONS/Models"

protocols = {}
for root, dirs, files in os.walk(protocol_dir):
    dirs[:] = [d for d in dirs if d != '_comuns']  # passos comuns não são protocolo (21/10/2026)
    for f in files:
        if f.endswith('.json'):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8') as file:
                    data = json.load(file)
                    pid = data.get('id', f.replace('.json', ''))
                    protocols[pid] = {
                        'file': f,
                        'path': path,
                        'name': data.get('name', ''),
                        'nextProtocol': data.get('nextProtocol', None),
                        'dynamicNextProtocol': data.get('dynamicNextProtocol', None),
                        'steps': data.get('steps', [])
                    }
            except Exception as e:
                pass

referenced_by = {pid: [] for pid in protocols.keys()}
missing_references = []

for pid, pdata in protocols.items():
    # Direct
    nxt = pdata['nextProtocol']
    if nxt:
        if nxt in referenced_by:
            referenced_by[nxt].append(f"nextProtocol in {pdata['file']}")
        else:
            missing_references.append(f"{nxt} (nextProtocol in {pdata['file']})")
            
    # Dynamic Router
    dyn = pdata['dynamicNextProtocol']
    if dyn and 'map' in dyn:
        for key, mapped_id in dyn['map'].items():
            if mapped_id is None:
                continue
            if mapped_id in referenced_by:
                referenced_by[mapped_id].append(f"Dynamic Router in {pdata['file']}")
            else:
                missing_references.append(f"{mapped_id} (Dynamic Router in {pdata['file']})")

for root, dirs, files in os.walk(models_dir):
    for f in files:
        if f.endswith('.md'):
            path = os.path.join(root, f)
            try:
                with open(path, "r", encoding='utf-8') as file:
                    model_content = file.read()
                # Find only ```dfm code blocks to prevent false positives from YAML
                dfm_blocks = re.findall(r'```dfm\s*\n(.*?)\n```', model_content, re.DOTALL)
                for block in dfm_blocks:
                    for line in block.split('\n'):
                        line = line.strip()
                        if line.startswith('id:'):
                            raw_ids = line[3:].split('|')
                            for raw_id in raw_ids:
                                raw_id = raw_id.strip()
                                if raw_id.startswith('command:'):
                                    continue
                                if raw_id:
                                    if raw_id in referenced_by:
                                        referenced_by[raw_id].append(f)
                                    else:
                                        missing_references.append(f"{raw_id} (Button in {f})")
            except Exception:
                pass
            
print("=== MISSING PROTOCOLS (Called but do not exist) ===")
for m in set(missing_references):
    print(f"  - {m}")

print("\n=== POTENTIAL ORPHANS (not referenced by anything) ===")
for pid, refs in referenced_by.items():
    if not refs and pid not in ['base_protocol', '_deprecated_estudo_sistemico']:  # Base is a template
        print(f"  - {pid} ({protocols[pid]['file']})")

