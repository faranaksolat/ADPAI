import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image
spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'tools/collect_menu_seed.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class CollectionTest(unittest.TestCase):
    def test_duplicate_and_invalid_image_are_not_training_data(self):
        buf=io.BytesIO(); Image.new('RGB',(8,8)).save(buf,format='JPEG')
        def fetch(url):
            if url.endswith('README.md'): return b'license: cc-by-4.0'
            if '_3.' in url: return b'<html>error</html>'
            return buf.getvalue()
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'new'
            result=m.collect(out,fetcher=fetch,count=3,pause=0)
            self.assertEqual(result['downloaded'],1)
            self.assertEqual(result['duplicate'],1)
            self.assertEqual(result['failed'],1)
            self.assertFalse(result['complete'])
            self.assertEqual(result['annotated'],0)
            with self.assertRaises(FileExistsError): m.collect(out,fetcher=fetch,count=1,pause=0)
if __name__=='__main__': unittest.main()
