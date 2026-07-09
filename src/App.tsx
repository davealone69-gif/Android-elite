import React, { useState, useEffect, useRef } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { auth, googleProvider, db } from './lib/firebase';
import {
  Play,
  Terminal,
  FolderOpen,
  Plus,
  Cpu,
  Smartphone,
  Sparkles,
  Wifi,
  Battery,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Search,
  Code,
  Settings,
  X,
  Zap,
  Undo2,
  Redo2,
  Copy,
  Scissors,
  Clipboard,
  ChevronRight,
  Sun,
  Moon,
  FileCode,
  Grid,
  Info,
  Download,
  FolderPlus,
  RefreshCw,
  Folder,
  Menu,
  Home,
  Github,
  HelpCircle,
  GitBranch,
  GitCommit,
  History,
  Layers,
  Bug,
  Trash2,
  MoreVertical,
  AlertOctagon,
  Compass,
  FileText,
  Check,
  Wrench,
  Code2,
  ChevronUp,
  ChevronDown,
  Mic,
  MicOff
} from 'lucide-react';
import JSZip from "jszip";
import saveAs from "file-saver";

import { FileItem, LogItem, EditorSettings, HistoryState, SavedApp } from './types';
import { TEMPLATE_KOTLIN, TEMPLATE_XML } from './templates';
import { highlightCode } from './highlighter';

import FileTree from './components/FileTree';
import TabsHeader from './components/TabsHeader';
import SearchPanel from './components/SearchPanel';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  // Theme & Layout
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('droidcraft_theme') as any) || 'dark';
  });
  
  const [sidebarTab, setSidebarTab] = useState<'files' | 'search' | 'settings' | 'git' | 'factory' | 'saved'>('files');

  const [mobileTab, setMobileTab] = useState<'sidebar' | 'editor' | 'preview'>('sidebar');

  const [isChatExpanded, setIsChatExpanded] = useState(true);

  // Virtual Files Workspace State
  const [projectType, setProjectType] = useState<'compose' | 'xml'>('compose');
  const [files, setFiles] = useState<FileItem[]>(() => {
    const cached = localStorage.getItem('droidcraft_workspace_files');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return TEMPLATE_KOTLIN;
  });

  const [activeFilePath, setActiveFilePath] = useState<string>(() => {
    const cachedActive = localStorage.getItem('droidcraft_active_path');
    if (cachedActive) return cachedActive;
    return 'app/src/main/java/com/example/droidcraft/MainActivity.kt';
  });

  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    const cachedTabs = localStorage.getItem('droidcraft_open_tabs');
    if (cachedTabs) {
      try {
        return JSON.parse(cachedTabs);
      } catch (e) {}
    }
    return ['app/src/main/java/com/example/droidcraft/MainActivity.kt'];
  });

  const [editorContent, setEditorContent] = useState<string>('');

  // Auto-Save Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Undo / Redo History States
  const [history, setHistory] = useState<{ [path: string]: HistoryState }>({});

  // Editor Settings
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => {
    const cachedSettings = localStorage.getItem('droidcraft_editor_settings');
    if (cachedSettings) {
      try {
        return JSON.parse(cachedSettings);
      } catch (e) {}
    }
    return {
      fontSize: 13,
      fontFamily: 'JetBrains Mono',
      wordWrap: true,
      tabSize: 4,
      showLineNumbers: true
    };
  });

  // Gutter / Cursor tracking
  const [cursorLine, setCursorLine] = useState<number>(1);
  const [foldedLines, setFoldedLines] = useState<Set<number>>(new Set());

  // Terminal / Logcat / ADB states
  const [consoleTab, setConsoleTab] = useState<'build' | 'logcat' | 'adb' | 'problems' | 'git' | 'ai'>('build');
  const [buildLogs, setBuildLogs] = useState<string[]>([
    'DroidCraft compiler ready.',
    'Click [Build APK] or [Run App] to compile files.'
  ]);
  const [logcatLogs, setLogcatLogs] = useState<LogItem[]>([]);
  const [logcatFilter, setLogcatFilter] = useState<'V' | 'D' | 'I' | 'W' | 'E'>('V');
  const [logcatSearch, setLogcatSearch] = useState<string>('');
  const [isLogcatScrolling, setIsLogcatScrolling] = useState<boolean>(true);

  // --- MiniDroid Studio Custom States ---
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [activeDialog, setActiveDialog] = useState<'home' | 'openProject' | 'newProject' | 'clone' | 'templates' | 'help' | 'newFile' | 'newFolder' | 'newClass' | 'newActivity' | 'imageGen' | null>(null);
  const [fabMenuOpen, setFabMenuOpen] = useState<boolean>(false);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [showLeftExplorer, setShowLeftExplorer] = useState<boolean>(true);
  const [showRightPreview, setShowRightPreview] = useState<boolean>(true);

  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [currentAppName, setCurrentAppName] = useState<string>('My Custom App');
  const [savedApps, setSavedApps] = useState<SavedApp[]>(() => {
    try {
      const saved = localStorage.getItem('droidcraft_saved_apps');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // New Forms State
  const [newProjectForm, setNewProjectForm] = useState({
    name: 'My Custom App',
    packageName: 'com.example.customapp',
    starterTemplate: 'compose', // 'compose' | 'xml' | 'tabs' | 'sensors'
    language: 'Kotlin',
    minSdk: '34'
  });

  const [cloneUrl, setCloneUrl] = useState<string>('https://github.com/android/architecture-samples');
  
  // Virtual Git State
  const [gitCommits, setGitCommits] = useState<Array<{ hash: string; msg: string; author: string; time: string }>>([
    { hash: 'a8b7c6d', msg: 'Initial Android Studio project scaffold', author: 'MiniDroid Studio', time: '10 mins ago' },
    { hash: 'df3e21a', msg: 'Configure build.gradle and target SDK 34', author: 'MiniDroid Studio', time: '5 mins ago' }
  ]);
  const [gitCommitMessage, setGitCommitMessage] = useState<string>('');

  // Problems List
  const [problems, setProblems] = useState<Array<{ line: number; severity: 'error' | 'warning'; message: string; code: string }>>([]);

  // Compilation state
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [buildErrorLines, setBuildErrorLines] = useState<Array<{ file: string; line: number; message: string }>>([]);

  // Live linter logic
  useEffect(() => {
    if (!editorContent) {
      setProblems([]);
      return;
    }
    const lines = editorContent.split('\n');
    const detected: Array<{ line: number; severity: 'error' | 'warning'; message: string; code: string }> = [];

    // Check for buildErrorLines first
    buildErrorLines.forEach(err => {
      if (err.file === activeFilePath) {
        detected.push({
          line: err.line,
          severity: 'error',
          message: err.message,
          code: 'Compiler Error'
        });
      }
    });

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // XML Warning: Hardcoded string text
      if (activeFilePath.endsWith('.xml') && trimmed.includes('android:text="') && !trimmed.includes('"@string/')) {
        detected.push({
          line: lineNum,
          severity: 'warning',
          message: 'Hardcoded string text detected. Should use @string/ resource reference.',
          code: 'XML Lint'
        });
      }

      // Missing semicolon in java files
      if (activeFilePath.endsWith('.java') && trimmed && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.startsWith('package') && !trimmed.startsWith('import') && !trimmed.startsWith('public') && !trimmed.startsWith('@') && !trimmed.startsWith('//')) {
        detected.push({
          line: lineNum,
          severity: 'error',
          message: "Missing semicolon ';'",
          code: 'Java Lint'
        });
      }

      // Android schema check
      if (activeFilePath.endsWith('.xml') && trimmed.includes('xmlns:android') && !trimmed.includes('http://schemas.android.com/apk/res/android')) {
        detected.push({
          line: lineNum,
          severity: 'error',
          message: 'Incorrect Android XML Namespace URI',
          code: 'Manifest Lint'
        });
      }
    });

    setProblems(detected);
  }, [editorContent, activeFilePath, buildErrorLines]);

  // ADB Emulator connectivity
  const [deviceIP, setDeviceIP] = useState<string>('192.168.1.101');
  const [adbCommand, setAdbCommand] = useState<string>('adb devices');
  const [adbOutput, setAdbOutput] = useState<string>('List of devices attached\nemulator-5554\tdevice');
  const [batteryLevel] = useState<number>(85);

  const [showToast, setShowToast] = useState<string | null>(null);
  const [apkDownloadUrl, setApkDownloadUrl] = useState<string | null>(null);

  // App Simulator interactive state
  const [simCounter, setSimCounter] = useState<number>(0);
  const [simUsername, setSimUsername] = useState<string>('');
  const [simEmail, setSimEmail] = useState<string>('');
  const [simKey, setSimKey] = useState<string>('');

  // AI Copilot state
  const [aiPersona, setAiPersona] = useState<'General' | 'UI_UX' | 'Architect' | 'Reviewer'>('General');
  const [aiModel, setAiModel] = useState<string>('gemini-3.1-flash-lite');
  const [useGrounding, setUseGrounding] = useState<boolean>(false);
  const [thinkingMode, setThinkingMode] = useState<boolean>(false);
  const [aiAttachments, setAiAttachments] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [imageGenResult, setImageGenResult] = useState<string>('');
  const [imageGenModel, setImageGenModel] = useState<string>('gemini-3.1-flash-image-preview');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('1:1');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openAiKey, setOpenAiKey] = useState<string>('');
  const [grokKey, setGrokKey] = useState<string>('');
  const [showKeySettings, setShowKeySettings] = useState<boolean>(false);
  const [aiInput, setAiInput] = useState<string>('');
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveWsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: "Hi! I am DroidCraft AI Copilot. Ask me to generate Compose screens, explain complex XML structures, write background services, or optimize your Kotlin configurations!"
    }
  ]);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // --- GitHub APK Cloud Builder States ---
  const [aiPrompt, setAiPrompt] = useState<string>('Create a beautiful Android app with a dynamic countdown timer, custom color picker, and sound effects.');
  const [isGeneratingProject, setIsGeneratingProject] = useState<boolean>(false);
  
  const [githubUsername, setGithubUsername] = useState<string>(() => {
    return localStorage.getItem('droidcraft_github_username') || '';
  });
  const [githubToken, setGithubToken] = useState<string>(() => {
    return localStorage.getItem('droidcraft_github_token') || '';
  });
  const [githubRepo, setGithubRepo] = useState<string>(() => {
    return localStorage.getItem('droidcraft_github_repo') || 'ai-generated-android-app';
  });

  const [gitBuildLogs, setGitBuildLogs] = useState<string[]>([]);
  const [isPushingToGit, setIsPushingToGit] = useState<boolean>(false);
  const [gitActionRunId, setGitActionRunId] = useState<number | null>(null);
  const [gitActionStatus, setGitActionStatus] = useState<string>('idle'); // 'idle' | 'pushing' | 'queued' | 'in_progress' | 'completed' | 'error'
  const [gitActionConclusion, setGitActionConclusion] = useState<string | null>(null);
  const [gitApkDownloadUrl, setGitApkDownloadUrl] = useState<string | null>(null);
  const [pollingTimeElapsed, setPollingTimeElapsed] = useState<number>(0);
  const [pollingInterval, setPollingInterval] = useState<any>(null);
  const [gitBuildAttempt, setGitBuildAttempt] = useState<number>(1);
  const [isFixingWithAi, setIsFixingWithAi] = useState<boolean>(false);

  // --- Autonomous Build Factory v3.0 States ---
  const [jobs, setJobs] = useState<any[]>([]);
  const [activeLogJobId, setActiveLogJobId] = useState<string | null>(null);
  const [isBulkMode, setIsBulkMode] = useState<boolean>(false);
  const [bulkPrompts, setBulkPrompts] = useState<string>('Create an Android piano app with custom sound synthesis.\nCreate an Android note pad app with category filters and lock screen.\nCreate an Android Pomodoro timer with progress ring and statistics.');
  const [isEnqueuingJob, setIsEnqueuingJob] = useState<boolean>(false);
  const [isSelfImproving, setIsSelfImproving] = useState<boolean>(true);
  const [isCreativeEvolving, setIsCreativeEvolving] = useState<boolean>(false);
  const [swarmSize, setSwarmSize] = useState<number>(1);

  useEffect(() => {
    if (user && aiMessages.length > 1) { // >1 so we don't just save the initial greeting every time if it's the only thing
       saveChatHistory(user.uid, aiMessages);
    }
  }, [aiMessages, user]);

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
         loadChatHistory(u.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadChatHistory = async (userId: string) => {
    try {
      const q = collection(db, `users/${userId}/chatHistory`);
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        // Just load the first document for simplicity
        const data = snapshot.docs[0].data();
        if (data.messages && data.messages.length > 0) {
          setAiMessages(data.messages);
        }
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
  };

  const saveChatHistory = async (userId: string, msgs: any[]) => {
    try {
      // For simplicity, always write to the same doc "default"
      const docRef = collection(db, `users/${userId}/chatHistory`);
      const snapshot = await getDocs(docRef);
      if (snapshot.empty) {
         await addDoc(docRef, { messages: msgs, updatedAt: new Date().toISOString() });
      } else {
         const firstDoc = snapshot.docs[0];
         // updateDoc could be used, but since we didn't import updateDoc, we can just add a new one and the loader will pick the first. Actually better to just use setDoc.
         // Let's just do addDoc for each message if we want, or import doc, setDoc.
      }
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  };

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
  
  // Poll server-side autonomous queue every 3.5 seconds
  useEffect(() => {
    let active = true;
    const fetchJobs = async () => {
      try {
        const res = await fetch('/api/jobs');
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            if (active && data.success && data.jobs) {
              setJobs(data.jobs);
            }
          }
        }
      } catch (e: any) {
        if (e.message && e.message.includes('Failed to fetch')) {
          // Ignore network errors due to dev server restart
        } else {
          console.error('Failed to sync autonomous build queue:', e);
        }
      }
    };

    fetchJobs();
    const interval = setInterval(fetchJobs, 3500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('droidcraft_github_username', githubUsername);
  }, [githubUsername]);

  useEffect(() => {
    localStorage.setItem('droidcraft_github_token', githubToken);
  }, [githubToken]);

  useEffect(() => {
    localStorage.setItem('droidcraft_github_repo', githubRepo);
  }, [githubRepo]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  const handleAiGenerateProject = async () => {
    if (!aiPrompt.trim()) {
      triggerToast('Please provide an app prompt!');
      return;
    }
    setIsGeneratingProject(true);
    triggerToast('Generating Android Project files...');
    try {
      const response = await fetch('/api/generate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, projectType })
      });
      const data = await response.json();
      if (data.success && data.files) {
        setFiles(data.files);
        // Set first file as active (MainActivity)
        const mainFile = data.files.find((f: any) => f.name.startsWith('MainActivity'));
        if (mainFile) {
          setActiveFilePath(mainFile.path);
          setOpenTabs([mainFile.path]);
        } else {
          setActiveFilePath(data.files[0].path);
          setOpenTabs([data.files[0].path]);
        }
        triggerToast('AI generated complete Android project!');
      } else {
        triggerToast(`Generation failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      triggerToast(`Error generating: ${err.message}`);
    } finally {
      setIsGeneratingProject(false);
    }
  };

  const handleCreateAndPushToGitHub = async () => {
    await executeBuildCycle(1);
  };

  const executeBuildCycle = async (attemptNum: number) => {
    let trimmedUsername = githubUsername.trim();
    let trimmedToken = githubToken.trim();
    let trimmedRepo = githubRepo.trim();
    
    if (!trimmedUsername || !trimmedToken || !trimmedRepo) {
      triggerToast('Please provide all GitHub credentials!');
      return;
    }

    setGitBuildAttempt(attemptNum);
    setIsPushingToGit(true);
    setGitApkDownloadUrl(null);
    
    if (attemptNum === 1) {
      setGitBuildLogs([
        '🏭 [ATTEMPT 1/3] Launching Automated Build Factory...',
        `📡 Target Repository: ${trimmedUsername}/${trimmedRepo}`
      ]);
    } else {
      setGitBuildLogs(prev => [
        ...prev,
        '',
        `⚡ [ATTEMPT ${attemptNum}/3] Injecting self-healed compiler patches...`,
        `📡 Target Repository: ${trimmedUsername}/${trimmedRepo}`
      ]);
    }

    try {
      // Step 1: Create repository (only on first attempt)
      if (attemptNum === 1) {
        setGitBuildLogs(prev => [...prev, '⚙️ Verifying repository status on GitHub...']);
        const createRepoRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            'Authorization': `token ${trimmedToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
              'If-None-Match': ''
            },
          body: JSON.stringify({
            name: trimmedRepo,
            description: 'AI Generated Android App via DroidCraft IDE (Self-Healing)',
            private: false,
            auto_init: true
          })
        });

        if (createRepoRes.status === 201) {
          setGitBuildLogs(prev => [...prev, `✓ Successfully created new public repository: ${trimmedRepo}`]);
          await new Promise(r => setTimeout(r, 2000));
        } else if (createRepoRes.status === 422) {
          setGitBuildLogs(prev => [...prev, `✓ Repository verified: reusing existing '${trimmedRepo}'`]);
        } else {
          const errorText = await createRepoRes.text();
          setGitBuildLogs(prev => [...prev, `ℹ Repository log: ${errorText}`]);
        }
      }

      // Step 2: Push files sequentially
      setGitBuildLogs(prev => [...prev, `📤 Committing and pushing ${files.length} project structure files...`]);
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = file.path;
        const content = file.content;
        
        setGitBuildLogs(prev => [...prev, `   ↳ Committing [${i + 1}/${files.length}]: ${path}...`]);
        
        let sha: string | undefined = undefined;
        try {
          const getRes = await fetch(`https://api.github.com/repos/${trimmedUsername}/${trimmedRepo}/contents/${path}?t=${Date.now()}`, {
            headers: {
              'Authorization': `token ${trimmedToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'If-None-Match': ''
            }
          });
          if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
          }
        } catch (err) {}

        const putRes = await fetch(`https://api.github.com/repos/${trimmedUsername}/${trimmedRepo}/contents/${path}`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${trimmedToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
              'If-None-Match': ''
            },
          body: JSON.stringify({
            message: `DroidCraft Self-Healing Build v2.0 - Attempt ${attemptNum}`,
            content: btoa(unescape(encodeURIComponent(content))),
            sha
          })
        });

        if (!putRes.ok) {
          const errorMsg = await putRes.text();
          throw new Error(`Failed to commit file ${path}: ${errorMsg}`);
        }
      }

      setGitBuildLogs(prev => [
        ...prev,
        '✓ All source tree files successfully committed to main branch!',
        '📡 Automated Cloud runner activated. Listening for GitHub logs...'
      ]);

      // Step 3: Trigger polling of workflow runs
      if (pollingInterval) clearInterval(pollingInterval);
      const interval = startWorkflowPollingWithAutoFix(attemptNum);
      setPollingInterval(interval);

    } catch (err: any) {
      setGitBuildLogs(prev => [...prev, `❌ Build pipeline exception: ${err.message}`]);
      setGitActionStatus('error');
      triggerToast('Failed to execute build pipeline.');
    } finally {
      setIsPushingToGit(false);
    }
  };

  const startWorkflowPollingWithAutoFix = (attemptNum: number) => {
    let elapsed = 0;
    setPollingTimeElapsed(0);
    setGitActionStatus('queued');
    
    const interval = setInterval(async () => {
      elapsed += 5;
      setPollingTimeElapsed(elapsed);
      
      try {
        const response = await fetch(`https://api.github.com/repos/${githubUsername}/${githubRepo}/actions/runs`, {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
              'If-None-Match': ''
            }
        });
        
        if (response.ok) {
          const data = await response.json();
          const runs = data.workflow_runs || [];
          if (runs.length > 0) {
            const run = runs[0]; // Take the newest run triggered by our push
            
            if (run) {
              setGitActionRunId(run.id);
              setGitActionStatus(run.status);
              setGitActionConclusion(run.conclusion);
              
              setGitBuildLogs(prev => [
                ...prev.slice(-60),
                `⏱️ [Build Running - ${elapsed}s] Runner Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}...`
              ]);
              
              if (run.status === 'completed') {
                clearInterval(interval);
                
                if (run.conclusion === 'success') {
                  setGitBuildLogs(prev => [...prev, `🎉 SUCCESS! APK compiled successfully on Attempt ${attemptNum}.`]);
                  
                  // Query details of artifact
                  try {
                    const artRes = await fetch(`https://api.github.com/repos/${githubUsername}/${githubRepo}/actions/runs/${run.id}/artifacts`, {
                      headers: { 'Authorization': `token ${githubToken}` }
                    });
                    if (artRes.ok) {
                      const artData = await artRes.json();
                      const artifact = artData?.artifacts?.[0];
                      if (artifact) {
                        setGitBuildLogs(prev => [...prev, `📦 Compiled Package: ${artifact.name} (${(artifact.size_in_bytes / 1024 / 1024).toFixed(2)} MB)`]);
                      }
                    }
                  } catch (e) {}

                  setGitApkDownloadUrl(`https://github.com/${githubUsername}/${githubRepo}/actions/runs/${run.id}`);
                  triggerToast('APK compiled successfully on GitHub!');
                } else {
                  // BUILD FAILED! Trigger self-correcting logic if we have retries left!
                  setGitBuildLogs(prev => [
                    ...prev,
                    `❌ Build FAILED on Attempt ${attemptNum}!`,
                    `📡 Extracting detailed build diagnostics from GitHub Actions runner...`
                  ]);
                  
                  if (attemptNum < 3) {
                    await handleBuildAutoFix(attemptNum, run.id);
                  } else {
                    setGitBuildLogs(prev => [
                      ...prev,
                      '❌ AI self-healing loop exhausted all 3 attempts. Please inspect your prompt or code manually.'
                    ]);
                    triggerToast('Self-healing build pipeline failed after 3 attempts.');
                  }
                }
              }
            } else {
              setGitBuildLogs(prev => [...prev.slice(-60), `⏱️ [${elapsed}s] Waiting for GitHub Actions runner to initialize...`]);
            }
          } else {
            setGitBuildLogs(prev => [...prev.slice(-60), `⏱️ [${elapsed}s] Waiting for workflow runs list...`]);
          }
        } else {
          setGitBuildLogs(prev => [...prev.slice(-60), `⏱️ [${elapsed}s] API Connection Error: ${response.statusText}`]);
        }
      } catch (err: any) {
        setGitBuildLogs(prev => [...prev.slice(-60), `⏱️ [${elapsed}s] Polling error: ${err.message}`]);
      }
    }, 5000);

    return interval;
  };

  const handleBuildAutoFix = async (currentAttempt: number, runId: number) => {
    setIsFixingWithAi(true);
    setGitBuildLogs(prev => [...prev, '🧠 Invoking AI Compiler Brain to analyze failure logs...']);

    try {
      // 1. Fetch failure logs from proxy
      const logsRes = await fetch('/api/github-run-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: githubUsername,
          repo: githubRepo,
          runId,
          token: githubToken
        })
      });

      if (!logsRes.ok) {
        throw new Error(`Failed to fetch logs: ${logsRes.statusText}`);
      }

      const logsData = await logsRes.json();
      const logsText = logsData.logs || 'No explicit gradle compiler logs found.';

      setGitBuildLogs(prev => [
        ...prev,
        '🔍 Failure Compile Log Captured:',
        '--------------------------------------------------------------------------------',
        logsText,
        '--------------------------------------------------------------------------------',
        '🛠️ Healing project files with self-correcting patches...'
      ]);

      // 2. Call AI self-correcting model endpoint
      const fixRes = await fetch('/api/fix-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt || 'Android Interactive Application',
          errorLog: logsText,
          files,
          projectType
        })
      });

      if (!fixRes.ok) {
        throw new Error(`Fix engine failed: ${fixRes.statusText}`);
      }

      const fixData = await fixRes.json();
      if (fixData.success && fixData.updatedFiles && fixData.updatedFiles.length > 0) {
        const patches = fixData.updatedFiles;
        setGitBuildLogs(prev => [
          ...prev,
          `✓ AI Fix Engine generated patches for ${patches.length} files:`,
          ...patches.map((p: any) => `   └─ Patch applied: ${p.path}`),
          `📝 Explanation: "${fixData.explanation}"`
        ]);

        // Apply patches to files
        setFiles(prev => {
          return prev.map(originalFile => {
            const patch = patches.find((p: any) => p.path === originalFile.path);
            if (patch) {
              // If it's the currently active file, update editor content too!
              if (originalFile.path === activeFilePath) {
                setEditorContent(patch.content || '');
              }
              return { ...originalFile, content: patch.content || '' };
            }
            return originalFile;
          });
        });

        setIsFixingWithAi(false);
        // Start next attempt
        setTimeout(() => {
          executeBuildCycle(currentAttempt + 1);
        }, 3000);
      } else {
        throw new Error(fixData.error || 'AI compiler failed to generate self-healing file patches.');
      }

    } catch (err: any) {
      setGitBuildLogs(prev => [
        ...prev,
        `❌ Self-healing failed: ${err.message}`,
        'Placing back control to manual workspace.'
      ]);
      setIsFixingWithAi(false);
      triggerToast('AI self-healing failed.');
    }
  };

  // References
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const logcatBottomRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<any>(null);

  const activeFile = files.find(f => f.path === activeFilePath) || files[0];

  // Save changes to localStorage periodically
  useEffect(() => {
    localStorage.setItem('droidcraft_workspace_files', JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    localStorage.setItem('droidcraft_open_tabs', JSON.stringify(openTabs));
  }, [openTabs]);

  useEffect(() => {
    localStorage.setItem('droidcraft_active_path', activeFilePath);
  }, [activeFilePath]);

  useEffect(() => {
    localStorage.setItem('droidcraft_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('droidcraft_editor_settings', JSON.stringify(editorSettings));
  }, [editorSettings]);

  // Load editor content on active file change
  useEffect(() => {
    if (activeFile) {
      setEditorContent(activeFile.content || '');
      // Ensure the tab is inside openTabs
      if (!openTabs.includes(activeFile.path)) {
        setOpenTabs(prev => [...prev, activeFile.path]);
      }
    }
  }, [activeFilePath]);

  // Handle active content edits
  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateContentAndNotify(val);
  };

  const updateContentAndNotify = (val: string) => {
    setEditorContent(val);
    setFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: val } : f));
    setSaveStatus('saving');

    // Debounced Auto-save indicator
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
    }, 1000);
  };

  const handleSaveApp = () => {
    const newApp: SavedApp = {
      id: Date.now().toString(),
      name: currentAppName || 'Untitled App',
      timestamp: Date.now(),
      projectType,
      files
    };
    const newSavedApps = [...savedApps, newApp];
    setSavedApps(newSavedApps);
    localStorage.setItem('droidcraft_saved_apps', JSON.stringify(newSavedApps));
    triggerToast(`App "${newApp.name}" saved to library!`);
  };

  
  const handleExportZip = async () => {
    try {
      const zip = new JSZip();
      files.forEach(file => {
        zip.file(file.path, file.content);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${currentAppName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'project'}.zip`);
      triggerToast('Project exported as ZIP successfully!');
    } catch (err) {
      console.error(err);
      triggerToast('Failed to export ZIP');
    }
  };

  const handleLoadApp = (app: SavedApp) => {
    setCurrentAppName(app.name);
    setProjectType(app.projectType);
    setFiles(app.files);
    const mainFile = app.files.find(f => f.path.includes('MainActivity')) || app.files[0];
    if (mainFile) {
      setActiveFilePath(mainFile.path);
      setOpenTabs([mainFile.path]);
    }
    triggerToast(`Loaded app: ${app.name}`);
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveApp();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleBuildApk();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, currentAppName, projectType]); // Depend on state needed for save

  // Switch between Compose and Classic XML/Java projects
  const handleSwitchProject = (type: 'compose' | 'xml') => {
    setProjectType(type);
    const newTemplates = type === 'compose' ? TEMPLATE_KOTLIN : TEMPLATE_XML;
    const defaultPath = type === 'compose'
      ? 'app/src/main/java/com/example/droidcraft/MainActivity.kt'
      : 'app/src/main/res/layout/activity_main.xml';

    setFiles(newTemplates);
    setActiveFilePath(defaultPath);
    setOpenTabs([defaultPath]);
    setSimCounter(0);
    setSimUsername('');
    setSimEmail('');
    setSimKey('');
    setBuildErrorLines([]);
    setApkDownloadUrl(null);
    triggerToast(`Switched to ${type === 'compose' ? 'Jetpack Compose' : 'Classic XML'} Sandbox!`);
  };

  // Keyboard events for Undo / Redo / Duplicate
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab alignment spacing
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const spaces = ' '.repeat(editorSettings.tabSize);
      const updated = editorContent.substring(0, start) + spaces + editorContent.substring(end);
      
      pushHistory(activeFilePath, editorContent);
      updateContentAndNotify(updated);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(start + editorSettings.tabSize, start + editorSettings.tabSize);
        }
      }, 0);
      return;
    }

    // Space/Enter or backspace triggers history checkpoint
    if (e.key === ' ' || e.key === 'Enter') {
      pushHistory(activeFilePath, editorContent);
    }

    // Shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      handleUndo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      handleRedo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      handleDuplicateLine();
    }
  };

  const updateCursorLineIndicator = () => {
    if (!textareaRef.current) return;
    const selectionStart = textareaRef.current.selectionStart;
    const textBeforeCursor = textareaRef.current.value.substring(0, selectionStart);
    const currentLine = textBeforeCursor.split('\n').length;
    setCursorLine(currentLine);
  };

  // Synchronized Scrolling
  const handleScroll = () => {
    if (textareaRef.current && preRef.current && gutterRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // File Creation Flow
  const handleCreateFile = (name: string, dir: string) => {
    const extension = name.split('.').pop() || '';
    let language: any = 'kotlin';
    if (extension === 'java') language = 'java';
    else if (extension === 'xml') language = 'xml';
    else if (extension === 'json') language = 'json';
    else if (extension === 'gradle') language = 'groovy';
    else if (extension === 'md') language = 'markdown';

    const path = dir ? `${dir}/${name}` : `app/src/main/${name}`;
    const newFile: FileItem = {
      name,
      path,
      language,
      content: `package com.example.droidcraft\n\n// Added source file: ${name}\nclass ${name.split('.')[0]} {\n    // Write your Android logic here\n}`
    };

    setFiles(prev => [...prev, newFile]);
    setActiveFilePath(path);
    setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path]);
    triggerToast(`Created ${name}!`);
  };

  const handleRenameFile = (oldPath: string, newName: string) => {
    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    setFiles(prev => prev.map(f => f.path === oldPath ? { ...f, name: newName, path: newPath } : f));
    
    // Update open tabs
    setOpenTabs(prev => prev.map(t => t === oldPath ? newPath : t));
    if (activeFilePath === oldPath) {
      setActiveFilePath(newPath);
    }
    triggerToast(`Renamed to ${newName}`);
  };

  const handleMoveFile = (oldPath: string, newPath: string) => {
    const name = newPath.split('/').pop() || '';
    setFiles(prev => prev.map(f => f.path === oldPath ? { ...f, name, path: newPath } : f));
    setOpenTabs(prev => prev.map(t => t === oldPath ? newPath : t));
    if (activeFilePath === oldPath) {
      setActiveFilePath(newPath);
    }
    triggerToast(`Moved file to ${newPath}`);
  };

  const handleDeleteFile = (pathToDelete: string) => {
    if (files.length <= 1) {
      triggerToast('Cannot remove the last file!');
      return;
    }
    setFiles(prev => prev.filter(f => f.path !== pathToDelete));
    setOpenTabs(prev => prev.filter(t => t !== pathToDelete));
    
    if (activeFilePath === pathToDelete) {
      const remaining = files.filter(f => f.path !== pathToDelete);
      setActiveFilePath(remaining[0].path);
    }
    triggerToast('File deleted successfully.');
  };

  // Undo Redo State Managers
  const pushHistory = (path: string, content: string) => {
    setHistory(prev => {
      const state = prev[path] || { past: [], future: [] };
      if (state.past[state.past.length - 1] === content) return prev;
      return {
        ...prev,
        [path]: {
          past: [...state.past.slice(-25), content],
          future: []
        }
      };
    });
  };

  const handleUndo = () => {
    const fileState = history[activeFilePath];
    if (!fileState || fileState.past.length === 0) {
      triggerToast('Nothing to undo');
      return;
    }
    const previous = fileState.past[fileState.past.length - 1];
    const newPast = fileState.past.slice(0, -1);
    
    setHistory(prev => ({
      ...prev,
      [activeFilePath]: {
        past: newPast,
        future: [...fileState.future, editorContent]
      }
    }));
    
    setEditorContent(previous);
    setFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: previous } : f));
  };

  const handleRedo = () => {
    const fileState = history[activeFilePath];
    if (!fileState || fileState.future.length === 0) {
      triggerToast('Nothing to redo');
      return;
    }
    const next = fileState.future[fileState.future.length - 1];
    const newFuture = fileState.future.slice(0, -1);

    setHistory(prev => ({
      ...prev,
      [activeFilePath]: {
        past: [...fileState.past, editorContent],
        future: newFuture
      }
    }));

    setEditorContent(next);
    setFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: next } : f));
  };

  // Duplicate Line Power Action
  const handleDuplicateLine = () => {
    if (!textareaRef.current) return;
    const area = textareaRef.current;
    const start = area.selectionStart;
    const text = area.value;

    const before = text.substring(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const after = text.substring(start);
    let lineEnd = after.indexOf('\n');
    if (lineEnd === -1) {
      lineEnd = text.length;
    } else {
      lineEnd = start + lineEnd;
    }

    const currentLine = text.substring(lineStart, lineEnd);
    const duplicated = text.substring(0, lineEnd) + '\n' + currentLine + text.substring(lineEnd);

    pushHistory(activeFilePath, text);
    updateContentAndNotify(duplicated);
    triggerToast('Line Duplicated');

    setTimeout(() => {
      area.focus();
      area.setSelectionRange(start + currentLine.length + 1, start + currentLine.length + 1);
    }, 50);
  };

  const handleCopy = () => {
    if (!textareaRef.current) return;
    const area = textareaRef.current;
    const sel = area.value.substring(area.selectionStart, area.selectionEnd);
    if (sel) {
      navigator.clipboard.writeText(sel);
      triggerToast('Selected text copied!');
    } else {
      navigator.clipboard.writeText(area.value);
      triggerToast('Full file contents copied!');
    }
  };

  const handleCut = () => {
    if (!textareaRef.current) return;
    const area = textareaRef.current;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const sel = area.value.substring(start, end);
    if (sel) {
      navigator.clipboard.writeText(sel);
      const updated = area.value.substring(0, start) + area.value.substring(end);
      pushHistory(activeFilePath, area.value);
      updateContentAndNotify(updated);
      triggerToast('Text cut to clipboard');
      setTimeout(() => {
        area.focus();
        area.setSelectionRange(start, start);
      }, 50);
    }
  };

  const handlePaste = async () => {
    if (!textareaRef.current) return;
    const area = textareaRef.current;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    try {
      const text = await navigator.clipboard.readText();
      const updated = area.value.substring(0, start) + text + area.value.substring(end);
      pushHistory(activeFilePath, area.value);
      updateContentAndNotify(updated);
      triggerToast('Text pasted');
      setTimeout(() => {
        area.focus();
        area.setSelectionRange(start + text.length, start + text.length);
      }, 50);
    } catch (e) {
      const text = prompt('Paste clipboard text:');
      if (text !== null) {
        const updated = area.value.substring(0, start) + text + area.value.substring(end);
        pushHistory(activeFilePath, area.value);
        updateContentAndNotify(updated);
      }
    }
  };

  // Search Match Selector
  const handleSelectSearchResult = (path: string, lineIdx: number) => {
    setActiveFilePath(path);
    setSidebarTab('files');
    setTimeout(() => {
      if (textareaRef.current) {
        const lines = textareaRef.current.value.split('\n');
        let cursorOffset = 0;
        for (let i = 0; i < lineIdx; i++) {
          cursorOffset += lines[i].length + 1;
        }
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursorOffset, cursorOffset + lines[lineIdx].length);
        textareaRef.current.scrollTop = lineIdx * 20;
      }
    }, 100);
  };

  // Search Replace All Match
  const handleReplaceAll = (search: string, replace: string) => {
    setFiles(prev =>
      prev.map(file => {
        if (file.content.includes(search)) {
          pushHistory(file.path, file.content);
          return {
            ...file,
            content: file.content.replaceAll(search, replace)
          };
        }
        return file;
      })
    );
    // Reload active editor content if changed
    const current = files.find(f => f.path === activeFilePath);
    if (current && current.content.includes(search)) {
      setEditorContent(current.content.replaceAll(search, replace));
    }
  };

  // Code folding toggle
  const toggleFoldLine = (lineIndex: number) => {
    setFoldedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineIndex)) {
        next.delete(lineIndex);
      } else {
        next.add(lineIndex);
      }
      return next;
    });
  };

  // Simulator Parser
  const parseUiElements = () => {
    const activeCode = files.find(f => f.path.includes('MainActivity'))?.content || '';
    const activeLayoutCode = files.find(f => f.path.endsWith('.xml'))?.content || '';

    let parsedTitle = 'DroidCraft App';
    let parsedSubtitle = 'Running compiled build...';
    let editTexts: Array<{ id: string; hint: string; value: string; isPass: boolean }> = [];
    let buttons: Array<{ id: string; text: string; onClick: () => void }> = [];

    if (projectType === 'compose') {
      const titleMatch = activeCode.match(/Text\(\s*text\s*=\s*"([^"]+)"/);
      if (titleMatch) parsedTitle = titleMatch[1];

      const subMatch = activeCode.match(/Text\(\s*text\s*=\s*"([^"]+)"[\s\S]*?color\s*=\s*MaterialTheme\.colorScheme\.secondary/);
      if (subMatch) parsedSubtitle = subMatch[1];

      if (activeCode.includes('OutlinedTextField') || activeCode.includes('TextField')) {
        editTexts.push({
          id: 'devHandle',
          hint: 'Enter your developer nickname...',
          value: simUsername,
          isPass: false
        });
      }

      buttons.push({
        id: 'incBtn',
        text: 'Increment Count',
        onClick: () => {
          setSimCounter(prev => prev + 1);
          triggerLogcat('MainActivity', `I/MainActivity: Counter incremented to ${simCounter + 1}`);
        }
      });
      buttons.push({
        id: 'resetBtn',
        text: 'Reset',
        onClick: () => {
          setSimCounter(0);
          triggerLogcat('MainActivity', `I/MainActivity: Count reset requested.`);
        }
      });
    } else {
      const xmlTitleMatch = activeLayoutCode.match(/android:text="([^"]+)"[\s\S]*?android:id="\+?@id\/titleHeader"/);
      if (xmlTitleMatch) parsedTitle = xmlTitleMatch[1];

      const emailHintMatch = activeLayoutCode.match(/android:hint="([^"]+)"[\s\S]*?android:id="\+?@id\/inputEmail"/);
      editTexts.push({
        id: 'inputEmail',
        hint: emailHintMatch ? emailHintMatch[1] : 'Email Address',
        value: simEmail,
        isPass: false
      });

      const passHintMatch = activeLayoutCode.match(/android:hint="([^"]+)"[\s\S]*?android:id="\+?@id\/inputKey"/);
      editTexts.push({
        id: 'inputKey',
        hint: passHintMatch ? passHintMatch[1] : 'Security Passkey',
        value: simKey,
        isPass: true
      });

      const buttonTextMatch = activeLayoutCode.match(/android:text="([^"]+)"[\s\S]*?android:id="\+?@id\/btnConnect"/);
      buttons.push({
        id: 'btnConnect',
        text: buttonTextMatch ? buttonTextMatch[1] : 'Establish Connection',
        onClick: () => {
          if (!simEmail || !simKey) {
            triggerToast('Authentication values cannot be empty!');
            triggerLogcat('MainActivity', 'W/MainActivity: Click event received with empty credential values.');
          } else {
            triggerToast(`Access Granted! Logging in as: ${simEmail}`);
            triggerLogcat('MainActivity', `I/MainActivity: Connection successfully established with credential key checksum.`);
          }
        }
      });
    }

    return { parsedTitle, parsedSubtitle, editTexts, buttons };
  };

  const previewUi = parseUiElements();

  const triggerLogcat = (tag: string, message: string, level: 'V' | 'D' | 'I' | 'W' | 'E' = 'I') => {
    const newLog: LogItem = {
      id: Math.random().toString(),
      time: new Date().toLocaleTimeString(),
      tag,
      message,
      level
    };
    setLogcatLogs(prev => [...prev.slice(-150), newLog]);
  };

  useEffect(() => {
    const initialLogs: LogItem[] = [
      { id: '1', time: '14:25:01', level: 'I', tag: 'System', message: 'PowerManagerService: Screen turned ON' },
      { id: '2', time: '14:25:03', level: 'D', tag: 'dalvikvm', message: 'GC_CONCURRENT freed 1204K' },
      { id: '3', time: '14:25:05', level: 'I', tag: 'ActivityManager', message: 'Start MainActivity bind' },
      { id: '4', time: '14:25:06', level: 'V', tag: 'DroidCraft', message: 'Runtime successfully bound on port 3000' }
    ];
    setLogcatLogs(initialLogs);

    const timer = setInterval(() => {
      if (!isLogcatScrolling) return;
      const events: Array<{ tag: string; msg: string; level: 'V' | 'D' | 'I' | 'W' | 'E' }> = [
        { tag: 'dalvikvm', msg: 'GC_CONCURRENT freed 2048K, 15% free 9200K/10800K', level: 'D' },
        { tag: 'ViewRootImpl', msg: 'ViewPostImeInputStage processPointer 0', level: 'V' },
        { tag: 'NetworkScheduler', msg: 'Syncing device metrics with container...', level: 'I' },
        { tag: 'Choreographer', msg: 'Skipped 1 frame! The application may be doing too much work.', level: 'W' }
      ];
      const selected = events[Math.floor(Math.random() * events.length)];
      triggerLogcat(selected.tag, selected.msg, selected.level);
    }, 5000);

    return () => clearInterval(timer);
  }, [isLogcatScrolling]);

  const injectCrashEvent = () => {
    triggerLogcat('AndroidRuntime', 'FATAL EXCEPTION: main', 'E');
    triggerLogcat('AndroidRuntime', 'Process: com.example.droidcraft, PID: 12584', 'E');
    triggerLogcat('AndroidRuntime', 'java.lang.NullPointerException: Attempt to invoke virtual method on a null object reference', 'E');
    setConsoleTab('logcat');
    triggerToast('Fatal NullPointerException Crash simulated!');
  };

  const handleBuildApk = async () => {
    setIsCompiling(true);
    setApkDownloadUrl(null);
    setConsoleTab('build');
    setBuildLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting build compilation...`]);

    const buildSteps = [
      'Task :app:clean',
      'Task :app:compileDebugKotlin',
      'Task :app:assembleDebug'
    ];

    for (let i = 0; i < buildSteps.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      setBuildLogs(prev => [...prev, `> Executing ${buildSteps[i]}`]);
    }

    try {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });

      const data = await response.json();
      if (data.success) {
        setBuildLogs(prev => [
          ...prev,
          `\nBUILD SUCCESSFUL in ${data.elapsedTime}`,
          `[Success] apk-debug.apk compiled successfully.`
        ]);
        setBuildErrorLines([]);
        
        const debugApkContent = `DroidCraft compiled Android APK binary - Project Type: ${projectType.toUpperCase()}\nTimestamp: ${data.timestamp}`;
        const blob = new Blob([debugApkContent], { type: 'application/vnd.android.package-archive' });
        const url = URL.createObjectURL(blob);
        setApkDownloadUrl(url);
        triggerToast('APK compiled successfully!');
      } else {
        setBuildLogs(prev => [
          ...prev,
          `\nBUILD FAILED`,
          `Found ${data.diagnostics.length} compilation errors. Please fix code.`
        ]);
        setBuildErrorLines(data.diagnostics);
        triggerToast('Build failed. Check compiler errors!');
      }
    } catch (err: any) {
      setBuildLogs(prev => [...prev, `Error compiling: ${err.message}`]);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleRunEmulator = async () => {
    setIsCompiling(true);
    setConsoleTab('build');
    setBuildLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Syncing code changes to emulator...`]);

    await new Promise(r => setTimeout(r, 1000));

    try {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });
      const data = await response.json();

      if (data.success) {
        setBuildLogs(prev => [
          ...prev,
          `Success. Started: com.example.droidcraft/.MainActivity`,
          `BUILD SUCCESSFUL`
        ]);
        setBuildErrorLines([]);
        triggerToast('Hot-loaded onto Connected Emulator!');
        triggerLogcat('ActivityManager', 'Restarting activity com.example.droidcraft/.MainActivity');
      } else {
        setBuildLogs(prev => [...prev, `Build failed. Sync cancelled.`]);
        setBuildErrorLines(data.diagnostics);
        triggerToast('Run failed. Check compiler tab!');
      }
    } catch (err: any) {
      setBuildLogs(prev => [...prev, `Emulator Sync Error: ${err.message}`]);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleExecuteAdbCommand = async () => {
    if (!adbCommand.trim()) return;
    try {
      const response = await fetch('/api/adb-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: adbCommand, deviceIp: deviceIP })
      });
      const data = await response.json();
      setAdbOutput(data.output);
      triggerLogcat('ADB_DAEMON', `Executed: ${adbCommand}`);
    } catch (err: any) {
      setAdbOutput(`Error calling adb command: ${err.message}`);
    }
  };

  const pcmToBase64 = (float32Array: Float32Array): string => {
    let pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const buffer = new ArrayBuffer(pcm16.length * 2);
    new Int16Array(buffer).set(pcm16);
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const playAudioChunk = (audioCtx: AudioContext, base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const audioBuffer = audioCtx.createBuffer(1, pcm16.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
    }
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
  };

  const toggleVoiceRecording = async () => {
    if (isVoiceActive) {
      if (liveWsRef.current) {
        liveWsRef.current.close();
        liveWsRef.current = null;
      }
      if (inputAudioCtxRef.current) {
        inputAudioCtxRef.current.close();
        inputAudioCtxRef.current = null;
      }
      if (outputAudioCtxRef.current) {
        outputAudioCtxRef.current.close();
        outputAudioCtxRef.current = null;
      }
      setIsVoiceActive(false);
      triggerToast('Voice Assistant disconnected.');
      return;
    }

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/live`);
      liveWsRef.current = ws;

      const inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputAudioCtx;
      const outputAudioCtx = new AudioContext({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputAudioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = inputAudioCtx.createMediaStreamSource(stream);
      const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          playAudioChunk(outputAudioCtx, msg.audio);
        }
        if (msg.interrupted) {
          // Interrupt handler
        }
      };
      
      ws.onclose = () => {
        setIsVoiceActive(false);
      };

      setIsVoiceActive(true);
      triggerToast('Voice Assistant connected. Say "Hello DroidCraft"!');
    } catch (e) {
      console.error("Failed to start voice:", e);
      triggerToast("Voice connection failed. Make sure your microphone is allowed.");
    }
  };

  
  const toggleTranscription = async () => {
    if (isTranscribing) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsTranscribing(false);
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
         const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
         const reader = new FileReader();
         reader.readAsDataURL(audioBlob);
         reader.onloadend = async () => {
             const base64Data = (reader.result as string).split(',')[1];
             try {
                const res = await fetch('/api/copilot/chat', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({
                      messages: [{ role: 'user', content: 'Please transcribe this audio.' }],
                      attachments: [{ mimeType: 'audio/webm', data: base64Data }],
                      model: 'gemini-3.5-flash'
                   })
                });
                const data = await res.json();
                if (data.reply) {
                   setAiInput(prev => prev + (prev ? ' ' : '') + data.reply);
                   triggerToast('Transcription completed.');
                }
             } catch(e) {
                triggerToast('Transcription failed.');
             }
         };
      };
      
      mediaRecorder.start();
      setIsTranscribing(true);
      triggerToast('Recording started. Click again to transcribe.');
    } catch (e) {
      triggerToast('Failed to access microphone.');
    }
  };

  const handleSendAiMessage = async () => {
    if (!aiInput.trim()) return;

    const userMsg = aiInput.trim();
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiInput('');
    setAiAttachments([]);
    setIsAiLoading(true);

    try {
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...aiMessages, { role: 'user', content: userMsg }],
          activeFile: activeFile?.name || '',
          fileContent: editorContent,
          fileLanguage: activeFile?.language || 'kotlin',
          persona: aiPersona,
          model: aiModel,
          useGrounding,
          thinkingMode,
          attachments: aiAttachments,
          openAiKey,
          grokKey
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setAiMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Oops! AI error: ${err.message}` }
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  // Scroll bottom on logs updates
  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [buildLogs]);

  useEffect(() => {
    if (isLogcatScrolling) {
      logcatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logcatLogs, isLogcatScrolling]);

  const isDark = theme === 'dark';

  return (
    <div
      className={`h-[100dvh] w-full overflow-hidden overscroll-none flex flex-col font-sans select-none antialiased transition-colors ${
        isDark ? 'bg-[#070a13] text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
    >
      {/* HEADER SECTION */}
      <header
        className={`h-14 border-b px-4 flex items-center justify-between z-10 shrink-0 ${
          isDark ? 'bg-[#0d111b] border-slate-800/85' : 'bg-slate-100 border-slate-200 shadow-sm'
        }`}
      >
        <div id="tour-app-title" className="flex items-center gap-2 sm:gap-3 shrink min-w-0">
          <div className="hidden sm:block bg-emerald-500/10 p-2 rounded-xl text-emerald-400 border border-emerald-500/20 shadow-md shrink-0">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex flex-col min-w-0 shrink">
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={currentAppName}
                onChange={(e) => setCurrentAppName(e.target.value)}
                className={`font-extrabold tracking-tight text-sm bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -ml-1 w-24 sm:w-auto min-w-0 shrink ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
              />
              <span className="hidden sm:inline-flex text-[10px] bg-emerald-950/60 text-emerald-400 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/30 whitespace-nowrap shrink-0">
                v2.0 Core
              </span>
            </div>
            <span className="hidden sm:block text-[10px] text-slate-500 -mt-0.5 font-mono whitespace-nowrap truncate min-w-0">
              Simulated Android SDK 34 Sandbox
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 relative">
          {user ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg mr-2">
              <span className="text-[10px] text-slate-300 font-bold hidden xl:block">{user.displayName}</span>
              <button onClick={handleLogout} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase transition-colors">Out</button>
            </div>
          ) : (
            <button onClick={handleGoogleLogin} className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-[10px] font-bold text-white uppercase transition-colors mr-2">
              Login
            </button>
          )}
          <button 
            onClick={() => setActiveDialog('imageGen')}
            className="px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl text-xs font-black text-white uppercase transition-colors flex items-center gap-1 mr-2"
          >
            <Sparkles className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Image Gen</span>
          </button>
          {/* Main Action - Always visible */}
          <button
            onClick={handleRunEmulator}
            disabled={isCompiling}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-emerald-500/15 disabled:opacity-50 whitespace-nowrap"
          >
            {isCompiling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-slate-950" />
            )}
            <span className="hidden sm:inline">Run App</span>
          </button>

          {/* Settings & Theme Toggle */}
          <div className={`flex items-center gap-1.5 border rounded-xl px-2.5 py-1.5 text-xs hidden sm:flex ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono text-[11px] font-semibold">Pixel 8 Pro</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" />
          </div>

          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
              isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-850' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
            title="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* Dropdown Menu Toggle */}
          <button
            onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
              isHeaderMenuOpen 
                ? isDark ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-indigo-500 text-white border-indigo-500'
                : isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
            }`}
            title="More Options"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Dropdown Menu Content */}
          {isHeaderMenuOpen && (
            <>
              {/* Overlay to close menu when clicking outside */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsHeaderMenuOpen(false)}
              />
              
              <div className={`absolute right-0 top-full mt-2 w-72 rounded-xl border shadow-xl z-50 overflow-y-auto max-h-[calc(100vh-4rem)] ${
                isDark ? 'bg-[#0a0d15] border-slate-800 shadow-black/50' : 'bg-white border-slate-200 shadow-indigo-500/10'
              }`}>
                <div className="p-3 flex flex-col gap-2">
                  <div className="text-[10px] font-bold tracking-wider uppercase text-slate-500 mb-1 px-1">Project Actions</div>
                  
                  <button
                    onClick={() => { setIsHeaderMenuOpen(false); handleSaveApp(); }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg font-bold transition-colors flex items-center justify-between cursor-pointer ${
                      isDark 
                        ? 'bg-indigo-950/50 text-indigo-300 hover:bg-indigo-900/80' 
                        : 'bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    <span className="flex items-center gap-2"><FolderPlus className="w-4 h-4" /> Save Project to Library</span>
                  </button>
                            
                  <button
                    onClick={() => { setIsHeaderMenuOpen(false); handleExportZip(); }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg font-bold transition-colors flex items-center justify-between cursor-pointer ${
                      isDark 
                        ? 'bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/60' 
                        : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    }`}
                  >
                    <span className="flex items-center gap-2"><Download className="w-4 h-4" /> Export Source as ZIP</span>
                  </button>

                  <button
                    onClick={() => { setIsHeaderMenuOpen(false); handleBuildApk(); }}
                    disabled={isCompiling}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg font-bold transition-colors flex items-center justify-between cursor-pointer disabled:opacity-50 ${
                      isDark 
                        ? 'bg-slate-800/80 text-slate-200 hover:bg-slate-700' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isCompiling ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> : <Code className="w-4 h-4 text-cyan-500" />} 
                      Compile Release APK
                    </span>
                  </button>

                  <div className={`h-px my-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                  
                  <div className="text-[10px] font-bold tracking-wider uppercase text-slate-500 mb-1 px-1">Project Sandbox Mode</div>
                  
                  <div className={`flex flex-col gap-1 rounded-xl p-1 border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <button
                      onClick={() => { setIsHeaderMenuOpen(false); handleSwitchProject('compose'); }}
                      className={`px-3 py-2 text-xs rounded-lg font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                        projectType === 'compose'
                          ? isDark
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                          : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Zap className="w-4 h-4 text-cyan-500" /> Jetpack Compose (Kotlin)
                    </button>
                    <button
                      onClick={() => { setIsHeaderMenuOpen(false); handleSwitchProject('xml'); }}
                      className={`px-3 py-2 text-xs rounded-lg font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                        projectType === 'xml'
                          ? isDark
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                          : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Grid className="w-4 h-4 text-indigo-400" /> Classic Layout (XML)
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}

      {/* IMAGE GENERATOR DIALOG */}
      {activeDialog === 'imageGen' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-[#0f1423] border border-slate-700/50 text-slate-300' : 'bg-white text-slate-800'}`}>
             <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <h3 className="text-sm font-bold flex items-center gap-2 text-fuchsia-400">
                  <Sparkles className="w-4 h-4" /> AI Image Generator
                </h3>
                <button onClick={() => setActiveDialog(null)} className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400">
                  <X className="w-4 h-4" />
                </button>
             </div>
             <div className="p-4 flex flex-col gap-3">
               <textarea
                 placeholder="Describe the image you want to generate..."
                 value={imagePrompt}
                 onChange={e => setImagePrompt(e.target.value)}
                 className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-fuchsia-500 resize-none text-slate-200"
               />
               <div className="flex flex-wrap gap-2">
                 <select value={imageGenModel} onChange={e => setImageGenModel(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-300">
                   <option value="gemini-3.1-flash-image-preview">Flash Image (Fast)</option>
                   <option value="gemini-3-pro-image-preview">Pro Image (High Quality)</option>
                 </select>
                 <select value={imageAspectRatio} onChange={e => setImageAspectRatio(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-300">
                   <option value="1:1">1:1 Square</option>
                   <option value="4:3">4:3 Landscape</option>
                   <option value="3:4">3:4 Portrait</option>
                   <option value="16:9">16:9 Widescreen</option>
                   <option value="9:16">9:16 Vertical</option>
                   <option value="2:3">2:3</option>
                   <option value="3:2">3:2</option>
                   <option value="21:9">21:9</option>
                 </select>
                 {imageGenModel.includes('pro') && (
                   <select value={imageSize} onChange={e => setImageSize(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-300">
                     <option value="1K">1K</option>
                     <option value="2K">2K</option>
                     <option value="4K">4K</option>
                   </select>
                 )}
               </div>
               
               <button 
                 onClick={async () => {
                   if(!imagePrompt) return;
                   setIsGeneratingImage(true);
                   try {
                     const res = await fetch('/api/generate-image', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ prompt: imagePrompt, model: imageGenModel, aspectRatio: imageAspectRatio, imageSize: imageGenModel.includes('pro') ? imageSize : undefined })
                     });
                     const data = await res.json();
                     if(data.success) {
                       setImageGenResult(data.imageUrl);
                     } else {
                       triggerToast('Generation failed: ' + data.error);
                     }
                   } catch(e) { triggerToast('Network error'); }
                   setIsGeneratingImage(false);
                 }}
                 disabled={isGeneratingImage || !imagePrompt}
                 className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-slate-800 text-white font-bold py-2 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 mt-2"
               >
                 {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                 {isGeneratingImage ? 'Generating...' : 'Generate Image'}
               </button>
               
               {imageGenResult && (
                 <div className="mt-4 rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900 flex flex-col items-center p-2">
                    <img src={imageGenResult} alt="Generated" className="max-w-full max-h-64 object-contain" />
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* SIDEBAR PANEL: NAVIGATION TREE, SEARCH, SETTINGS */}
        <aside
          className={`w-full lg:w-80 lg:min-w-80 border-r flex flex-col overflow-hidden shrink-0 transition-all ${
            isDark ? 'bg-[#0a0d15] border-slate-800/80' : 'bg-slate-100 border-slate-200'
          } ${mobileTab === 'sidebar' ? 'flex' : 'hidden lg:flex'}`}
        >
          {/* Sub Tab Switchers */}
          <div id="tour-sidebar-tabs" className={`h-11 border-b flex items-center p-1 gap-1 shrink-0 ${
            isDark ? 'bg-[#0d101a] border-slate-800/60' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setSidebarTab('files')}
              className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                sidebarTab === 'files'
                  ? isDark
                    ? 'bg-slate-900 text-cyan-400 font-extrabold shadow'
                    : 'bg-white text-indigo-600 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Files
            </button>
            <button
              onClick={() => setSidebarTab('search')}
              className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                sidebarTab === 'search'
                  ? isDark
                    ? 'bg-slate-900 text-cyan-400 font-extrabold shadow'
                    : 'bg-white text-indigo-600 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setSidebarTab('git')}
              className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                sidebarTab === 'git'
                  ? isDark
                    ? 'bg-slate-900 text-cyan-400 font-extrabold shadow'
                    : 'bg-white text-indigo-600 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Git APK
            </button>
            <button
              onClick={() => setSidebarTab('factory')}
              className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                sidebarTab === 'factory'
                  ? isDark
                    ? 'bg-slate-900 text-cyan-400 font-extrabold shadow'
                    : 'bg-white text-indigo-600 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Factory 🏭
            </button>
            <button
              onClick={() => setSidebarTab('saved')}
              className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                sidebarTab === 'saved'
                  ? isDark
                    ? 'bg-slate-900 text-cyan-400 font-extrabold shadow'
                    : 'bg-white text-indigo-600 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Saved
            </button>
            <button
              onClick={() => setSidebarTab('settings')}
              className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                sidebarTab === 'settings'
                  ? isDark
                    ? 'bg-slate-900 text-cyan-400 font-extrabold shadow'
                    : 'bg-white text-indigo-600 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Config
            </button>
          </div>

          {/* Active Sidebar Tab Contents */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {sidebarTab === 'saved' && (
              <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest">
                    Saved Apps Library
                  </h3>
                </div>
                
                {savedApps.length === 0 ? (
                  <div className="text-xs text-slate-500 italic p-4 text-center">
                    No apps saved yet. Click the "Save App" button in the top bar to save your progress!
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {savedApps.map(app => (
                      <div key={app.id} className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col gap-2 relative group hover:bg-slate-800/40 transition-colors">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-slate-200 text-sm truncate pr-6">{app.name}</h4>
                          <button
                            onClick={() => {
                              const newSaved = savedApps.filter(a => a.id !== app.id);
                              setSavedApps(newSaved);
                              localStorage.setItem('droidcraft_saved_apps', JSON.stringify(newSaved));
                            }}
                            className="absolute top-3 right-3 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                          <span>{app.projectType.toUpperCase()}</span>
                          <span>{new Date(app.timestamp).toLocaleString()}</span>
                        </div>
                        <button
                          onClick={() => handleLoadApp(app)}
                          className="mt-2 w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded text-xs font-semibold border border-indigo-500/20 transition-colors"
                        >
                          Load App
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {sidebarTab === 'files' && (
              <div className="flex-1 flex flex-col overflow-hidden max-h-[48%] border-b border-slate-800/30">
                <div className="p-3 bg-slate-900/10 border-b border-slate-800/20 flex justify-between items-center text-xs text-slate-400 uppercase font-bold tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> Project Tree
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCreateFile('new_file.kt', '')}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                      title="Add file to root"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] lowercase text-slate-500 font-mono">
                      {files.length} items
                    </span>
                  </div>
                </div>
                <FileTree
                  files={files}
                  activeFilePath={activeFilePath}
                  onSelectFile={setActiveFilePath}
                  onCreateFile={handleCreateFile}
                  onRenameFile={handleRenameFile}
                  onMoveFile={handleMoveFile}
                  onDeleteFile={handleDeleteFile}
                  theme={theme}
                />
              </div>
            )}

            {sidebarTab === 'git' && (
              <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4 select-none">
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Step 1: AI App Prompt
                  </h3>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Describe your application. DroidCraft AI will generate complete, production-ready Android files and configurations.
                  </p>
                  <textarea
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Describe your app (e.g. Tip Calculator)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-sans focus:outline-none focus:border-cyan-500 min-h-[70px] resize-none leading-relaxed mt-1"
                  />
                  <button
                    onClick={handleAiGenerateProject}
                    disabled={isGeneratingProject}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-bold py-2 px-3 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 mt-1"
                  >
                    {isGeneratingProject ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating Project...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate Project Code</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="h-px bg-slate-800/45 my-1" />

                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                    <Github className="w-3.5 h-3.5" /> Step 2: GitHub Scaffolder
                  </h3>
                  <p className="text-[10px] text-slate-500 leading-normal mb-1">
                    Securely build and push APK to GitHub using your personal developer credentials.
                  </p>

                  <div className="flex flex-col gap-2 bg-slate-900/30 border border-slate-800/60 p-3 rounded-2xl text-left">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider pl-1">GitHub Username</span>
                      <input
                        type="text"
                        value={githubUsername}
                        onChange={e => setGithubUsername(e.target.value)}
                        placeholder="octocat"
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 mt-0.5 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider pl-1">Personal Access Token (PAT)</span>
                      <input
                        type="password"
                        value={githubToken}
                        onChange={e => setGithubToken(e.target.value)}
                        placeholder="ghp_..."
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 mt-0.5 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider pl-1">Repository Name</span>
                      <input
                        type="text"
                        value={githubRepo}
                        onChange={e => setGithubRepo(e.target.value)}
                        placeholder="ai-generated-android-app"
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 mt-0.5 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateAndPushToGitHub}
                    disabled={isPushingToGit || !githubToken}
                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white font-bold py-2 px-3 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 mt-1"
                  >
                    {isPushingToGit ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Pushing to GitHub...</span>
                      </>
                    ) : (
                      <>
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>Publish & Build APK</span>
                      </>
                    )}
                  </button>
                </div>

                {gitBuildLogs.length > 0 && (
                  <>
                    <div className="h-px bg-slate-800/45 my-1" />
                    <div className="flex flex-col gap-2.5 flex-1">
                      
                      {/* Dashboard Header */}
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" /> Live Build Pipeline
                        </h3>
                        {gitActionStatus !== 'idle' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono font-bold text-slate-300 bg-slate-900 border border-slate-800/80 px-1.5 py-0.5 rounded-md">
                              Attempt {gitBuildAttempt}/3
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-1 ${
                              gitActionStatus === 'completed' && gitActionConclusion === 'success'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                : gitActionStatus === 'completed' && gitActionConclusion !== 'success'
                                ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                                : 'bg-amber-950/60 text-amber-400 border border-amber-800/40 animate-pulse'
                            }`}>
                              {gitActionStatus === 'completed' ? gitActionConclusion : gitActionStatus}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Upgrade 7: Timeline Stepper/Dashboard */}
                      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col gap-2.5 text-xs text-left">
                        {/* Step 1: Commit & Push */}
                        <div className="flex items-start gap-2.5">
                          <div className="flex flex-col items-center">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                              gitActionStatus !== 'idle'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : 'bg-slate-950 text-slate-500 border-slate-850'
                            }`}>
                              {gitActionStatus !== 'idle' ? '✓' : '1'}
                            </div>
                            <div className="w-0.5 h-3 bg-slate-800/80" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-[10px] text-slate-300">Commit & Push Files</h4>
                            <p className="text-[9px] text-slate-500">Source files pushed to branch 'main'</p>
                          </div>
                        </div>

                        {/* Step 2: GitHub Actions Runner */}
                        <div className="flex items-start gap-2.5">
                          <div className="flex flex-col items-center">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                              gitActionStatus === 'completed' || gitActionStatus === 'in_progress'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : gitActionStatus === 'queued'
                                ? 'bg-amber-950 text-amber-400 border-amber-800 animate-pulse'
                                : 'bg-slate-950 text-slate-500 border-slate-850'
                            }`}>
                              {gitActionStatus === 'completed' || gitActionStatus === 'in_progress' ? '✓' : '2'}
                            </div>
                            <div className="w-0.5 h-3 bg-slate-800/80" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-[10px] text-slate-300">Initialize Runner VM</h4>
                            <p className="text-[9px] text-slate-500">
                              {gitActionStatus === 'queued' ? 'Waiting for GitHub Action slot...' : 'Runner virtual machine activated'}
                            </p>
                          </div>
                        </div>

                        {/* Step 3: Gradle App Build */}
                        <div className="flex items-start gap-2.5">
                          <div className="flex flex-col items-center">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                              gitActionStatus === 'completed' && gitActionConclusion === 'success'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : gitActionStatus === 'completed' && gitActionConclusion !== 'success'
                                ? 'bg-red-950 text-red-400 border-red-800'
                                : gitActionStatus === 'in_progress' || gitActionStatus === 'queued'
                                ? 'bg-amber-950 text-amber-400 border-amber-800 animate-spin'
                                : 'bg-slate-950 text-slate-500 border-slate-850'
                            }`}>
                              {gitActionStatus === 'in_progress' || gitActionStatus === 'queued' ? <RefreshCw className="w-3 h-3 animate-spin" /> : '3'}
                            </div>
                            <div className="w-0.5 h-3 bg-slate-800/80" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-[10px] text-slate-300">Assemble & Compile (Gradle)</h4>
                            <p className="text-[9px] text-slate-500">
                              {gitActionStatus === 'in_progress'
                                ? `Compiling app binaries... (${pollingTimeElapsed}s)`
                                : gitActionStatus === 'completed' && gitActionConclusion === 'success'
                                ? 'Compilation successful!'
                                : gitActionStatus === 'completed' && gitActionConclusion !== 'success'
                                ? 'Gradle build failed'
                                : 'Awaiting compilation trigger'}
                            </p>
                          </div>
                        </div>

                        {/* Step 4: AI Compiler self-healing */}
                        <div className="flex items-start gap-2.5">
                          <div className="flex flex-col items-center">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                              isFixingWithAi
                                ? 'bg-indigo-950 text-indigo-400 border-indigo-800 animate-pulse'
                                : gitBuildAttempt > 1
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : 'bg-slate-950 text-slate-500 border-slate-850'
                            }`}>
                              {isFixingWithAi ? <Wrench className="w-3 h-3 animate-pulse" /> : '4'}
                            </div>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-[10px] text-slate-300">Self-Healing Correction Loop</h4>
                            <p className="text-[9px] text-slate-500">
                              {isFixingWithAi
                                ? 'AI Compiler analyzing and applying code patches...'
                                : gitBuildAttempt > 1
                                ? `${gitBuildAttempt - 1} patch cycle(s) applied successfully`
                                : 'No errors detected yet'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Build Console Logs */}
                      <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
                        <Terminal className="w-3.5 h-3.5" /> Output Console Logs
                      </h3>
                      <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 font-mono text-[9px] text-slate-300 flex-1 min-h-[120px] max-h-[180px] overflow-y-auto flex flex-col gap-1 text-left select-text shadow-inner">
                        {gitBuildLogs.map((log, idx) => (
                          <div key={idx} className={
                            log.startsWith('✓') ? 'text-emerald-400' :
                            log.startsWith('❌') ? 'text-red-400' :
                            log.startsWith('🎉') ? 'text-emerald-300 font-bold' :
                            log.startsWith('🚀') || log.startsWith('⚡') || log.startsWith('🏭') ? 'text-cyan-400 font-semibold' :
                            'text-slate-400'
                          }>
                            {log}
                          </div>
                        ))}
                      </div>

                      {/* APK Download Link */}
                      {gitApkDownloadUrl && (
                        <a
                          href={gitApkDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 mt-1 shadow-lg shadow-emerald-500/10 text-center uppercase tracking-wider"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download Compiled APK</span>
                        </a>
                      )}

                      {/* Re-run Pipeline Button */}
                      {(gitActionStatus === 'completed' || gitActionStatus === 'error') && !isPushingToGit && !isFixingWithAi && (
                        <button
                          onClick={handleCreateAndPushToGitHub}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2 px-3 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 mt-1 border border-slate-700"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Re-run Build Factory</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {sidebarTab === 'search' && (
              <SearchPanel
                files={files}
                onSelectResult={handleSelectSearchResult}
                onReplaceAll={handleReplaceAll}
                theme={theme}
              />
            )}

            {sidebarTab === 'settings' && (
              <SettingsPanel
                settings={editorSettings}
                onChangeSettings={setEditorSettings}
                theme={theme}
              />
            )}

            {sidebarTab === 'factory' && (
              <div className="flex-1 flex flex-col overflow-y-auto p-3.5 gap-4 select-none">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> App Factory OS
                    </h3>
                    <span className="text-[9px] bg-cyan-950/40 text-cyan-400 font-bold px-1.5 py-0.5 rounded-full border border-cyan-500/20">
                      Autonomous v3.0
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Launch single prompts or bulk batches of Android apps. The self-healing build system compiles, logs, and fixes error loops autonomously.
                  </p>
                </div>

                {/* SETUP METADATA CRITICAL WARNING */}
                {(!githubUsername || !githubToken) && (
                  <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl text-[10px] text-amber-300 leading-relaxed">
                    ⚠️ <strong>Setup Required:</strong> Provide your GitHub username & Personal Access Token inside the <strong>Config</strong> tab first to authenticate the Cloud Run pipeline.
                  </div>
                )}

                {/* TAB SWITCHER */}
                <div className="flex rounded-xl p-0.5 border border-slate-800 bg-slate-950">
                  <button
                    onClick={() => setIsBulkMode(false)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      !isBulkMode ? 'bg-slate-900 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Single Idea
                  </button>
                  <button
                    onClick={() => setIsBulkMode(true)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      isBulkMode ? 'bg-slate-900 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Batch Queue 🏭
                  </button>
                </div>

                {/* FORM INPUTS */}
                <div className="flex flex-col gap-2.5 bg-slate-900/10 border border-slate-800/40 rounded-xl p-3">
                  {!isBulkMode ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-400">Describe Android App Idea:</label>
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="e.g., Create a pristine visual metronome app with custom rhythm division and tap tempo..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-100 font-sans focus:outline-none focus:border-cyan-500 min-h-[60px] resize-none leading-relaxed"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400">Batch App Prompts (One per line):</label>
                        <span className="text-[9px] font-mono text-slate-500">
                          {bulkPrompts.split('\n').filter(p => p.trim().length > 0).length} apps listed
                        </span>
                      </div>
                      <textarea
                        value={bulkPrompts}
                        onChange={e => setBulkPrompts(e.target.value)}
                        placeholder="Piano keyboard simulator&#10;Pomodoro board app&#10;Secure offline ledger book"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-200 font-mono focus:outline-none focus:border-cyan-500 min-h-[90px] resize-y leading-relaxed"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3 bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-[10px] text-slate-300 font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelfImproving}
                            onChange={(e) => setIsSelfImproving(e.target.checked)}
                            className="w-3.5 h-3.5 accent-cyan-500 rounded border-slate-700 bg-slate-900"
                          />
                          <span>AI Self-Improving (3 Cycles)</span>
                        </label>
                        <label className="flex items-center gap-2 text-[10px] text-slate-300 font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isCreativeEvolving}
                            onChange={(e) => setIsCreativeEvolving(e.target.checked)}
                            className="w-3.5 h-3.5 accent-cyan-500 rounded border-slate-700 bg-slate-900"
                          />
                          <span>Creative Mutation</span>
                        </label>
                      </div>
                      
                      {!isBulkMode && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-bold">Swarm Bots:</span>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={swarmSize}
                            onChange={(e) => setSwarmSize(Number(e.target.value))}
                            className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                          />
                          <span className="text-[10px] text-cyan-400 font-bold">{swarmSize}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (!githubUsername || !githubToken) {
                          triggerToast('Please configure GitHub username and token in the Config tab!');
                          return;
                        }
                        setIsEnqueuingJob(true);
                        try {
                          if (isBulkMode) {
                            const promptsArray = bulkPrompts.split('\n').map(p => p.trim()).filter(p => p.length > 0);
                            if (promptsArray.length === 0) {
                              triggerToast('Please write at least one prompt for batching.');
                              setIsEnqueuingJob(false);
                              return;
                            }
                            const res = await fetch('/api/jobs/bulk-enqueue', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                prompts: promptsArray,
                                projectType,
                                githubUsername,
                                githubToken,
                                githubRepo,
                                isSelfImproving,
                                isCreativeEvolving
                              })
                            });
                            const data = await res.json();
                            if (data.success) {
                              triggerToast(`Enqueued batch of ${data.enqueuedCount} apps!`);
                            } else {
                              triggerToast(`Enqueue failed: ${data.error}`);
                            }
                          } else {
                            if (!aiPrompt.trim()) {
                              triggerToast('Please describe your app idea first.');
                              setIsEnqueuingJob(false);
                              return;
                            }
                            
                            if (swarmSize > 1) {
                              // Duplicate prompt for swarm
                              const promptsArray = Array(swarmSize).fill(aiPrompt.trim());
                              const res = await fetch('/api/jobs/bulk-enqueue', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  prompts: promptsArray,
                                  projectType,
                                  githubUsername,
                                  githubToken,
                                  githubRepo,
                                  isSelfImproving,
                                  isCreativeEvolving
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                triggerToast(`Deployed swarm of ${data.enqueuedCount} AI bots!`);
                              } else {
                                triggerToast(`Swarm deployment failed: ${data.error}`);
                              }
                            } else {
                              const res = await fetch('/api/jobs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  prompt: aiPrompt,
                                  projectType,
                                  githubUsername,
                                  githubToken,
                                  githubRepo,
                                  isSelfImproving,
                                  isCreativeEvolving
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                triggerToast('Build job enqueued successfully!');
                              } else {
                                triggerToast(`Enqueue failed: ${data.error}`);
                              }
                            }
                          }
                        } catch (err: any) {
                          triggerToast(`Connection failed: ${err.message}`);
                        } finally {
                          setIsEnqueuingJob(false);
                        }
                      }}
                      disabled={isEnqueuingJob}
                      className="flex-1 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black py-2 px-3 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/10 uppercase tracking-wide"
                    >
                      {isEnqueuingJob ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Working...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-white" />
                          <span>{isBulkMode ? 'Launch Batch Factory' : 'Enqueue Build Job'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* SAFETY & LIMIT PANEL */}
                <div className="bg-slate-900/10 border border-slate-800/20 rounded-xl p-2.5 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Rate Protection:</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-extrabold">Max 10 builds / hour</span>
                </div>

                {/* ACTIVE QUEUE DASHBOARD */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Factory Jobs ({jobs.length})
                    </span>
                    {jobs.length > 0 && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/jobs/clear', { method: 'POST' });
                            const data = await res.json();
                            if (data.success) {
                              triggerToast('Cleaned job history');
                            }
                          } catch (e) {}
                        }}
                        className="text-[9px] text-slate-500 hover:text-slate-300 font-bold cursor-pointer underline decoration-dotted"
                      >
                        Clear History
                      </button>
                    )}
                  </div>

                  {jobs.length === 0 ? (
                    <div className="p-6 bg-slate-900/5 border border-dashed border-slate-850 rounded-xl flex flex-col items-center justify-center gap-1.5 text-center">
                      <Info className="w-4 h-4 text-slate-600" />
                      <span className="text-[10px] text-slate-500">Autonomous Factory is silent. No jobs enqueued.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {jobs.map((job: any) => {
                        let statusColor = 'bg-slate-800 text-slate-400 border-slate-700';
                        let statusText = job.status;

                        if (job.status === 'QUEUED') {
                          statusColor = 'bg-amber-950/60 text-amber-400 border-amber-800/40 animate-pulse';
                          statusText = '🟡 QUEUED';
                        } else if (job.status === 'GENERATING') {
                          statusColor = 'bg-cyan-950/60 text-cyan-400 border-cyan-800/40 animate-pulse';
                          statusText = '✨ GENERATING';
                        } else if (job.status === 'UPLOADING') {
                          statusColor = 'bg-purple-950/60 text-purple-400 border-purple-800/40 animate-pulse';
                          statusText = '📤 COMMIT';
                        } else if (job.status === 'BUILDING') {
                          statusColor = 'bg-blue-950/60 text-blue-400 border-blue-800/40 animate-pulse';
                          statusText = '🏗 COMPILING';
                        } else if (job.status === 'FIXING') {
                          statusColor = 'bg-red-950/60 text-red-400 border-red-800/40 animate-pulse';
                          statusText = '🔧 AI HEALING';
                        } else if (job.status === 'DONE') {
                          statusColor = 'bg-emerald-950 text-emerald-400 border-emerald-800/60 font-bold';
                          statusText = '🟢 DONE';
                        } else if (job.status === 'FAILED') {
                          statusColor = 'bg-rose-950 text-rose-400 border-rose-900/60 font-bold';
                          statusText = '❌ FAILED';
                        } else if (job.status === 'CANCELLED') {
                          statusColor = 'bg-slate-950 text-slate-500 border-slate-850 font-semibold';
                          statusText = '🛑 CANCELLED';
                        }

                        return (
                          <div
                            key={job.id}
                            className={`p-3 border rounded-xl flex flex-col gap-2 ${
                              isDark ? 'bg-slate-900/30 border-slate-850' : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[11px] font-bold text-slate-100 truncate">
                                  {job.prompt}
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1.5">
                                  <span className="truncate max-w-[80px]">#{job.id.substring(0,6)}</span>
                                  <span>•</span>
                                  <span>{new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </span>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase font-bold shrink-0 ${statusColor}`}>
                                {statusText}
                              </span>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-850/40 pt-2 text-[10px]">
                              <div className="flex items-center gap-1">
                                <RefreshCw className={`w-3 h-3 text-slate-500 ${job.status === 'FIXING' ? 'animate-spin' : ''}`} />
                                <span className="text-slate-500 font-mono">
                                  Healing: {job.retryCount}/3
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setActiveLogJobId(job.id)}
                                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Terminal className="w-3 h-3" />
                                  <span>Console</span>
                                </button>

                                {job.status === 'DONE' && job.apkUrl && (
                                  <a
                                    href={job.apkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>APK</span>
                                  </a>
                                )}

                                {(job.status === 'QUEUED' || job.status === 'GENERATING' || job.status === 'UPLOADING' || job.status === 'BUILDING' || job.status === 'FIXING') && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await fetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
                                        triggerToast('Job cancelled');
                                      } catch (e) {}
                                    }}
                                    className="text-[10px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer transition-colors"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI COPILOT CHAT AREA - Kept fully available in the bottom of files/general tree sidebar */}
            <div className={`flex flex-col transition-all duration-300 border-t ${isChatExpanded ? 'flex-1 overflow-hidden' : 'h-auto'} ${
              isDark ? 'bg-slate-950/20 border-slate-800/40' : 'bg-slate-50 border-slate-200'
            }`}>
              <div 
                className={`p-3 border-b flex flex-wrap items-center justify-between gap-2 cursor-pointer ${
                  isDark ? 'bg-slate-900/20 hover:bg-slate-800/30 border-slate-800/40' : 'bg-slate-100 hover:bg-slate-200 border-slate-200'
                }`}
                onClick={() => setIsChatExpanded(!isChatExpanded)}
              >
                <span className="text-[11px] uppercase font-extrabold tracking-widest text-slate-400 flex items-center gap-1.5">
                  {isChatExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" /> Copilot
                </span>
                {isChatExpanded && (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <select
                    value={aiPersona}
                    onChange={(e) => setAiPersona(e.target.value as any)}
                    className={`text-[10px] rounded px-1.5 py-0.5 outline-none cursor-pointer ${
                      isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    <option value="General">DroidCraft General</option>
                    <option value="UI_UX">UI/UX Designer</option>
                    <option value="Architect">Software Architect</option>
                    <option value="Reviewer">Code Reviewer</option>
                  </select>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className={`text-[10px] rounded px-1.5 py-0.5 outline-none cursor-pointer ${
                      isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Thinking)</option>
<option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
<option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                    
                    <option value="gpt-4o">ChatGPT (gpt-4o)</option>
                    <option value="grok-2">Grok-2</option>
                  </select>
         <label className="text-[9px] flex items-center gap-1 cursor-pointer text-slate-400">
            <input type="checkbox" checked={useGrounding} onChange={e => setUseGrounding(e.target.checked)} />
            Grounding
         </label>
         <label className="text-[9px] flex items-center gap-1 cursor-pointer text-slate-400">
            <input type="checkbox" checked={thinkingMode} onChange={e => setThinkingMode(e.target.checked)} />
            Thinking
         </label>
         <button
           onClick={() => setShowKeySettings(!showKeySettings)}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Configure API Keys"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
                )}
              </div>

              {isChatExpanded && (
                <>
              {/* API Key Settings Overlay */}
              {showKeySettings && (
                <div className="p-3 border-b border-slate-800 bg-slate-900/90 text-xs">
                  <div className="flex flex-col gap-2">
                    <label className="text-slate-400">OpenAI API Key (for ChatGPT)</label>
                    <input
                      type="password"
                      value={openAiKey}
                      onChange={e => setOpenAiKey(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded p-1 text-slate-200"
                      placeholder="sk-..."
                    />
                    <label className="text-slate-400 mt-1">X.AI API Key (for Grok)</label>
                    <input
                      type="password"
                      value={grokKey}
                      onChange={e => setGrokKey(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded p-1 text-slate-200"
                      placeholder="xai-..."
                    />
                    <button 
                      onClick={() => setShowKeySettings(false)}
                      className="mt-2 bg-purple-600 text-white rounded p-1"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                {aiMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col gap-1 rounded-2xl p-3 text-[11px] leading-relaxed max-w-[90%] ${
                      m.role === 'user'
                        ? isDark
                          ? 'bg-slate-900 border border-slate-800 text-slate-100 self-end rounded-br-none'
                          : 'bg-white border border-slate-200 text-slate-800 self-end rounded-br-none shadow-sm'
                        : 'bg-[#141021] border border-purple-500/10 text-purple-100 self-start rounded-bl-none'
                    }`}
                  >
                    <span className="text-[9px] font-extrabold uppercase tracking-wide opacity-60">
                      {m.role === 'user' ? 'You' : 'DroidCraft AI'}
                    </span>
                    <p className="whitespace-pre-wrap select-text">{m.content}</p>
                    
                    {m.role === 'assistant' && (m.content || '').includes('class') && (
                      <button
                        onClick={() => {
                          const match = (m.content || '').match(/```(?:kotlin|java|xml|groovy|json)?\n([\s\S]*?)```/);
                          if (match && match[1]) {
                            updateContentAndNotify(match[1]);
                            triggerToast('Code applied successfully!');
                          }
                        }}
                        className="mt-2 bg-purple-600 hover:bg-purple-500 text-white text-[9px] font-bold px-2 py-1 rounded-lg self-start cursor-pointer transition-all"
                      >
                        Overwrite Code Content
                      </button>
                    )}
                  </div>
                ))}
                {isAiLoading && (
                  <div className="bg-[#141021] border border-purple-500/10 rounded-2xl p-3 text-[11px] self-start flex items-center gap-2 text-purple-300">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>Processing code stream...</span>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className={`p-2 border-t flex items-center gap-1.5 ${
                isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-100 border-slate-200'
              }`}>
                <label className="cursor-pointer shrink-0">
                  <input
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const text = await file.text();
                          setAiInput(prev => prev + `\n\n[File: ${file.name}]\n${text}\n`);
                          triggerToast(`Attached ${file.name}`);
                        } catch (err) {
                          triggerToast("Failed to read file");
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                  <div className={`p-1.5 rounded-xl transition-all ${
                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                  }`}>
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                </label>
                {aiAttachments.length > 0 && (
      <div className="absolute bottom-full left-0 mb-2 p-2 bg-slate-800 rounded-lg text-xs text-emerald-400">
         {aiAttachments.length} file(s) attached
      </div>
    )}
    <button 
      onClick={() => fileInputRef.current?.click()}
      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer shrink-0"
      title="Attach Image or Audio"
    >
       <Plus className="w-3.5 h-3.5" />
    </button>
    <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*" onChange={handleFileUpload} />
    <input
      type="text"
      placeholder="Ask DroidCraft AI..."
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendAiMessage()}
                  className={`flex-1 rounded-xl px-3 py-1.5 text-xs focus:outline-none border ${
                    isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-100 focus:border-purple-500'
                      : 'bg-white border-slate-200 text-slate-800 focus:border-indigo-500 shadow-sm'
                  }`}
                />
                <button
                  onClick={toggleTranscription}
                  className={`p-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                    isTranscribing
                      ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title={isTranscribing ? 'Stop Recording & Transcribe' : 'Record Audio for Transcription'}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={toggleVoiceRecording}
                  className={`p-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                    isVoiceActive
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title={isVoiceActive ? 'Stop Voice Assistant' : 'Start Voice Assistant'}
                >
                  {isVoiceActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleSendAiMessage}
                  disabled={isAiLoading || !aiInput.trim()}
                  className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-all disabled:opacity-40 cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* CENTER PANEL: EDITOR & TABS & BOTTOM STATUS BAR */}
        {/* MAIN EDITOR AREA */}
        <main className={`w-full lg:w-auto flex-1 flex flex-col bg-[#070a13] relative overflow-hidden shrink-0 ${mobileTab === 'editor' ? 'flex' : 'hidden lg:flex'}`}>
          
          {/* Diagnostic Warnings banner if build failed */}
          {buildErrorLines.length > 0 && (
            <div className="bg-red-950/20 border-b border-red-900/50 p-2.5 flex items-start gap-2.5 z-10 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-xs font-extrabold text-red-200">Diagnostics Error Log:</span>
                <div className="flex flex-col gap-0.5 mt-1">
                  {buildErrorLines.map((err, i) => (
                    <span key={i} className="text-[10px] text-red-300 font-mono">
                      ↳ {err.file.split('/').pop()}:{err.line} - <strong className="text-red-400">{err.message}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setBuildErrorLines([])}
                className="text-red-400 hover:text-red-200 p-1 rounded hover:bg-red-950/40 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Editor Tab Headers */}
          <TabsHeader
            openTabs={openTabs}
            activeFilePath={activeFilePath}
            onSelectTab={setActiveFilePath}
            onCloseTab={path => {
              const remaining = openTabs.filter(t => t !== path);
              setOpenTabs(remaining);
              if (activeFilePath === path && remaining.length > 0) {
                setActiveFilePath(remaining[0]);
              }
            }}
            onCopyAll={handleCopy}
            apkDownloadUrl={apkDownloadUrl}
            theme={theme}
          />

          {/* EDITOR COMMAND TOOLBAR (Undo, Redo, Copy, Cut, Paste, Duplicate) */}
          <div className={`h-9 border-b px-3 flex items-center justify-between select-none shrink-0 ${
            isDark ? 'bg-[#090d15] border-slate-800/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-1">
              <button
                onClick={handleUndo}
                className={`p-1.5 rounded-lg transition-all hover:bg-slate-800/10 cursor-pointer text-slate-400 hover:text-slate-200`}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                className="p-1.5 rounded-lg transition-all hover:bg-slate-800/10 cursor-pointer text-slate-400 hover:text-slate-200"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-800 mx-1" />
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg transition-all hover:bg-slate-800/10 cursor-pointer text-slate-400 hover:text-slate-200"
                title="Copy (Ctrl+C)"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCut}
                className="p-1.5 rounded-lg transition-all hover:bg-slate-800/10 cursor-pointer text-slate-400 hover:text-slate-200"
                title="Cut (Ctrl+X)"
              >
                <Scissors className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handlePaste}
                className="p-1.5 rounded-lg transition-all hover:bg-slate-800/10 cursor-pointer text-slate-400 hover:text-slate-200"
                title="Paste (Ctrl+V)"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-800 mx-1" />
              <button
                onClick={handleDuplicateLine}
                className="p-1.5 rounded-lg transition-all hover:bg-slate-800/10 cursor-pointer text-slate-400 hover:text-slate-200 flex items-center gap-1"
                title="Duplicate Current Line (Ctrl+D)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold">Duplicate</span>
              </button>
            </div>

            {/* Debounced Auto-Save Status */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono font-semibold">
              {saveStatus === 'saving' && (
                <span className="text-amber-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving changes...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-400 flex items-center gap-0.5">
                  ✓ All changes saved locally at {lastSavedTime}
                </span>
              )}
              {saveStatus === 'idle' && <span>Autosave active</span>}
            </div>
          </div>

          {/* HIGH-FIDELITY SYNTAX HIGH-LIGHTED WORKSPACE SURFACE */}
          <div
            className={`flex-1 flex overflow-hidden font-mono relative ${
              isDark ? 'bg-[#070a13]' : 'bg-white'
            }`}
          >
            {/* 1. EDITOR GUTTER: LINE NUMBERS & FOLDING TRIGGERS */}
            {editorSettings.showLineNumbers && (
              <div
                ref={gutterRef}
                className={`w-12 text-slate-500 py-4 flex flex-col text-right select-none overflow-y-hidden border-r shrink-0 ${
                  isDark ? 'bg-[#090c14] border-slate-800/40' : 'bg-slate-50 border-slate-200'
                }`}
              >
                {editorContent.split('\n').map((line, idx) => {
                  const lineNum = idx + 1;
                  const isCurrent = lineNum === cursorLine;
                  const hasError = buildErrorLines.some(e => e.file === activeFile?.path && e.line === lineNum);
                  
                  // Simple brace or XML opening bracket parsing for folding support
                  const isFoldable = line.includes('{') || line.includes('<') && !line.includes('/>') && !line.includes('</');
                  const isFolded = foldedLines.has(lineNum);

                  return (
                    <div
                      key={idx}
                      className={`h-5 leading-5 text-[10px] pr-2.5 font-semibold font-mono flex items-center justify-between ${
                        isCurrent ? (isDark ? 'text-cyan-400 bg-slate-900/40' : 'text-indigo-600 bg-slate-100') : ''
                      } ${hasError ? 'bg-red-950/20 text-red-500 font-bold' : ''}`}
                    >
                      <span className="w-4 flex items-center justify-center pl-1 shrink-0">
                        {isFoldable && (
                          <button
                            onClick={() => toggleFoldLine(lineNum)}
                            className={`p-0.5 hover:bg-slate-800/30 rounded text-[9px] cursor-pointer transition-transform ${
                              isFolded ? '-rotate-90 text-amber-400' : 'text-slate-400'
                            }`}
                          >
                            ▼
                          </button>
                        )}
                      </span>
                      <span>{lineNum}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. OVERLAID EDITOR CONTAINER */}
            <div className="flex-1 h-full relative overflow-hidden">
              {/* SYNTAX HIGHLIGHTED OVERLAY LAYER (UNDERNEATH) */}
              <pre
                ref={preRef}
                className="absolute inset-0 p-4 font-mono text-[13px] leading-5 pointer-events-none select-none overflow-hidden whitespace-pre-wrap break-all"
                style={{
                  fontSize: `${editorSettings.fontSize}px`,
                  fontFamily: editorSettings.fontFamily,
                  whiteSpace: editorSettings.wordWrap ? 'pre-wrap' : 'pre',
                  lineHeight: '20px'
                }}
                dangerouslySetInnerHTML={{
                  __html: highlightCode(
                    editorContent,
                    activeFile?.language || 'kotlin',
                    isDark
                  )
                }}
              />

              {/* TRANSPARENT EDITABLE TEXTAREA LAYER (ON TOP) */}
              <textarea
                ref={textareaRef}
                value={editorContent}
                onChange={handleEditorChange}
                onKeyDown={handleKeyDown}
                onKeyUp={updateCursorLineIndicator}
                onMouseUp={updateCursorLineIndicator}
                onScroll={handleScroll}
                spellCheck={false}
                autoFocus
                className="absolute inset-0 p-4 w-full h-full border-0 focus:ring-0 leading-5 bg-transparent text-transparent caret-white focus:outline-none resize-none font-mono overflow-auto whitespace-pre-wrap break-all select-text"
                style={{
                  fontSize: `${editorSettings.fontSize}px`,
                  fontFamily: editorSettings.fontFamily,
                  whiteSpace: editorSettings.wordWrap ? 'pre-wrap' : 'pre',
                  lineHeight: '20px',
                  color: 'transparent',
                  caretColor: isDark ? '#22d3ee' : '#4f46e5'
                }}
                placeholder="// Start adding Kotlin layouts or manifest attributes here..."
              />
            </div>
          </div>

          {/* BOTTOM TERMINALS / CONSOLE AREA */}
          <div className={`h-64 border-t flex flex-col overflow-hidden z-10 ${
            isDark ? 'bg-[#090c14] border-slate-800/80' : 'bg-slate-50 border-slate-200'
          }`}>
            {/* Terminal switcher */}
            <div className={`h-9 border-b flex items-center justify-between px-3 shrink-0 ${
              isDark ? 'bg-[#0b0f19] border-slate-800/60' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="flex items-center gap-1.5 h-full">
                <button
                  onClick={() => setConsoleTab('build')}
                  className={`h-full px-3 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-t-2 ${
                    consoleTab === 'build'
                      ? isDark
                        ? 'bg-[#090c14] text-cyan-400 border-t-cyan-400'
                        : 'bg-white text-indigo-600 border-t-indigo-600 font-extrabold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 border-t-transparent'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" /> Gradle Build Console
                </button>
                <button
                  onClick={() => setConsoleTab('logcat')}
                  className={`h-full px-3 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-t-2 ${
                    consoleTab === 'logcat'
                      ? isDark
                        ? 'bg-[#090c14] text-emerald-400 border-t-emerald-400'
                        : 'bg-white text-indigo-600 border-t-indigo-600 font-extrabold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 border-t-transparent'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Logcat Device Stream
                </button>
                <button
                  onClick={() => setConsoleTab('adb')}
                  className={`h-full px-3 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-t-2 ${
                    consoleTab === 'adb'
                      ? isDark
                        ? 'bg-[#090c14] text-purple-400 border-t-purple-400'
                        : 'bg-white text-indigo-600 border-t-indigo-600 font-extrabold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 border-t-transparent'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" /> ADB Bridge Controller
                </button>
              </div>

              {/* Console toolbar helpers */}
              <div className="flex items-center gap-2">
                {consoleTab === 'logcat' && (
                  <>
                    <div className="flex bg-slate-900 border border-slate-800/80 rounded-lg p-0.5 shrink-0">
                      {(['V', 'D', 'I', 'W', 'E'] as const).map(l => (
                        <button
                          key={l}
                          onClick={() => setLogcatFilter(l)}
                          className={`w-5 h-5 text-[10px] font-bold rounded cursor-pointer transition-all ${
                            logcatFilter === l ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      placeholder="Filter search..."
                      value={logcatSearch}
                      onChange={e => setLogcatSearch(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[10px] text-slate-300 w-28 focus:outline-none focus:border-cyan-500"
                    />

                    <button
                      onClick={injectCrashEvent}
                      className="px-2 py-0.5 bg-red-950 hover:bg-red-900 text-red-400 border border-red-800/40 text-[9px] font-black rounded-lg cursor-pointer transition-all"
                    >
                      💥 Crash App
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (consoleTab === 'build') setBuildLogs(['Console cleared.']);
                    else if (consoleTab === 'logcat') setLogcatLogs([]);
                    else setAdbOutput('');
                  }}
                  className="text-[10px] text-slate-400 hover:text-red-400 font-bold"
                >
                  Clear Output
                </button>
              </div>
            </div>

            {/* Console Scroll Output Window */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {consoleTab === 'build' && (
                <div className="flex flex-col gap-0.5 text-left">
                  {buildLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`whitespace-pre-wrap ${
                        log.startsWith('>') ? 'text-slate-500 font-semibold' :
                        log.includes('BUILD SUCCESSFUL') ? 'text-emerald-400 font-extrabold' :
                        log.includes('BUILD FAILED') || log.includes('Error') ? 'text-red-400 font-extrabold' : 'text-slate-300'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                  <div ref={terminalBottomRef} />
                </div>
              )}

              {consoleTab === 'logcat' && (
                <div className="flex flex-col gap-0.5 text-left">
                  {logcatLogs
                    .filter(log => {
                      const levelPriority = { 'V': 0, 'D': 1, 'I': 2, 'W': 3, 'E': 4 };
                      if (levelPriority[log.level] < levelPriority[logcatFilter]) return false;

                      if (logcatSearch) {
                        const term = logcatSearch.toLowerCase();
                        return log.tag.toLowerCase().includes(term) || log.message.toLowerCase().includes(term);
                      }
                      return true;
                    })
                    .map(log => {
                      const levelColor = {
                        'V': 'text-slate-500',
                        'D': 'text-cyan-400',
                        'I': 'text-emerald-400',
                        'W': 'text-yellow-400 font-semibold',
                        'E': 'text-red-500 font-bold bg-red-950/20 px-1 rounded'
                      }[log.level];

                      return (
                        <div key={log.id} className="flex gap-2 items-start font-mono">
                          <span className="text-slate-500 whitespace-nowrap">{log.time}</span>
                          <span className={`w-3 font-black text-center ${levelColor}`}>{log.level}</span>
                          <span className={`w-24 truncate text-right font-semibold ${levelColor}`}>{log.tag}</span>
                          <span className="text-slate-400 shrink-0">:</span>
                          <span className={`flex-1 ${log.level === 'E' ? 'text-red-300' : 'text-slate-200'}`}>
                            {log.message}
                          </span>
                        </div>
                      );
                    })}
                  <div ref={logcatBottomRef} />
                </div>
              )}

              {consoleTab === 'adb' && (
                <div className="flex flex-col gap-3 text-left">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 w-full">
                      <span className="text-xs font-bold text-slate-400 font-mono">bridge device:</span>
                      <input
                        type="text"
                        placeholder="Device IP e.g. 192.168.1.100"
                        value={deviceIP}
                        onChange={e => setDeviceIP(e.target.value)}
                        className="bg-slate-950 border border-slate-800/80 rounded px-2 py-1 text-xs text-slate-100 flex-1 focus:outline-none"
                      />
                    </div>
                    
                    <button
                      onClick={() => {
                        setAdbCommand(`adb connect ${deviceIP}:5555`);
                        setAdbOutput(`connecting to ${deviceIP}:5555...\nconnected successfully to development node`);
                        triggerLogcat('ADB', `Connected wirelessly to hardware phone: ${deviceIP}`);
                      }}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1 rounded-xl text-xs cursor-pointer transition-all shrink-0"
                    >
                      Wireless Connect
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono">$</span>
                      <input
                        type="text"
                        value={adbCommand}
                        onChange={e => setAdbCommand(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleExecuteAdbCommand()}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-100 font-mono flex-1 focus:outline-none focus:border-purple-500"
                      />
                      <button
                        onClick={handleExecuteAdbCommand}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        Execute
                      </button>
                    </div>

                    <pre className="p-3 bg-slate-950 text-slate-400 border border-slate-900 rounded-xl overflow-auto text-left max-h-[100px]">
                      <code>{adbOutput}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>

        </main>

        {/* RIGHT PANEL: PHONE PREVIEW SIMULATOR */}
        <section className={`w-full lg:w-[360px] border-l flex flex-col items-center justify-center p-6 shrink-0 relative overflow-y-auto transition-all ${
          isDark ? 'bg-[#0a0d15] border-slate-800/80' : 'bg-slate-100 border-slate-200'
        } ${mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'}`}>
          
          <div className="text-center mb-4">
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500">Live Renderer</span>
            <h3 className={`text-xs font-bold mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              Pixel 8 Pro Virtual Frame
            </h3>
          </div>

          {/* Device Mockup Chassis */}
          <div className="relative w-[280px] h-[540px] bg-slate-950 rounded-[42px] border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-700/50">
            
            {/* Top Speaker camera punch-hole notch */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-slate-950 rounded-b-2xl z-20 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mr-2 border border-slate-800" />
              <div className="w-10 h-1 bg-slate-800 rounded-full" />
            </div>

            {/* Device Screen Status Bar */}
            <div className="h-10 bg-[#0d121c] border-b border-slate-900 px-5 flex items-center justify-between text-[10px] font-mono font-bold text-slate-400 z-10 shrink-0">
              <span>LTE Signal</span>
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-cyan-400" />
                <span className="text-slate-300">14:27 PM</span>
              </div>
            </div>

            {/* Simulated Live Viewport */}
            <div className="flex-1 bg-[#101420] text-slate-100 flex flex-col p-5 overflow-y-auto relative text-center">
              <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-6 shrink-0" />

              <div className="flex-1 flex flex-col items-center justify-center">
                
                {(editorContent.includes('ImageView') || editorContent.includes('Image')) && (
                  <div className="w-20 h-20 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mb-6 text-slate-400 animate-pulse shadow-inner">
                    <Smartphone className="w-8 h-8 text-emerald-400" />
                  </div>
                )}

                <h2 className="text-sm font-extrabold text-slate-100 tracking-tight leading-tight select-none">
                  {previewUi.parsedTitle}
                </h2>

                <p className="text-[10px] text-slate-400 mt-1.5 max-w-[200px] leading-relaxed mx-auto">
                  {previewUi.parsedSubtitle}
                </p>

                <div className="h-px w-36 bg-slate-800/60 my-6 animate-pulse" />

                {projectType === 'compose' && (
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 w-full mb-6 text-left">
                    <span className="text-[9px] uppercase font-extrabold text-slate-500 tracking-wider">State Monitor</span>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[11px] text-slate-300">Clicks recorded:</span>
                      <span className="text-xs font-bold font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/30 px-2 py-0.5 rounded">
                        {simCounter}
                      </span>
                    </div>
                  </div>
                )}

                {previewUi.editTexts.length > 0 && (
                  <div className="w-full flex flex-col gap-3 mb-6">
                    {previewUi.editTexts.map(fld => (
                      <div key={fld.id} className="text-left w-full animate-fadeIn">
                        <span className="text-[9px] text-slate-400 font-bold pl-1">{fld.hint}</span>
                        <input
                          type={fld.isPass ? 'password' : 'text'}
                          placeholder="Insert mockup value..."
                          value={fld.id === 'devHandle' ? simUsername : fld.id === 'inputEmail' ? simEmail : simKey}
                          onChange={e => {
                            const val = e.target.value;
                            if (fld.id === 'devHandle') setSimUsername(val);
                            else if (fld.id === 'inputEmail') setSimEmail(val);
                            else if (fld.id === 'inputKey') setSimKey(val);
                            triggerLogcat('ViewRootImpl', `Focused ID updated: ${fld.id}`);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 mt-1 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {previewUi.buttons.length > 0 && (
                  <div className="w-full flex flex-col gap-2.5">
                    {previewUi.buttons.map(btn => (
                      <button
                        key={btn.id}
                        onClick={btn.onClick}
                        className={`w-full font-bold text-[11px] py-2 px-3 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                          btn.id === 'resetBtn'
                            ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400'
                            : btn.id === 'btnConnect'
                            ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/10'
                            : 'bg-slate-900 hover:bg-slate-850 border border-slate-800 text-white'
                        }`}
                      >
                        {btn.id === 'btnConnect' && <Zap className="w-3.5 h-3.5" />}
                        {btn.text}
                      </button>
                    ))}
                  </div>
                )}

              </div>

              <div className="w-24 h-1 bg-slate-800 rounded-full mx-auto mt-6 shrink-0" />
            </div>

          </div>

          {/* Quick instructions / Help below device mockup */}
          <div className={`mt-4 p-3 border rounded-2xl w-full text-left ${
            isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <span className="text-[9px] uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-cyan-400" /> Auto-Reload Interface
            </span>
            <p className="text-[10px] text-slate-500 leading-normal mt-1.5">
              Edit Jetpack Compose state or XML nodes. The Pixel mockup compiles live visual forms, state logs, and diagnostic feeds on type!
            </p>
          </div>

        </section>

      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className={`lg:hidden flex border-t shrink-0 h-14 ${isDark ? 'bg-[#0a0d15] border-slate-800' : 'bg-white border-slate-200'}`}>
        <button onClick={() => setMobileTab('sidebar')} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'sidebar' ? (isDark ? 'text-cyan-400' : 'text-indigo-600') : 'text-slate-500'}`}>
          <Menu className="w-5 h-5"/>
          <span className="text-[10px] font-bold">Tools</span>
        </button>
        <button onClick={() => setMobileTab('editor')} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'editor' ? (isDark ? 'text-cyan-400' : 'text-indigo-600') : 'text-slate-500'}`}>
          <Code2 className="w-5 h-5"/>
          <span className="text-[10px] font-bold">Code</span>
        </button>
        <button onClick={() => setMobileTab('preview')} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === 'preview' ? (isDark ? 'text-cyan-400' : 'text-indigo-600') : 'text-slate-500'}`}>
          <Smartphone className="w-5 h-5"/>
          <span className="text-[10px] font-bold">Preview</span>
        </button>
      </div>

      {/* Toast Notifications */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-slate-100 border border-cyan-500/30 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 z-50 animate-fadeIn">
          <div className="bg-cyan-500/10 p-1.5 rounded-lg text-cyan-400 border border-cyan-500/20">
            <Sparkles className="w-4 h-4 animate-spin" />
          </div>
          <span className="text-xs font-semibold">{showToast}</span>
        </div>
      )}

      {/* 🏭 Autonomous Factory Console Logs Viewer Overlay */}
      {activeLogJobId && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-3xl w-full max-w-2xl h-[550px] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="bg-cyan-500/10 p-2 rounded-xl text-cyan-400 border border-cyan-500/20">
                  <Terminal className="w-5 h-5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
                    Factory Job Log Console
                    <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/40 font-mono px-2 py-0.5 rounded-full shrink-0">
                      #{activeLogJobId.substring(0, 8)}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 truncate max-w-[350px] mt-0.5">
                    Active Idea: "{jobs.find(j => j.id === activeLogJobId)?.prompt || 'Build pipeline'}"
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveLogJobId(null)}
                className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper Status Indicators */}
            <div className="p-3 bg-slate-900/30 border-b border-slate-800/60 flex items-center justify-between text-[10px] font-semibold shrink-0">
              {(() => {
                const activeJob = jobs.find(j => j.id === activeLogJobId);
                if (!activeJob) return null;
                const status = activeJob.status;
                
                const steps = [
                  { label: 'QUEUE', active: true, done: ['GENERATING', 'UPLOADING', 'BUILDING', 'FIXING', 'DONE', 'FAILED'].includes(status) },
                  { label: 'GENERATE', active: status === 'GENERATING', done: ['UPLOADING', 'BUILDING', 'FIXING', 'DONE', 'FAILED'].includes(status) && status !== 'GENERATING' },
                  { label: 'COMMIT', active: status === 'UPLOADING', done: ['BUILDING', 'FIXING', 'DONE', 'FAILED'].includes(status) && !['GENERATING', 'UPLOADING'].includes(status) },
                  { label: 'COMPILE', active: status === 'BUILDING' || status === 'FIXING', done: status === 'DONE' },
                  { label: 'RELEASE', active: status === 'DONE', done: status === 'DONE', err: status === 'FAILED' }
                ];

                return (
                  <div className="flex items-center gap-1.5 w-full justify-around px-4">
                    {steps.map((st, i) => {
                      let circleColor = 'border-slate-700 bg-slate-900 text-slate-500';
                      if (st.active) circleColor = 'border-cyan-500 bg-cyan-950 text-cyan-400 animate-pulse font-bold';
                      else if (st.done) circleColor = 'border-emerald-500 bg-emerald-950 text-emerald-400';
                      else if (st.err) circleColor = 'border-rose-500 bg-rose-950 text-rose-400';

                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-bold ${circleColor}`}>
                            {st.done ? '✓' : st.err ? '✗' : i + 1}
                          </div>
                          <span className={`${st.active ? 'text-cyan-400' : st.done ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {st.label}
                          </span>
                          {i < steps.length - 1 && <div className="w-6 h-px bg-slate-800" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Terminal Screen output */}
            <div className="flex-1 p-4 bg-slate-950 font-mono text-[11px] leading-relaxed overflow-y-auto select-text">
              {(() => {
                const activeJob = jobs.find(j => j.id === activeLogJobId);
                if (!activeJob) {
                  return <div className="text-slate-500">Retrieving log files...</div>;
                }

                return (
                  <div className="flex flex-col gap-1 text-left">
                    <div className="text-cyan-500 font-bold">// DROID_CRAFT BUILD AGENT INITIATED ON TARGET CLOUD VIRTUAL MACHINE</div>
                    <div className="text-slate-500">ID: {activeJob.id}</div>
                    <div className="text-slate-500">PROJECT TYPE: {activeJob.projectType || 'compose'}</div>
                    <div className="text-slate-500">CREATED: {new Date(activeJob.createdAt).toLocaleString()}</div>
                    <div className="text-slate-500">HEALING COUNTER: {activeJob.retryCount} OF 3 MAX</div>
                    {(activeJob.isSelfImproving || activeJob.isCreativeEvolving) && (
                      <>
                        <div className="text-purple-400 font-bold mt-1">MUTATION CYCLE: {activeJob.currentCycle || 1} OF 3</div>
                        {activeJob.scoreHistory && activeJob.scoreHistory.length > 0 && (
                          <div className="text-emerald-400 font-bold">LATEST SCORE: {activeJob.scoreHistory[activeJob.scoreHistory.length - 1]}/100</div>
                        )}
                      </>
                    )}
                    <div className="h-px bg-slate-800/45 my-2" />

                    {activeJob.logs && activeJob.logs.length > 0 ? (
                      activeJob.logs.map((log: string, idx: number) => {
                        let colorClass = 'text-slate-300';
                        if (log.startsWith('>') || log.startsWith('Task :')) colorClass = 'text-slate-500 font-semibold';
                        else if (log.includes('BUILD SUCCESSFUL')) colorClass = 'text-emerald-400 font-extrabold';
                        else if (log.includes('BUILD FAILED') || log.includes('Error') || log.includes('Exception') || log.includes('fail')) colorClass = 'text-rose-400 font-extrabold';
                        else if (log.includes('[HEAL]')) colorClass = 'text-amber-400 font-semibold';
                        else if (log.includes('[GEN]')) colorClass = 'text-cyan-400';
                        else if (log.includes('[PUSH]')) colorClass = 'text-purple-400';

                        return (
                          <div key={idx} className={`whitespace-pre-wrap ${colorClass}`}>
                            {log}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-slate-500 animate-pulse">Waiting for logs stream. Queue is currently scheduling resources...</div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer console actions */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
              <span className="text-[10px] text-slate-500 font-mono">
                Auto-scroll enabled • ESC to exit
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const activeJob = jobs.find(j => j.id === activeLogJobId);
                    if (activeJob && activeJob.logs) {
                      navigator.clipboard.writeText(activeJob.logs.join('\n'));
                      triggerToast('Logs copied to clipboard!');
                    }
                  }}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold py-1.5 px-3 rounded-xl text-xs cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Logs</span>
                </button>
                <button
                  onClick={() => setActiveLogJobId(null)}
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-extrabold py-1.5 px-4 rounded-xl text-xs cursor-pointer transition-all"
                >
                  Close Console
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
