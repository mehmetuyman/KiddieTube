import React, { useEffect, useState } from 'react';

const INSTALL_PROMPT_PREF_KEY = 'kiddietube-install-prompt';
const PROMPT_DISMISSED_VALUE = 'dismissed';
const PROMPT_INSTALLED_VALUE = 'installed';

// localStorage can throw (blocked storage, some private modes). A throw inside
// an effect would unmount the whole app, so treat it as "no preference".
function readPref(): string | null {
  try {
    return localStorage.getItem(INSTALL_PROMPT_PREF_KEY);
  } catch {
    return null;
  }
}

function writePref(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(INSTALL_PROMPT_PREF_KEY);
    else localStorage.setItem(INSTALL_PROMPT_PREF_KEY, value);
  } catch {
    /* ignore */
  }
}

interface InstallPromptProps {
  onClose: () => void;
}

const InstallPrompt: React.FC<InstallPromptProps> = ({ onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  const checkPromptPreference = () => !readPref(); // Show prompt if no preference is stored

  useEffect(() => {
    // Only proceed if user hasn't dismissed or installed
    if (!checkPromptPreference()) {
      setIsVisible(false);
      return;
    }

    const handler = (e: Event) => {
      // Prevent Chrome 67+ from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful installs through other means
    const onAppInstalled = () => {
      writePref(PROMPT_INSTALLED_VALUE);
      setIsVisible(false);
    };
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      // Show the install prompt and wait for the user to respond
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') writePref(PROMPT_INSTALLED_VALUE);
    } catch {
      /* prompt() can only be called once per event */
    }

    // Clear the deferredPrompt as it can only be used once
    setDeferredPrompt(null);
    setIsVisible(false);
    onClose();
  };

  const handleDismiss = () => {
    writePref(PROMPT_DISMISSED_VALUE);
    setIsVisible(false);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="install-prompt">
      <div className="install-prompt-content">
        <img
          src={`${import.meta.env.BASE_URL}assets/logo_no_bg.png`}
          alt="KiddieTube Logo"
          className="install-prompt-logo"
        />
        <h2>Install KiddieTube</h2>
        <p>Install our app for the best fullscreen experience!</p>
        <div className="install-prompt-buttons">
          <button onClick={handleInstall} className="install-button">
            Install
          </button>
          <button 
            className="close-button" 
            onClick={handleDismiss}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

export const resetInstallPromptPreference = () => writePref(null);

export default InstallPrompt;