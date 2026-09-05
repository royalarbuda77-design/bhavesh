package com.jarvis.assistant.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.jarvis.assistant.R
import com.jarvis.assistant.TalkActivity

/** Home-screen Arc Reactor button — tap once, speak. Mirrors assistant state. */
class JarvisOrbWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> render(context, mgr, id) }
    }

    override fun onEnabled(context: Context) = Unit

    companion object {
        fun render(context: Context, mgr: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_orb)
            val pi = PendingIntent.getActivity(
                context, 616,
                Intent(context, TalkActivity::class.java)
                    .setAction("TAP_TO_TALK")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.orb, pi)
            runCatching { mgr.updateAppWidget(id, views) }
        }

        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, JarvisOrbWidget::class.java))
            ids.forEach { render(context, mgr, it) }
        }
    }
}
