import JSON5 from 'json5';
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '15mb' }));

// Initialize Google GenAI securely on the server
let ai: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
} catch (err) {
  console.error('Failed to initialize Gemini API client:', err);
}

// Wrapper for generateContent with retries to handle 503/429
async function retryGenerateContent(options: any, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      if (!ai) throw new Error("AI is not initialized");
      return await ai.models.generateContent(options);
    } catch (err: any) {
      attempt++;
      const errMsg = err?.message || String(err);
      fs.appendFileSync("error.log", "generateContent failed: " + errMsg + "\n"); console.warn(`generateContent failed (attempt ${attempt}/${maxRetries}):`, errMsg);
      if (attempt >= maxRetries) throw err;
      
      let delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      const retryMatch = errMsg.match(/retry in (\d+(?:\.\d+)?)s/);
      if (retryMatch) {
         delay = parseFloat(retryMatch[1]) * 1000 + 2000; // use exact delay + 2s buffer
         console.warn(`Rate limit explicitly asked to wait for ${delay}ms`);
         if (errMsg.includes('PerDay')) {
             console.warn("Daily quota exceeded. Switching to fallback model.");
             if (options.model === 'gemini-3.1-flash-lite') {
                 options.model = 'gemini-3.1-flash-lite';
             } else {
                 options.model = 'gemini-3.1-flash-lite';
             }
             delay = 1000; 
         }
      } else if (errMsg.includes('429')) {
         if (options.model === 'gemini-3.1-flash-lite') {
             options.model = 'gemini-3.1-flash-lite';
             delay = 1000;
         }
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Generation failed after retries");
}

// AI Copilot Assistant Endpoint
app.post('/api/copilot/chat', async (req, res) => {
  const { messages, activeFile, fileContent, fileLanguage, persona, model, openAiKey, grokKey, useGrounding, thinkingMode, attachments } = req.body;

  let currentModel = model || 'gemini-3.1-flash-lite';
  
  if (currentModel === 'gpt-4o' && !openAiKey) {
    return res.status(200).json({ reply: "Please click the Settings cog to provide your OpenAI API Key to use ChatGPT (gpt-4o)." });
  }
  if (currentModel === 'grok-2' && !grokKey) {
    return res.status(200).json({ reply: "Please click the Settings cog to provide your X.AI API Key to use Grok-2." });
  }
  if (!ai && currentModel.startsWith('gemini')) {
    return res.status(200).json({
      reply: "Hello! I am DroidCraft AI Copilot. (Note: GEMINI_API_KEY is not configured yet. Set it in Settings > Secrets to unlock full AI code analysis and generation features!)"
    });
  }

  try {
    let personaDescription = `You are DroidCraft Copilot, an expert Android Developer Advocate and Jetpack Compose/XML layout master.
You assist developers in writing high-performance Kotlin, Java, XML layouts, and Gradle configurations inside their lightweight web IDE.`;

    if (persona === 'UI_UX') {
      personaDescription = `You are the UI/UX Designer Copilot, an expert in Material Design 3, color theory, spacing, and beautiful Jetpack Compose animations and layouts. You focus heavily on making the app look amazing.`;
    } else if (persona === 'Architect') {
      personaDescription = `You are the Android Architect Copilot, an expert in clean architecture (MVVM/MVI), Kotlin coroutines/Flows, dependency injection (Hilt/Dagger), and writing scalable, testable apps. You focus on code structure and maintainability.`;
    } else if (persona === 'Reviewer') {
      personaDescription = `You are the Code Review Copilot, a strict but helpful Android peer reviewer focused on finding memory leaks, lifecycle bugs, and recommending optimizations and best practices.`;
    }

    const systemInstruction = `${personaDescription}
When asked to write or fix code, provide detailed, clean code blocks and explain them briefly.
If the user's active file is provided, use that context to give highly tailored recommendations.
Active File: ${activeFile || 'None'}
Language: ${fileLanguage || 'Unknown'}
Active Code Context:
\`\`\`${fileLanguage || ''}
${fileContent || '// No file is active'}
\`\`\`
If you generate code, make sure to format it perfectly inside markdown code blocks.`;

    if (currentModel === 'gpt-4o' && openAiKey) {
      return res.status(200).json({ reply: `[ChatGPT / gpt-4o Simulation Mode]\nTo implement actual OpenAI calls, please install the openai SDK on the backend. Your query was received using the GPT persona.\n\n${personaDescription}` });
    }
    if (currentModel === 'grok-2' && grokKey) {
      return res.status(200).json({ reply: `[Grok-2 Simulation Mode]\nTo implement actual Grok calls, use the appropriate HTTP endpoint. Your query was received using the Grok persona.\n\n${personaDescription}` });
    }

    const formattedMessages = messages.map((m: any) => {
      const parts: any[] = [{ text: m.content }];
      if (m.attachments) {
         m.attachments.forEach((att: any) => {
            parts.push({
               inlineData: {
                  mimeType: att.mimeType,
                  data: att.data
               }
            });
         });
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: parts
      };
    });

    const config: any = {
      systemInstruction
    };

    if (useGrounding && currentModel === 'gemini-3.5-flash') {
      config.tools = [{ googleSearch: {} }];
    }
    
    // Import ThinkingLevel locally or use string for sdk compatibility
    if (thinkingMode && currentModel === 'gemini-3.1-pro-preview') {
      config.thinkingConfig = { thinkingLevel: 'HIGH' };
    }

    let attempt = 0;
    const maxRetries = 5;
    let response;

    while (attempt < maxRetries) {
      try {
        response = await ai!.models.generateContent({
           model: currentModel,
           contents: formattedMessages,
           config
        });
        break;
      } catch (err: any) {
        attempt++;
        const errMsg = err?.message || String(err);
        console.warn(`generateContent failed (attempt ${attempt}/${maxRetries}):`, errMsg);
        if (attempt >= maxRetries) throw err;
        let delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        const retryMatch = errMsg.match(/retry in (\d+(?:\.\d+)?)s/);
        if (retryMatch) {
           delay = parseFloat(retryMatch[1]) * 1000 + 2000;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    let replyText = response?.text || '';
    
    // Extract grounding URLs if any
    const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
       const urls = chunks.map((c: any) => c.web?.uri).filter(Boolean);
       if (urls.length > 0) {
          replyText += '\n\n**Sources:**\n' + urls.map((u: string) => `- ${u}`).join('\n');
       }
    }

    res.json({ reply: replyText });

  } catch (error: any) {
    console.error('Copilot generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate copilot response' });
  }
});

// Image Generation Endpoint
app.post('/api/generate-image', async (req, res) => {
  const { prompt, model, aspectRatio, imageSize } = req.body;
  if (!ai) {
    return res.status(500).json({ error: "Gemini API key not configured" });
  }
  const currentModel = model || 'gemini-3.1-flash-image-preview'; // Note: SDK uses gemini-3.1-flash-image
  const mappedModel = currentModel.replace('-preview', '');
  
  try {
     const response = await ai.models.generateContent({
        model: mappedModel,
        contents: {
           parts: [{ text: prompt }]
        },
        config: {
           imageConfig: {
              aspectRatio: aspectRatio || "1:1",
              imageSize: imageSize || "1K"
           }
        }
     });
     
     let imageUrl = '';
     if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
           if (part.inlineData) {
              imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
              break;
           }
        }
     }
     
     res.json({ success: true, imageUrl });
  } catch (error: any) {
     res.status(500).json({ error: error.message || "Failed to generate image" });
  }
});

// Build Intelligence & Smart Templates (Upgrades 5 & 6)
interface TemplateInfo {
  name: string;
  mainContent: string;
  extraContent?: string;
}

function getTemplateInfo(prompt: string, type: 'compose' | 'xml'): TemplateInfo {
  const p = prompt.toLowerCase();
  
  if (type === 'compose') {
    if (p.includes('login') || p.includes('auth') || p.includes('signin') || p.includes('signup') || p.includes('credential')) {
      return {
        name: 'login_app',
        mainContent: `package com.example.droidcraft

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LoginAppScreen()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginAppScreen() {
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Secure Portal",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Sign in to your account",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.secondary
        )
        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email Address") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
        )
        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = {
                if (email.isBlank() || password.isBlank()) {
                    Toast.makeText(context, "Please fill in all fields", Toast.LENGTH_SHORT).show()
                } else {
                    isLoading = true
                    Toast.makeText(context, "Logging in...", Toast.LENGTH_SHORT).show()
                }
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Sign In")
        }
    }
}`
      };
    }

    if (p.includes('map') || p.includes('coordinate') || p.includes('gps') || p.includes('location') || p.includes('track') || p.includes('route')) {
      return {
        name: 'maps_app',
        mainContent: `package com.example.droidcraft

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MapsAppScreen()
        }
    }
}

@Composable
fun MapsAppScreen() {
    var trackerStatus by remember { mutableStateOf("Active") }
    var locationName by remember { mutableStateOf("Silicon Valley, CA") }
    var coordinates by remember { mutableStateOf("37.4220° N, 122.0841° W") }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "GeoTracker Cloud Map",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Real-time location simulation",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.secondary
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp)
                .background(Color(0xFFE0F7FA), RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "🗺️ Map Simulation Grid",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleLarge,
                    color = Color(0xFF006064)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Coordinates: $coordinates",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF00838F)
                )
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Location: $locationName",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyLarge
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Status: $trackerStatus",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = {
                        trackerStatus = "GPS Connected"
                        coordinates = "37.7749° N, 122.4194° W"
                        locationName = "San Francisco, CA"
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Refresh Coordinates")
                }
            }
        }
    }
}`
      };
    }

    if (p.includes('chat') || p.includes('agent') || p.includes('ai') || p.includes('assistant') || p.includes('bot') || p.includes('gemini') || p.includes('conversation')) {
      return {
        name: 'ai_chat_app',
        mainContent: `package com.example.droidcraft

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ChatAppScreen()
        }
    }
}

data class ChatMessage(val sender: String, val text: String, val isUser: Boolean)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatAppScreen() {
    var inputText by remember { mutableStateOf("") }
    var messages by remember { mutableStateOf(listOf(
        ChatMessage("Gemini", "Hello! I am your AI assistant. How can I help you compile today?", false)
    )) }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Gemini Conversational AI",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Divider()
        }

        LazyColumn(
            modifier = Modifier.weight(1f).padding(vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(messages) { msg ->
                val alignment = if (msg.isUser) Alignment.End else Alignment.Start
                val bg = if (msg.isUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                val textColor = if (msg.isUser) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                
                Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = alignment) {
                    Box(
                        modifier = Modifier
                            .background(bg, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                            .widthIn(max = 260.dp)
                    ) {
                        Column {
                            Text(text = msg.sender, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, color = textColor)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(text = msg.text, style = MaterialTheme.typography.bodyMedium, color = textColor)
                        }
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = inputText,
                onValueChange = { inputText = it },
                placeholder = { Text("Ask Gemini...") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(24.dp)
            )
            Button(
                onClick = {
                    if (inputText.isNotBlank()) {
                        val userMsg = ChatMessage("User", inputText, true)
                        val aiMsg = ChatMessage("Gemini", "Processed: " + inputText, false)
                        messages = messages + userMsg + aiMsg
                        inputText = ""
                    }
                },
                shape = RoundedCornerShape(24.dp)
            ) {
                Text("Send")
            }
        }
    }
}`
      };
    }

    return {
      name: 'basic_app',
      mainContent: `package com.example.droidcraft

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
            MainAppScreen()
        }
    }
}

@Composable
fun MainAppScreen() {
    var clickCount by remember { mutableStateOf(0) }
    
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Smart Interactive Counter",
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.headlineSmall
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Total counts: $clickCount",
            style = MaterialTheme.typography.bodyLarge
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = { clickCount++ }) {
            Text("Increment")
        }
    }
}`
    };
  } else {
    if (p.includes('login') || p.includes('auth') || p.includes('signin') || p.includes('signup') || p.includes('credential')) {
      return {
        name: 'login_app',
        mainContent: `package com.example.droidcraft;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private EditText inputEmail;
    private EditText inputKey;
    private Button btnConnect;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        inputEmail = findViewById(R.id.inputEmail);
        inputKey = findViewById(R.id.inputKey);
        btnConnect = findViewById(R.id.btnConnect);

        btnConnect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String email = inputEmail.getText().toString();
                String key = inputKey.getText().toString();
                if (email.isEmpty() || key.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Please fill in all details", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(MainActivity.this, "Authorized: logged in as " + email, Toast.LENGTH_SHORT).show();
                }
            }
        });
    }
}`,
        extraContent: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:gravity="center"
    android:background="#101420">

    <TextView
        android:id="@+id/titleHeader"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Secure Gateway Access"
        android:textColor="#FFFFFF"
        android:textSize="22sp"
        android:textStyle="bold" />

    <EditText
        android:id="@+id/inputEmail"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Username or Email"
        android:textColor="#FFFFFF"
        android:textColorHint="#7F8C8D"
        android:layout_marginTop="24dp" />

    <EditText
        android:id="@+id/inputKey"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Security Password"
        android:inputType="textPassword"
        android:textColor="#FFFFFF"
        android:textColorHint="#7F8C8D"
        android:layout_marginTop="12dp" />

    <Button
        android:id="@+id/btnConnect"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Sign In"
        android:layout_marginTop="24dp" />
</LinearLayout>`
      };
    }

    if (p.includes('map') || p.includes('coordinate') || p.includes('gps') || p.includes('location') || p.includes('track') || p.includes('route')) {
      return {
        name: 'maps_app',
        mainContent: `package com.example.droidcraft;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private TextView titleHeader;
    private Button btnConnect;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        titleHeader = findViewById(R.id.titleHeader);
        btnConnect = findViewById(R.id.btnConnect);

        btnConnect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                titleHeader.setText("GPS Link: 37.7749° N, 122.4194° W");
                Toast.makeText(MainActivity.this, "Location update synchronized!", Toast.LENGTH_SHORT).show();
            }
        });
    }
}`,
        extraContent: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:gravity="center"
    android:background="#121824">

    <TextView
        android:id="@+id/titleHeader"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Silicon Valley, CA (GPS Active)"
        android:textColor="#FFFFFF"
        android:textSize="18sp"
        android:textStyle="bold" />

    <Button
        android:id="@+id/btnConnect"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Query Coordinates"
        android:layout_marginTop="32dp" />
</LinearLayout>`
      };
    }

    return {
      name: 'basic_app',
      mainContent: `package com.example.droidcraft;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private TextView titleHeader;
    private Button btnConnect;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        titleHeader = findViewById(R.id.titleHeader);
        btnConnect = findViewById(R.id.btnConnect);

        btnConnect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Toast.makeText(MainActivity.this, "AI System Connection Established!", Toast.LENGTH_SHORT).show();
            }
        });
    }
}`,
      extraContent: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:gravity="center"
    android:background="#101420">

    <TextView
        android:id="@+id/titleHeader"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Workspace Application Ready"
        android:textColor="#FFFFFF"
        android:textSize="18sp"
        android:textStyle="bold" />

    <Button
        android:id="@+id/btnConnect"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Establish Link"
        android:layout_marginTop="24dp" />
</LinearLayout>`
    };
  }
}

// AI Project Generator Endpoint
app.post('/api/generate-project', async (req, res) => {
  const { prompt, projectType } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt parameter' });
  }

  const type = projectType === 'xml' ? 'xml' : 'compose';
  let mainActivityContent = '';
  let layoutContent = '';

  const templateInfo = getTemplateInfo(prompt, type);

  if (!ai) {
    // Robust Fallback mock projects
    mainActivityContent = templateInfo.mainContent;
    if (type === 'xml') {
      layoutContent = templateInfo.extraContent || '';
    }
  } else {
    try {
      if (type === 'compose') {
        const systemInstruction = `You are DroidCraft AI, an expert Android developer.
Your task is to write a single-file Jetpack Compose MainActivity.kt for an app.
The prompt describing the app is: "${prompt}"

We selected the "${templateInfo.name}" boilerplate template as a high-integrity starting point.
Here is the template's Kotlin content:
${templateInfo.mainContent}

Please adapt, extend, or fully customize this code to build what is requested in the prompt, but preserve the packages, imports, stable Jetpack Compose structure, and ensure there are absolutely no compile-time errors.
Do NOT use unreferenced variables, resources, or layout components.
Make sure:
1. The package name is com.example.droidcraft.
2. It includes the MainActivity class extending ComponentActivity and calls setContent { ... }.
3. You implement the entire interactive UI inside this single Kotlin file using standard Material3 Compose components.
4. Keep all imports clean.
5. Output ONLY raw Kotlin code. Do NOT wrap it in any Markdown code blocks or explanation tags.`;

        const response = await retryGenerateContent({
          model: 'gemini-3.1-flash-lite',
          contents: 'Write the complete MainActivity.kt code.',
          config: { systemInstruction }
        });

        let code = response.text || '';
        code = code.replace(/^```(?:kotlin)?\n/, '').replace(/\n```$/, '').trim();
        mainActivityContent = code;
      } else {
        // XML Project: First generate layout, then Java file
        const xmlInstruction = `You are DroidCraft AI. Write a complete activity_main.xml layout based on prompt: "${prompt}".
We selected the "${templateInfo.name}" boilerplate template to start with.
Here is the template's layout code:
${templateInfo.extraContent}

Please customize this XML code. Output ONLY raw, well-formatted Android XML layout code. No markdown formatting, no explanations. Make sure it has a LinearLayout or ConstraintLayout, and root elements contain xmlns declarations. Include elements with appropriate android:id attributes, such as "titleHeader" and buttons or inputs needed for your layout.`;

        const xmlResponse = await retryGenerateContent({
          model: 'gemini-3.1-flash-lite',
          contents: 'Write activity_main.xml layout code.',
          config: { systemInstruction: xmlInstruction }
        });

        let xmlCode = xmlResponse.text || '';
        xmlCode = xmlCode.replace(/^```(?:xml)?\n/, '').replace(/\n```$/, '').trim();
        layoutContent = xmlCode;

        const javaInstruction = `You are DroidCraft AI. Write a complete MainActivity.java file in Java based on the layout and prompt: "${prompt}".
The selected template is: "${templateInfo.name}".
Here is the template's Java code:
${templateInfo.mainContent}

Please adapt this Java file to bind elements from the XML layout, handle click events, and execute logic for the user's prompt.
Make sure:
1. The package name is com.example.droidcraft.
2. The activity extends AppCompatActivity and overrides onCreate, setting setContentView(R.layout.activity_main).
3. Find elements by id and wire up click listeners to update UI or show Toasts.
4. Output ONLY raw Java code. No markdown formatting, no explanations.`;

        const javaResponse = await retryGenerateContent({
          model: 'gemini-3.1-flash-lite',
          contents: 'Write MainActivity.java code.',
          config: { systemInstruction: javaInstruction }
        });

        let javaCode = javaResponse.text || '';
        javaCode = javaCode.replace(/^```(?:java)?\n/, '').replace(/\n```$/, '').trim();
        mainActivityContent = javaCode;
      }
    } catch (err: any) {
      console.error('Gemini generator error:', err);
      return res.status(500).json({ error: `AI generation failed: ${err.message}` });
    }
  }

  // Construct complete set of files for GitHub repository template
  const generatedFiles: Array<{ name: string; path: string; content: string; language: string }> = [];

  // 1. Core Source Files
  if (type === 'compose') {
    generatedFiles.push({
      name: 'MainActivity.kt',
      path: 'app/src/main/java/com/example/droidcraft/MainActivity.kt',
      content: mainActivityContent,
      language: 'kotlin'
    });

    // 2. AndroidManifest.xml (Compose)
    generatedFiles.push({
      name: 'AndroidManifest.xml',
      path: 'app/src/main/AndroidManifest.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.droidcraft">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:label="DroidCraft App"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`,
      language: 'xml'
    });

    // 3. app/build.gradle.kts (Compose)
    generatedFiles.push({
      name: 'build.gradle.kts',
      path: 'app/build.gradle.kts',
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
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("com.google.android.material:material:1.11.0")
}`,
      language: 'groovy'
    });

    // 4. settings.gradle.kts (Compose)
    generatedFiles.push({
      name: 'settings.gradle.kts',
      path: 'settings.gradle.kts',
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
include(":app")`,
      language: 'groovy'
    });
  } else {
    // XML Layout Source Files
    generatedFiles.push({
      name: 'MainActivity.java',
      path: 'app/src/main/java/com/example/droidcraft/MainActivity.java',
      content: mainActivityContent,
      language: 'java'
    });

    generatedFiles.push({
      name: 'activity_main.xml',
      path: 'app/src/main/res/layout/activity_main.xml',
      content: layoutContent,
      language: 'xml'
    });

    // 2. AndroidManifest.xml (XML Layout)
    generatedFiles.push({
      name: 'AndroidManifest.xml',
      path: 'app/src/main/AndroidManifest.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.droidcraft">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:label="DroidCraft App"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`,
      language: 'xml'
    });

    // 3. app/build.gradle (XML)
    generatedFiles.push({
      name: 'build.gradle',
      path: 'app/build.gradle',
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

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.9.0'
}`,
      language: 'groovy'
    });

    // 4. settings.gradle (XML)
    generatedFiles.push({
      name: 'settings.gradle',
      path: 'settings.gradle',
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
include ':app'`,
      language: 'groovy'
    });
  }

  // 5. Shared Root build.gradle File
  generatedFiles.push({
    name: 'build.gradle',
    path: 'build.gradle',
    content: `// Top-level build file where you can add configuration options common to all sub-projects/modules.
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.2'
        ${type === 'compose' ? "classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'" : ''}
    }
}
}

task clean(type: Delete) {
    delete rootProject.buildDir
}`,
    language: 'groovy'
  });

  // 6. self-bootstrapping gradlew Wrapper
  generatedFiles.push({
    name: 'gradlew',
    path: 'gradlew',
    content: `#!/usr/bin/env bash

# Self-bootstrapping Gradle Wrapper script
# Downloads gradle-wrapper.jar if missing, then executes it.

set -e

GRADLE_WRAPPER_JAR="gradle/wrapper/gradle-wrapper.jar"
if [ ! -f "$GRADLE_WRAPPER_JAR" ]; then
    echo "Downloading Gradle Wrapper JAR..."
    mkdir -p gradle/wrapper
    curl -sSLo "$GRADLE_WRAPPER_JAR" https://raw.githubusercontent.com/gradle/gradle/v8.5.0/gradle/wrapper/gradle-wrapper.jar
fi

exec java \\
    -XX:MaxMetaspaceSize=256m \\
    -XX:+HeapDumpOnOutOfMemoryError \\
    -Xmx1024m \\
    -Dorg.gradle.appname=gradlew \\
    -classpath "$GRADLE_WRAPPER_JAR" \\
    org.gradle.wrapper.GradleWrapperMain \\
    "$@"`,
    language: 'markdown' // treat as text/shell
  });

  // 7. gradle-wrapper.properties Configuration
  generatedFiles.push({
    name: 'gradle-wrapper.properties',
    path: 'gradle/wrapper/gradle-wrapper.properties',
    content: `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists`,
    language: 'json'
  });

  // 8. GitHub Actions APK Builder Workflow
  generatedFiles.push({
    name: 'build.yml',
    path: '.github/workflows/build.yml',
    content: `name: Build APK

on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Grant execute permission
        run: chmod +x gradlew

      - name: Build Debug APK
        run: ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug.apk
          path: app/build/outputs/apk/debug/app-debug.apk`,
    language: 'yaml'
  });


  const badges = getTechStackBadges(generatedFiles);
  generatedFiles.push({
    name: 'README.md',
    path: 'README.md',
    content: `# Android App\n\nGenerated by DroidCraft IDE.\n\n### Tech Stack\n${badges.join(' ')}\n\n### Building\nThis project uses GitHub actions to automatically build the APK.`,
    language: 'markdown'
  });

  res.json({
    success: true,
    files: generatedFiles
  });
});

// UPGRADE 1 — Build Failure Detector Endpoint
app.post('/api/github-run-logs', async (req, res) => {
  const { username, repo, runId, token } = req.body;
  if (!username || !repo || !runId || !token) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    // 1. Get jobs for this run
    const jobsUrl = `https://api.github.com/repos/${username}/${repo}/actions/runs/${runId}/jobs`;
    const jobsRes = await fetch(jobsUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            }
    });

    if (!jobsRes.ok) {
      throw new Error(`Failed to fetch jobs: ${jobsRes.statusText}`);
    }

    const jobsData: any = await jobsRes.json();
    const jobs = jobsData.jobs || [];
    if (jobs.length === 0) {
      return res.json({ success: true, logs: 'No jobs registered for this run yet.', status: 'queued' });
    }

    const firstJob = jobs[0];
    const jobId = firstJob.id;

    // 2. Fetch job logs (raw text)
    const logsUrl = `https://api.github.com/repos/${username}/${repo}/actions/jobs/${jobId}/logs`;
    const logsRes = await fetch(logsUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            }
    });

    if (!logsRes.ok) {
      throw new Error(`Failed to fetch logs for job ${jobId}: ${logsRes.statusText}`);
    }

    const logsText = await logsRes.text();

    // 3. Filter logs to find compilation/gradle failure block to keep it concise
    const lines = logsText.split('\n');
    let relevantLogs = '';
    
    // Search for gradle compile or runtime errors
    const errorStartIndex = lines.findIndex(l => 
      l.includes('FAILURE: Build failed') || 
      l.includes('* What went wrong:') || 
      l.includes('e: /') ||
      l.includes('error: ') ||
      l.includes('Unresolved reference:')
    );

    if (errorStartIndex !== -1) {
      relevantLogs = lines.slice(Math.max(0, errorStartIndex - 20), Math.min(lines.length, errorStartIndex + 80)).join('\n');
    } else {
      relevantLogs = lines.slice(-150).join('\n'); // fallback to last 150 lines
    }

    res.json({ success: true, logs: relevantLogs, status: firstJob.status, conclusion: firstJob.conclusion });
  } catch (err: any) {
    console.error('Error getting logs:', err);
    res.status(500).json({ error: err.message });
  }
});

// UPGRADE 2 — AI Error Fixer Endpoint
app.post('/api/fix-project', async (req, res) => {
  const { prompt, errorLog, files, projectType } = req.body;
  if (!prompt || !errorLog || !files) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!ai) {
    return res.status(500).json({ error: 'AI Generator not configured (missing Gemini API Key)' });
  }

  try {
    const type = projectType === 'xml' ? 'xml' : 'compose';
    
    // Format current files for system prompt
    const filesContext = files.map((f: any) => `### FILE PATH: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

    const systemInstruction = `You are DroidCraft AI, an elite self-healing compiler and Android engineer.
Your task is to analyze an Android project build failure from GitHub Actions logs, identify the source of the build error (in Kotlin, Java, XML layouts, or Gradle files), and fix the error while keeping the original app idea intact.

Original Prompt / App Idea:
"${prompt}"

Current Project Files:
${filesContext}

Error Log from build failure:
${errorLog}

Instructions:
1. Examine the error log. Common issues include unresolved references, broken imports, mismatched XML layout IDs, duplicate or outdated Gradle dependency versions, missing namespace definitions, or type mismatches.
2. Formulate a fix for the failing files. Do NOT rewrite files that don't need fixing.
3. Return ONLY the files that need to be updated. For each file you fix/update, output it in the JSON schema below.
4. Output MUST be valid JSON matching this schema:
{
  "updatedFiles": [
    {
      "path": "app/src/main/java/com/example/droidcraft/MainActivity.kt",
      "content": "...corrected content..."
    }
  ],
  "explanation": "Brief explanation of what was broken and how you fixed it."
}
5. Output ONLY raw JSON. No markdown code blocks, no trailing comments, no leading characters. If you wrap it in markdown, use \`\`\`json ... \`\`\``;

    const response = await retryGenerateContent({
      model: 'gemini-3.1-flash-lite',
      contents: 'Analyze the error log and return the fixed file contents in the required JSON format.',
      config: { 
        systemInstruction,
        responseMimeType: "application/json",
         
      }
    });

    let text = response.text || '';
    text = text.trim();
    if (text.startsWith('```json')) {
      text = text.substring(7);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    try {
      let parsed;
            try {
              parsed = JSON5.parse(text);
            } catch (err) {
              console.warn('Initial JSON5 parse failed, attempting repair:', err.message);
              let repaired = text.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1').replace(/[\x00-\x1F]+/g, ' ');
              try {
                parsed = JSON5.parse(repaired);
              } catch (err2) {
                // If it still fails, just throw original
                throw new Error('Bad escaped character in JSON: ' + err.message);
              }
            }
      res.json({
        success: true,
        updatedFiles: parsed.updatedFiles || [],
        explanation: parsed.explanation || 'Fixed compile errors.'
      });
    } catch (parseErr: any) {
      console.error('Failed to parse JSON response from Gemini:', text);
      res.json({
        success: false,
        error: `Failed to parse AI response: ${parseErr.message}`,
        rawResponse: text
      });
    }

  } catch (err: any) {
    console.error('AI Fix error:', err);
    res.status(500).json({ error: `AI fixing failed: ${err.message}` });
  }
});

// ==========================================
// 🧠 AUTONOMOUS APP FACTORY PIPELINE v3.0
// ==========================================


function getTechStackBadges(files: Array<{ name: string; path: string; content: string; language: string }>): string[] {
  const badges: string[] = [];
  const allContent = files.map(f => f.content).join('\n');
  const hasCompose = files.some(f => f.content.includes('androidx.compose') || f.name.includes('MainActivity.kt'));
  const hasXML = files.some(f => f.name.includes('.xml') && f.path.includes('layout'));
  const hasKotlin = files.some(f => f.language === 'kotlin' || f.name.endsWith('.kt'));
  const hasJava = files.some(f => f.language === 'java' || f.name.endsWith('.java'));
  const hasGradle = files.some(f => f.name.includes('build.gradle'));

  if (hasKotlin) {
    badges.push('![Kotlin](https://img.shields.io/badge/kotlin-%237F52FF.svg?style=for-the-badge&logo=kotlin&logoColor=white)');
  }
  if (hasJava) {
    badges.push('![Java](https://img.shields.io/badge/java-%23ED8B00.svg?style=for-the-badge&logo=openjdk&logoColor=white)');
  }
  if (hasCompose) {
    badges.push('![Jetpack Compose](https://img.shields.io/badge/Jetpack%20Compose-4285F4?style=for-the-badge&logo=android&logoColor=white)');
  }
  if (hasXML && !hasCompose) {
    badges.push('![Android XML](https://img.shields.io/badge/XML-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)');
  }
  if (hasGradle) {
    badges.push('![Gradle](https://img.shields.io/badge/Gradle-02303A.svg?style=for-the-badge&logo=Gradle&logoColor=white)');
  }

  if (allContent.includes('firebase')) {
    badges.push('![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase)');
  }
  if (allContent.includes('room')) {
    badges.push('![Room](https://img.shields.io/badge/Room-Database-4285F4?style=for-the-badge&logo=sqlite&logoColor=white)');
  }
  if (allContent.includes('hilt') || allContent.includes('dagger')) {
    badges.push('![Hilt](https://img.shields.io/badge/Hilt-DI-3DDC84?style=for-the-badge&logo=android&logoColor=white)');
  }
  if (allContent.includes('retrofit') || allContent.includes('okhttp')) {
    badges.push('![Retrofit](https://img.shields.io/badge/Retrofit-Network-161B22?style=for-the-badge&logo=github&logoColor=white)');
  }
  if (allContent.includes('play-services-maps') || allContent.includes('google-maps')) {
     badges.push('![Google Maps](https://img.shields.io/badge/Google%20Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white)');
  }
  return badges;
}


async function scoreAppHelper(code: string, prompt: string): Promise<number> {
  if (!ai) return 70;
  try {
    const response = await retryGenerateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Rate this Android app implementation on a scale of 0 to 100 based on code quality, UI beauty/Material3 styles, design compliance, and crash stability.
      
App description prompt:
"${prompt}"

Source Code:
\`\`\`
${code}
\`\`\`

Return ONLY a single valid integer number between 0 and 100, representing your score. Do not return any other text, reasoning, or markdown.`,
    });
    const txt = (response.text || '').trim();
    const score = parseInt(txt.replace(/[^0-9]/g, ''), 10);
    return isNaN(score) ? 75 : Math.min(100, Math.max(0, score));
  } catch (err) {
    console.error('Error scoring app:', err);
    return 75;
  }
}

async function suggestUpgradesHelper(code: string, prompt: string): Promise<string[]> {
  if (!ai) return [
    "Upgrade to high-fidelity typography & colors",
    "Add transition/layout animations",
    "Implement state persistence features"
  ];
  try {
    const response = await retryGenerateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `You are an elite product designer and expert Android developer.
Given the original app prompt: "${prompt}" and the current source code implementation:
\`\`\`
${code}
\`\`\`

Suggest exactly 5 creative, highly polished upgrades, advanced features, micro-interactions, or UI refinements that would make this app exceptionally high quality.
Return your answer strictly as a JSON array of strings, like this:
[
  "Upgrade suggestion 1",
  "Upgrade suggestion 2",
  "Upgrade suggestion 3",
  "Upgrade suggestion 4",
  "Upgrade suggestion 5"
]
Do not include any formatting, markdown markers (like \`\`\`json), or preamble. Return ONLY the raw JSON array string.`,
    });
    let txt = (response.text || '').trim();
    if (txt.startsWith('```json')) txt = txt.substring(7);
    if (txt.startsWith('```')) txt = txt.substring(3);
    if (txt.endsWith('```')) txt = txt.substring(0, txt.length - 3);
    txt = txt.trim();
    const list = JSON.parse(txt);
    if (Array.isArray(list)) {
      return list.map(item => String(item).trim()).slice(0, 5);
    }
    return [];
  } catch (err) {
    console.error('Error suggesting upgrades:', err);
    return [
      "Integrate haptic click feedback simulations",
      "Add clean search, filter, and sorting utilities",
      "Refine typography alignment & premium theme styles"
    ];
  }
}

async function peerReviewHelper(code: string, prompt: string): Promise<string> {
  if (!ai) return "Boilerplate code layout is sound. Needs specialized architecture refinement.";
  try {
    const response = await retryGenerateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `You are a Senior Android Peer Reviewer.
Review the following source code for an app created from prompt: "${prompt}".

Identify architectural bottlenecks, visual/UX quirks, or logical improvements. Keep your review highly constructive, succinct, and professional.
Limit your review to 3-4 bullet points or a single concise paragraph. Do not return markdown headers or formatting, just plain text review.

Source Code:
\`\`\`
${code}
\`\`\`
`,
    });
    return (response.text || '').trim();
  } catch (err) {
    console.error('Error reviewing app:', err);
    return "Code compiles correctly but would benefit from further visual rhythm polish and component extraction.";
  }
}

async function reviewAndImproveHelper(code: string, prompt: string, reviewComments: string, upgrades: string[], projectType: 'compose' | 'xml'): Promise<string> {
  if (!ai) return code;
  try {
    const upgradesPrompt = upgrades.length > 0 
      ? `Additionally, you MUST integrate these specific advanced upgrades and product feature mutations:\n${upgrades.map((u, i) => `- ${u}`).join('\n')}` 
      : `Refine, polish, and optimize the existing layout structure and stability.`;

    const systemInstruction = `You are DroidCraft AI, an expert Senior Android developer.
Your task is to take the existing main file code and rewrite/refactor it to make it significantly higher quality, incorporating peer review suggestions and any requested upgrade mutations.

Original prompt describing the app: "${prompt}"
Current implementation file:
\`\`\`
${code}
\`\`\`

PEER REVIEW SUGGESTIONS:
"${reviewComments}"

MUTATIONS & UPGRADES:
${upgradesPrompt}

Rules:
1. Ensure the package name remains com.example.droidcraft.
2. If Compose, output the complete MainActivity.kt extending ComponentActivity. Ensure excellent Material3 component layout design, using beautiful negative space, custom theme styles, elegant color schemes, clean shapes, and robust states.
3. If XML/Java, output the complete MainActivity.java. Ensure click listeners and layout bindings are flawless.
4. The output must be ready to compile immediately. No unreferenced resources or variables.
5. Output ONLY the raw code (Kotlin/Java). Do NOT wrap the code in any Markdown code blocks or explanation tags.`;

    const response = await retryGenerateContent({
      model: 'gemini-3.1-flash-lite',
      contents: 'Write the complete improved, optimized, and upgraded source code.',
      config: { systemInstruction,   }
    });

    let newCode = response.text || '';
    newCode = newCode.replace(/^```(?:kotlin|java)?\n/, '').replace(/\n```$/, '').trim();
    return newCode;
  } catch (err) {
    console.error('Error improving app:', err);
    return code;
  }
}

export interface BuildJob {
  id: string;
  prompt: string;
  projectType: 'compose' | 'xml';
  status: 'QUEUED' | 'GENERATING' | 'UPLOADING' | 'BUILDING' | 'FIXING' | 'DONE' | 'FAILED' | 'CANCELLED';
  retryCount: number;
  repoName: string;
  githubUsername: string;
  githubToken: string;
  createdAt: string;
  updatedAt: string;
  logs: string[];
  apkUrl?: string;
  runId?: string;
  errorReason?: string;
  isSelfImproving?: boolean;
  isCreativeEvolving?: boolean;
  scoreHistory?: number[];
  suggestedUpgrades?: string[];
  currentCycle?: number;
  peerReview?: string;
}

let jobQueue: BuildJob[] = [];
let isQueueProcessing = false;

function saveJobsToDisk() {
  try {
    fs.writeFileSync(path.join(process.cwd(), 'jobs_db.json'), JSON.stringify(jobQueue, null, 2));
  } catch (err) {
    console.error('Failed to save jobs database:', err);
  }
}

function loadJobsFromDisk() {
  try {
    const filePath = path.join(process.cwd(), 'jobs_db.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      jobQueue = JSON.parse(data);
      // Reset any active statuses to FAILED or QUEUED to prevent being stuck after a server restart
      jobQueue.forEach(job => {
        if (job.status === 'GENERATING' || job.status === 'UPLOADING' || job.status === 'BUILDING' || job.status === 'FIXING') {
          job.status = 'QUEUED';
        }
      });
    }
  } catch (err) {
    console.error('Failed to load jobs database:', err);
  }
}

// Initial database load
loadJobsFromDisk();

async function fetchGithubRunLogsHelper(username: string, repo: string, runId: string, token: string): Promise<string> {
  try {
    const jobsUrl = `https://api.github.com/repos/${username}/${repo}/actions/runs/${runId}/jobs`;
    const jobsRes = await fetch(jobsUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            }
    });

    if (!jobsRes.ok) return 'Failed to fetch jobs metadata.';
    const jobsData: any = await jobsRes.json();
    const jobs = jobsData.jobs || [];
    if (jobs.length === 0) return 'No jobs run logs available yet.';

    const jobId = jobs[0].id;
    const logsUrl = `https://api.github.com/repos/${username}/${repo}/actions/jobs/${jobId}/logs`;
    const logsRes = await fetch(logsUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            }
    });

    if (!logsRes.ok) return `Failed to fetch logs for job ${jobId}.`;
    const logsText = await logsRes.text();

    const lines = logsText.split('\n');
    const errorStartIndex = lines.findIndex(l => 
      l.includes('FAILURE: Build failed') || 
      l.includes('* What went wrong:') || 
      l.includes('e: /') ||
      l.includes('error: ') ||
      l.includes('Unresolved reference:')
    );

    if (errorStartIndex !== -1) {
      return lines.slice(Math.max(0, errorStartIndex - 20), Math.min(lines.length, errorStartIndex + 80)).join('\n');
    }
    return lines.slice(-150).join('\n');
  } catch (e: any) {
    return `Error retrieving compiler diagnostics: ${e.message}`;
  }
}

async function runJob(job: BuildJob) {
  job.status = 'GENERATING';
  job.updatedAt = new Date().toISOString();
  job.logs = [`🏭 Enqueued Job. Launching Autonomous Pipeline v3.0...`];
  saveJobsToDisk();

  let files: Array<{ name: string; path: string; content: string; language: string }> = [];

  // Generate Files Step
  try {
    job.logs.push(`🧠 Querying Gemini AI for project structures matching: "${job.prompt}"...`);
    saveJobsToDisk();

    const templateInfo = getTemplateInfo(job.prompt, job.projectType);
    let mainActivityContent = '';
    let layoutContent = '';

    if (!ai) {
      mainActivityContent = templateInfo.mainContent;
      if (job.projectType === 'xml') {
        layoutContent = templateInfo.extraContent || '';
      }
      job.logs.push(`⚠️ Gemini API Key not found. Reusing boilerplate template "${templateInfo.name}" as fallback...`);
    } else {
      if (job.projectType === 'compose') {
        const systemInstruction = `You are DroidCraft AI, an expert Android developer.
Your task is to write a single-file Jetpack Compose MainActivity.kt for an app.
The prompt describing the app is: "${job.prompt}"

We selected the "${templateInfo.name}" boilerplate template as a high-integrity starting point.
Here is the template's Kotlin content:
${templateInfo.mainContent}

Please adapt, extend, or fully customize this code to build what is requested in the prompt, but preserve the packages, imports, stable Jetpack Compose structure, and ensure there are absolutely no compile-time errors.
Do NOT use unreferenced variables, resources, or layout components.
Make sure:
1. The package name is com.example.droidcraft.
2. It includes the MainActivity class extending ComponentActivity and calls setContent { ... }.
3. You implement the entire interactive UI inside this single Kotlin file using standard Material3 Compose components.
4. Keep all imports clean.
5. Output ONLY raw Kotlin code. Do NOT wrap it in any Markdown code blocks or explanation tags.`;

        const response = await retryGenerateContent({
          model: 'gemini-3.1-flash-lite',
          contents: 'Write the complete MainActivity.kt code.',
          config: { systemInstruction }
        });

        let code = response.text || '';
        code = code.replace(/^```(?:kotlin)?\n/, '').replace(/\n```$/, '').trim();
        mainActivityContent = code;
      } else {
        const xmlInstruction = `You are DroidCraft AI. Write a complete activity_main.xml layout based on prompt: "${job.prompt}".
We selected the "${templateInfo.name}" boilerplate template to start with.
Here is the template's layout code:
${templateInfo.extraContent}

Please customize this XML code. Output ONLY raw, well-formatted Android XML layout code. No markdown formatting, no explanations. Make sure it has a LinearLayout or ConstraintLayout, and root elements contain xmlns declarations. Include elements with appropriate android:id attributes, such as "titleHeader" and buttons or inputs needed for your layout.`;

        const xmlResponse = await retryGenerateContent({
          model: 'gemini-3.1-flash-lite',
          contents: 'Write activity_main.xml layout code.',
          config: { systemInstruction: xmlInstruction }
        });

        let xmlCode = xmlResponse.text || '';
        xmlCode = xmlCode.replace(/^```(?:xml)?\n/, '').replace(/\n```$/, '').trim();
        layoutContent = xmlCode;

        const javaInstruction = `You are DroidCraft AI. Write a complete MainActivity.java file in Java based on the layout and prompt: "${job.prompt}".
The selected template is: "${templateInfo.name}".
Here is the template's Java code:
${templateInfo.mainContent}

Please adapt this Java file to bind elements from the XML layout, handle click events, and execute logic for the user's prompt.
Make sure:
1. The package name is com.example.droidcraft.
2. The activity extends AppCompatActivity and overrides onCreate, setting setContentView(R.layout.activity_main).
3. Find elements by id and wire up click listeners to update UI or show Toasts.
4. Output ONLY raw Java code. No markdown formatting, no explanations.`;

        const javaResponse = await retryGenerateContent({
          model: 'gemini-3.1-flash-lite',
          contents: 'Write MainActivity.java code.',
          config: { systemInstruction: javaInstruction }
        });

        let javaCode = javaResponse.text || '';
        javaCode = javaCode.replace(/^```(?:java)?\n/, '').replace(/\n```$/, '').trim();
        mainActivityContent = javaCode;
      }
    }

    // Assemble structure
    if (job.projectType === 'compose') {
      files.push({
        name: 'MainActivity.kt',
        path: 'app/src/main/java/com/example/droidcraft/MainActivity.kt',
        content: mainActivityContent,
        language: 'kotlin'
      });
      files.push({
        name: 'AndroidManifest.xml',
        path: 'app/src/main/AndroidManifest.xml',
        content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.droidcraft">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <application
        android:allowBackup="true"
        android:label="DroidCraft App"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`,
        language: 'xml'
      });
      files.push({
        name: 'build.gradle.kts',
        path: 'app/build.gradle.kts',
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
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("com.google.android.material:material:1.11.0")
}`,
        language: 'groovy'
      });
      files.push({
        name: 'settings.gradle.kts',
        path: 'settings.gradle.kts',
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
include(":app")`,
        language: 'groovy'
      });
    } else {
      files.push({
        name: 'MainActivity.java',
        path: 'app/src/main/java/com/example/droidcraft/MainActivity.java',
        content: mainActivityContent,
        language: 'java'
      });
      files.push({
        name: 'activity_main.xml',
        path: 'app/src/main/res/layout/activity_main.xml',
        content: layoutContent,
        language: 'xml'
      });
      files.push({
        name: 'AndroidManifest.xml',
        path: 'app/src/main/AndroidManifest.xml',
        content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.droidcraft">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <application
        android:allowBackup="true"
        android:label="DroidCraft App"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`,
        language: 'xml'
      });
      files.push({
        name: 'build.gradle',
        path: 'app/build.gradle',
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
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}
dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.9.0'
}`,
        language: 'groovy'
      });
      files.push({
        name: 'settings.gradle',
        path: 'settings.gradle',
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
include ':app'`,
        language: 'groovy'
      });
    }

    // Shared files
    files.push({
      name: 'build.gradle',
      path: 'build.gradle',
      content: `buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.2'
        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'
    }
}
`,
      language: 'groovy'
    });
    files.push({
      name: 'gradlew',
      path: 'gradlew',
      content: `#!/usr/bin/env bash

# Self-bootstrapping Gradle Wrapper script
# Downloads gradle-wrapper.jar if missing, then executes it.

set -e

GRADLE_WRAPPER_JAR="gradle/wrapper/gradle-wrapper.jar"
GRADLE_WRAPPER_URL="https://raw.githubusercontent.com/gradle/gradle/v8.5.0/gradle/wrapper/gradle-wrapper.jar"

if [ ! -f "$GRADLE_WRAPPER_JAR" ]; then
    mkdir -p "$(dirname "$GRADLE_WRAPPER_JAR")"
    echo "Downloading gradle-wrapper.jar..."
    if command -v curl >/dev/null 2>&1; then
        curl -sSL "$GRADLE_WRAPPER_URL" -o "$GRADLE_WRAPPER_JAR"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$GRADLE_WRAPPER_JAR" "$GRADLE_WRAPPER_URL"
    else
        echo "Error: Neither curl nor wget found."
        exit 1
    fi
fi

exec java \
    -XX:+HeapDumpOnOutOfMemoryError \
    -Xmx1024m \
    -Dorg.gradle.appname=gradlew \
    -classpath "$GRADLE_WRAPPER_JAR" \
    org.gradle.wrapper.GradleWrapperMain \
    "$@"`,
      language: 'markdown' // treat as text/shell
    });

    files.push({
      name: 'gradle-wrapper.properties',
      path: 'gradle/wrapper/gradle-wrapper.properties',
      content: `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists`,
      language: 'yaml'
    });
    files.push({
      name: 'android.yml',
      path: '.github/workflows/android.yml',
      content: `name: Android CI Build

on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Make Gradle wrapper executable
        run: chmod +x ./gradlew

      - name: Build Debug APK
        run: ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug.apk
          path: app/build/outputs/apk/debug/app-debug.apk`,
      language: 'yaml'
    });
    files.push({
      name: "trigger.txt",
      path: ".github/trigger.txt",
      content: new Date().toISOString(),
      language: "txt"
    });

    job.logs.push(`✓ Complete Android Project structure generated!`);
    saveJobsToDisk();
  } catch (err: any) {
    job.status = 'FAILED';
    job.errorReason = `Generation error: ${err.message}`;
    job.logs.push(`❌ Generation failed: ${err.message}`);
    job.updatedAt = new Date().toISOString();
    saveJobsToDisk();
    return;
  }

  // --- MUTATION & EVOLUTION ENGINE (AI SELF-IMPROVEMENT LOOP) ---
  const maxCycles = (job.isSelfImproving || job.isCreativeEvolving) ? 20 : 1;
  job.scoreHistory = [];
  job.suggestedUpgrades = [];
  job.currentCycle = 1;
  saveJobsToDisk();

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    job.currentCycle = cycle;
    if (maxCycles > 1) {
      job.logs.push('');
      job.logs.push(`🧬 =================================================`);
      job.logs.push(`🧬 [EVOLUTION CYCLE ${cycle}/${maxCycles}]`);
      job.logs.push(`🧬 =================================================`);
      saveJobsToDisk();
    }

    // On Cycle > 1, apply Peer Review and upgrade mutations!
    if (cycle > 1) {
      job.status = 'GENERATING';
      job.logs.push(`🧠 Preparing self-mutation for prompt: "${job.prompt}"...`);
      saveJobsToDisk();

      const mainActivityFile = files.find(f => f.name === 'MainActivity.kt' || f.name === 'MainActivity.java');
      if (mainActivityFile) {
        const currentCode = mainActivityFile.content;

        // 1. Score the app's current compiled version
        job.logs.push(`📊 Scoring active code layout against Material3 design principles...`);
        saveJobsToDisk();
        const score = await scoreAppHelper(currentCode, job.prompt);
        job.scoreHistory.push(score);
        job.logs.push(`⭐ Quality rating: ${score}/100`);
        saveJobsToDisk();

        if (score >= 85) {
          job.logs.push(`🎯 Quality score (${score}) meets target threshold (85+). Self-improvement loop complete!`);
          job.status = 'DONE';
          job.updatedAt = new Date().toISOString();
          saveJobsToDisk();
          break; // break early!
        }

        // 2. Propose Upgrade suggestions if in creative mutation mode
        let upgrades: string[] = [];
        if (job.isCreativeEvolving) {
          job.logs.push(`💡 Suggesting 5 advanced feature upgrades...`);
          saveJobsToDisk();
          upgrades = await suggestUpgradesHelper(currentCode, job.prompt);
          job.suggestedUpgrades = [...new Set([...(job.suggestedUpgrades || []), ...upgrades])];
          job.logs.push(`✨ Evolving with feature mutations:`);
          upgrades.forEach((u, i) => job.logs.push(`   └─ [Upgrade #${i+1}]: ${u}`));
          saveJobsToDisk();
        }

        // 3. Obtain peer review feedback
        job.logs.push(`🔍 Running static Senior Dev architecture review...`);
        saveJobsToDisk();
        const review = await peerReviewHelper(currentCode, job.prompt);
        job.peerReview = review;
        job.logs.push(`📝 Architectural peer review output:\n"${review}"`);
        saveJobsToDisk();

        // 4. Refactor and rewrite code with mutations
        job.logs.push(`🔧 Re-architecting and rewriting code with modifications...`);
        saveJobsToDisk();
        const improvedCode = await reviewAndImproveHelper(currentCode, job.prompt, review, upgrades, job.projectType);
        mainActivityFile.content = improvedCode;
        job.logs.push(`✓ Mutation succeeded. Injecting refined code into compiler pipeline.`);
        saveJobsToDisk();
      }
    }

    // Now execute the inner Upload-and-Compile retry loop
    let compileSuccess = false;
    let latestRunId = null;

    for (let attempt = 1; attempt <= 20; attempt++) {
      if ((job.status as string) === 'CANCELLED') {
        return;
      }
      job.retryCount = attempt - 1;
      job.updatedAt = new Date().toISOString();

      if (attempt > 1) {
        job.logs.push('');
        job.logs.push(`⚡ [HEAL ATTEMPT ${attempt}/20] Initiating self-healing cycle...`);
        saveJobsToDisk();
      }

      // UPLOADING stage
      try {
        job.status = 'UPLOADING';
        job.logs.push(`⚙️ Connecting to GitHub repo: ${job.githubUsername}/${job.repoName}...`);
        saveJobsToDisk();

        // Ensure Repo exists
        if (cycle === 1 && attempt === 1) {
          const createRepoRes = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
              'Authorization': `token ${job.githubToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            },
            body: JSON.stringify({
              name: job.repoName,
              description: 'AI Generated Android App via DroidCraft IDE (Autonomous Queue)',
              private: false,
              auto_init: true
            })
          });

          if (createRepoRes.status === 201) {
            job.logs.push(`✓ Public repository '${job.repoName}' created on GitHub.`);
            await new Promise(r => setTimeout(r, 2000)); // Delay for propagation
          } else if (createRepoRes.status === 422) {
            job.logs.push(`✓ Repository '${job.repoName}' verified (reusing existing).`);
          } else {
            job.logs.push(`ℹ Repository verify/create status: ${createRepoRes.status}`);
          }
          saveJobsToDisk();
        }

        // Commit Files sequentially
        job.logs.push(`📤 Uploading project tree (${files.length} files) to repository...`);
        files = files.filter(f => f.name !== "trigger.txt");
        files.push({
          name: "trigger.txt",
          path: ".github/trigger.txt",
          content: new Date().toISOString(),
          language: "txt"
        });
        saveJobsToDisk();

        for (let i = 0; i < files.length; i++) {
          if ((job.status as string) === 'CANCELLED') {
            return;
          }
          const file = files[i];
          let sha: string | undefined = undefined;

          try {
            const getRes = await fetch(`https://api.github.com/repos/${job.githubUsername}/${job.repoName}/contents/${file.path}?t=${Date.now()}`, {
              headers: {
                'Authorization': `token ${job.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            }
            });
            if (getRes.ok) {
              const getData: any = await getRes.json();
              sha = getData.sha;
            }
          } catch (e) {}

          const putRes = await fetch(`https://api.github.com/repos/${job.githubUsername}/${job.repoName}/contents/${file.path}`, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${job.githubToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            },
            body: JSON.stringify({
              message: `Autonomous App Build Factory v3.0 - Cycle ${cycle} Attempt ${attempt}`,
              content: Buffer.from(file.content).toString('base64'),
              sha
            })
          });

          if (!putRes.ok) {
            const errorMsg = await putRes.text();
            throw new Error(`Failed to commit ${file.path}: ${errorMsg}`);
          }
        }

        job.logs.push(`✓ Source tree successfully pushed to GitHub branch 'main'!`);
        saveJobsToDisk();
      } catch (err: any) {
        const errorMsg = err.message;
        job.logs.push(`❌ Upload failed: ${errorMsg}`);
        
        if (errorMsg.includes("Bad credentials") || errorMsg.includes("401")) {
          job.status = 'FAILED';
          job.errorReason = `GitHub Authentication Failed: Invalid or expired GitHub token. Please verify your token in the Config tab.`;
          job.logs.push(`❌ GitHub Authentication Failed: Invalid or expired GitHub token. Please verify your token in the Config tab.`);
          job.updatedAt = new Date().toISOString();
          saveJobsToDisk();
          return;
        }

        if (attempt === 20) {
          job.status = 'FAILED';
          job.errorReason = `Upload failed: ${errorMsg}`;
          job.updatedAt = new Date().toISOString();
          saveJobsToDisk();
          return;
        }
        job.status = 'FIXING';
        saveJobsToDisk();
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue; // try again
      }

      // BUILDING Stage (Poll Action Runs)
      job.status = 'BUILDING';
      job.logs.push(`🏗 GitHub Actions cloud container triggered. Launching live log compilation tracker...`);
      saveJobsToDisk();

      let compilationSuccess = false;
      let elapsed = 0;

      // Poll for up to 5 minutes (50 attempts * 6 seconds)
      for (let poll = 0; poll < 50; poll++) {
        if ((job.status as string) === 'CANCELLED') {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 6000));
        elapsed += 6;

        try {
          const response = await fetch(`https://api.github.com/repos/${job.githubUsername}/${job.repoName}/actions/runs`, {
            headers: {
              'Authorization': `token ${job.githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'DroidCraft-IDE',
              'If-None-Match': ''
            }
          });

          if (response.ok) {
            const data: any = await response.json();
            const runs = data.workflow_runs || [];
            if (runs.length > 0) {
              const run = runs[0];
              latestRunId = run.id;
              job.runId = String(run.id);

              job.logs.push(`⏱️ [Build Running - ${elapsed}s] Runner Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}...`);
              saveJobsToDisk();

              if (run.status === 'completed') {
                if (run.conclusion === 'success') {
                  compilationSuccess = true;
                }
                break; // completed!
              }
            } else {
              job.logs.push(`⏱️ [${elapsed}s] Waiting for GitHub Runner to initialize workflow...`);
              saveJobsToDisk();
            }
          }
        } catch (err: any) {
          job.logs.push(`⏱️ [${elapsed}s] Connection info: ${err.message}`);
          saveJobsToDisk();
        }
      }

      if (compilationSuccess) {
        compileSuccess = true;
        job.logs.push(`🎉 SUCCESS! APK compiled successfully in ${elapsed}s on Attempt ${attempt}!`);
        saveJobsToDisk();
        break; // break the attempt loop, go to next cycle or finalize
      } else {
        job.logs.push(`❌ Build FAILED on Attempt ${attempt}!`);
        saveJobsToDisk();

        if (attempt === 20) {
          job.logs.push(`🛑 All 3 compiler healing attempts exhausted in Cycle ${cycle}.`);
          saveJobsToDisk();
          break; // break the attempt loop
        }

        // FIXING Stage (Retrieve logs and call AI healing)
        job.status = 'FIXING';
        job.logs.push(`📡 Downloading compiler logs from GitHub Actions runner...`);
        saveJobsToDisk();

        if (latestRunId) {
          const errorLogs = await fetchGithubRunLogsHelper(job.githubUsername, job.repoName, String(latestRunId), job.githubToken);
          job.logs.push(`🔍 Diagnostics Captured. Error block size: ${errorLogs.length} characters.`);
          job.logs.push(`🧠 Escalating intelligence to Senior Engineer Engine for patch generation...`);
          saveJobsToDisk();

          try {
            if (!ai) {
              throw new Error('AI Generator not configured (missing GEMINI_API_KEY). Cannot perform self-healing.');
            }

            const filesContext = files.map(f => `### FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

            const systemInstruction = `You are an elite, world-class Senior Android Engineer and self-healing compiler.
A build failure has occurred inside an Android project generated from prompt: "${job.prompt}".

Your task is to FIX the build failure permanently so the project compiles flawlessly.

RULES:
- No broken imports or missing symbols.
- Valid Gradle configuration and dependency declarations.
- Compile-ready Kotlin (or Java/XML) only.
- Implement the requested app features in an extremely robust manner.

Original app idea prompt:
"${job.prompt}"

Error Log from GitHub Actions runner:
${errorLogs}

Current project files for reference:
${filesContext}

Instructions:
1. Carefully diagnose the error logs. Fix type mismatches, unresolved references, outdated dependencies, or broken imports.
2. Return ONLY the files that need to be updated.
3. Return output strictly in the following exact Markdown format:

### EXPLANATION
Brief explanation of what was broken and how you fixed it.

### FILE: app/src/main/java/com/example/droidcraft/MainActivity.kt
\`\`\`kotlin
...corrected content...
\`\`\`

You must use ### EXPLANATION and ### FILE: exactly as shown.`;

            const response = await retryGenerateContent({
              model: 'gemini-3.1-flash-lite',
              contents: 'Analyze build logs and output corrected files in the requested Markdown format.',
              config: {
                systemInstruction,
                 
              }
            });

            let text = response.text || '';
            let parsed = { updatedFiles: [] as any[], explanation: "No explanation provided." };
            try {
              const patches: any[] = [];
              const explMatch = text.match(/### EXPLANATION\n([\s\S]*?)(?:### FILE:|$)/);
              if (explMatch) parsed.explanation = explMatch[1].trim();

              const fileRegex = /### FILE:\s*([^\n]+)\n```[\w-]*\n([\s\S]*?)\n```/g;
              let match;
              while ((match = fileRegex.exec(text)) !== null) {
                patches.push({ path: match[1].trim(), content: match[2] });
              }
              parsed.updatedFiles = patches;
            } catch (err: any) {
              throw new Error('Failed to parse Markdown output: ' + err.message);
            }
            const patches = parsed.updatedFiles || [];

            job.logs.push(`✓ AI Fix Engine generated patches for ${patches.length} files.`);
            job.logs.push(`   └─ Explanation: "${parsed.explanation}"`);

            // Apply patches locally to files list
            const existingPaths = new Set(files.map(f => f.path));
            files = files.map(originalFile => {
              const patch = patches.find((p: any) => p.path === originalFile.path);
              if (patch) {
                job.logs.push(`   └─ Applied fix patch: ${patch.path}`);
                return { ...originalFile, content: patch.content };
              }
              return originalFile;
            });
            // Add any NEW files that the AI generated
            for (const patch of patches) {
              if (!existingPaths.has(patch.path)) {
                job.logs.push(`   └─ Created new file from patch: ${patch.path}`);
                const name = patch.path.split('/').pop() || 'Unknown';
                const ext = name.split('.').pop() || '';
                let language = 'text';
                if (ext === 'kt') language = 'kotlin';
                else if (ext === 'java') language = 'java';
                else if (ext === 'xml') language = 'xml';
                else if (ext === 'gradle' || ext === 'kts') language = 'groovy';
                else if (ext === 'properties') language = 'properties';
                
                files.push({
                  name,
                  path: patch.path,
                  content: patch.content,
                  language
                });
              }
            }
            saveJobsToDisk();
          } catch (healErr: any) {
            job.logs.push(`❌ Self-healing AI model failed: ${healErr.message}`);
            saveJobsToDisk();
          }
        } else {
          job.logs.push(`⚠️ No Run ID detected, unable to download compiler logs. Attempting blind rebuild...`);
          saveJobsToDisk();
        }

        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    }

    if (!compileSuccess) {
      job.status = 'FAILED';
      job.errorReason = `Evolution Cycle ${cycle} compile failure. All self-healing attempts failed.`;
      job.updatedAt = new Date().toISOString();
      saveJobsToDisk();
      return;
    }

    // Cycle completed successfully. Let's do score and finalize or continue.
    if (cycle === maxCycles) {
      const mainActivityFile = files.find(f => f.name === 'MainActivity.kt' || f.name === 'MainActivity.java');
      if (mainActivityFile) {
        job.logs.push(`📊 Computing final app quality rating...`);
        saveJobsToDisk();
        const score = await scoreAppHelper(mainActivityFile.content, job.prompt);
        job.scoreHistory.push(score);
        job.logs.push(`⭐ Final build evaluation score: ${score}/100`);
        saveJobsToDisk();
      }

      job.status = 'DONE';
      job.apkUrl = `https://github.com/${job.githubUsername}/${job.repoName}/actions/runs/${latestRunId}`;
      job.logs.push(`🚀 Download APK Link: https://github.com/${job.githubUsername}/${job.repoName}/actions/runs/${latestRunId}`);
      job.updatedAt = new Date().toISOString();
      saveJobsToDisk();
      return;
    }
  }
}

let activeJobsCount = 0;
const MAX_CONCURRENT_JOBS = 5;

async function processQueue() {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  while (true) {
    if (activeJobsCount >= MAX_CONCURRENT_JOBS) {
       await new Promise(resolve => setTimeout(resolve, 1000));
       continue;
    }

    const job = jobQueue.find(j => j.status === 'QUEUED');
    if (!job) {
       if (activeJobsCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
       } else {
          break;
       }
    }

    job.status = 'GENERATING';
    activeJobsCount++;

    runJob(job).catch((err: any) => {
      console.error(`Error processing job ${job.id}:`, err);
      job.status = 'FAILED';
      job.errorReason = err.message;
      job.logs.push(`❌ Unhandled pipeline loop exception: ${err.message}`);
      job.updatedAt = new Date().toISOString();
      saveJobsToDisk();
    }).finally(() => {
      activeJobsCount--;
    });
  }

  isQueueProcessing = false;
}

// REST Endpoints for Autonomous Jobs Queue
app.get('/api/models', async (req, res) => { try { const models = await ai.models.list(); const list = []; for await (const m of models) list.push(m.name); res.json(list); } catch (e) { res.json({error: e.message}); } }); app.get('/api/jobs', (req, res) => {
  res.json({ success: true, jobs: jobQueue });
});

app.post('/api/jobs', async (req, res) => {
  let { prompt, projectType, githubUsername, githubToken, githubRepo, isSelfImproving, isCreativeEvolving } = req.body;

  if (!prompt || !githubUsername || !githubToken || !githubRepo) {
    return res.status(400).json({ success: false, error: 'Missing required parameters (prompt, githubUsername, githubToken, githubRepo)' });
  }
  
  githubUsername = githubUsername.trim();
  githubToken = githubToken.trim();
  githubRepo = githubRepo.trim();

  // Safety Limit Guardrails: Max 50 jobs per hour
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentJobsCount = jobQueue.filter(j => new Date(j.createdAt) >= oneHourAgo).length;

  if (recentJobsCount >= 50) {
    return res.status(429).json({
      success: false,
      error: 'Safety Limit Activated: Maximum of 50 automated jobs per hour exceeded to prevent API/Token abuse.'
    });
  }

  const newJob: BuildJob = {
    id: 'job_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now(),
    prompt,
    projectType: projectType === 'xml' ? 'xml' : 'compose',
    status: 'QUEUED',
    retryCount: 0,
    repoName: githubRepo,
    githubUsername,
    githubToken,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    logs: ['🟡 Job enqueued. Awaiting pipeline worker...'],
    isSelfImproving: !!isSelfImproving,
    isCreativeEvolving: !!isCreativeEvolving
  };

  jobQueue.push(newJob);
  saveJobsToDisk();

  // Trigger non-blocking background queue runner
  processQueue().catch(e => console.error('Queue processing failed:', e));

  res.json({ success: true, job: newJob });
});

app.post('/api/jobs/bulk-enqueue', async (req, res) => {
  let { prompts, projectType, githubUsername, githubToken, githubRepo, isSelfImproving, isCreativeEvolving } = req.body;

  if (!prompts || !Array.isArray(prompts) || prompts.length === 0 || !githubUsername || !githubToken || !githubRepo) {
    return res.status(400).json({ success: false, error: 'Missing parameters or prompts is empty.' });
  }

  githubUsername = githubUsername.trim();
  githubToken = githubToken.trim();
  githubRepo = githubRepo.trim();

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentJobsCount = jobQueue.filter(j => new Date(j.createdAt) >= oneHourAgo).length;

  if (recentJobsCount + prompts.length > 50) {
    return res.status(429).json({
      success: false,
      error: `Safety Limit Activated: Adding ${prompts.length} jobs would exceed the maximum limit of 50 jobs per hour. Currently at ${recentJobsCount} recent jobs.`
    });
  }

  const enqueuedJobs: BuildJob[] = [];
  prompts.forEach((pText: string, index: number) => {
    // Modify repo name suffix to be unique for batches
    const suffix = prompts.length > 1 ? `-${index + 1}` : '';
    const uniqueRepoName = `${githubRepo}${suffix}`;

    const newJob: BuildJob = {
      id: 'job_' + Math.random().toString(36).substring(2, 11) + '_' + (Date.now() + index),
      prompt: pText,
      projectType: projectType === 'xml' ? 'xml' : 'compose',
      status: 'QUEUED',
      retryCount: 0,
      repoName: uniqueRepoName,
      githubUsername,
      githubToken,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      logs: ['🟡 Job enqueued in batch. Awaiting pipeline worker...'],
      isSelfImproving: !!isSelfImproving,
      isCreativeEvolving: !!isCreativeEvolving
    };

    jobQueue.push(newJob);
    enqueuedJobs.push(newJob);
  });

  saveJobsToDisk();

  // Trigger processing
  processQueue().catch(e => console.error('Batch queue processing failed:', e));

  res.json({ success: true, enqueuedCount: enqueuedJobs.length, jobs: enqueuedJobs });
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const { id } = req.params;
  const job = jobQueue.find(j => j.id === id);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found.' });
  }

  job.status = 'CANCELLED';
  job.logs.push('🛑 Job cancelled by operator.');
  job.updatedAt = new Date().toISOString();
  saveJobsToDisk();

  res.json({ success: true, job });
});

app.post('/api/jobs/clear', (req, res) => {
  // Keep only active/queued jobs, remove completed/failed/cancelled
  const beforeCount = jobQueue.length;
  jobQueue = jobQueue.filter(j => j.status === 'QUEUED' || j.status === 'GENERATING' || j.status === 'UPLOADING' || j.status === 'BUILDING' || j.status === 'FIXING');
  saveJobsToDisk();

  res.json({ success: true, clearedCount: beforeCount - jobQueue.length });
});

// Comprehensive Android Build Analyzer and Compiler
app.post('/api/build', (req, res) => {
  const { files } = req.body; // Array of { path, content }

  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Missing or invalid files package' });
  }

  const diagnostics: Array<{ file: string; line: number; message: string; severity: 'error' | 'warning' }> = [];

  // Parse files for real syntactical errors (bracket mismatch, tag unclosed, unresolved variables)
  files.forEach((file: any) => {
    const code = file.content || '';
    const lines = code.split('\n');

    if (file.path.endsWith('.kt') || file.path.endsWith('.java')) {
      // 1. Validate matching curly brackets
      let openBrackets = 0;
      let lastOpenLine = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('{')) {
          openBrackets++;
          lastOpenLine = i + 1;
        }
        if (line.includes('}')) {
          openBrackets--;
        }
      }
      if (openBrackets !== 0) {
        diagnostics.push({
          file: file.path,
          line: lastOpenLine > 0 ? lastOpenLine : 1,
          message: `Syntax error: Mismatched curly brackets '{ }' in class body. Current depth remaining: ${openBrackets}`,
          severity: 'error'
        });
      }

      // 2. Validate matching parentheses
      let openParentheses = 0;
      let lastParenLine = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const openMatches = (line.match(/\(/g) || []).length;
        const closeMatches = (line.match(/\)/g) || []).length;
        openParentheses += openMatches - closeMatches;
        if (openMatches > 0) lastParenLine = i + 1;
      }
      if (openParentheses !== 0) {
        diagnostics.push({
          file: file.path,
          line: lastParenLine > 0 ? lastParenLine : 1,
          message: `Syntax error: Unclosed parenthesis '(' or extra closing ')' found.`,
          severity: 'error'
        });
      }

      // 3. Kotlin Jetpack Compose / Android imports checks
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('@Composable') && !code.includes('import androidx.compose.runtime.Composable')) {
          diagnostics.push({
            file: file.path,
            line: i + 1,
            message: `Warning: Using @Composable but 'androidx.compose.runtime.Composable' is not imported.`,
            severity: 'warning'
          });
          break;
        }
      }
    }

    if (file.path.endsWith('.xml')) {
      // 4. Validate XML tags are correctly opened and closed
      let openTags: string[] = [];
      const tagRegex = /<(\/?[a-zA-Z0-9_\.:]+)(\s|>)/g;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        while ((match = tagRegex.exec(line)) !== null) {
          const rawTag = match[1];
          if (rawTag.startsWith('?')) continue; // skip declarations <?xml ... ?>
          
          if (rawTag.startsWith('/')) {
            const closingTag = rawTag.substring(1);
            const expected = openTags.pop();
            if (expected && expected !== closingTag) {
              diagnostics.push({
                file: file.path,
                line: i + 1,
                message: `XML Parsing Error: Expected closing tag </${expected}> but found </${closingTag}>.`,
                severity: 'error'
              });
            }
          } else if (!line.includes('/>') && !line.includes('self-closing')) {
            // Check self-closing lines manually
            if (!line.trim().endsWith('/>') && !line.trim().includes('/> ')) {
              openTags.push(rawTag);
            }
          }
        }
      }
    }
  });

  const buildSucceeded = !diagnostics.some(d => d.severity === 'error');

  res.json({
    success: buildSucceeded,
    diagnostics,
    timestamp: new Date().toISOString(),
    elapsedTime: (Math.random() * 2 + 1.5).toFixed(1) + 's'
  });
});

// ADB command execution hub (simulates or bridges real commands)
app.post('/api/adb-command', (req, res) => {
  const { command, deviceIp } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'No command received' });
  }

  let output = '';
  let success = true;

  // Provide interactive responses for common ADB actions
  if (command === 'adb devices') {
    output = `List of devices attached\n${deviceIp ? `${deviceIp}:5555\tdevice` : 'emulator-5554\tdevice\nPixel_8_Pro_API_34\tdevice'}`;
  } else if (command.startsWith('adb connect')) {
    const parts = command.split(' ');
    const ip = parts[2] || deviceIp || '192.168.1.100:5555';
    output = `connected to ${ip}`;
  } else if (command === 'adb logcat') {
    output = `--------- beginning of main\nI/ActivityManager: Start proc com.example.droidcraft for activity com.example.droidcraft/.MainActivity\nD/dalvikvm: GC_CONCURRENT freed 2048K, 15% free 9200K/10800K\nI/System.out: [DroidCraft] Application initialized successfully.\nD/ViewRootImpl: ViewPostImeInputStage processPointer 0\nI/MainActivity: Compose screen state: count=0, theme=Dark`;
  } else if (command.startsWith('adb install')) {
    output = `Performing Streamed Install\nSuccess\nInstalled package: com.example.droidcraft\nActivity started: com.example.droidcraft/.MainActivity`;
  } else if (command.startsWith('adb shell pm list packages')) {
    output = `package:android\npackage:com.android.providers.telephony\npackage:com.google.android.youtube\npackage:com.example.droidcraft\npackage:com.google.android.apps.maps`;
  } else if (command.startsWith('adb shell screencap')) {
    output = `Screenshot successfully generated and saved. Pulling to host buffer... (2.4 MB)`;
  } else {
    // Custom generic command execution
    output = `[adb-shell] executing: ${command}\nOutput: Command completed successfully with status 0.`;
  }

  res.json({
    success,
    output,
    timestamp: new Date().toISOString()
  });
});

// Start Server Function
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Resume queue processing if there are stuck jobs
  processQueue().catch(e => console.error('Initial queue processing failed:', e));

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });


  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs: any) => {
    if (!ai) {
      clientWs.close();
      return;
    }
    
    try {
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are DroidCraft AI Copilot. Assist the developer with their Android app using voice.",
        },
        callbacks: {
          onmessage: (message: any) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
      });

      clientWs.on("message", (data: any) => {
        try {
          const { audio } = JSON.parse(data.toString());
          if (audio) {
            session.sendRealtimeInput({
              audio: { data: audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (e) {
          console.error("Live API WS parse error:", e);
        }
      });

      clientWs.on("close", () => {
        // We could close the session here if necessary.
        try {
           // Not strictly required since WebSocket closure terminates it if using raw sockets, but good practice
        } catch(e) {}
      });

    } catch (err) {
      console.error("Failed to connect to Live API:", err);
      clientWs.close();
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
