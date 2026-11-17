import importlib.util
import unittest
from pathlib import Path


RUTA = Path(__file__).with_name("demo_produccion_videos.py")


class VideosDemoTests(unittest.TestCase):
    def modulo(self):
        spec = importlib.util.spec_from_file_location("demo_produccion_videos", RUTA)
        modulo = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(modulo)
        return modulo

    def test_el_video_vertical_rellena_sin_recortar_la_foto(self):
        filtro = self.modulo().filtro_vertical()
        self.assertIn("scale=720:1280:force_original_aspect_ratio=increase", filtro)
        self.assertIn("crop=720:1280", filtro)
        self.assertIn("boxblur=24:2", filtro)
        self.assertIn("force_original_aspect_ratio=decrease", filtro)
        self.assertIn("overlay=(W-w)/2:(H-h)/2", filtro)

    def test_cada_texto_identifica_el_contenido_ficticio(self):
        modulo = self.modulo()
        uno = modulo.texto_video(0, "Demo 01 - Granja Alba", "Brahma")
        dos = modulo.texto_video(1, "Demo 02 - Granja Pradera", "Sedosa")
        self.assertIn("DEMOSTRACIÓN", uno)
        self.assertIn("#VideoDemo", uno)
        self.assertNotEqual(uno, dos)

    def test_ffmpeg_usa_filtro_complejo_y_limpia_como_root(self):
        fuente = RUTA.read_text(encoding="utf-8")
        self.assertIn('"-filter_complex", filtro_vertical()', fuente)
        self.assertIn('["docker", "exec", "-u", "0", CONTAINER, "rm"', fuente)


if __name__ == "__main__":
    unittest.main()
