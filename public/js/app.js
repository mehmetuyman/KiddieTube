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
  controls: 2,
  disablekb: 1,
  fs: 0,
  playsinline: 1,
};

const state = {
  videos: [],
  activeCategory: CATEGORY_ALL,
  activeVideoId: null,
  playerStatus: YT_STATES.UNSTARTED,
};

const selectors = {
  categoryList: document.getElementById('categoryList'),
  videoList: document.getElementById('videoList'),
  videoTitle: document.getElementById('videoTitle'),
  videoCategory: document.getElementById('videoCategory'),
  listHeading: document.getElementById('listHeading'),
  videoToggle: document.getElementById('videoToggle'),
  videoStatus: document.getElementById('videoStatus'),
};

let youtubePlayer = null;
let playerReady = false;
let pendingVideoId = null;

selectors.videoToggle.disabled = true;
selectors.videoToggle.setAttribute('aria-label', 'Loading player...');

selectors.videoToggle.addEventListener('click', () => {
  if (!playerReady || !youtubePlayer || !state.activeVideoId) return;
  const status = youtubePlayer.getPlayerState();
  if (status === YT_STATES.PLAYING || status === YT_STATES.BUFFERING) {
    youtubePlayer.pauseVideo();
  } else {
    youtubePlayer.playVideo();
  }
});

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
    selectors.videoStatus.textContent = 'Idle';
    selectors.videoToggle.disabled = true;
    if (playerReady && youtubePlayer) {
      youtubePlayer.stopVideo();
    }
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
      state.playerStatus = YT_STATES.BUFFERING;
      updateVideoStatus();
      youtubePlayer.loadVideoById(video.id);
    }
    youtubePlayer.playVideo();
  } else {
    pendingVideoId = video.id;
  }

  selectors.videoToggle.disabled = !playerReady;
}

function highlightActiveVideo() {
  Array.from(selectors.videoList.children).forEach(item => {
    item.classList.toggle('active-video', item.dataset.videoId === state.activeVideoId);
  });
}

function handlePlayerReady() {
  playerReady = true;
  selectors.videoToggle.disabled = !state.activeVideoId;
  const initialId = state.activeVideoId || pendingVideoId;

  if (initialId) {
    state.playerStatus = YT_STATES.BUFFERING;
    updateVideoStatus();
    youtubePlayer.loadVideoById(initialId);
    pendingVideoId = null;
  } else {
    updateVideoStatus();
  }
}

function handlePlayerStateChange(event) {
  state.playerStatus = event.data;
  updateVideoStatus();
}

function updateVideoStatus() {
  if (!state.activeVideoId) {
    selectors.videoStatus.textContent = 'Idle';
    selectors.videoToggle.setAttribute('aria-label', 'Play video');
    return;
  }

  selectors.videoToggle.disabled = !playerReady;

  switch (state.playerStatus) {
    case YT_STATES.PLAYING:
      selectors.videoStatus.textContent = 'Playing';
      selectors.videoToggle.setAttribute('aria-label', 'Pause video');
      break;
    case YT_STATES.PAUSED:
      selectors.videoStatus.textContent = 'Paused';
      selectors.videoToggle.setAttribute('aria-label', 'Play video');
      break;
    case YT_STATES.BUFFERING:
      selectors.videoStatus.textContent = 'Loading...';
      selectors.videoToggle.setAttribute('aria-label', 'Pause video');
      break;
    case YT_STATES.ENDED:
      selectors.videoStatus.textContent = 'Finished';
      selectors.videoToggle.setAttribute('aria-label', 'Replay video');
      break;
    case YT_STATES.CUED:
      selectors.videoStatus.textContent = 'Ready';
      selectors.videoToggle.setAttribute('aria-label', 'Play video');
      break;
    default:
      selectors.videoStatus.textContent = 'Ready';
      selectors.videoToggle.setAttribute('aria-label', 'Play video');
  }
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

loadVideos();
registerServiceWorker();