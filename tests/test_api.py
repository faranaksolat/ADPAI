import io
import unittest
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient
from backend.main import app, ocr_paths


def image_bytes():
    stream=io.BytesIO()
    Image.new("RGB",(20,20),"white").save(stream,format="PNG")
    return stream.getvalue()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)

    def test_health_and_real_frontend_modules(self):
        health=self.client.get('/api/health').json()
        self.assertFalse(health['automatic_negative_results'])
        self.assertNotIn('calorie_estimation',health)
        html=self.client.get('/').text
        self.assertIn('src/browser.js?v=1.11.0',html)
        for path in ['browser.js','tesseract.js','engine.js','ontology.js','image.js','pwa.js','ingredients.js','ingredient-glossary.js','crop.js','label-pattern.js','menu.js','ocr-worker.js','menu-image.js','menu-ocr.js']:
            response=self.client.get('/src/'+path)
            self.assertEqual(response.status_code,200,path)
        for path in ['/manifest.webmanifest','/sw.js','/privacy.html','/assets/icons/icon-192.png']:
            self.assertEqual(self.client.get(path).status_code,200,path)

    def test_bad_profiles_do_not_load_models(self):
        for profile in ['null','[]','{}','{"allergens":["unknown"]}','{"allergens":"milk"}']:
            with self.subTest(profile=profile), patch('backend.main.make_engine') as make:
                response=self.client.post('/api/analyze',data={'profile':profile},files={'images':('x.png',image_bytes(),'image/png')})
                self.assertEqual(response.status_code,422)
                make.assert_not_called()

    def test_invalid_image(self):
        response=self.client.post('/api/analyze',data={'profile':'{"allergens":["milk"]}'},files={'images':('x.png',b'not an image','image/png')})
        self.assertEqual(response.status_code,422)

    def test_oversized_upload(self):
        with patch('backend.main.MAX_UPLOAD_BYTES',8):
            response=self.client.post('/api/analyze',data={'profile':'{"allergens":["milk"]}'},files={'images':('x.png',image_bytes(),'image/png')})
        self.assertEqual(response.status_code,413)

    def test_inference_failure_is_not_http_success(self):
        with patch('backend.main.process_groups',side_effect=RuntimeError('model unavailable')):
            response=self.client.post('/api/analyze',data={'profile':'{"allergens":["milk"]}'},files={'images':('x.png',image_bytes(),'image/png')})
        self.assertEqual(response.status_code,503)

    def test_unavailable_models_are_not_a_successful_analysis(self):
        with patch('backend.main.make_engine',side_effect=RuntimeError('model unavailable')):
            response=self.client.post('/api/analyze',data={'profile':'{"allergens":["milk"]}'},files={'images':('x.png',image_bytes(),'image/png')})
        self.assertEqual(response.status_code,503)

    def test_request_uses_real_semantics_with_controlled_ocr(self):
        class Engine:
            def predict(self,input):
                if not input.endswith('.png'):
                    raise AssertionError('Paddle requires a supported image extension')
                with Image.open(input) as image:
                    if image.format != 'PNG':
                        raise AssertionError('Uploaded content must be decoded and normalized')
                yield {'rec_texts':['INGREDIENTS: roasted peanuts, sugar'],'rec_scores':[.95]}
        with patch('backend.main.make_engine',return_value=Engine()):
            response=self.client.post('/api/analyze',data={'profile':'{"allergens":["peanut"]}'},files={'images':('x.png',image_bytes(),'image/png')})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['products'][0]['status'],'conflict')
        self.assertNotIn('calories',response.json()['products'][0])
        self.assertNotIn('total_package_kcal',response.json()['summary'])

    def test_weak_terms_and_missing_scores_are_retained(self):
        class Engine:
            def predict(self,input):
                yield {'rec_texts':['milk','peanut'],'rec_scores':[.2]}
        items=ocr_paths(Engine(),['image'])
        self.assertEqual([x['score'] for x in items],[.2,0])
        self.assertEqual([x['text'] for x in items],['milk','peanut'])


if __name__ == '__main__':
    unittest.main()
