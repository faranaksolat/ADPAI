package io.github.faranaksolat.adpai;

import static org.junit.Assert.*;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.text.Text;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.Assume;
import org.junit.runner.RunWith;

/** Optional real-engine diagnostic. Corpus is private app data, never APK assets. */
@RunWith(AndroidJUnit4.class)
public class RecognitionCorpusTest {
    @Test public void readSuppliedFrozenImages() throws Exception {
        Assume.assumeTrue("Use the explicit local corpus driver", "true".equals(InstrumentationRegistry.getArguments().getString("adpaiCorpus")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File root = new File(context.getFilesDir(), "recognition-corpus");
        JSONArray manifest = new JSONArray(new String(Files.readAllBytes(new File(root, "manifest.json").toPath()), StandardCharsets.UTF_8));
        assertTrue("No zero-capture pass", manifest.length() > 0);
        NativeTextReader reader = new NativeTextReader();
        StringBuilder output = new StringBuilder();
        int completedReads = 0;
        try {
            for (int i = 0; i < manifest.length(); i++) {
                JSONObject row = manifest.getJSONObject(i);
                String filename = row.getString("file");
                assertTrue(filename.matches("[a-zA-Z0-9_-]+\\.(png|jpg|jpeg)"));
                byte[] bytes = Files.readAllBytes(new File(root, filename).toPath());
                StringBuilder digest = new StringBuilder();
                for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) digest.append(String.format("%02x", b & 255));
                assertEquals(row.getString("sha256"), digest.toString());
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                assertNotNull(bitmap);
                JSONObject prediction = new JSONObject().put("capture_id", row.getString("capture_id"))
                    .put("image_sha256", digest.toString()).put("sources", new JSONArray());
                long started = System.nanoTime();
                boolean pending = false;
                try {
                    for (String script : new String[]{"ko", "en"}) {
                        Task<Text> task = reader.recognize(bitmap, script);
                        try {
                            JSONObject result = NativeTextReader.result(Tasks.await(task, 60, TimeUnit.SECONDS));
                            completedReads++;
                            prediction.getJSONArray("sources").put(result.put("familyId", "korean").put("photoIndex", 0)
                                .put("rotation", 0).put("variant", "native-original").put("model_languages", new JSONArray().put(script)));
                        } catch (Exception error) {
                            prediction.put("error", error.getClass().getSimpleName() + ": " + error.getMessage());
                            if (error instanceof TimeoutException) {
                                final Bitmap held = bitmap;
                                task.addOnCompleteListener(done -> held.recycle());
                                pending = true; break;
                            }
                        }
                    }
                } finally { if (!pending) bitmap.recycle(); }
                prediction.put("emulator_latency_ms", (System.nanoTime() - started) / 1_000_000.0);
                output.append(prediction).append('\n');
                // Preserve completed cases even if a later native model fails.
                Files.write(new File(root, "predictions.jsonl").toPath(), output.toString().getBytes(StandardCharsets.UTF_8));
            }
        } finally { reader.close(); }
        assertTrue("No native recognition task completed", completedReads > 0);
    }
}
