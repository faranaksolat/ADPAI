package io.github.faranaksolat.adpai;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "AdpaiText")
public final class AdpaiTextPlugin extends Plugin {
    private final NativeTextReader reader = new NativeTextReader();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final Handler handler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void recognize(PluginCall call) {
        String data = call.getString("base64", ""), script = call.getString("script", "");
        if (data.isEmpty() || data.length() > 32_000_000 || (!script.equals("ko") && !script.equals("en"))) {
            call.reject("Invalid image or script"); return;
        }
        if (!busy.compareAndSet(false, true)) { call.reject("Native reader is busy"); return; }
        AtomicBoolean settled = new AtomicBoolean(false);
        Runnable deadline = () -> { if (settled.compareAndSet(false, true)) call.reject("Native OCR deadline reached"); };
        handler.postDelayed(deadline, 45000);
        executor.execute(() -> {
            Bitmap bitmap = null;
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth < 1 || bounds.outHeight < 1 || (long) bounds.outWidth * bounds.outHeight > 12_000_000)
                    throw new IllegalArgumentException("Image dimensions unsupported");
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) throw new IllegalArgumentException("Image could not be decoded");
                final Bitmap image = bitmap;
                reader.recognize(image, script).addOnCompleteListener(task -> {
                    try {
                        if (settled.compareAndSet(false, true)) {
                            if (task.isSuccessful()) call.resolve(JSObject.fromJSONObject(NativeTextReader.result(task.getResult())));
                            else call.reject("Native text recognition failed");
                        }
                    } catch (Exception error) { call.reject("Native result could not be decoded"); }
                    finally { handler.removeCallbacks(deadline); image.recycle(); busy.set(false); }
                });
            } catch (Exception | OutOfMemoryError error) {
                if (bitmap != null) bitmap.recycle();
                handler.removeCallbacks(deadline); busy.set(false);
                if (settled.compareAndSet(false, true)) call.reject("Native image processing failed");
            }
        });
    }

    @Override protected void handleOnDestroy() { executor.shutdown(); reader.close(); }
}
