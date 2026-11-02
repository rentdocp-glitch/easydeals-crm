package com.easydeals.crm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.telephony.TelephonyManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Incoming call -> ask the CRM which "bucket" this number belongs to and show it
 * as a notification on top of the call:
 *   paid_owner  (property owner who paid us)  -> most important
 *   buyer       (buyer enquiry, shows which property)
 *   owner_lead  (owner data the telecallers are working on)
 *   unknown     (new number)
 * Only the number of the incoming call is sent, and only to our own CRM.
 */
public class CallReceiver extends BroadcastReceiver {
    static final String CH_VIP = "calls_vip", CH_CALL = "calls";
    static final int NID = 4100;

    @Override
    public void onReceive(final Context ctx, Intent in) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(in.getAction())) return;
        final SharedPreferences sp = ctx.getSharedPreferences("cid", 0);
        final String key = sp.getString("key", "");
        if (key.isEmpty()) return; // app not logged in on this phone yet
        String state = in.getStringExtra(TelephonyManager.EXTRA_STATE);
        String num = in.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
        long now = System.currentTimeMillis();

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            if (num == null || num.trim().isEmpty()) return; // second broadcast brings the number
            final String n = MainActivity.last10(num);
            if (n.length() < 10) return;
            if (n.equals(sp.getString("num", "")) && now - sp.getLong("t", 0) < 30000 && "ring".equals(sp.getString("st", ""))) return;
            sp.edit().putString("num", n).putLong("t", now).putString("st", "ring").putString("bucket", "").putString("title", "").apply();
            final PendingResult pr = goAsync();
            new Thread(new Runnable() {
                public void run() {
                    try {
                        JSONObject body = new JSONObject();
                        body.put("n", n);
                        body.put("k", key);
                        JSONObject res = new JSONObject(post("caller_id", body.toString()));
                        String bucket = res.optString("bucket", "unknown");
                        JSONArray items = res.optJSONArray("items");
                        String title = "📞 Naya number";
                        String detail = "CRM mein nahi hai · call ke baad lead add karo";
                        int more = 0;
                        if (items != null && items.length() > 0) {
                            title = items.getJSONObject(0).optString("title", title);
                            detail = items.getJSONObject(0).optString("detail", "");
                            more = items.length() - 1;
                        }
                        if (more > 0) detail += "\n+" + more + " aur record (CRM mein dekho)";
                        sp.edit().putString("bucket", bucket).putString("title", title).apply();
                        show(ctx, bucket, title, detail, n, false);
                    } catch (Exception e) {
                        // no internet / not found: stay silent
                    } finally {
                        pr.finish();
                    }
                }
            }).start();
        } else if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            if ("ring".equals(sp.getString("st", ""))) sp.edit().putString("st", "talk").apply();
        } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            String st = sp.getString("st", "");
            final String n = sp.getString("num", "");
            sp.edit().putString("st", "idle").apply();
            if (!"ring".equals(st) || n.isEmpty() || now - sp.getLong("t", 0) > 600000) return;
            // rang and was never answered -> missed call
            final String bucket = sp.getString("bucket", "");
            final String title = sp.getString("title", "");
            final PendingResult pr = goAsync();
            new Thread(new Runnable() {
                public void run() {
                    try {
                        JSONObject body = new JSONObject();
                        body.put("n", n);
                        body.put("k", key);
                        post("call_missed", body.toString());
                    } catch (Exception e) {
                        // ignore
                    } finally {
                        if ("paid_owner".equals(bucket) || "buyer".equals(bucket)) {
                            show(ctx, bucket, "❗ Missed call · " + title.replaceFirst("^\\S+\\s", ""),
                                    "Wapas call karne ke liye yahan dabao · " + n, n, true);
                        }
                        pr.finish();
                    }
                }
            }).start();
        }
    }

    static void show(Context ctx, String bucket, String title, String detail, String num, boolean missed) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        boolean vip = "paid_owner".equals(bucket);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel a = new NotificationChannel(CH_VIP, "Deal Closed Owner calls", NotificationManager.IMPORTANCE_HIGH);
            a.setDescription("Deal Closed Owners ke call");
            a.enableVibration(true);
            nm.createNotificationChannel(a);
            NotificationChannel b = new NotificationChannel(CH_CALL, "CRM caller ID", NotificationManager.IMPORTANCE_HIGH);
            b.setDescription("Buyer / owner data / naya number");
            nm.createNotificationChannel(b);
        }
        Intent open = missed ? new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + num))
                : new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (missed) open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, missed ? 2 : 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, vip ? CH_VIP : CH_CALL)
                : new Notification.Builder(ctx);
        int color = vip ? 0xFFD97706 : "buyer".equals(bucket) ? 0xFF2563EB : "owner_lead".equals(bucket) ? 0xFF7C3AED : 0xFF6B7280;
        nb.setSmallIcon(missed ? android.R.drawable.sym_call_missed : android.R.drawable.sym_call_incoming)
                .setContentTitle(title)
                .setContentText(detail.replace('\n', ' '))
                .setStyle(new Notification.BigTextStyle().bigText(detail))
                .setColor(color)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(Notification.CATEGORY_CALL)
                .setPriority(Notification.PRIORITY_MAX)
                .setDefaults(Notification.DEFAULT_ALL);
        try {
            nm.notify(missed ? NID + 1 : NID, nb.build());
        } catch (SecurityException e) {
            // notifications not allowed on this phone
        }
    }

    static String post(String fn, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(MainActivity.SB + "/rest/v1/rpc/" + fn).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(6000);
        c.setReadTimeout(8000);
        c.setRequestProperty("apikey", MainActivity.KEY);
        c.setRequestProperty("Content-Type", "application/json");
        c.setDoOutput(true);
        c.getOutputStream().write(body.getBytes("UTF-8"));
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        if (in != null) {
            byte[] buf = new byte[8192];
            int r;
            while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
        }
        String t = bo.toString("UTF-8");
        if (code >= 400) throw new Exception(code + " " + t);
        return t;
    }
}
