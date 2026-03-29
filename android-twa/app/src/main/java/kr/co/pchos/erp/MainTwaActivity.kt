package kr.co.pchos.erp

import android.net.Uri
import com.google.androidbrowserhelper.trusted.LauncherActivity

class MainTwaActivity : LauncherActivity() {
    override fun getLaunchingUrl(): Uri {
        return Uri.parse("https://erp.pchos.kr/main")
    }
}
