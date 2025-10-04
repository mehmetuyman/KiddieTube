const CATEGORY_ALL = 'All';

const YT_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

const YT_PLAYER_VARS = {
  rel: 0,
  modestbranding: 1,
  controls: 0, // disable youtube controls
  disablekb: 1,
  fs: 0,
  playsinline: 1,
  enablejsapi: 1,
  origin: window.location.origin,
};

const state = {
  videos: [],
  activeCategory: CATEGORY_ALL,
  activeVideoId: null,
  playerStatus: YT_STATES.UNSTARTED,
};

const selectors = {
  categoryList: document.getElementById('categoryList'),
  categoryCollapse: document.getElementById('categoryCollapse'),
  categoryToggle: document.getElementById('categoryToggle'),
  videoList: document.getElementById('videoList'),
  videoTitle: document.getElementById('videoTitle'),
  videoCategory: document.getElementById('videoCategory'),
  listHeading: document.getElementById('listHeading'),
  videoStatus: document.getElementById('videoStatus'),
};

let youtubePlayer = null;
let playerReady = false;
let pendingVideoId = null;

setupResponsiveCategories();
loadVideos();
registerServiceWorker();

(function injectYouTubeAPI() {
  if (document.getElementById('youtube-iframe-api')) return;
  const script = document.createElement('script');
  script.id = 'youtube-iframe-api';
  script.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(script);
})();

window.onYouTubeIframeAPIReady = function () {
  youtubePlayer = new YT.Player('videoPlayer', {
    width: '100%',
    height: '100%',
    playerVars: YT_PLAYER_VARS,
    events: {
      onReady: handlePlayerReady,
      onStateChange: handlePlayerStateChange,
    },
  });
};

async function loadVideos() {
  try {
    const response = await fetch('/videos');
    if (!response.ok) throw new Error('Network response was not ok');
    state.videos = await response.json();
    renderCategories();
    filterAndRender();
  } catch (error) {
    console.error('Unable to fetch videos', error);
    selectors.videoTitle.textContent = 'Oops! Unable to load videos right now.';
    selectors.videoCategory.textContent = '';
    selectors.videoStatus.textContent = 'Error';
  }
}

function renderCategories() {
  const uniqueCategories = Array.from(new Set(state.videos.map(video => video.category)));
  const categories = [CATEGORY_ALL, ...uniqueCategories];
  const counts = state.videos.reduce((acc, video) => {
    acc[video.category] = (acc[video.category] || 0) + 1;
    return acc;
  }, {});
  counts[CATEGORY_ALL] = state.videos.length;

  selectors.categoryList.innerHTML = '';

  categories.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center category-item';
    button.dataset.category = category;

    const label = document.createElement('span');
    label.textContent = category;

    const badge = document.createElement('span');
    badge.className = 'badge rounded-pill';
    badge.textContent = counts[category] ?? 0;

    if (category === state.activeCategory) {
      button.classList.add('active');
    }

    button.append(label, badge);
    button.addEventListener('click', () => {
      if (state.activeCategory === category) return;
      state.activeCategory = category;
      renderCategories();
      filterAndRender();
    });

    selectors.categoryList.appendChild(button);
  });
}

function filterAndRender() {
  const filteredVideos = state.activeCategory === CATEGORY_ALL
    ? state.videos
    : state.videos.filter(video => video.category === state.activeCategory);

  selectors.listHeading.textContent = `${state.activeCategory} Videos`;
  renderVideoList(filteredVideos);

  if (!filteredVideos.length) {
    state.activeVideoId = null;
    selectors.videoTitle.textContent = 'No videos found in this category.';
    selectors.videoCategory.textContent = '';
    state.playerStatus = YT_STATES.UNSTARTED;
    updateVideoStatus();
    return;
  }

  const activeVideo = filteredVideos.find(video => video.id === state.activeVideoId) || filteredVideos[0];
  setActiveVideo(activeVideo);
}

function renderVideoList(videos) {
  selectors.videoList.innerHTML = '';

  videos.forEach(video => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-group-item list-group-item-action d-flex flex-column align-items-start gap-1';
    item.dataset.videoId = video.id;

    const title = document.createElement('span');
    title.className = 'video-title';
    title.textContent = video.title;

    const category = document.createElement('span');
    category.className = 'video-category';
    category.textContent = video.category;

    if (video.id === state.activeVideoId) {
      item.classList.add('active-video');
    }

    item.append(title, category);
    item.addEventListener('click', () => setActiveVideo(video));

    selectors.videoList.appendChild(item);
  });
}

function setActiveVideo(video) {
  if (!video) return;

  const isSameVideo = video.id === state.activeVideoId;
  state.activeVideoId = video.id;

  selectors.videoTitle.textContent = video.title;
  selectors.videoCategory.textContent = `Category: ${video.category}`;

  highlightActiveVideo();

  if (playerReady && youtubePlayer) {
    if (!isSameVideo) {
      youtubePlayer.cueVideoById(video.id);
      state.playerStatus = YT_STATES.CUED;
    }
  } else {
    pendingVideoId = video.id;
  }

  updateVideoStatus();
}

function highlightActiveVideo() {
  Array.from(selectors.videoList.children).forEach(item => {
    item.classList.toggle('active-video', item.dataset.videoId === state.activeVideoId);
  });
}

function handlePlayerReady() {
  playerReady = true;
  const initialId = state.activeVideoId || pendingVideoId;

  if (initialId) {
    youtubePlayer.cueVideoById(initialId);
    state.playerStatus = YT_STATES.CUED;
    updateVideoStatus();
    pendingVideoId = null;
  } else {
    updateVideoStatus();
  }

  // 🎮 Attach custom controls after the player is ready
  const btnPlay = document.getElementById('btnPlay');
  const btnPause = document.getElementById('btnPause');
  const btnMute = document.getElementById('btnMute');
  const btnUnmute = document.getElementById('btnUnmute');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const progressBar = document.getElementById('progressBar');
  const currentTimeEl = document.getElementById('currentTime');
  const durationEl = document.getElementById('duration');

  if (btnPlay) btnPlay.onclick = () => youtubePlayer.playVideo();
  if (btnPause) btnPause.onclick = () => youtubePlayer.pauseVideo();
  if (btnMute) btnMute.onclick = () => youtubePlayer.mute();
  if (btnUnmute) btnUnmute.onclick = () => youtubePlayer.unMute();
  if (btnFullscreen) btnFullscreen.onclick = () => {
    const iframe = youtubePlayer.getIframe();
    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if (iframe.webkitRequestFullscreen) {
      iframe.webkitRequestFullscreen();
    } else if (iframe.msRequestFullscreen) {
      iframe.msRequestFullscreen();
    }
  };

  // Update progress and duration
  setInterval(() => {
    if (youtubePlayer && youtubePlayer.getDuration) {
      const duration = youtubePlayer.getDuration();
      const current = youtubePlayer.getCurrentTime();

      if (!isNaN(duration) && duration > 0) {
        progressBar.max = duration;
        progressBar.value = current;

        currentTimeEl.textContent = formatTime(current);
        durationEl.textContent = formatTime(duration);

        // 🔴 Update gradient to simulate YouTube red progress bar
        const percent = (current / duration) * 100;
        progressBar.style.background = `linear-gradient(to right, red 0%, red ${percent}%, #555 ${percent}%, #555 100%)`;
      }
    }
  }, 1000);

  // Allow user to seek
  if (progressBar) {
    progressBar.addEventListener('input', () => {
      youtubePlayer.seekTo(progressBar.value, true);
    });
  }

  // Helper for time formatting
  function formatTime(sec) {
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
}


function handlePlayerStateChange(event) {

  // const pauseOverlay = document.querySelector('.custom-pause-overlay');

  // if (event.data === YT_STATES.PAUSED) {
  //   if (pauseOverlay) pauseOverlay.style.display = 'flex';
  // } else {
  //   if (pauseOverlay) pauseOverlay.style.display = 'none';
  // }

  // const pauseShield = document.querySelector('.pause-shield');

  // if (event.data === YT_STATES.PAUSED) {
  //   pauseShield.style.display = 'block';
  // } else {
  //   pauseShield.style.display = 'none';
  // }

  const pauseShield = document.querySelector('.pause-shield');
  if (event.data === YT_STATES.PAUSED) pauseShield.classList.add('visible');
  else pauseShield.classList.remove('visible');



  const bottomLeftGuard = document.querySelector('.iframe-guard-bottom-left');

  if (event.data === YT_STATES.PLAYING) {
    // Once the video starts, hide bottom-left guard
    if (bottomLeftGuard) bottomLeftGuard.style.display = 'none';
  } else if (event.data === YT_STATES.UNSTARTED || event.data === YT_STATES.CUED) {
    // Before the video starts (unstarted or just cued)
    if (bottomLeftGuard) bottomLeftGuard.style.display = 'block';
  }


  if (event.data === YT_STATES.ENDED && state.activeVideoId) {
    youtubePlayer.cueVideoById(state.activeVideoId);
    state.playerStatus = YT_STATES.CUED;
    updateVideoStatus();
    return;
  }

  state.playerStatus = event.data;
  updateVideoStatus();
}

function updateVideoStatus() {
  if (!state.activeVideoId) {
    selectors.videoStatus.textContent = 'Idle';
    return;
  }

  switch (state.playerStatus) {
    case YT_STATES.PLAYING:
      selectors.videoStatus.textContent = 'Playing';
      break;
    case YT_STATES.PAUSED:
      selectors.videoStatus.textContent = 'Paused';
      break;
    case YT_STATES.BUFFERING:
      selectors.videoStatus.textContent = 'Loading...';
      break;
    case YT_STATES.ENDED:
      selectors.videoStatus.textContent = 'Finished';
      break;
    case YT_STATES.CUED:
      selectors.videoStatus.textContent = 'Ready';
      break;
    default:
      selectors.videoStatus.textContent = 'Ready';
  }
}

function setupResponsiveCategories() {
  if (!selectors.categoryCollapse || !window.bootstrap?.Collapse) return;

  const collapseInstance = new window.bootstrap.Collapse(selectors.categoryCollapse, {
    toggle: false,
  });

  const mediaQuery = window.matchMedia('(max-width: 991.98px)');

  const syncCollapse = event => {
    if (event.matches) {
      collapseInstance.hide();
    } else {
      collapseInstance.show();
    }
  };

  mediaQuery.addEventListener('change', syncCollapse);
  syncCollapse(mediaQuery);

  selectors.categoryCollapse.addEventListener('shown.bs.collapse', () => {
    selectors.categoryToggle?.setAttribute('aria-expanded', 'true');
    if (selectors.categoryToggle) {
      selectors.categoryToggle.textContent = 'Hide';
    }
  });

  selectors.categoryCollapse.addEventListener('hidden.bs.collapse', () => {
    selectors.categoryToggle?.setAttribute('aria-expanded', 'false');
    if (selectors.categoryToggle) {
      selectors.categoryToggle.textContent = 'Show';
    }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(error => {
        console.warn('Service worker registration failed:', error);
      });
    });
  }
}
