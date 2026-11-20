package com.educhat.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * App 内更新：用 DownloadManager 把 APK 下载到应用外部文件目录，
 * 完成后通过 FileProvider 打开系统安装界面（Android 不允许静默安装）。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String APK_FILE_NAME = "edu-chat-update.apk";

    private BroadcastReceiver completeReceiver;
    private long currentDownloadId = -1;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("更新地址为空");
            return;
        }

        // Android 8+ 需要「安装未知应用」权限；未授权时引导到系统设置，用户授权后重试。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                try {
                    Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                    settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                } catch (Exception e) {
                    call.reject("无法打开安装权限设置", e);
                    return;
                }
                JSObject result = new JSObject();
                result.put("status", "needPermission");
                call.resolve(result);
                return;
            }
        }

        File target = new File(
            getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            APK_FILE_NAME
        );
        // 清掉上次下载残留，避免覆盖同名文件时 DownloadManager 复用失败缓存。
        //noinspection ResultOfMethodCallIgnored
        target.delete();

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Edu_chat 更新");
        request.setDescription("正在下载新版本…");
        request.setMimeType("application/vnd.android.package-archive");
        request.setDestinationInExternalFilesDir(
            getContext(),
            Environment.DIRECTORY_DOWNLOADS,
            APK_FILE_NAME
        );
        request.setNotificationVisibility(
            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
        );

        DownloadManager manager =
            (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("系统下载服务不可用");
            return;
        }
        currentDownloadId = manager.enqueue(request);

        completeReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        if (id == currentDownloadId) {
                            unregisterCompleteReceiver();
                            installDownloadedApk(context);
                        }
                    }
                }
            };
        getContext()
            .registerReceiver(
                completeReceiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            );

        JSObject result = new JSObject();
        result.put("status", "downloading");
        call.resolve(result);
    }

    private void unregisterCompleteReceiver() {
        if (completeReceiver != null) {
            try {
                getContext().unregisterReceiver(completeReceiver);
            } catch (Exception ignored) {
                // 可能已注销
            }
            completeReceiver = null;
        }
    }

    private void installDownloadedApk(Context context) {
        DownloadManager manager =
            (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            return;
        }
        try (
            Cursor cursor = manager.query(
                new DownloadManager.Query().setFilterById(currentDownloadId)
            )
        ) {
            if (cursor == null || !cursor.moveToFirst()) {
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                return;
            }
            File target = new File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                APK_FILE_NAME
            );
            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                target
            );
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(install);
        } catch (Exception ignored) {
            // 安装界面打开失败时保持静默，用户可稍后手动重试。
        }
    }
}
