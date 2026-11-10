import importlib.util
from io import BytesIO
from pathlib import Path
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('variants', Path(__file__).resolve().parents[1] / 'scripts' / 'generate_image_variants.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VariantTests(unittest.TestCase):
    def test_generates_sizes_without_upscaling_and_can_resume(self):
        image = Image.new('RGB', (1200, 600), 'white')
        results = list(module.variants_for(image, {480}))
        self.assertEqual([(w, h) for w, h, _ in results], [(480, None), (960, 480), (1200, 600)])
        for width, height, data in results[1:]:
            with Image.open(BytesIO(data)) as out:
                self.assertEqual(out.format, 'WEBP')
                self.assertEqual(out.size, (width, height))

    def test_small_image_has_one_variant(self):
        self.assertEqual([x[0] for x in module.variants_for(Image.new('RGB', (100, 50)))], [100])


if __name__ == '__main__':
    unittest.main()
