from __future__ import annotations

import argparse
import base64
import copy
import io
import json
import mimetypes
import os
import shutil
import subprocess
import tempfile
import wave
import zipfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, unquote, urlparse

from unipack_format import create_empty_project, export_project_zip, parse_project, save_project


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DEFAULT_PROJECT_PATH = str(Path(os.environ.get("UNIPACK_DEFAULT_PROJECT_PATH") or BASE_DIR.parent).expanduser().resolve())


class UniPackEditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/runtime-config":
            self._handle_runtime_config()
            return
        if parsed.path == "/api/project":
            self._handle_get_project(parsed)
            return
        if parsed.path == "/api/folder/pick":
            self._handle_pick_folder(parsed)
            return
        if parsed.path == "/api/sound":
            self._handle_get_sound(parsed)
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/project/save":
            self._handle_save_project()
            return
        if parsed.path == "/api/project/export":
            self._handle_export_project()
            return
        if parsed.path == "/api/project/create":
            self._handle_create_project()
            return
        if parsed.path == "/api/project/import-zip":
            self._handle_import_project_zip()
            return
        if parsed.path == "/api/sound/clip":
            self._handle_clip_sound()
            return
        if parsed.path == "/api/sound/import":
            self._handle_import_sound()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Endpoint nao encontrado")

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def _handle_get_project(self, parsed) -> None:
        params = parse_qs(parsed.query)
        project_path = params.get("path", [DEFAULT_PROJECT_PATH])[0]
        try:
            project = parse_project(project_path)
            self._send_json(project)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_runtime_config(self) -> None:
        config = {
            "supabaseUrl": os.environ.get("SUPABASE_URL", "").strip(),
            "supabasePublishableKey": os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip(),
            "supabaseLibraryTable": os.environ.get("SUPABASE_LIBRARY_TABLE", "led_library").strip() or "led_library",
            "supabaseProjectAudioBucket": os.environ.get("SUPABASE_PROJECT_AUDIO_BUCKET", "project-audio").strip()
            or "project-audio",
        }
        self._send_json(config)

    def _handle_pick_folder(self, parsed) -> None:
        params = parse_qs(parsed.query)
        initial_path = params.get("initial", [DEFAULT_PROJECT_PATH])[0]
        try:
            if os.name != "posix" or not shutil.which("osascript"):
                raise RuntimeError("Selecao de pasta local disponivel apenas no editor rodando no macOS.")
            initial_dir = Path(initial_path).expanduser()
            if not initial_dir.exists():
                initial_dir = Path.home()

            apple_script = "\n".join(
                [
                    'set chosenFolder to choose folder with prompt "Escolha uma pasta do projeto"',
                    "POSIX path of chosenFolder",
                ]
            )
            result = subprocess.run(
                ["osascript", "-e", apple_script],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                stderr = (result.stderr or "").strip().lower()
                if "user canceled" in stderr or "cancel" in stderr:
                    self._send_json({"cancelled": True, "path": ""})
                    return
                raise RuntimeError(result.stderr.strip() or "Falha ao abrir seletor de pasta")

            selected = (result.stdout or "").strip()
            if not selected:
                self._send_json({"cancelled": True, "path": ""})
                return
            self._send_json({"cancelled": False, "path": str(Path(selected).expanduser().resolve())})
        except Exception as exc:  # noqa: BLE001
            self._send_json(
                {"error": f"Nao foi possivel abrir o seletor de pasta: {exc}"},
                status=HTTPStatus.BAD_REQUEST,
            )

    def _handle_save_project(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            project = save_project(payload)
            self._send_json(project)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_create_project(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            project = create_empty_project(
                payload["projectPath"],
                folder_name=str(payload.get("folderName") or ""),
                title=str(payload.get("title") or "Novo UniPack"),
                producer_name=str(payload.get("producerName") or ""),
                button_x=int(payload.get("buttonX") or 8),
                button_y=int(payload.get("buttonY") or 8),
                chain_count=int(payload.get("chain") or 8),
            )
            self._send_json(project)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_export_project(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            browser_download = bool(payload.get("browserDownload"))
            if browser_download:
                archive_name, archive_bytes = self._build_export_archive_bytes(payload)
                self._send_json(
                    {
                        "cancelled": False,
                        "fileName": archive_name,
                        "zipBase64": base64.b64encode(archive_bytes).decode("ascii"),
                    }
                )
                return

            project_path = Path(payload["projectPath"]).expanduser().resolve()
            if not project_path.exists() or not project_path.is_dir():
                raise FileNotFoundError(f"Pasta do projeto nao encontrada: {project_path}")

            suggested_name = self._sanitize_export_file_name(payload.get("fileName") or project_path.name or "UniPack")
            export_path = str(payload.get("exportPath") or "").strip()
            if export_path:
                selected_path = Path(export_path).expanduser().resolve()
            else:
                selected_path = self._pick_export_zip_path(project_path.parent, suggested_name)
                if selected_path is None:
                    self._send_json({"cancelled": True, "exportPath": ""})
                    return

            archive_path = export_project_zip(project_path, selected_path)
            self._send_json(
                {
                    "cancelled": False,
                    "exportPath": str(archive_path),
                    "fileName": archive_path.name,
                }
            )
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_import_project_zip(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            file_name = str(payload.get("fileName") or "").strip()
            zip_base64 = str(payload.get("zipBase64") or "").strip()
            if not file_name.lower().endswith(".zip"):
                raise ValueError("Selecione um arquivo .zip valido")
            if not zip_base64:
                raise ValueError("Arquivo .zip nao informado")

            imported_project_path = self._import_project_zip_bytes(base64.b64decode(zip_base64), file_name)
            project = parse_project(imported_project_path)
            self._send_json(
                {
                    "projectPath": str(imported_project_path),
                    "project": project,
                }
            )
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_get_sound(self, parsed) -> None:
        params = parse_qs(parsed.query)
        project_path = Path(params.get("path", [DEFAULT_PROJECT_PATH])[0]).expanduser().resolve()
        relative_file = unquote(params.get("file", [""])[0]).strip()
        if not relative_file:
            self.send_error(HTTPStatus.BAD_REQUEST, "Arquivo de som nao informado")
            return

        sounds_dir = self._detect_case_insensitive_path(project_path, "Sounds")
        if sounds_dir is None:
            self.send_error(HTTPStatus.NOT_FOUND, "Pasta Sounds nao encontrada")
            return

        requested = (sounds_dir / relative_file).resolve()
        try:
            requested.relative_to(sounds_dir.resolve())
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN, "Caminho de som invalido")
            return

        if not requested.exists() or not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Som nao encontrado")
            return

        mime_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        data = requested.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _handle_import_sound(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            project_path = Path(payload["projectPath"]).expanduser().resolve()
            file_name = str(payload["fileName"]).strip()
            audio_base64 = str(payload.get("audioBase64") or "").strip()
            source_audio_base64 = str(payload.get("sourceAudioBase64") or "").strip()
            source_file_name = str(payload.get("sourceFileName") or "").strip()
            source_mime_type = str(payload.get("sourceMimeType") or "").strip()
            selection_start = float(payload.get("selectionStart") or 0)
            selection_end = float(payload.get("selectionEnd") or 0)
            pad_key = str(payload.get("padKey") or "").strip()
            sound_index = max(0, int(payload.get("soundIndex") or 0))

            if not file_name:
                raise ValueError("Nome do arquivo nao informado")
            if not audio_base64 and not source_audio_base64:
                raise ValueError("Audio nao informado")

            sounds_dir = self._ensure_sounds_dir(project_path)
            relative_path = self._sanitize_relative_sound_path(file_name)
            target_file = self._resolve_available_sound_path(sounds_dir, relative_path)
            try:
                target_file.relative_to(sounds_dir.resolve())
            except ValueError as exc:
                raise ValueError("Nome de arquivo invalido") from exc

            target_file.parent.mkdir(parents=True, exist_ok=True)
            if source_audio_base64:
                clip_bytes = self._build_clip_bytes_from_source(
                    base64.b64decode(source_audio_base64),
                    source_file_name,
                    source_mime_type,
                    selection_start,
                    selection_end,
                )
                target_file.write_bytes(clip_bytes)
            else:
                target_file.write_bytes(base64.b64decode(audio_base64))
            imported_path = target_file.relative_to(sounds_dir).as_posix()
            if pad_key:
                project = parse_project(project_path)
                pad = self._ensure_project_pad(project, pad_key)
                while len(pad["sounds"]) <= sound_index:
                    pad["sounds"].append({"soundFile": "", "loop": 1, "wormhole": None})
                pad["sounds"][sound_index]["soundFile"] = imported_path
                project = save_project(project)
            else:
                project = parse_project(project_path)

            self._send_json(
                {
                    "importedFile": imported_path,
                    "sound": {
                        "path": imported_path,
                        "name": target_file.name,
                        "size": target_file.stat().st_size,
                    },
                    "padKey": pad_key,
                    "soundIndex": sound_index,
                    "project": project,
                }
            )
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_clip_sound(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            source_audio_base64 = str(payload.get("sourceAudioBase64") or "").strip()
            source_file_name = str(payload.get("sourceFileName") or "").strip()
            source_mime_type = str(payload.get("sourceMimeType") or "").strip()
            selection_start = float(payload.get("selectionStart") or 0)
            selection_end = float(payload.get("selectionEnd") or 0)

            if not source_audio_base64:
                raise ValueError("Audio de origem nao informado")

            clip_bytes = self._build_clip_bytes_from_source(
                base64.b64decode(source_audio_base64),
                source_file_name,
                source_mime_type,
                selection_start,
                selection_end,
            )
            self._send_json(
                {
                    "audioBase64": base64.b64encode(clip_bytes).decode("ascii"),
                    "size": len(clip_bytes),
                    "mimeType": "audio/wav",
                }
            )
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _send_json(self, payload, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    @staticmethod
    def _sanitize_export_file_name(value: str) -> str:
        cleaned = "".join(char if char.isalnum() or char in {" ", "_", "-"} else "_" for char in str(value or "").strip())
        cleaned = "_".join(part for part in cleaned.split() if part)
        cleaned = cleaned.strip("._ ")
        return f"{cleaned or 'UniPack'}.zip"

    @staticmethod
    def _sanitize_folder_name(value: str) -> str:
        cleaned = "".join(char if char.isalnum() or char in {" ", "_", "-"} else "_" for char in str(value or "").strip())
        cleaned = "_".join(part for part in cleaned.split() if part)
        return cleaned.strip("._ ") or "UniPack_Importado"

    @staticmethod
    def _pick_export_zip_path(initial_dir: Path, default_name: str) -> Path | None:
        target_dir = initial_dir if initial_dir.exists() else Path.home()
        apple_script = "\n".join(
            [
                f'set defaultLocation to POSIX file "{str(target_dir).replace(chr(34), chr(92) + chr(34))}"',
                f'set chosenFile to choose file name with prompt "Salvar projeto exportado" default location defaultLocation default name "{default_name.replace(chr(34), chr(92) + chr(34))}"',
                "POSIX path of chosenFile",
            ]
        )
        result = subprocess.run(
            ["osascript", "-e", apple_script],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            stderr = (result.stderr or "").strip().lower()
            if "user canceled" in stderr or "cancel" in stderr:
                return None
            raise RuntimeError(result.stderr.strip() or "Falha ao abrir seletor de destino")

        selected = (result.stdout or "").strip()
        if not selected:
            return None
        return Path(selected).expanduser().resolve()

    def _import_project_zip_bytes(self, zip_bytes: bytes, file_name: str) -> Path:
        if not zip_bytes:
            raise ValueError("O arquivo .zip enviado esta vazio")

        import_root = BASE_DIR / ".imported_projects"
        import_root.mkdir(parents=True, exist_ok=True)
        folder_prefix = f"{self._sanitize_folder_name(Path(file_name).stem)}_"
        extracted_root = Path(tempfile.mkdtemp(prefix=folder_prefix, dir=str(import_root)))

        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
                self._safe_extract_zip(archive, extracted_root)
        except zipfile.BadZipFile as exc:
            shutil.rmtree(extracted_root, ignore_errors=True)
            raise ValueError("O arquivo enviado nao e um .zip valido") from exc
        except Exception:
            shutil.rmtree(extracted_root, ignore_errors=True)
            raise

        project_root = self._detect_imported_project_root(extracted_root)
        if project_root is None:
            shutil.rmtree(extracted_root, ignore_errors=True)
            raise ValueError("Nao encontrei a estrutura de um projeto UniPad dentro desse .zip")
        return project_root

    def _safe_extract_zip(self, archive: zipfile.ZipFile, destination: Path) -> None:
        destination_resolved = destination.resolve()
        for member in archive.infolist():
            normalized_name = member.filename.replace("\\", "/").strip()
            if not normalized_name:
                continue

            member_path = PurePosixPath(normalized_name)
            safe_parts = [part for part in member_path.parts if part not in ("", ".", "..")]
            if not safe_parts:
                continue

            target_path = (destination / Path(*safe_parts)).resolve()
            try:
                target_path.relative_to(destination_resolved)
            except ValueError as exc:
                raise ValueError("O .zip contem caminhos invalidos") from exc

            if member.is_dir():
                target_path.mkdir(parents=True, exist_ok=True)
                continue

            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member, "r") as source_file, target_path.open("wb") as output_file:
                shutil.copyfileobj(source_file, output_file)

    def _detect_imported_project_root(self, extracted_root: Path) -> Path | None:
        candidates: list[tuple[int, int, Path]] = []
        directories = [extracted_root, *(path for path in extracted_root.rglob("*") if path.is_dir())]
        for directory in directories:
            marker_count = self._count_project_markers(directory)
            if marker_count <= 0:
                continue
            depth = len(directory.relative_to(extracted_root).parts)
            candidates.append((marker_count, -depth, directory))

        if not candidates:
            return None

        candidates.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
        return candidates[0][2]

    def _count_project_markers(self, root: Path) -> int:
        markers = ("Info", "keySound", "keyLED", "Sounds", "autoPlay")
        return sum(1 for marker in markers if self._detect_case_insensitive_path(root, marker) is not None)

    def _build_export_archive_bytes(self, payload: dict) -> tuple[str, bytes]:
        project_data = payload.get("projectData")
        project_path_value = str(payload.get("projectPath") or "").strip()
        suggested_name = self._sanitize_export_file_name(
            payload.get("fileName")
            or Path(project_path_value).name
            or "UniPack"
        )

        if project_data and isinstance(project_data, dict):
            return self._build_export_archive_bytes_from_project_data(project_data, payload, suggested_name)
        if project_path_value:
            return self._build_export_archive_bytes_from_project_path(project_path_value, suggested_name)
        raise ValueError("Projeto invalido para exportacao.")

    def _build_export_archive_bytes_from_project_path(self, project_path_value: str, suggested_name: str) -> tuple[str, bytes]:
        project_path = Path(project_path_value).expanduser().resolve()
        if not project_path.exists() or not project_path.is_dir():
            raise FileNotFoundError(f"Pasta do projeto nao encontrada: {project_path}")

        with tempfile.TemporaryDirectory(prefix="unipack_export_zip_") as temp_dir_name:
            temp_zip_path = Path(temp_dir_name) / suggested_name
            archive_path = export_project_zip(project_path, temp_zip_path)
            return archive_path.name, archive_path.read_bytes()

    def _build_export_archive_bytes_from_project_data(
        self,
        project_data: dict,
        payload: dict,
        suggested_name: str,
    ) -> tuple[str, bytes]:
        cloned_project = copy.deepcopy(project_data)
        sound_files = payload.get("soundFiles")
        if sound_files is not None and not isinstance(sound_files, list):
            raise ValueError("Lista de audios invalida para exportacao.")

        with tempfile.TemporaryDirectory(prefix="unipack_export_project_") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            project_root = temp_dir / Path(suggested_name).stem
            project_root.mkdir(parents=True, exist_ok=True)

            cloned_project["projectPath"] = str(project_root)
            cloned_project.setdefault(
                "casing",
                {
                    "info": "Info",
                    "keySound": "keySound",
                    "keyLED": "keyLED",
                    "sounds": "Sounds",
                    "autoPlay": "autoPlay",
                },
            )
            save_project(cloned_project)

            sounds_dir = self._ensure_sounds_dir(project_root)
            for sound_entry in sound_files or []:
                relative_path = self._sanitize_relative_sound_path(str(sound_entry.get("path") or ""))
                target_path = (sounds_dir / relative_path).resolve()
                try:
                    target_path.relative_to(sounds_dir.resolve())
                except ValueError as exc:
                    raise ValueError("Caminho de audio invalido na exportacao.") from exc
                target_path.parent.mkdir(parents=True, exist_ok=True)
                audio_base64 = str(sound_entry.get("audioBase64") or "").strip()
                if not audio_base64:
                    raise ValueError(f"Audio ausente para exportacao: {relative_path.as_posix()}")
                target_path.write_bytes(base64.b64decode(audio_base64))

            archive_path = export_project_zip(project_root, temp_dir / suggested_name)
            return archive_path.name, archive_path.read_bytes()

    def _build_clip_bytes_from_source(
        self,
        source_bytes: bytes,
        source_file_name: str,
        source_mime_type: str,
        selection_start: float,
        selection_end: float,
    ) -> bytes:
        start_time = max(0.0, float(selection_start))
        end_time = max(start_time, float(selection_end))
        if end_time <= start_time:
            raise ValueError("Intervalo de corte invalido")

        source_suffix = self._guess_audio_suffix(source_file_name, source_mime_type)
        with tempfile.TemporaryDirectory(prefix="unipack_clip_") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            source_path = temp_dir / f"source{source_suffix}"
            decoded_path = temp_dir / "decoded.wav"
            clip_path = temp_dir / "clip.wav"

            source_path.write_bytes(source_bytes)
            conversion = subprocess.run(
                [
                    "afconvert",
                    "-f",
                    "WAVE",
                    "-d",
                    "LEI16@44100",
                    "-c",
                    "2",
                    str(source_path),
                    str(decoded_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if conversion.returncode != 0 or not decoded_path.exists():
                raise RuntimeError(conversion.stderr.strip() or "Nao foi possivel preparar o audio para o corte")

            with wave.open(str(decoded_path), "rb") as decoded_audio:
                total_frames = decoded_audio.getnframes()
                if total_frames <= 0:
                    raise ValueError("O audio carregado nao possui amostras validas")

                frame_rate = decoded_audio.getframerate()
                start_frame = min(total_frames - 1, max(0, int(round(start_time * frame_rate))))
                end_frame = min(total_frames, max(start_frame + 1, int(round(end_time * frame_rate))))
                frame_count = max(1, end_frame - start_frame)

                decoded_audio.setpos(start_frame)
                frames = decoded_audio.readframes(frame_count)
                if not frames:
                    raise ValueError("Nao foi possivel ler o trecho selecionado")

                with wave.open(str(clip_path), "wb") as clip_audio:
                    clip_audio.setnchannels(decoded_audio.getnchannels())
                    clip_audio.setsampwidth(decoded_audio.getsampwidth())
                    clip_audio.setframerate(frame_rate)
                    clip_audio.writeframes(frames)

            return clip_path.read_bytes()

    @staticmethod
    def _guess_audio_suffix(source_file_name: str, source_mime_type: str) -> str:
        suffix = Path(source_file_name or "").suffix.strip()
        if suffix:
            return suffix

        mime = (source_mime_type or "").lower()
        mapping = {
            "audio/mpeg": ".mp3",
            "audio/mp3": ".mp3",
            "audio/wav": ".wav",
            "audio/x-wav": ".wav",
            "audio/wave": ".wav",
            "audio/mp4": ".m4a",
            "audio/x-m4a": ".m4a",
            "audio/aac": ".aac",
            "audio/aiff": ".aiff",
            "audio/x-aiff": ".aiff",
        }
        return mapping.get(mime, ".bin")

    @staticmethod
    def _detect_case_insensitive_path(root: Path, target_name: str) -> Path | None:
        lowered = target_name.lower()
        if not root.exists():
            return None
        for child in root.iterdir():
            if child.name.lower() == lowered:
                return child
        return None

    def _ensure_sounds_dir(self, project_path: Path) -> Path:
        sounds_dir = self._detect_case_insensitive_path(project_path, "Sounds")
        if sounds_dir is None:
            sounds_dir = project_path / "Sounds"
            sounds_dir.mkdir(parents=True, exist_ok=True)
        return sounds_dir

    @staticmethod
    def _resolve_available_sound_path(sounds_dir: Path, relative_path: Path) -> Path:
        candidate = (sounds_dir / relative_path).resolve()
        if not candidate.exists():
            return candidate

        suffix = relative_path.suffix or ".wav"
        stem = relative_path.stem
        parent = relative_path.parent
        counter = 1
        while True:
            next_relative = parent / f"{stem}_{counter:02d}{suffix}"
            candidate = (sounds_dir / next_relative).resolve()
            if not candidate.exists():
                return candidate
            counter += 1

    @staticmethod
    def _ensure_project_pad(project: dict, pad_key: str) -> dict:
        parts = pad_key.split(":")
        if len(parts) != 3:
            raise ValueError("Pad invalido para importar o corte")

        try:
            chain, x, y = (int(part) for part in parts)
        except ValueError as exc:
            raise ValueError("Pad invalido para importar o corte") from exc

        project.setdefault("pads", {})
        if pad_key not in project["pads"]:
            project["pads"][pad_key] = {
                "key": pad_key,
                "chain": chain,
                "x": x,
                "y": y,
                "sounds": [],
                "ledAnimations": [],
            }

        pad = project["pads"][pad_key]
        pad.setdefault("sounds", [])
        pad.setdefault("ledAnimations", [])
        return pad

    @staticmethod
    def _sanitize_relative_sound_path(file_name: str) -> Path:
        cleaned = file_name.replace("\\", "/").strip().lstrip("/")
        if not cleaned:
            raise ValueError("Nome do arquivo invalido")

        raw_path = Path(cleaned)
        parts = [part for part in raw_path.parts if part not in ("", ".", "..")]
        if not parts:
            raise ValueError("Nome do arquivo invalido")

        safe_name = Path(*parts)
        if not safe_name.suffix:
            safe_name = safe_name.with_suffix(".wav")
        return safe_name


def main() -> None:
    parser = argparse.ArgumentParser(description="Editor local para projetos UniPad")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8765")))
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), UniPackEditorHandler)
    print(f"Unipack Studio rodando em http://{args.host}:{args.port}")
    print(f"Pasta padrao do projeto: {DEFAULT_PROJECT_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
