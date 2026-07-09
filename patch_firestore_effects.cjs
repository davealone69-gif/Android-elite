const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

if (!code.includes('loadChatHistory(u.uid);')) {
  code = code.replace(
    'setUser(u);',
    `setUser(u);
      if (u) {
         loadChatHistory(u.uid);
      }`
  );
}

// When messages are added, we should save them
// Instead of modifying every setAiMessages, we can add a useEffect that listens to aiMessages
if (!code.includes('saveChatHistory(user.uid, aiMessages);')) {
  code = code.replace(
    '// Firebase Auth listener',
    `useEffect(() => {
    if (user && aiMessages.length > 1) { // >1 so we don't just save the initial greeting every time if it's the only thing
       saveChatHistory(user.uid, aiMessages);
    }
  }, [aiMessages, user]);

  // Firebase Auth listener`
  );
}

fs.writeFileSync('src/App.tsx', code);
