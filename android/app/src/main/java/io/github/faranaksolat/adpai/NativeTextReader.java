package io.github.faranaksolat.adpai;

import android.graphics.Bitmap;
import android.graphics.Rect;
import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Bundled, on-device recognizers. No guessed characters or confidence. */
public final class NativeTextReader {
    private final Map<String, TextRecognizer> recognizers = new HashMap<>();

    public synchronized Task<Text> recognize(Bitmap bitmap, String script) {
        if (!script.equals("ko") && !script.equals("en")) throw new IllegalArgumentException("Unsupported script");
        TextRecognizer recognizer = recognizers.get(script);
        if (recognizer == null) {
            recognizer = script.equals("ko")
                ? com.google.mlkit.vision.text.TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build())
                : com.google.mlkit.vision.text.TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            recognizers.put(script, recognizer);
        }
        return recognizer.process(InputImage.fromBitmap(bitmap, 0));
    }

    public synchronized void close() {
        for (TextRecognizer recognizer : recognizers.values()) recognizer.close();
        recognizers.clear();
    }

    public static JSONObject result(Text text) throws JSONException {
        JSONArray items = new JSONArray();
        int blockId = 0, lineId = 0;
        for (Text.TextBlock block : text.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                for (Text.Element word : line.getElements()) {
                    JSONObject item = new JSONObject();
                    item.put("text", word.getText());
                    float confidence = word.getConfidence();
                    item.put("score", Float.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0);
                    item.put("confidence_scope", "native_word_uncalibrated");
                    item.put("lineId", lineId);
                    item.put("blockId", blockId);
                    Rect box = word.getBoundingBox();
                    if (box != null) item.put("box", new JSONObject().put("x0", box.left).put("y0", box.top).put("x1", box.right).put("y1", box.bottom));
                    items.put(item);
                }
                lineId++;
            }
            blockId++;
        }
        return new JSONObject().put("items", items).put("engine", "mlkit-bundled-16.0.1")
            .put("confidence_scope", "native_word_uncalibrated");
    }
}
