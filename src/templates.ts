import { FileItem } from './types';

export const TEMPLATE_KOTLIN: FileItem[] = [
  {
    name: 'MainActivity.kt',
    path: 'app/src/main/java/com/example/droidcraft/MainActivity.kt',
    language: 'kotlin',
    content: `package com.example.droidcraft

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainAppScreen()
                }
            }
        }
    }
}

@Composable
fun MainAppScreen() {
    var counter by remember { mutableStateOf(0) }
    var devHandle by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "DroidCraft Live Sandbox",
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.headlineMedium
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        Text(
            text = "Build real apps on the fly",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.secondary
        )

        Spacer(modifier = Modifier.height(24.dp))
        
        Card(
            modifier = Modifier.fillMaxWidth().padding(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "Developer Profile",
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                OutlinedTextField(
                    value = devHandle,
                    onValueChange = { devHandle = it },
                    placeholder = { Text("Enter your developer nickname...") }
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = "Total Runs Compiled: $counter",
            style = MaterialTheme.typography.titleLarge
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(onClick = { counter++ }) {
                Text("Increment Count")
            }
            
            Button(
                onClick = { counter = 0 },
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Text("Reset")
            }
        }
    }
}`
  },
  {
    name: 'build.gradle.kts',
    path: 'app/build.gradle.kts',
    language: 'groovy',
    content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.droidcraft"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.droidcraft"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation(platform("androidx.compose:compose-bom:2023.08.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
}`
  },
  {
    name: 'AndroidManifest.xml',
    path: 'app/src/main/AndroidManifest.xml',
    language: 'xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    >

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="DroidCraft App"
        android:theme="@style/Theme.Material3">
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.Material3">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`
  },
  {
    name: 'settings.gradle.kts',
    path: 'settings.gradle.kts',
    language: 'groovy',
    content: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "DroidCraft"
include(":app")`
  }
];

export const TEMPLATE_XML: FileItem[] = [
  {
    name: 'activity_main.xml',
    path: 'app/src/main/res/layout/activity_main.xml',
    language: 'xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:gravity="center"
    android:background="#121824"
    tools:context=".MainActivity">

    <TextView
        android:id="@+id/titleHeader"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="System Gateway Login"
        android:textColor="#FFFFFF"
        android:textSize="24sp"
        android:textStyle="bold" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Authorized Access Terminal Only"
        android:textColor="#8F9CAE"
        android:textSize="12sp"
        android:layout_marginTop="4dp" />

    <!-- Operator Email Input -->
    <EditText
        android:id="@+id/inputEmail"
        android:layout_width="match_parent"
        android:layout_height="54dp"
        android:hint="Operator Email Address"
        android:inputType="textEmailAddress"
        android:imeOptions="actionNext"
        android:autofillHints="emailAddress"
        android:textColor="#FFFFFF"
        android:textColorHint="#5A6E85"
        android:paddingHorizontal="16dp"
        android:layout_marginTop="32dp"
        android:background="@android:drawable/editbox_background_normal"
        android:backgroundTint="#1D273A" />

    <!-- Security Passkey Input -->
    <EditText
        android:id="@+id/inputKey"
        android:layout_width="match_parent"
        android:layout_height="54dp"
        android:hint="Security Passkey"
        android:inputType="textPassword"
        android:imeOptions="actionDone"
        android:autofillHints="password"
        android:textColor="#FFFFFF"
        android:textColorHint="#5A6E85"
        android:paddingHorizontal="16dp"
        android:layout_marginTop="16dp"
        android:background="@android:drawable/editbox_background_normal"
        android:backgroundTint="#1D273A" />

    <!-- Connect Button -->
    <Button
        android:id="@+id/btnConnect"
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:text="Establish Connection"
        android:textColor="#121824"
        android:textStyle="bold"
        android:backgroundTint="#00FFCC"
        android:layout_marginTop="32dp" />

</LinearLayout>`
  },
  {
    name: 'MainActivity.java',
    path: 'app/src/main/java/com/example/droidcraft/MainActivity.java',
    language: 'java',
    content: `package com.example.droidcraft;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private EditText inputEmail;
    private EditText inputKey;
    private Button btnConnect;
    private TextView titleHeader;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        inputEmail = findViewById(R.id.inputEmail);
        inputKey = findViewById(R.id.inputKey);
        btnConnect = findViewById(R.id.btnConnect);
        titleHeader = findViewById(R.id.titleHeader);

        btnConnect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String email = inputEmail.getText().toString();
                String key = inputKey.getText().toString();

                if (email.isEmpty() || key.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Authentication values cannot be empty!", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(MainActivity.this, "Access Granted! Logging in as: " + email, Toast.LENGTH_LONG).show();
                }
            }
        });
    }
}`
  },
  {
    name: 'AndroidManifest.xml',
    path: 'app/src/main/AndroidManifest.xml',
    language: 'xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    >

    <application
        android:allowBackup="true"
        android:label="DroidCraft Legacy"
        android:theme="@style/Theme.AppCompat.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`
  },
  {
    name: 'build.gradle',
    path: 'app/build.gradle',
    language: 'groovy',
    content: `apply plugin: 'com.android.application'

android {
    namespace 'com.example.droidcraft'
    compileSdkVersion 34

    defaultConfig {
        applicationId "com.example.droidcraft"
        minSdkVersion 26
        targetSdkVersion 34
        versionCode 1
        versionName "1.0"
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.9.0'
}`
  }
];
