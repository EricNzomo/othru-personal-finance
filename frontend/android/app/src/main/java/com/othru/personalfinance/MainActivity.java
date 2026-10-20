package com.othru.personalfinance;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();

        webView.getSettings().setMixedContentMode(
            WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        );
    }
}