from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import zipfile

from unipack_format import create_empty_project, export_project_zip, parse_project, save_project


ROOT = Path(__file__).resolve().parent.parent
SOURCE_PROJECT = ROOT


class UniPackFormatTest(unittest.TestCase):
    def test_parse_current_project(self) -> None:
        project = parse_project(SOURCE_PROJECT)

        self.assertEqual(project["info"]["title"], "Alan Walker - The Spectre")
        self.assertEqual(int(project["info"]["buttonX"]), 8)
        self.assertEqual(int(project["info"]["chain"]), 8)
        self.assertGreater(len(project["sounds"]), 300)
        self.assertGreater(len(project["pads"]), 200)
        self.assertGreater(len(project["autoPlay"]), 100)

        pad = project["pads"]["3:4:5"]
        self.assertEqual(len(pad["sounds"]), 12)
        self.assertEqual(len(pad["ledAnimations"]), 2)

    def test_roundtrip_save(self) -> None:
        project = parse_project(SOURCE_PROJECT)

        with tempfile.TemporaryDirectory() as tmpdir:
          target = Path(tmpdir) / "roundtrip"
          target.mkdir(parents=True, exist_ok=True)

          sounds_target = target / "Sounds"
          sounds_target.mkdir(parents=True, exist_ok=True)
          for sound in project["sounds"][:4]:
              source_file = SOURCE_PROJECT / project["casing"]["sounds"] / sound["path"]
              dest_file = sounds_target / sound["path"]
              dest_file.parent.mkdir(parents=True, exist_ok=True)
              dest_file.write_bytes(source_file.read_bytes())

          project["projectPath"] = str(target)
          project["sounds"] = project["sounds"][:4]

          saved = save_project(project)
          self.assertEqual(saved["info"]["title"], project["info"]["title"])
          self.assertTrue((target / "Info").exists())
          self.assertTrue((target / "keySound").exists())
          self.assertTrue((target / "keyLED").exists())
          self.assertTrue((target / "autoPlay").exists())

    def test_create_empty_project(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / "novo_pack"
            created = create_empty_project(
                target,
                folder_name="Meu_Pack",
                title="Meu Pack",
                producer_name="Tester",
                button_x=8,
                button_y=8,
                chain_count=4,
            )

            self.assertEqual(created["info"]["title"], "Meu Pack")
            self.assertEqual(created["info"]["producerName"], "Tester")
            self.assertEqual(created["info"]["buttonX"], "8")
            self.assertEqual(created["info"]["buttonY"], "8")
            self.assertEqual(created["info"]["chain"], "4")
            project_root = target / "Meu_Pack"
            self.assertEqual(Path(created["projectPath"]), project_root.resolve())
            self.assertTrue((project_root / "Info").exists())
            self.assertTrue((project_root / "keySound").exists())
            self.assertTrue((project_root / "keyLED").is_dir())
            self.assertTrue((project_root / "Sounds").is_dir())
            self.assertTrue((project_root / "autoPlay").exists())

    def test_create_empty_project_in_selected_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / "projeto_escolhido"
            created = create_empty_project(target, title="Projeto Escolhido")

            self.assertEqual(Path(created["projectPath"]), target.resolve())
            self.assertTrue((target / "Info").exists())
            self.assertTrue((target / "keySound").exists())
            self.assertTrue((target / "keyLED").is_dir())
            self.assertTrue((target / "Sounds").is_dir())
            self.assertTrue((target / "autoPlay").exists())

    def test_export_project_zip_matches_unipack_root_structure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            project_root = base / "Meu_Pack"
            created = create_empty_project(project_root, title="Meu Pack Exportado")

            sound_path = project_root / "Sounds" / "01.wav"
            sound_path.write_bytes(b"RIFFtest")
            (project_root / ".DS_Store").write_bytes(b"ignored")
            save_project(created)

            archive_path = export_project_zip(project_root, base / "exports" / "Meu_Pack.zip")

            self.assertTrue(archive_path.exists())
            self.assertEqual(archive_path.suffix.lower(), ".zip")
            with zipfile.ZipFile(archive_path, "r") as archive:
                names = set(archive.namelist())
                info_entry = archive.getinfo("Info")
                sound_entry = archive.getinfo("Sounds/01.wav")

            self.assertIn("Info", names)
            self.assertIn("keySound", names)
            self.assertIn("keyLED/", names)
            self.assertIn("Sounds/01.wav", names)
            self.assertIn("autoPlay", names)
            self.assertNotIn(".DS_Store", names)
            self.assertEqual(info_entry.compress_type, zipfile.ZIP_STORED)
            self.assertEqual(sound_entry.compress_type, zipfile.ZIP_STORED)


if __name__ == "__main__":
    unittest.main()
