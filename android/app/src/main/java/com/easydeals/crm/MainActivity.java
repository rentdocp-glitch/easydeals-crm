package com.easydeals.crm;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.CallLog;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.TimeZone;

/**
 * EasyDeals CRM Android app.
 * - Shows the CRM website full screen (WebView).
 * - Reads the phone call log and sends ONLY calls whose number matches a CRM lead
 *   to the CRM (table device_calls). Other calls (family, friends, ...) never leave the phone.
 */
public class MainActivity extends Activity {
    static final String HOME = "https://rentdocp-glitch.github.io/easydeals-crm/";
    static final String SB = "https://sfvpslsexobukgerkixi.supabase.co";
    static final String KEY = "sb_publishable_YckWE6w7_PM9Q8ysBM-XFg_KBQwYDEa";
    static final String GRAB_JS = "(function(){try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);"
            + "if(k.indexOf('sb-')===0&&k.indexOf('-auth-token')>0&&k.indexOf('code-verifier')<0){return localStorage.getItem(k)||''}}}catch(e){}return ''})()";

    WebView wv;
    final Handler h = new Handler(Looper.getMainLooper());
    ValueCallback<Uri[]> fileCb;
    volatile boolean busy;
    long lastSync;
    long lastLeads;
    HashMap<String, ArrayList<Long>> byPhone = new HashMap<String, ArrayList<Long>>();

    final Runnable tick = new Runnable() {
        public void run() {
            grab();
            h.postDelayed(this, 20000);
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        wv = new WebView(this);
        setContentView(wv);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " EasyDealsApp");
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.startsWith("https://rentdocp-glitch.github.io/") || u.startsWith(SB)) return false;
                try {
                    startActivity(new Intent(u.startsWith("tel:") ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, Uri.parse(u)));
                } catch (Exception e) {
                    // no app to open this link
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                h.postDelayed(new Runnable() {
                    public void run() {
                        grab();
                    }
                }, 3000);
            }
        });
        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    startActivityForResult(p.createIntent(), 9);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });
        wv.loadUrl(HOME);
        askPermissions();
    }

    @Override
    protected void onResume() {
        super.onResume();
        h.removeCallbacks(tick);
        h.postDelayed(tick, 3000);
    }

    @Override
    protected void onPause() {
        super.onPause();
        h.removeCallbacks(tick);
    }

    @Override
    public void onBackPressed() {
        if (wv != null && wv.canGoBack()) wv.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == 9 && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
        } else {
            super.onActivityResult(req, res, data);
        }
    }

    void askPermissions() {
        ArrayList<String> need = new ArrayList<String>();
        need.add(Manifest.permission.READ_CALL_LOG);
        need.add(Manifest.permission.READ_PHONE_STATE);
        if (android.os.Build.VERSION.SDK_INT >= 33) need.add("android.permission.POST_NOTIFICATIONS");
        ArrayList<String> ask = new ArrayList<String>();
        for (String p : need) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) ask.add(p);
        if (!ask.isEmpty()) requestPermissions(ask.toArray(new String[0]), 7);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] grants) {
        if (req == 7) {
            boolean log = true, phone = true;
            for (int i = 0; i < perms.length && i < grants.length; i++) {
                boolean ok = grants[i] == PackageManager.PERMISSION_GRANTED;
                if (Manifest.permission.READ_CALL_LOG.equals(perms[i])) log = ok;
                if (Manifest.permission.READ_PHONE_STATE.equals(perms[i])) phone = ok;
            }
            if (log && phone) {
                toast("Done. Call aate hi CRM batayega ki number kiska hai.");
                lastSync = 0;
            } else {
                toast("Call log / Phone permission nahi mili. Phone Settings > Apps > EasyDeals CRM > Permissions mein Allow karo.");
            }
        }
    }

    void toast(final String m) {
        runOnUiThread(new Runnable() {
            public void run() {
                Toast.makeText(MainActivity.this, m, Toast.LENGTH_LONG).show();
            }
        });
    }

    // ---------- session from the CRM page ----------
    void grab() {
        if (wv == null) return;
        wv.evaluateJavascript(GRAB_JS, new ValueCallback<String>() {
            public void onReceiveValue(String v) {
                if (v != null) onSession(v);
            }
        });
    }

    void onSession(String raw) {
        try {
            Object o = new JSONTokener(raw).nextValue();
            if (!(o instanceof String) || ((String) o).isEmpty()) return;
            JSONObject j = new JSONObject((String) o);
            String at = j.optString("access_token");
            long exp = j.optLong("expires_at");
            JSONObject u = j.optJSONObject("user");
            String uid = u != null ? u.optString("id") : "";
            if (at.isEmpty() || uid.isEmpty() || exp * 1000 < System.currentTimeMillis() + 60000) return;
            ensureDevice(at, uid);
            startSync(at, uid);
        } catch (Exception e) {
            // ignore, try again on next tick
        }
    }

    volatile boolean regBusy;

    // one secret key per phone + user, used by CallReceiver for caller ID
    void ensureDevice(final String at, final String uid) {
        final SharedPreferences sp = getSharedPreferences("cid", 0);
        if (regBusy || (!sp.getString("key", "").isEmpty() && uid.equals(sp.getString("uid", "")))) return;
        regBusy = true;
        new Thread(new Runnable() {
            public void run() {
                try {
                    String r = http("POST", SB + "/rest/v1/rpc/register_device", "{}", at, null).trim();
                    if (r.startsWith("\"")) r = r.substring(1, r.length() - 1);
                    if (r.length() >= 32) sp.edit().putString("key", r).putString("uid", uid).apply();
                } catch (Exception e) {
                    // try again on next tick
                } finally {
                    regBusy = false;
                }
            }
        }).start();
    }

    void startSync(final String at, final String uid) {
        long now = System.currentTimeMillis();
        if (busy || now - lastSync < 60000) return;
        if (checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) return;
        busy = true;
        new Thread(new Runnable() {
            public void run() {
                try {
                    int n = sync(at, uid);
                    lastSync = System.currentTimeMillis();
                    if (n > 0) toast("📱 " + n + " new call(s) added to CRM");
                } catch (Exception e) {
                    lastSync = System.currentTimeMillis() - 30000; // retry in ~30 sec
                } finally {
                    busy = false;
                }
            }
        }).start();
    }

    // ---------- call log -> CRM ----------
    static String last10(String s) {
        if (s == null) return "";
        StringBuilder d = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '0' && c <= '9') d.append(c);
        }
        String t = d.toString();
        return t.length() > 10 ? t.substring(t.length() - 10) : t;
    }

    int sync(String at, String uid) throws Exception {
        long now = System.currentTimeMillis();
        if (byPhone.isEmpty() || now - lastLeads > 600000) {
            HashMap<String, ArrayList<Long>> m = new HashMap<String, ArrayList<Long>>();
            for (int off = 0; ; off += 1000) {
                JSONArray a = new JSONArray(http("GET", SB + "/rest/v1/leads?select=id,phone&order=id&limit=1000&offset=" + off, null, at, null));
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    String p = last10(o.optString("phone"));
                    if (p.length() < 10) continue;
                    ArrayList<Long> l = m.get(p);
                    if (l == null) {
                        l = new ArrayList<Long>();
                        m.put(p, l);
                    }
                    l.add(o.getLong("id"));
                }
                if (a.length() < 1000) break;
            }
            byPhone = m;
            lastLeads = now;
        }

        SharedPreferences sp = getSharedPreferences("sync", 0);
        long stored = sp.getLong("since_" + uid, 0);
        long since = stored == 0 ? now - 30L * 86400000L : stored - 6L * 3600000L;

        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));

        JSONArray rows = new JSONArray();
        long maxD = stored;
        int fresh = 0;
        Cursor c = getContentResolver().query(CallLog.Calls.CONTENT_URI,
                new String[]{CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DURATION, CallLog.Calls.DATE},
                CallLog.Calls.DATE + ">?", new String[]{String.valueOf(since)}, CallLog.Calls.DATE + " ASC");
        try {
            while (c != null && c.moveToNext()) {
                String num = last10(c.getString(0));
                int type = c.getInt(1);
                long dur = c.getLong(2);
                long date = c.getLong(3);
                if (date > maxD) maxD = date;
                if (num.length() < 10) continue;
                ArrayList<Long> ids = byPhone.get(num);
                if (ids == null) continue; // not a CRM lead: never sent
                String dir;
                if (type == 1 || type == 7) dir = "in";
                else if (type == 2) dir = "out";
                else if (type == 3) dir = "missed";
                else if (type == 5) dir = "rejected";
                else continue;
                for (Long id : ids) {
                    JSONObject r = new JSONObject();
                    r.put("lead_id", id.longValue());
                    r.put("by_id", uid);
                    r.put("phone", num);
                    r.put("direction", dir);
                    r.put("duration_sec", dur);
                    r.put("started_at", iso.format(new Date(date)));
                    rows.put(r);
                }
                if (date > stored) fresh++;
            }
        } finally {
            if (c != null) c.close();
        }

        for (int i = 0; i < rows.length(); i += 200) {
            JSONArray part = new JSONArray();
            for (int j = i; j < Math.min(i + 200, rows.length()); j++) part.put(rows.get(j));
            http("POST", SB + "/rest/v1/device_calls?on_conflict=by_id,started_at,lead_id", part.toString(), at,
                    "resolution=ignore-duplicates,return=minimal");
        }
        if (maxD > stored) sp.edit().putLong("since_" + uid, maxD).apply();
        return stored == 0 ? 0 : fresh;
    }

    static String http(String method, String url, String body, String token, String prefer) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("apikey", KEY);
        c.setRequestProperty("Authorization", "Bearer " + token);
        if (prefer != null) c.setRequestProperty("Prefer", prefer);
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.getOutputStream().write(body.getBytes("UTF-8"));
        }
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        if (in != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        }
        String text = bo.toString("UTF-8");
        if (code >= 400) throw new IOException(code + " " + text);
        return text;
    }
}
