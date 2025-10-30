import React, { useEffect, useState } from 'react';

const INSTALL_PROMPT_PREF_KEY = 'kiddietube-install-prompt';
const PROMPT_DISMISSED_VALUE = 'dismissed';
const PROMPT_INSTALLED_VALUE = 'installed';

interface InstallPromptProps {
  onClose: () => void;
}

const InstallPrompt: React.FC<InstallPromptProps> = ({ onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  const checkPromptPreference = () => {
    const preference = localStorage.getItem(INSTALL_PROMPT_PREF_KEY);
    return !preference; // Show prompt if no preference is stored
  };

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
    window.addEventListener('appinstalled', () => {
      localStorage.setItem(INSTALL_PROMPT_PREF_KEY, PROMPT_INSTALLED_VALUE);
      setIsVisible(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', () => {});
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
      localStorage.setItem(INSTALL_PROMPT_PREF_KEY, PROMPT_INSTALLED_VALUE);
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferredPrompt as it can only be used once
    setDeferredPrompt(null);
    setIsVisible(false);
    onClose();
  };

  const handleDismiss = () => {
    localStorage.setItem(INSTALL_PROMPT_PREF_KEY, PROMPT_DISMISSED_VALUE);
    setIsVisible(false);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="install-prompt">
      <div className="install-prompt-content">
        <img 
          src="/assets/logo_no_bg.png" 
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
        <button 
          className="reset-preference-button"
          onClick={() => {
            localStorage.removeItem(INSTALL_PROMPT_PREF_KEY);
            setIsVisible(false);
            onClose();
          }}
        >
          Reset Preference
        </button>
      </div>
    </div>
  );
};

export const resetInstallPromptPreference = () => {
  localStorage.removeItem(INSTALL_PROMPT_PREF_KEY);
};

export default InstallPrompt;