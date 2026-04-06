'use strict';

// ============================================================
// 1. DOM ЭЛЕМЕНТЫ
// ============================================================
const searchForm = document.getElementById('search-form');
const usernameInput = document.getElementById('username');
const searchBtn = document.getElementById('searchBtn');
const errorDiv = document.getElementById('error');
const loader = document.getElementById('loader');
const profileSection = document.getElementById('profile-section');
const profileDiv = document.getElementById('profile');
const reposSection = document.getElementById('repos-section');
const reposList = document.getElementById('repos');
const historySection = document.getElementById('history-section');
const historyDiv = document.getElementById('history');
const clearHistoryBtn = document.getElementById('clearHistory');


const paginationDiv = document.createElement('div');
paginationDiv.className = 'pagination-controls';
reposSection.appendChild(paginationDiv);


let currentUsername = '';
let currentTotalRepos = 0;
let currentPage = 1;
const REPOS_PER_PAGE = 5;

// ============================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (UI)
// ============================================================
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
}

function clearError() {
  errorDiv.textContent = '';
  errorDiv.classList.add('hidden');
}

function showLoader() {
  loader.classList.remove('hidden');
}

function hideLoader() {
  loader.classList.add('hidden');
}

function clearContainer(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

// ============================================================
// 3. СЕТЕВЫЕ ЗАПРОСЫ (FETCH)
// ============================================================

// ПОЧЕМУ async/await? — Позволяет писать асинхронный код так, будто он синхронный; читается легче, чем цепочки .then().
async function getUser(username) {
  const response = await fetch(`https://api.github.com/users/${username}`);
  
  // ПОЧЕМУ !response.ok? - fetch не считает ошибки 404/500 исключениями; нужно вручную проверять успешность статус-кода.
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Пользователь не найден');
    }
    if (response.status === 403) {
      throw new Error('Слишком много запросов (Rate Limit). Подождите немного.');
    }
    throw new Error(`Ошибка сервера: ${response.status}`);
  }
  
  // ПОЧЕМУ проверяем Content-Type? - Страхуемся, что сервер вернул именно JSON, а не HTML-страницу с ошибкой, чтобы не сломать парсер (response.json()).
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new TypeError("Упс, мы ждали JSON, а получили что-то другое!");
  }
  
  return await response.json();
}

async function getRepos(username, page = 1) {
  const response = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=${REPOS_PER_PAGE}&page=${page}`);
  
  if (!response.ok) {
    throw new Error(`Ошибка загрузки репозиториев: ${response.status}`);
  }

  // Проверка Content-Type и для репозиториев
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new TypeError("Упс, мы ждали JSON, а получили что-то другое!");
  }
  
  return await response.json();
}

// ============================================================
// 4. ОТРИСОВКА ДАННЫХ (RENDER)
// ============================================================

function renderProfile(user) {
  clearContainer(profileDiv);

  const avatar = document.createElement('img');
  avatar.src = user.avatar_url;
  avatar.alt = `Аватар ${user.login}`;
  avatar.className = 'profile-avatar';

  const name = document.createElement('h2');
  name.textContent = user.name || user.login;

  const bio = document.createElement('p');
  bio.textContent = user.bio || 'Нет описания профиля.';

  const reposCount = document.createElement('span');
  reposCount.textContent = `Публичных репозиториев: ${user.public_repos}`;

  profileDiv.append(avatar, name, bio, reposCount);
  profileSection.classList.remove('hidden');
}

function renderRepos(repos) {
  clearContainer(reposList);

  if (repos.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'У пользователя пока нет публичных репозиториев.';
    reposList.appendChild(li);
  } else {
    repos.forEach(repo => {
      const li = document.createElement('li');
      li.className = 'repo-item';

      const title = document.createElement('h3');
      const link = document.createElement('a');
      link.href = repo.html_url;
      link.target = '_blank';
      link.textContent = repo.name;
      title.appendChild(link);

      const desc = document.createElement('p');
      desc.textContent = repo.description || 'Нет описания';

      const stars = document.createElement('span');
      stars.textContent = `⭐ ${repo.stargazers_count}`;

      li.append(title, desc, stars);
      reposList.appendChild(li);
    });
  }
  
  reposSection.classList.remove('hidden');
}

// ============================================================
// 5. ПАГИНАЦИЯ (PRO УРОВЕНЬ)
// ============================================================

function renderPagination() {
  clearContainer(paginationDiv);
  
  if (currentTotalRepos === 0) return;

  const totalPages = Math.ceil(currentTotalRepos / REPOS_PER_PAGE);
  if (totalPages <= 1) return; 
  
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = 'page-btn';
    
    if (i === currentPage) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', async () => {
      currentPage = i;
      await loadPageData(); 
    });

    paginationDiv.appendChild(btn);
  }
}

async function loadPageData() {
  showLoader();
  try {
    const reposData = await getRepos(currentUsername, currentPage);
    renderRepos(reposData);
    renderPagination(); 
  } catch (error) { // <--- ЗДЕСЬ БЫЛА ОШИБКА, Я ВЕРНУЛ CATCH НА МЕСТО
    showError(error.message);
  } finally {
    hideLoader();
  }
}

// ============================================================
// 6. ИСТОРИЯ ПОИСКА (LOCAL STORAGE)
// ============================================================

function saveToHistory(username) {
  let history = JSON.parse(localStorage.getItem('gh_search_history')) || [];
  history = history.filter(item => item.toLowerCase() !== username.toLowerCase());
  history.unshift(username); 
  if (history.length > 3) history.pop();
  localStorage.setItem('gh_search_history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem('gh_search_history')) || [];
  clearContainer(historyDiv);

  if (history.length === 0) {
    historySection.classList.add('hidden');
    return;
  }

  history.forEach(username => {
    const tag = document.createElement('span');
    tag.className = 'history-tag';
    tag.textContent = username;
    
    tag.addEventListener('click', () => {
      usernameInput.value = username;
      searchBtn.click(); 
    });
    historyDiv.appendChild(tag);
  });
  historySection.classList.remove('hidden');
}

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem('gh_search_history');
  renderHistory();
});

// ============================================================
// 7. ГЛАВНЫЙ ОБРАБОТЧИК ФОРМЫ
// ============================================================

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = usernameInput.value.trim();
  if (!username) {
    showError('Введите имя пользователя GitHub');
    return;
  }

  currentUsername = username;
  currentPage = 1; 

  clearError();
  profileSection.classList.add('hidden');
  reposSection.classList.add('hidden');
  searchBtn.disabled = true;
  showLoader();

  // ПОЧЕМУ try...catch? — Единственный способ поймать ошибки сети при использовании await.
  try {
    // ПОЧЕМУ Promise.all? - Преимущества параллельных запросов: не ждем профиль, чтобы начать качать репозитории.
    const [userData, reposData] = await Promise.all([
      getUser(currentUsername),
      getRepos(currentUsername, currentPage)
    ]);

    currentTotalRepos = userData.public_repos; 

    renderProfile(userData);
    renderRepos(reposData);
    renderPagination(); 
    saveToHistory(userData.login); 

  } catch (error) {
    showError(error.message);
  } finally {
    hideLoader();
    searchBtn.disabled = false;
  }
});

// ============================================================
// 8. ИНИЦИАЛИЗАЦИЯ
// ============================================================
renderHistory();