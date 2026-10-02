import json
from pathlib import Path


def load_contract_rules(root: Path) -> dict:
    path = root / "data" / "vertragsregeln.json"
    if not path.exists():
        return {"bundles": [], "contract_rules": {}}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def bundle_for_line(root: Path, line) -> dict | None:
    line_text = str(line or "").strip()
    if not line_text:
        return None
    config = load_contract_rules(root)
    for bundle in config.get("bundles", []):
        if line_text in [str(v) for v in bundle.get("lines", [])]:
            return bundle
    return None


def annotate_bundle(root: Path, obj: dict) -> dict:
    bundle = bundle_for_line(root, obj.get("line"))
    if bundle:
        obj["_bundle_key"] = bundle.get("key", "")
        obj["_bundle_name"] = bundle.get("name", "")
        obj["_contract_rule_id"] = bundle.get("contract_rule_id", "")
    else:
        obj["_bundle_key"] = ""
        obj["_bundle_name"] = ""
        obj["_contract_rule_id"] = ""
    return obj
