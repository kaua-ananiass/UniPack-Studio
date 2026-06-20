from __future__ import annotations

import json
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any


LINE_ENDING_CRLF = "\r\n"
INFO_ORDER = [
    "title",
    "producerName",
    "buttonX",
    "buttonY",
    "chain",
    "squareButton",
    "landscape",
    "website",
]


def _detect_case_insensitive_path(root: Path, target_name: str) -> Path | None:
    lowered = target_name.lower()
    for child in root.iterdir():
        if child.name.lower() == lowered:
            return child
    return None


def _read_text(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _ensure_pad(pads: dict[str, dict[str, Any]], chain: int, x: int, y: int) -> dict[str, Any]:
    key = pad_key(chain, x, y)
    if key not in pads:
        pads[key] = {
            "key": key,
            "chain": chain,
            "x": x,
            "y": y,
            "sounds": [],
            "ledAnimations": [],
        }
    return pads[key]


def pad_key(chain: int, x: int, y: int) -> str:
    return f"{chain}:{x}:{y}"


def _sanitize_project_folder_name(value: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in {" ", "_", "-"} else "_" for char in str(value or "").strip())
    cleaned = "_".join(part for part in cleaned.split() if part)
    cleaned = cleaned.strip("._ ")
    return cleaned or "Novo_UniPack"


def parse_project(project_path: str | Path) -> dict[str, Any]:
    root = Path(project_path).expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"Pasta do projeto nao encontrada: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Caminho nao e uma pasta: {root}")

    casing = {
        "info": "Info",
        "keySound": "keySound",
        "keyLED": "keyLED",
        "sounds": "Sounds",
        "autoPlay": "autoPlay",
    }
    paths = {}
    for key, default_name in casing.items():
        match = _detect_case_insensitive_path(root, default_name)
        if match:
            casing[key] = match.name
            paths[key] = match
        else:
            paths[key] = root / default_name

    info, info_extra = parse_info(paths["info"])
    sounds = parse_sounds(paths["sounds"])
    pads = {}
    parse_key_sound(paths["keySound"], pads)
    parse_key_led(paths["keyLED"], pads)
    auto_play = parse_auto_play(paths["autoPlay"])

    button_x = int(info.get("buttonX") or 8)
    button_y = int(info.get("buttonY") or 8)
    chain_count = int(info.get("chain") or 8)

    return {
        "projectPath": str(root),
        "casing": casing,
        "info": info,
        "infoExtra": info_extra,
        "sounds": sounds,
        "pads": dict(sorted(pads.items(), key=lambda item: _pad_sort_tuple(item[1]))),
        "autoPlay": auto_play,
        "stats": {
            "buttonX": button_x,
            "buttonY": button_y,
            "chain": chain_count,
            "mappedPads": len(pads),
            "soundRows": sum(len(pad["sounds"]) for pad in pads.values()),
            "ledAnimations": sum(len(pad["ledAnimations"]) for pad in pads.values()),
            "autoPlayRows": len(auto_play),
            "soundFiles": len(sounds),
        },
    }


def create_empty_project(
    project_path: str | Path,
    *,
    folder_name: str = "",
    title: str = "Novo UniPack",
    producer_name: str = "",
    button_x: int = 8,
    button_y: int = 8,
    chain_count: int = 8,
) -> dict[str, Any]:
    base_path = Path(project_path).expanduser().resolve()
    root = base_path / _sanitize_project_folder_name(folder_name) if folder_name.strip() else base_path
    root.mkdir(parents=True, exist_ok=True)
    (root / "Sounds").mkdir(parents=True, exist_ok=True)

    project = {
        "projectPath": str(root),
        "casing": {
            "info": "Info",
            "keySound": "keySound",
            "keyLED": "keyLED",
            "sounds": "Sounds",
            "autoPlay": "autoPlay",
        },
        "info": {
            "title": title.strip() or "Novo UniPack",
            "producerName": producer_name.strip(),
            "buttonX": str(max(1, int(button_x))),
            "buttonY": str(max(1, int(button_y))),
            "chain": str(max(1, int(chain_count))),
            "squareButton": "true",
            "landscape": "false",
            "website": "",
        },
        "infoExtra": [],
        "pads": {},
        "sounds": [],
        "autoPlay": [],
    }
    return save_project(project)


def parse_info(path: Path) -> tuple[dict[str, str], list[dict[str, str]]]:
    info: dict[str, str] = {}
    extra: list[dict[str, str]] = []
    if not path.exists() or not path.is_file():
        return info, extra

    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        info[key] = value
        if key not in INFO_ORDER:
            extra.append({"key": key, "value": value})

    return info, extra


def parse_sounds(path: Path) -> list[dict[str, Any]]:
    if not path.exists() or not path.is_dir():
        return []

    sounds = []
    for sound_path in sorted(p for p in path.rglob("*") if p.is_file()):
        relative = sound_path.relative_to(path).as_posix()
        sounds.append(
            {
                "path": relative,
                "name": sound_path.name,
                "size": sound_path.stat().st_size,
            }
        )
    return sounds


def parse_key_sound(path: Path, pads: dict[str, dict[str, Any]]) -> None:
    if not path.exists() or not path.is_file():
        return

    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parts = line.split()
        if len(parts) < 4:
            continue

        try:
            chain = int(parts[0])
            x = int(parts[1])
            y = int(parts[2])
            loop = int(parts[4]) if len(parts) >= 5 else 1
            wormhole = int(parts[5]) if len(parts) >= 6 else None
        except ValueError:
            continue

        sound_file = parts[3]
        pad = _ensure_pad(pads, chain, x, y)
        pad["sounds"].append(
            {
                "soundFile": sound_file,
                "loop": loop,
                "wormhole": wormhole,
            }
        )


def parse_key_led(path: Path, pads: dict[str, dict[str, Any]]) -> None:
    if not path.exists() or not path.is_dir():
        return

    for led_file in sorted((p for p in path.iterdir() if p.is_file()), key=lambda p: p.name.lower()):
        parts = led_file.name.split()
        if len(parts) < 3:
            continue

        try:
            chain = int(parts[0])
            x = int(parts[1])
            y = int(parts[2])
            loop = int(parts[3]) if len(parts) >= 4 else 1
        except ValueError:
            continue

        suffix = " ".join(parts[4:]).strip() if len(parts) > 4 else ""
        pad = _ensure_pad(pads, chain, x, y)
        pad["ledAnimations"].append(
            {
                "loop": loop,
                "suffix": suffix,
                "events": parse_led_events(_read_text(led_file)),
            }
        )


def parse_led_events(content: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parts = line.split()
        cmd = parts[0].lower()

        try:
            if cmd in {"on", "o"} and len(parts) >= 4:
                x_token = parts[1]
                y_token = parts[2]
                if parts[3].lower() in {"auto", "a"}:
                    velocity = int(parts[4]) if len(parts) >= 5 else 3
                    events.append(
                        {
                            "type": "on",
                            "x": x_token,
                            "y": int(y_token),
                            "mode": "auto",
                            "color": "",
                            "velocity": velocity,
                        }
                    )
                else:
                    velocity = int(parts[4]) if len(parts) >= 5 else None
                    events.append(
                        {
                            "type": "on",
                            "x": x_token,
                            "y": int(y_token),
                            "mode": "hex",
                            "color": parts[3].upper(),
                            "velocity": velocity,
                        }
                    )
            elif cmd in {"off", "f"} and len(parts) >= 3:
                events.append(
                    {
                        "type": "off",
                        "x": parts[1],
                        "y": int(parts[2]),
                    }
                )
            elif cmd in {"delay", "d"} and len(parts) >= 2:
                events.append({"type": "delay", "ms": int(parts[1])})
            elif cmd in {"chain", "c"} and len(parts) >= 2:
                events.append({"type": "chain", "chain": int(parts[1])})
        except ValueError:
            continue
    return events


def parse_auto_play(path: Path) -> list[dict[str, Any]]:
    if not path.exists() or not path.is_file():
        return []

    commands: list[dict[str, Any]] = []
    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parts = line.split()
        cmd = parts[0].lower()
        try:
            if cmd in {"on", "o"} and len(parts) >= 3:
                commands.append({"type": "on", "x": int(parts[1]), "y": int(parts[2])})
            elif cmd in {"off", "f"} and len(parts) >= 3:
                commands.append({"type": "off", "x": int(parts[1]), "y": int(parts[2])})
            elif cmd in {"touch", "t"} and len(parts) >= 3:
                commands.append({"type": "touch", "x": int(parts[1]), "y": int(parts[2])})
            elif cmd in {"delay", "d"} and len(parts) >= 2:
                commands.append({"type": "delay", "ms": int(parts[1])})
            elif cmd in {"chain", "c"} and len(parts) >= 2:
                commands.append({"type": "chain", "chain": int(parts[1])})
        except ValueError:
            continue
    return commands


def save_project(project: dict[str, Any]) -> dict[str, Any]:
    root = Path(project["projectPath"]).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)

    casing = project.get("casing") or {}
    info_name = casing.get("info", "Info")
    key_sound_name = casing.get("keySound", "keySound")
    key_led_name = casing.get("keyLED", "keyLED")
    auto_play_name = casing.get("autoPlay", "autoPlay")

    _write_text(root / info_name, serialize_info(project.get("info") or {}, project.get("infoExtra") or []))
    _write_text(root / key_sound_name, serialize_key_sound(project.get("pads") or {}))
    write_key_led(root / key_led_name, project.get("pads") or {})
    _write_text(root / auto_play_name, serialize_auto_play(project.get("autoPlay") or []))

    return parse_project(root)


def export_project_zip(project_path: str | Path, destination_zip: str | Path) -> Path:
    root = Path(project_path).expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"Pasta do projeto nao encontrada: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Caminho do projeto invalido: {root}")

    target = Path(destination_zip).expanduser().resolve()
    if target.suffix.lower() != ".zip":
        target = target.with_suffix(".zip")
    target.parent.mkdir(parents=True, exist_ok=True)

    visible_entries = []
    for entry_path in sorted(root.rglob("*")):
        relative_parts = entry_path.relative_to(root).parts
        if entry_path.resolve() == target:
            continue
        if any(part.startswith(".") for part in relative_parts):
            continue
        visible_entries.append(entry_path)

    visible_dirs = {entry for entry in visible_entries if entry.is_dir()}
    visible_children_by_dir = {directory: 0 for directory in visible_dirs}
    for entry in visible_entries:
        current = entry.parent
        while current != root and current in visible_children_by_dir:
            visible_children_by_dir[current] += 1
            current = current.parent

    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
        for entry_path in visible_entries:
            archive_name = entry_path.relative_to(root).as_posix()
            if entry_path.is_dir():
                if visible_children_by_dir.get(entry_path, 0) > 0:
                    continue
                _write_compat_zip_directory(archive, archive_name)
                continue
            _write_compat_zip_file(archive, archive_name, entry_path.read_bytes())

    return target


def _write_compat_zip_file(archive: zipfile.ZipFile, archive_name: str, data: bytes) -> None:
    entry = zipfile.ZipInfo(archive_name)
    entry.compress_type = zipfile.ZIP_STORED
    entry.create_system = 0
    entry.external_attr = 0x20
    archive.writestr(entry, data)


def _write_compat_zip_directory(archive: zipfile.ZipFile, archive_name: str) -> None:
    entry = zipfile.ZipInfo(f"{archive_name.rstrip('/')}/")
    entry.compress_type = zipfile.ZIP_STORED
    entry.create_system = 0
    entry.external_attr = 0x10
    archive.writestr(entry, b"")


def serialize_info(info: dict[str, Any], info_extra: list[dict[str, str]]) -> str:
    lines = []
    used_keys = set()

    for key in INFO_ORDER:
        value = info.get(key)
        if value is None or value == "":
            continue
        lines.append(f"{key}={value}")
        used_keys.add(key)

    for entry in info_extra:
        key = (entry.get("key") or "").strip()
        if not key or key in used_keys:
            continue
        lines.append(f"{key}={entry.get('value', '')}")
        used_keys.add(key)

    for key, value in info.items():
        if key in used_keys or value is None or value == "":
            continue
        lines.append(f"{key}={value}")

    return join_lines(lines)


def serialize_key_sound(pads: dict[str, Any]) -> str:
    lines = []
    for pad in sorted(pads.values(), key=_pad_sort_tuple):
        for mapping in pad.get("sounds") or []:
            base = f"{pad['chain']} {pad['x']} {pad['y']} {mapping.get('soundFile', '').strip()}"
            sound_file = mapping.get("soundFile", "").strip()
            if not sound_file:
                continue

            loop = mapping.get("loop")
            wormhole = mapping.get("wormhole")
            if wormhole not in (None, "", 0, "0"):
                loop_value = int(loop or 1)
                lines.append(f"{base} {loop_value} {int(wormhole)}")
            elif loop not in (None, "", 1, "1"):
                lines.append(f"{base} {int(loop)}")
            else:
                lines.append(base)
    return join_lines(lines)


def write_key_led(path: Path, pads: dict[str, Any]) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)

    for pad in sorted(pads.values(), key=_pad_sort_tuple):
        animations = pad.get("ledAnimations") or []
        if not animations:
            continue

        for index, animation in enumerate(animations):
            loop = int(animation.get("loop") or 1)
            suffix = ""
            if len(animations) > 1:
                suffix = _variant_suffix(index)

            name = f"{pad['chain']} {pad['x']} {pad['y']} {loop}"
            if suffix:
                name = f"{name} {suffix}"

            content = serialize_led_events(animation.get("events") or [])
            _write_text(path / name, content)


def serialize_led_events(events: list[dict[str, Any]]) -> str:
    lines = []
    for event in events:
        event_type = event.get("type")
        if event_type == "on":
            x_value = str(event.get("x", "1")).strip() or "1"
            y_value = int(event.get("y") or 1)
            mode = event.get("mode") or "auto"
            if mode == "auto":
                velocity = int(event.get("velocity") or 3)
                lines.append(f"o {x_value} {y_value} a {velocity}")
            else:
                color = str(event.get("color") or "FFFFFF").strip().upper()
                velocity = event.get("velocity")
                if velocity in (None, "", 0, "0"):
                    lines.append(f"o {x_value} {y_value} {color}")
                else:
                    lines.append(f"o {x_value} {y_value} {color} {int(velocity)}")
        elif event_type == "off":
            x_value = str(event.get("x", "1")).strip() or "1"
            y_value = int(event.get("y") or 1)
            lines.append(f"f {x_value} {y_value}")
        elif event_type == "delay":
            lines.append(f"d {int(event.get('ms') or 0)}")
        elif event_type == "chain":
            lines.append(f"c {int(event.get('chain') or 1)}")
    return join_lines(lines)


def serialize_auto_play(commands: list[dict[str, Any]]) -> str:
    lines = []
    for command in commands:
        command_type = command.get("type")
        if command_type in {"on", "off", "touch"}:
            x_value = int(command.get("x") or 1)
            y_value = int(command.get("y") or 1)
            shorthand = {"on": "o", "off": "f", "touch": "t"}[command_type]
            lines.append(f"{shorthand} {x_value} {y_value}")
        elif command_type == "delay":
            lines.append(f"d {int(command.get('ms') or 0)}")
        elif command_type == "chain":
            lines.append(f"c {int(command.get('chain') or 1)}")
    return join_lines(lines)


def join_lines(lines: list[str]) -> str:
    if not lines:
        return ""
    return LINE_ENDING_CRLF.join(lines) + LINE_ENDING_CRLF


def _variant_suffix(index: int) -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyz"
    result = ""
    current = index
    while True:
        result = alphabet[current % 26] + result
        current = current // 26 - 1
        if current < 0:
            break
    return result


def _pad_sort_tuple(pad: dict[str, Any]) -> tuple[int, int, int]:
    return (int(pad["chain"]), int(pad["x"]), int(pad["y"]))


def project_to_json(project: dict[str, Any]) -> str:
    return json.dumps(project, ensure_ascii=False, indent=2)
