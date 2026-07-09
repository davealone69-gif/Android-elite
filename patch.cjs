const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add Firebase imports
if (!code.includes("import { auth, googleProvider, db }")) {
   code = code.replace(
     "import React, { useState, useEffect, useRef } from 'react';",
     "import React, { useState, useEffect, useRef } from 'react';\nimport { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';\nimport { collection, addDoc, getDocs } from 'firebase/firestore';\nimport { auth, googleProvider, db } from './lib/firebase';"
   );
}

// Add state variables for Firebase, Thinking Mode, Grounding, and Images
if (!code.includes("const [user, setUser] = useState")) {
   code = code.replace(
      "const [aiModel, setAiModel] = useState<string>('gemini-3.1-flash-lite');",
      "const [aiModel, setAiModel] = useState<string>('gemini-3.1-flash-lite');\n  const [useGrounding, setUseGrounding] = useState<boolean>(false);\n  const [thinkingMode, setThinkingMode] = useState<boolean>(false);\n  const [aiAttachments, setAiAttachments] = useState<any[]>([]);\n  const [user, setUser] = useState<User | null>(null);\n  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);\n  const [imagePrompt, setImagePrompt] = useState<string>('');\n  const fileInputRef = useRef<HTMLInputElement>(null);"
   );
}

// Update handleSendAiMessage to include new options
code = code.replace(
   "model: aiModel,",
   "model: aiModel,\n          useGrounding,\n          thinkingMode,\n          attachments: aiAttachments,"
);
code = code.replace(
   "setAiInput('');",
   "setAiInput('');\n    setAiAttachments([]);"
);

// Add Firebase auth effect and methods
if (!code.includes("useEffect(() => {\n    const unsubscribe = onAuthStateChanged(auth")) {
   code = code.replace(
      "// Poll server-side autonomous queue every 3.5 seconds",
      `// Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      triggerToast('Logged in successfully!');
    } catch (e: any) {
      triggerToast('Login failed: ' + e.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    triggerToast('Logged out.');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
           const mimeType = result.substring(result.indexOf(':') + 1, result.indexOf(';'));
           const data = result.split(',')[1];
           setAiAttachments(prev => [...prev, { mimeType, data }]);
           triggerToast('Attachment added.');
        }
     };
     reader.readAsDataURL(file);
  };
  
  // Poll server-side autonomous queue every 3.5 seconds`
   );
}

fs.writeFileSync('src/App.tsx', code);
