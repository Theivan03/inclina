package com.ivancabrera.inclina;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MotionPlugin.class); // sensores nativos a alta frecuencia
        super.onCreate(savedInstanceState);
    }
}
