document.addEventListener("DOMContentLoaded", function () {
  let isRecording = false;
  let recognition;
  let currentlyPlaying = null;
  let currentConversationId = null;
  let lastAction = null;
  let mediaRecorder;
  let audioChunks = [];

  const sidebar = document.getElementById("sidebar");
  const openSidebarButton = document.getElementById("open-sidebar-button");
  const closeSidebarButton = document.getElementById("close-sidebar-button");
  const newConversationButton = document.getElementById(
    "new-conversation-button"
  );
  const chatForm = document.getElementById("chat-form");
  const chatBox = document.getElementById("chat-box");
  const userInput = document.getElementById("user-input");
  const microphoneButton = document.getElementById("microphone-button");
  const loadingIndicator = document.getElementById("loading-indicator");
  const errorMessage = document.getElementById("error-message");
  const themeToggle = document.getElementById("theme-toggle");
  const sunIcon = themeToggle.querySelector("i");
  const conversationList = document.getElementById("conversation-list");
  const languageSelect = document.getElementById("language-select");

  const shimmer = document.createElement("div");
  shimmer.classList.add("shimmer");
  document.body.appendChild(shimmer);

  restoreConversationState();

  let currentLanguage = languageSelect.value;
  const selectedLanguage = localStorage.getItem("selectedLanguage");

  if (selectedLanguage) {
    currentLanguage = selectedLanguage;
    languageSelect.value = currentLanguage;

    if (currentLanguage !== "en") {
      reloadAndTranslatePage(currentLanguage);
    }
  }

  translatePageOnLoad();

  function initializeSpeechRecognition() {
    if ("webkitSpeechRecognition" in window) {
      recognition = new webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = languageSelect.value;

      recognition.onresult = handleSpeechResult;
      recognition.onerror = handleSpeechError;
    } else {
      microphoneButton.style.display = "none";
    }
  }

  function restoreConversationState() {
    const chatBox = document.getElementById("chat-box");
    currentConversationId = localStorage.getItem("lastActiveConversation");

    if (currentConversationId) {
      const conversation = JSON.parse(
        localStorage.getItem(`conversation_${currentConversationId}`)
      );
      if (conversation) {
        chatBox.innerHTML = "";
        conversation.messages.forEach((message) => {
          addMessage(message.sender, message.text);
        });
      }
    }
  }

  function saveConversationState() {
    const chatBox = document.getElementById("chat-box");
    if (chatBox) {
      localStorage.setItem("savedConversationState", chatBox.innerHTML);
    }
  }

  function handleSpeechResult(event) {
    const transcript = event.results[0][0].transcript;
    showLoadingIndicator("Processing audio...");
    stopSpeech();
    sendMessageToBot(transcript)
      .then(() => hideLoadingIndicator())
      .catch((error) => {
        hideLoadingIndicator();
        handleError(error.message);
      });
  }

  function handleSpeechError(event) {
    console.error("Speech recognition error:", event.error);
    stopSpeech();
  }

  function handleOpenSidebar() {
    sidebar.classList.add("open");
    if (window.innerWidth < 768) {
      openSidebarButton.style.display = "none";
      closeSidebarButton.style.display = "block";
      document.addEventListener("click", closeSidebarOnClickOutside);
    }
  }

  function handleCloseSidebar() {
    if (window.innerWidth < 768) {
      sidebar.classList.remove("open");
      openSidebarButton.style.display = "block";
      closeSidebarButton.style.display = "none";
      document.removeEventListener("click", closeSidebarOnClickOutside);
    }
  }

  function closeSidebarOnClickOutside(event) {
    if (
      !sidebar.contains(event.target) &&
      !openSidebarButton.contains(event.target)
    ) {
      handleCloseSidebar();
    }
  }

  // New conversation
  function handleNewConversation() {
    chatBox.innerHTML = "";
    userInput.value = "";
    errorMessage.textContent = "";
    handleCloseSidebar();
    displayWelcomeMessage();
    currentConversationId = null;
  }

   function displayWelcomeMessage() {
    const welcomeMessage = currentLanguage === "en" 
      ? "Welcome! How may I assist you?" 
      : "Akwaaba! Mɛyɛ dɛn aboa wo?";
    addMessage("bot", welcomeMessage);
  }
  
  // Theme toggle functionality
  function applySavedTheme() {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.body.classList.add(savedTheme);
    updateIcon(savedTheme);
  }

  function toggleTheme() {
    const isDarkMode = document.body.classList.toggle("dark");
    const theme = isDarkMode ? "dark" : "light";
    localStorage.setItem("theme", theme);
    updateIcon(theme);
  }

  function updateIcon(theme) {
    if (theme === "dark") {
      sunIcon.classList.remove("fa-moon");
      sunIcon.classList.add("fa-sun");
    } else {
      sunIcon.classList.remove("fa-sun");
      sunIcon.classList.add("fa-moon");
    }
  }

  // Event listeners
  function addEventListeners() {
    openSidebarButton.addEventListener("click", handleOpenSidebar);
    closeSidebarButton.addEventListener("click", handleCloseSidebar);
    newConversationButton.addEventListener("click", handleNewConversation);
    chatForm.addEventListener("submit", handleSubmit);
    themeToggle.addEventListener("click", () => {
      toggleTheme();
      setShimmerBackgroundColor();
    });

    if (recognition) {
      microphoneButton.addEventListener("click", async () => {
        if (isRecording) {
          stopAudioRecording();
        } else {
          startAudioRecording();
        }
      });
    }

    languageSelect.addEventListener("change", (event) => {
      const newLanguage = event.target.value;
      localStorage.setItem("selectedLanguage", newLanguage);

      saveConversationState();

      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("lang", newLanguage);
      window.location.href = currentUrl.toString();
    });

    window.addEventListener("beforeunload", () => {
      if (currentConversationId) {
        localStorage.setItem("lastActiveConversation", currentConversationId);
      }
    });
  }

  function parseMarkdown(text) {
    // Replace numbered list items with bold main points
    text = text.replace(
      /(\d+\.)\s+\*\*(.+?)\*\*/,
      function (match, number, content) {
        return `<p>${number} <strong>${content}</strong></p>`;
      }
    );

    // Replace other bold text
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Replace italic text
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Replace line breaks
    text = text.replace(/\n/g, "<br>");

    return text;
  }

  function startAudioRecording() {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          sendAudioToServer(audioBlob);
          audioChunks = [];
        };
        mediaRecorder.start();
        isRecording = true;
        microphoneButton.classList.add("recording");
        microphoneButton.querySelector("i").className = "fas fa-stop";
      })
      .catch((error) => {
        console.error("Audio recording failed:", error);
      });
  }

  function stopAudioRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      microphoneButton.classList.remove("recording");
      microphoneButton.querySelector("i").className = "fas fa-microphone";
    }
  }

  function initialize() {
    initializeSpeechRecognition();
    initializeAudioRecording();
    addEventListeners();
    restoreConversationState();

    setTimeout(() => {
      applySavedTheme();
      hideErrorMessage();
      loadExistingConversations();
      setShimmerBackgroundColor();
      shimmer.style.display = "none";
    }, 5000);
  }

  function initializeChat() {
    displayWelcomeMessage();
    loadExistingConversations();
  }

  initialize();

  function setShimmerBackgroundColor() {
    const isDarkMode = document.body.classList.contains("dark");
    shimmer.classList.toggle("dark", isDarkMode);
  }

  function showShimmer() {
    shimmer.style.display = "flex";
    setShimmerBackgroundColor();
  }

  function hideShimmer() {
    shimmer.style.display = "none";
  }

  async function sendMessageToBot(message) {
    lastAction = { message, language: currentLanguage };
    hideErrorMessage();
    try {
      showLoadingIndicator("Generating response...");
      const response = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, language: currentLanguage }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "An error occurred while processing your request."
        );
      }

      const data = await response.json();
      hideLoadingIndicator();

      if (data.reply) {
        addMessage("bot", data.reply);
        updateCurrentConversation("bot", data.reply);
        return data.reply;
      } else {
        throw new Error("The server returned an empty response.");
      }
    } catch (error) {
      hideLoadingIndicator();
      handleError(error.message);
      throw error;
    }
  }

  function addMessage(sender, text, isEdited = false, isAudio = false) {
    if (isEdited) {
      const lastBotMessage = chatBox.querySelector(".message.bot:last-child");
      if (lastBotMessage) {
        lastBotMessage.remove();
      }
    }
  
    const messageContainer = document.createElement("div");
    messageContainer.classList.add("message-container");
  
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender);
  
    messageElement.classList.add(
      sender === "user" ? "message-right" : "message-left"
    );
  
    let textElement = document.createElement("div");
    textElement.style.whiteSpace = "pre-wrap";
    textElement.style.width = "100%";
  
    if (isAudio) {
      const audioElement = document.createElement("audio");
      audioElement.controls = true;
      audioElement.src = URL.createObjectURL(text);
      messageElement.appendChild(audioElement);
    } else {
      textElement.innerHTML = parseMarkdown(text);
      messageElement.appendChild(textElement);
    }
  
    const iconContainer = document.createElement("div");
    iconContainer.classList.add("message-icons");
  
    let editTextarea = null;
  
    if (sender === "bot") {
      // Create a flexbox container for the bot message and profile pic
      const botMessageContainer = document.createElement("div");
      botMessageContainer.classList.add("bot-message-container");
      
      const profilePicContainer = document.createElement("div");
      profilePicContainer.classList.add("profile-pic-container");
  
      const profilePic = document.createElement("img");
      profilePic.src = "static/images/doctor.png";
      profilePic.alt = "Bot Profile Picture";
      profilePic.classList.add("profile-pic");
      profilePicContainer.appendChild(profilePic);
  
      // Append profilePicContainer and messageElement to the botMessageContainer
      botMessageContainer.appendChild(profilePicContainer);
      botMessageContainer.appendChild(messageElement);
  
      // Append the entire bot message (with profile picture) to the messageContainer
      messageContainer.appendChild(botMessageContainer);
  
      const speakIcon = document.createElement("i");
      speakIcon.classList.add("fas", "fa-volume-up", "icon-button");
      speakIcon.title = "Listen to response";
      speakIcon.onclick = () => {
        if (currentlyPlaying) {
          stopSpeech();
        } else {
          speakText(textElement.innerHTML, speakIcon);
        }
      };
  
      const translateIcon = document.createElement("i");
      translateIcon.classList.add("fas", "fa-globe", "icon-button");
      translateIcon.title = "Translate response";
      translateIcon.onclick = async () => {
        const fromLang = currentLanguage === "en" ? "en" : "ak";
        const toLang = currentLanguage === "en" ? "ak" : "en";
        try {
          const translatedText = await translateText(text, fromLang, toLang);
          console.log("Translated Text:", translatedText);
          if (textElement) {
            textElement.innerText = translatedText;
          } else {
            console.error("textElement is not defined.");
          }
        } catch (error) {
          console.error("Translation failed:", error);
        }
      };
  
      if (
        text !== "Welcome! How may I assist you?" &&
        text !== "Akwaaba! Mɛyɛ dɛn aboa wo?"
      ) {
        const regenerateIcon = document.createElement("i");
        regenerateIcon.classList.add("fas", "fa-redo", "icon-button");
        regenerateIcon.title = "Regenerate response";
        regenerateIcon.onclick = () =>
          regenerateResponse(textElement.innerHTML, messageElement);
        iconContainer.appendChild(regenerateIcon);
      }
  
      iconContainer.appendChild(speakIcon);
      iconContainer.appendChild(translateIcon);
    }
  
    if (sender === "user") {
      const editIcon = createIcon("fas fa-pencil", "Edit message", () => {
        if (editTextarea) return;
  
        const currentText = textElement.innerHTML;
        textElement.remove();
  
        editTextarea = document.createElement("textarea");
        editTextarea.value = currentText;
        editTextarea.classList.add("edit-textarea");
        messageElement.insertBefore(editTextarea, iconContainer);
  
        const sendButton = document.createElement("button");
        sendButton.textContent = "Send";
        sendButton.classList.add("send-button");
  
        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.classList.add("cancel-button");
  
        sendButton.addEventListener("click", () => {
          const newText = editTextarea.value.trim();
          if (newText && newText !== currentText) {
            isEdited = true;
            messageElement.remove();
            addMessage("user", newText, true);
  
            showLoadingIndicator();
            sendMessageToBot(newText);
          } else {
            resetEditMode();
          }
        });
  
        cancelButton.addEventListener("click", resetEditMode);
  
        function resetEditMode() {
          editTextarea.replaceWith(textElement);
          textElement.innerHTML = currentText;
          messageElement.appendChild(iconContainer);
          sendButton.remove();
          cancelButton.remove();
        }
  
        iconContainer.appendChild(sendButton);
        iconContainer.appendChild(cancelButton);
      });
  
      iconContainer.appendChild(editIcon);
    }
  
    messageElement.appendChild(iconContainer);
    if (sender === "user") {
      messageContainer.appendChild(messageElement); // No profile pic for user
    }
    chatBox.appendChild(messageContainer);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  

  function createIcon(iconClass, title, clickHandler) {
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.title = title;
    icon.addEventListener("click", clickHandler);
    return icon;
  }

  function retryLastAction() {
    if (lastAction) {
      hideErrorMessage();
      showLoadingIndicator();
      sendMessageToBot(lastAction.message)
        .then(() => hideLoadingIndicator())
        .catch((error) => {
          hideLoadingIndicator();
          handleError(error.message);
        });
    }
  }

  function speakText(text, icon, lang = currentLanguage) {
    const speech = new SpeechSynthesisUtterance();
    speech.text = text;
    speech.lang = lang === "ak" ? "en" : lang;

    speech.onend = () => {
      icon.classList.remove("fa-stop");
      icon.classList.add("fa-volume-up");
      currentlyPlaying = null;
    };

    icon.classList.remove("fa-volume-up");
    icon.classList.add("fa-stop");
    currentlyPlaying = speech;
    window.speechSynthesis.speak(speech);
  }

  function stopSpeech() {
    if (currentlyPlaying) {
      window.speechSynthesis.cancel();
      currentlyPlaying = null;
      const icon = document.querySelector(".fa-stop");
      if (icon) {
        icon.classList.remove("fa-stop");
        icon.classList.add("fa-volume-up");
      }
    }
  }

  function handleError(message) {
    errorMessage.innerHTML = `
      <p>${message}</p>
      <button id="retry-button" class="retry-button">Retry</button>
    `;

    errorMessage.style.display = "block";

    const retryButton = document.getElementById("retry-button");
    retryButton.addEventListener("click", retryLastAction);

    positionErrorMessage();
  }

  function positionErrorMessage() {
    const chatBoxRect = chatBox.getBoundingClientRect();
    const inputBoxRect = document
      .getElementById("user-input")
      .getBoundingClientRect();

    errorMessage.style.position = "absolute";
    errorMessage.style.bottom = `${
      window.innerHeight - inputBoxRect.top + 10
    }px`;
    errorMessage.style.width = `${chatBoxRect.width}px`;
    errorMessage.style.maxHeight = `${availableSpace - 10}px`;
    errorMessage.style.overflowY = "auto";
  }

  function updateErrorMessagePosition() {
    if (errorMessage.style.display !== "none") {
      positionErrorMessage();
    }
  }

  function hideErrorMessage() {
    errorMessage.style.display = "none";
  }

  function showLoadingIndicator(message = "Processing...") {
    loadingIndicator.textContent = message;
    loadingIndicator.style.display = "block";
  }

  function hideLoadingIndicator() {
    loadingIndicator.style.display = "none";
  }

  async function translateText(text, fromLang, toLang) {
    try {
      const response = await fetch("/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, src_lang: fromLang, dest_lang: toLang }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Translation failed.");
      }

      const data = await response.json();
      return data.translated_text;
    } catch (error) {
      console.error("Translation error:", error.message);
      return text;
    }
  }

  function reloadAndTranslatePage(targetLanguage) {
    localStorage.setItem("selectedLanguage", targetLanguage);
    translatePageContent(targetLanguage)
      .then(() => {
        if (recognition) {
          recognition.lang = targetLanguage;
        }
      })
      .catch((error) => {
        handleError("Failed to translate the page. Please try again.");
      });
  }

  async function translatePageContent(targetLanguage) {
    try {
      await translateElement(document.body, "en", targetLanguage);

      const sidebar = document.getElementById("sidebar");
      if (sidebar) {
        await translateElement(sidebar, "en", targetLanguage);
      }

      const disclaimer = document.querySelector(".disclaimer");
      if (disclaimer) {
        await translateElement(disclaimer, "en", targetLanguage);
      }

      const buttons = document.querySelectorAll("button, label, option");
      for (const button of buttons) {
        await translateElement(button, "en", targetLanguage);
      }

      const inputElements = document.querySelectorAll(
        "input[placeholder], textarea[placeholder]"
      );
      for (const input of inputElements) {
        const translatedPlaceholder = await translateText(
          input.getAttribute("placeholder"),
          "en",
          targetLanguage
        );
        input.setAttribute("placeholder", translatedPlaceholder);
      }

      const messageElements = document.querySelectorAll(".message");
      for (const messageElement of messageElements) {
        const textElement = messageElement.querySelector("div");
        if (textElement) {
          const translatedText = await translateText(
            textElement.innerHTML,
            "en",
            targetLanguage
          );
          textElement.innerHTML = translatedText;
        }
      }
    } catch (error) {
      console.error("Translation error:", error);
      handleError("Failed to translate the page. Please try again.");
    } finally {
      hideShimmer();
      hideLoadingIndicator();
    }
  }

  function translatePageOnLoad() {
    const languageSelect = document.getElementById("language-select");
    const selectedLanguage = languageSelect.value;

    if (selectedLanguage !== "en") {
      showShimmer();
      translatePageContent(selectedLanguage)
        .then(() => {
          initializeChat();
          hideShimmer();
        })
        .catch((error) => {
          hideShimmer();
          handleError(
            error + "Failed to translate the page. Please try again."
          );
        });
    } else {
      initializeChat();
    }
  }

  async function translateElement(element, fromLang, toLang) {
    if (element.childNodes.length === 0) {
      if (element.textContent.trim()) {
        const translatedText = await translateText(
          element.textContent,
          fromLang,
          toLang
        );
        element.textContent = translatedText;
      }
    } else {
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent.trim()) {
            const translatedText = await translateText(
              child.textContent,
              fromLang,
              toLang
            );
            child.textContent = translatedText;
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          await translateElement(child, fromLang, toLang);
        }
      }
    }
  }

  function regenerateResponse(originalQuestion, messageElement) {
    messageElement.remove();

    showLoadingIndicator();
    const variedPrompt = "I want a different response to: " + originalQuestion;

    sendMessageToBot(variedPrompt);
  }

  function saveConversation(message) {
    if (!currentConversationId) {
      currentConversationId = Date.now().toString();
    }

    let conversation = JSON.parse(
      localStorage.getItem(`conversation_${currentConversationId}`)
    ) || {
      id: currentConversationId,
      messages: [],
      timestamp: new Date().toISOString(),
    };

    conversation.messages.push({ sender: "user", text: message });
    localStorage.setItem(
      `conversation_${currentConversationId}`,
      JSON.stringify(conversation)
    );
    localStorage.setItem("lastActiveConversation", currentConversationId);
    loadExistingConversations();
  }

  function loadExistingConversations() {
    conversationList.innerHTML = "";
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith("conversation_")
    );

    const groupedConversations = groupConversationsByDate(keys);

    Object.keys(groupedConversations).forEach((group) => {
      const groupContainer = document.createElement("div");
      groupContainer.classList.add("conversation-group");

      const groupHeader = document.createElement("div");
      groupHeader.classList.add("conversation-group-header");
      groupHeader.textContent = group;
      groupContainer.appendChild(groupHeader);

      groupedConversations[group].forEach((conversation) => {
        const listItem = document.createElement("li");
        listItem.classList.add("conversation-item");

        // Set the conversation title based on the first user message
        const firstMessage = conversation.messages.find(
          (msg) => msg.sender === "user"
        );
        const title = firstMessage ? firstMessage.text : "Untitled";
        listItem.innerHTML = `
          <span class="conversation-title">${title}</span>
          <i class="fas fa-trash delete-icon" title="Delete conversation"></i>
        `;

        listItem
          .querySelector(".delete-icon")
          .addEventListener("click", (event) => {
            event.stopPropagation();
            deleteConversation(conversation.id);
          });

        listItem.addEventListener("click", () =>
          loadConversation(conversation.id)
        );
        groupContainer.appendChild(listItem);
      });

      conversationList.appendChild(groupContainer);
    });
  }

  function groupConversationsByDate(keys) {
    const groupedConversations = {};

    keys.forEach((key) => {
      const conversation = JSON.parse(localStorage.getItem(key));
      const date = new Date(conversation.timestamp);
      const groupKey = getGroupKey(date);

      if (!groupedConversations[groupKey]) {
        groupedConversations[groupKey] = [];
      }

      groupedConversations[groupKey].push(conversation);
    });

    return groupedConversations;
  }

  function getGroupKey(date) {
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return "Today";
    } else if (diffInDays === 1) {
      return "Yesterday";
    } else if (diffInDays < 7) {
      return "This Week";
    } else if (diffInDays < 30) {
      return "This Month";
    } else {
      return date.toLocaleDateString();
    }
  }

  function loadConversation(conversationId) {
    const conversation = JSON.parse(
      localStorage.getItem("conversation_" + conversationId)
    );
    chatBox.innerHTML = "";
    conversation.messages.forEach((message) => {
      addMessage(message.sender, message.text);
    });
    currentConversationId = conversationId;
    handleCloseSidebar();
    displayWelcomeMessage();
  }

  function updateCurrentConversation(sender, text) {
    if (!currentConversationId) {
      // If there's no current conversation, create a new one
      currentConversationId = Date.now().toString();
      const newConversation = {
        id: currentConversationId,
        messages: [],
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(`conversation_${currentConversationId}`, JSON.stringify(newConversation));
    }
  
    let conversation = JSON.parse(
      localStorage.getItem(`conversation_${currentConversationId}`)
    );
  
    // If conversation is still null, initialize it
    if (!conversation) {
      conversation = {
        id: currentConversationId,
        messages: [],
        timestamp: new Date().toISOString(),
      };
    }
  
    conversation.messages.push({ sender, text });
    localStorage.setItem(
      `conversation_${currentConversationId}`,
      JSON.stringify(conversation)
    );
    loadExistingConversations();
  }

  function deleteConversation(conversationId) {
    localStorage.removeItem("conversation_" + conversationId);
    loadExistingConversations();
  }

  function initializeAudioRecording() {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          sendAudioToServer(audioBlob);
          audioChunks = [];
        };
      })
      .catch((error) => {
        console.error("Error accessing microphone:", error);
        microphoneButton.style.display = "none";
      });
  }

  function createSpinner(message) {
    const spinner = document.createElement("div");
    spinner.classList.add("spinner");
    spinner.innerHTML = `
      <div class="spinner-border text-primary" role="status">
        <span class="sr-only"></span>
      </div>
      <span class="ml-2">${message}</span>
    `;
    return spinner;
  }

  function showSpinner(message) {
    const existingSpinner = document.querySelector(".spinner");
    if (existingSpinner) {
      existingSpinner.remove();
    }
    const spinner = createSpinner(message);
    chatBox.appendChild(spinner);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function removeSpinner() {
    const spinner = document.querySelector(".spinner");
    if (spinner) {
      spinner.remove();
    }
  }

  async function sendAudioToServer(audioBlob) {
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.webm");
    formData.append("language", languageSelect.value);

    try {
      addMessage("user", audioBlob, false, true);

      showLoadingIndicator("Processing audio...");
      hideErrorMessage();
      const response = await fetch("/transcribe_audio", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          hideLoadingIndicator();
          await sendMessageToBot(data.text);
        } else if (data.error) {
          hideLoadingIndicator();
          handleError(data.error);
        }
      } else {
        hideLoadingIndicator();
        handleError("Failed to process the audio.");
      }
    } catch (error) {
      console.error("Error sending audio to server:", error);
      handleError("Failed to send audio to the server.");
    }
  }

  // Add this to your CSS
  const style = document.createElement("style");
  style.textContent = `
    .spinner {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      background-color: #f0f0f0;
      border-radius: 5px;
      margin: 10px 0;
    }
  
    .spinner-border {
      width: 1.5rem;
      height: 1.5rem;
      border-width: 0.2em;
    }
  `;
  document.head.appendChild(style);

  async function handleSubmit(event) {
    event.preventDefault();
    const message = userInput.value.trim();
    if (message) {
      if (!currentConversationId) {
        // If there's no current conversation, create a new one
        currentConversationId = Date.now().toString();
        saveConversation(message);
      } else {
        updateCurrentConversation("user", message);
      }
      addMessage("user", message);
      userInput.value = "";
      showLoadingIndicator();
      try {
        const botResponse = await sendMessageToBot(message);
        updateCurrentConversation("bot", botResponse);
      } catch (error) {
        handleError("Failed to get a response from the bot. Please try again.");
      }
    }
  }

  window.addEventListener("resize", updateErrorMessagePosition);
  window.addEventListener("scroll", updateErrorMessagePosition);
});
