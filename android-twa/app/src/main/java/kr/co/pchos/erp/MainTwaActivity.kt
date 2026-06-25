package kr.co.pchos.erp

import android.net.Uri
import com.google.androidbrowserhelper.trusted.LauncherActivity

class MainTwaActivity : LauncherActivity() {
    override fun getLaunchingUrl(): Uri {
        val intentUri = intent?.data
        if (intentUri != null) {
            return intentUri
        }
        return super.getLaunchingUrl()
    }
}
