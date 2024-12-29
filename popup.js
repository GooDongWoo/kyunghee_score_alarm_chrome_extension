// 상태 표시 함수
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.display = 'block';
  status.style.backgroundColor = isError ? '#ffebee' : '#e8f5e9';
  status.className = isError ? 'error' : '';
}

// 로그인 상태 업데이트 함수
function updateLoginStatus(isLoggedIn) {
  const loginStatus = document.getElementById('loginStatus');
  const loginForm = document.getElementById('loginForm');
  const toggleButton = document.getElementById('toggleLoginForm');
  
  loginStatus.className = `login-status ${isLoggedIn ? 'saved' : 'not-saved'}`;
  loginStatus.textContent = isLoggedIn ? 
    '로그인 정보가 저장되어 있습니다' : 
    '로그인 정보가 저장되어 있지 않습니다';

  // 로그인 정보가 없으면 폼을 자동으로 보여줌
  if (!isLoggedIn) {
    loginForm.classList.remove('hidden');
    toggleButton.textContent = '로그인 폼 닫기';
  }
}

// 로그인 폼 토글 함수
function toggleLoginForm() {
  const loginForm = document.getElementById('loginForm');
  const toggleButton = document.getElementById('toggleLoginForm');
  
  if (loginForm.classList.contains('hidden')) {
    loginForm.classList.remove('hidden');
    toggleButton.textContent = '로그인 폼 닫기';
  } else {
    loginForm.classList.add('hidden');
    toggleButton.textContent = '로그인 정보 수정';
    // 폼을 닫을 때 입력 필드 초기화
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
  }
}

// 테이블 업데이트 함수
function updateTable(grades) {
  const tableBody = document.getElementById('gradeTableBody');
  tableBody.innerHTML = '';

  if (grades && grades.length > 0) {
    grades.forEach(grade => {
      const row = document.createElement('tr');
      const isFinished = grade['마감여부'] === '마감';
      
      [
        '교과목', '이수구분', '학점', '점수', '평점', '등급', '마감여부', '성적입력'
      ].forEach(field => {
        const cell = document.createElement('td');
        cell.textContent = grade[field] || '-';
        cell.className = isFinished ? 'finished' : 'unfinished';
        row.appendChild(cell);
      });

      tableBody.appendChild(row);
    });
  } else {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.textContent = '등록된 성적 정보가 없습니다.';
    cell.style.textAlign = 'center';
    row.appendChild(cell);
    tableBody.appendChild(row);
  }
}

// 성적 테이블 업데이트 함수
async function updateGradeTable() {
  try {
    showStatus('성적 정보를 불러오는 중...');

    // 저장된 데이터 먼저 확인
    const data = await chrome.storage.local.get(['lastGradeData', 'lastCheckTime']);
    
    // 마지막 체크 시간 확인
    const now = new Date().getTime();
    const timeSinceLastCheck = now - (data.lastCheckTime || 0);
    const CACHE_DURATION = 5 * 60 * 1000; // 5분

    // 저장된 데이터가 있고 5분이 지나지 않았다면 저장된 데이터 사용
    if (data.lastGradeData && timeSinceLastCheck < CACHE_DURATION) {
      updateTable(data.lastGradeData);
      const minutes = Math.floor(timeSinceLastCheck / 60000);
      const seconds = Math.floor((timeSinceLastCheck % 60000) / 1000);
      showStatus(`성적 정보가 업데이트되었습니다. (캐시된 데이터: ${minutes}분 ${seconds}초 전)`);
      return;
    }

    // 새로운 데이터 요청
    const response = await chrome.runtime.sendMessage({action: "checkNow"});
    if (response && response.success && response.grades) {
      updateTable(response.grades);
      showStatus('성적 정보가 업데이트되었습니다.');
    } else {
      showStatus('성적 데이터를 받아올 수 없습니다.', true);
    }
  } catch (error) {
    console.error('Error updating grade table:', error);
    showStatus('성적 정보를 불러오는 중 오류가 발생했습니다.', true);
  }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
  if (!chrome.runtime.id) {
    showStatus('확장프로그램이 비활성화되었습니다. 페이지를 새로고침해주세요.', true);
    return;
  }

  try {
    // 저장된 설정 불러오기
    const data = await chrome.storage.local.get([
      'username', 
      'password', 
      'checkInterval',
      'notificationEnabled'
    ]);

    // 로그인 상태 업데이트
    updateLoginStatus(!!data.username);

    // 저장된 확인 주기 설정
    if (data.checkInterval) {
      document.getElementById('checkInterval').value = data.checkInterval;
    }

    // 알림 설정 상태 설정
    const notificationCheckbox = document.getElementById('notificationEnabled');
    if (notificationCheckbox) {
      notificationCheckbox.checked = data.notificationEnabled !== false;
    }
    
    // 초기 테이블 로드
    await updateGradeTable();

  } catch (error) {
    console.error('Error loading saved data:', error);
    showStatus('데이터 로딩 중 오류가 발생했습니다.', true);
  }
});

// 로그인 폼 토글 버튼 이벤트 리스너
document.getElementById('toggleLoginForm').addEventListener('click', toggleLoginForm);

// 저장 버튼 클릭 이벤트
document.getElementById('saveButton').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const checkInterval = document.getElementById('checkInterval').value;
  const notificationEnabled = document.getElementById('notificationEnabled').checked;

  if (!username || !password) {
    showStatus('아이디와 비밀번호를 모두 입력해주세요.', true);
    return;
  }

  try {
    // 설정 저장
    await chrome.storage.local.set({
      username,
      password,
      checkInterval,
      notificationEnabled
    });

    // 알람 주기 업데이트
    await chrome.alarms.clear('checkGrade');
    await chrome.alarms.create('checkGrade', {
      periodInMinutes: parseInt(checkInterval)
    });

    showStatus('설정이 저장되었습니다.');
    
    // 로그인 상태 업데이트
    updateLoginStatus(true);
    
    // 로그인 폼 숨기기
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('toggleLoginForm').textContent = '로그인 정보 수정';
    
    // 입력 필드 초기화
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    
    // 즉시 체크 실행 및 테이블 업데이트
    await updateGradeTable();
  } catch (error) {
    console.error('Error saving data:', error);
    showStatus('저장 중 오류가 발생했습니다.', true);
  }
});

// 새로고침 버튼 클릭 이벤트
document.getElementById('refreshButton').addEventListener('click', async () => {
  try {
    // 캐시 무시하고 새로운 데이터 요청
    await chrome.storage.local.remove(['lastGradeData', 'lastCheckTime']);
    await updateGradeTable();
  } catch (error) {
    showStatus('성적 정보 업데이트 중 오류가 발생했습니다.', true);
  }
});

// 저장된 정보 확인 버튼 클릭 이벤트
document.getElementById('checkInfoButton').addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get([
      'username', 
      'password', 
      'checkInterval',
      'lastCheckTime'
    ]);

    if (data.username) {
      const lastCheck = data.lastCheckTime ? 
        new Date(data.lastCheckTime).toLocaleString() : 
        '없음';

      const message = `아이디: ${data.username}\n` +
                     `비밀번호: ${'*'.repeat(data.password.length)}\n` +
                     `확인 주기: ${data.checkInterval}분\n` +
                     `마지막 확인: ${lastCheck}`;
      showStatus(message);
    } else {
      showStatus('저장된 정보가 없습니다.', true);
    }
  } catch (error) {
    console.error('Error checking saved data:', error);
    showStatus('정보 확인 중 오류가 발생했습니다.', true);
  }
});

// 알림 설정 변경 이벤트
document.getElementById('notificationEnabled').addEventListener('change', async (event) => {
  try {
    await chrome.storage.local.set({
      notificationEnabled: event.target.checked
    });
    showStatus(`알림이 ${event.target.checked ? '활성화' : '비활성화'}되었습니다.`);
  } catch (error) {
    console.error('Error saving notification setting:', error);
    showStatus('알림 설정 저장 중 오류가 발생했습니다.', true);
  }
});