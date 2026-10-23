package com.ivancabrera.inclina;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lectura nativa del giróscopo y el acelerómetro a alta frecuencia (hasta 200 muestras/s),
 * en vez de los eventos devicemotion del WebView, que van a 60 o menos.
 *
 * Las muestras se agrupan y se envían a la web cada ~20 ms en un evento "batch":
 *   { samples: [[ax, ay, az, gx, gy, gz, tMs], ...], hz: <muestras/s reales> }
 * Ejes y unidades como en Chrome Android: aceleración con gravedad en m/s² (z = +9,81 con la
 * pantalla hacia arriba) y giro en °/s sobre x, y, z con la regla de la mano derecha.
 */
@CapacitorPlugin(name = "Motion")
public class MotionPlugin extends Plugin implements SensorEventListener {

    private static final float RAD2DEG = 57.29578f;

    private SensorManager sensorManager;
    private Sensor gyroscope;
    private Sensor accelerometer;
    private HandlerThread thread;
    private Handler handler;
    private boolean running = false;
    private boolean wantRunning = false;
    private int periodUs = 5000; // 200 Hz como objetivo; Android lo trata como sugerencia

    private final float[] lastAcc = new float[3];
    private boolean haveAcc = false;
    private JSONArray batch = new JSONArray();
    private long batchStartedNs = 0;
    private int countInWindow = 0;
    private long windowStartNs = 0;
    private double measuredHz = 0;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("gyro", gyroscope != null);
        r.put("accel", accelerometer != null);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Integer hzArg = call.getInt("hz", 200);
        int hz = hzArg == null ? 200 : hzArg;
        if (hz < 20) hz = 20;
        if (hz > 500) hz = 500;
        periodUs = 1000000 / hz;
        wantRunning = true;
        register();
        JSObject r = new JSObject();
        r.put("gyro", gyroscope != null);
        r.put("accel", accelerometer != null);
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        wantRunning = false;
        unregister();
        call.resolve();
    }

    private synchronized void register() {
        if (running || sensorManager == null || accelerometer == null) return;
        if (thread == null) {
            thread = new HandlerThread("inclina-sensors");
            thread.start();
            handler = new Handler(thread.getLooper());
        }
        haveAcc = false;
        batch = new JSONArray();
        countInWindow = 0;
        windowStartNs = 0;
        sensorManager.registerListener(this, accelerometer, periodUs, handler);
        if (gyroscope != null) sensorManager.registerListener(this, gyroscope, periodUs, handler);
        running = true;
    }

    private synchronized void unregister() {
        if (!running) return;
        sensorManager.unregisterListener(this);
        running = false;
    }

    @Override
    protected void handleOnPause() {
        unregister();
    }

    @Override
    protected void handleOnResume() {
        if (wantRunning) register();
    }

    @Override
    protected void handleOnDestroy() {
        wantRunning = false;
        unregister();
        if (thread != null) {
            thread.quitSafely();
            thread = null;
            handler = null;
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            lastAcc[0] = event.values[0];
            lastAcc[1] = event.values[1];
            lastAcc[2] = event.values[2];
            haveAcc = true;
            if (gyroscope != null) return; // con giróscopo, la muestra la marca el giróscopo
            push(event.timestamp, lastAcc, null);
            return;
        }
        if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {
            if (!haveAcc) return;
            push(event.timestamp, lastAcc, event.values);
        }
    }

    private void push(long tNs, float[] acc, float[] gyro) {
        JSONArray s = new JSONArray();
        try {
            s.put((double) acc[0]);
            s.put((double) acc[1]);
            s.put((double) acc[2]);
            if (gyro != null) {
                s.put((double) (gyro[0] * RAD2DEG));
                s.put((double) (gyro[1] * RAD2DEG));
                s.put((double) (gyro[2] * RAD2DEG));
            } else {
                s.put(JSONObject.NULL);
                s.put(JSONObject.NULL);
                s.put(JSONObject.NULL);
            }
            s.put(tNs / 1000000.0);
        } catch (Exception e) {
            return;
        }
        synchronized (this) {
            batch.put(s);
            if (batchStartedNs == 0) batchStartedNs = tNs;
            countInWindow++;
            if (windowStartNs == 0) windowStartNs = tNs;
            else if (tNs - windowStartNs >= 1000000000L) {
                measuredHz = countInWindow * 1e9 / (tNs - windowStartNs);
                countInWindow = 0;
                windowStartNs = tNs;
            }
            if (tNs - batchStartedNs < 20000000L) return; // agrupa 20 ms
            JSONArray out = batch;
            batch = new JSONArray();
            batchStartedNs = 0;
            JSObject data = new JSObject();
            data.put("samples", out);
            data.put("hz", measuredHz);
            notifyListeners("batch", data);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
