import importlib.util
import unittest
from pathlib import Path


RUTA = Path(__file__).with_name("demo_produccion_videos_reales.py")


class VideosRealesDemoTests(unittest.TestCase):
    def modulo(self):
        spec = importlib.util.spec_from_file_location("demo_produccion_videos_reales", RUTA)
        modulo = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(modulo)
        return modulo

    def test_acepta_solo_licencias_reutilizables(self):
        modulo = self.modulo()
        for licencia in ("CC0", "Public domain", "CC BY 4.0", "CC BY-SA 3.0"):
            self.assertTrue(modulo.licencia_permitida(licencia), licencia)
        for licencia in ("", "All rights reserved", "CC BY-NC 4.0", "CC BY-ND 2.0"):
            self.assertFalse(modulo.licencia_permitida(licencia), licencia)

    def test_selecciona_20_archivos_reales_unicos_y_aptos(self):
        modulo = self.modulo()
        candidatos = [
            {"title": f"File:Gallina {i}.webm", "url": f"https://example.test/{i}.webm",
             "mime": "video/webm", "size": 1_000_000, "license": "CC BY-SA 4.0"}
            for i in range(22)
        ]
        candidatos += [
            dict(candidatos[0]),
            {"title": "File:Sin licencia.webm", "url": "https://example.test/x.webm",
             "mime": "video/webm", "size": 1_000, "license": ""},
            {"title": "File:Muy grande.webm", "url": "https://example.test/y.webm",
             "mime": "video/webm", "size": 90_000_000, "license": "CC0"},
        ]
        seleccion = modulo.seleccionar_candidatos(candidatos, 20)
        self.assertEqual(20, len(seleccion))
        self.assertEqual(20, len({x["title"] for x in seleccion}))
        self.assertEqual(20, len({x["url"] for x in seleccion}))

    def test_texto_incluye_creditos_y_no_supera_limite(self):
        modulo = self.modulo()
        meta = {
            "title": "File:A mother hen with chicks.webm",
            "source": "https://commons.wikimedia.org/?curid=123",
            "author": "NairobiPapel",
            "license": "CC BY-SA 4.0",
        }
        texto = modulo.texto_publicacion(0, meta)
        self.assertIn("VIDEO REAL", texto)
        self.assertIn("NairobiPapel", texto)
        self.assertIn("CC BY-SA 4.0", texto)
        self.assertIn(meta["source"], texto)
        self.assertLessEqual(len(texto), 600)

    def test_lista_no_contiene_material_sensible_y_tiene_respaldo(self):
        modulo = self.modulo()
        self.assertGreaterEqual(len(modulo.TITULOS_PREFERIDOS), 24)
        nombres = " ".join(modulo.TITULOS_PREFERIDOS).lower()
        for termino in ("slaughter", "fight", "cockfighting", "dead", "injured"):
            self.assertNotIn(termino, nombres)

    def test_habilita_lectura_del_temporal_copiado_a_docker(self):
        fuente = RUTA.read_text(encoding="utf-8")
        copia = fuente.index('["docker", "cp", str(origen), f"{CONTAINER}:{entrada}"]')
        permiso = fuente.index('["docker", "exec", "-u", "0", CONTAINER, "chmod", "644", entrada]')
        ffmpeg = fuente.index('"docker", "exec", CONTAINER, "ffmpeg"')
        self.assertLess(copia, permiso)
        self.assertLess(permiso, ffmpeg)


if __name__ == "__main__":
    unittest.main()
