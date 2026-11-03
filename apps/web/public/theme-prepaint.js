// Apply this device's theme before first paint (see src/lib/theme.ts).
// A separate file rather than an inline <script>, so the Content Security
// Policy doesn't need 'unsafe-inline' for scripts.
/* global localStorage, document */
;(function () {
  var t
  try {
    t = localStorage.getItem('kiddietube-theme')
  } catch (e) {
    // storage blocked: default theme
  }
  document.documentElement.setAttribute('data-theme', /^(sunny|ocean|candy|classic)$/.test(t || '') ? t : 'sunny')
})()
