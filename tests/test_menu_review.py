import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1]/'benchmarks'/filename)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


review = module('menu_review', 'export-menu-review.py')
collect = module('menu_cached', 'collect-menus.py')


class ReviewPacketTests(unittest.TestCase):
    def fixture(self, root):
        stream = io.BytesIO(); Image.new('RGB',(20,20),'white').save(stream,'PNG')
        data = stream.getvalue(); (root/'image.png').write_bytes(data)
        row = {'capture_id':'example-one','images':[{'path':'image.png','sha256':hashlib.sha256(data).hexdigest(),'source_url':'https://commons.wikimedia.org/example','license':'CC BY-SA 4.0','attribution':'fixture author'}],
               'reference_text':'DO NOT COPY MODEL TRANSCRIPT','entries':[{'name':'MODEL ANSWER','positive_allergens':['milk']}]}
        source = root/'input.jsonl'; source.write_text(json.dumps(row)+'\n')
        return source, row

    def test_blank_independent_packets_never_import_model_hints_or_fake_reviews(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source,row=self.fixture(root); output=root/'packet'
            status=review.export([source],output)
            self.assertEqual(status['completed_human_reviewers'],0)
            self.assertEqual(status['train_records'],0)
            for name in ['reviewer-A','reviewer-B']:
                text=(output/name/'references-UNREVIEWED.jsonl').read_text(); blank=json.loads(text)
                self.assertNotIn('MODEL ANSWER',text); self.assertNotIn('DO NOT COPY',text)
                self.assertEqual(blank['annotation']['status'],'unreviewed');self.assertEqual(blank['annotation']['reviewer_id'],'')
                self.assertEqual(blank['images'][0]['transcript'],'');self.assertIsNone(blank['entries'])
                self.assertEqual(blank['split'],'unassigned')
            with self.assertRaises(FileExistsError):review.export([source],output)

    def test_integrity_paths_and_unsafe_source_links_are_rejected_before_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source,row=self.fixture(root)
            row['images'][0]['source_url']='javascript:bad';source.write_text(json.dumps(row)+'\n')
            with self.assertRaises(ValueError):review.export([source],root/'no-output')
            self.assertFalse((root/'no-output').exists())
            row['images'][0]['source_url']='https://example.org/menu';row['images'][0]['sha256']='0'*64;source.write_text(json.dumps(row)+'\n')
            with self.assertRaises(ValueError):review.export([source],root/'no-output')

    def test_cached_discovery_does_not_repeat_search_or_forge_references(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);stream=io.BytesIO();Image.new('RGB',(20,20)).save(stream,'PNG');image=stream.getvalue()
            page={'pageid':123,'title':'File:Fixture menu.png','imageinfo':[{'url':'https://upload.wikimedia.org/fixture.png','descriptionurl':'https://commons.wikimedia.org/wiki/File:Fixture.png','mime':'image/png','size':len(image),'extmetadata':{key:{'value':value} for key,value in {'LicenseUrl':'https://creativecommons.org/licenses/by-sa/4.0/','LicenseShortName':'CC BY-SA 4.0','Artist':'fixture author'}.items()}}]}
            cache=root/'cached.json';cache.write_text(json.dumps({'query':{'pages':{'123':page}}}));calls=[]
            def fetch(url):calls.append(url);return image
            result=collect.collect(root/'new',5,getter=fetch,delay=0,discovery_files=[cache,cache],include_ids={123})
            self.assertEqual(calls,['https://upload.wikimedia.org/fixture.png'])
            self.assertEqual(result['queries'],[]);self.assertEqual(result['downloaded_original_images'],1)
            self.assertEqual(result['scored_real_menus'],0);self.assertEqual(result['independently_reviewed_references'],0)


if __name__=='__main__':unittest.main()
