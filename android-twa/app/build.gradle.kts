plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "kr.co.pchos.erp"
  compileSdk = 35

  defaultConfig {
    applicationId = "kr.co.pchos.erp"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "1.0.0"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
    }
    debug {
      isMinifyEnabled = false
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  buildFeatures {
    buildConfig = true
  }
}

dependencies {
  implementation("androidx.browser:browser:1.8.0")
  implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
