// 상태 표시 함수
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.display = 'block';
  status.style.backgroundColor = isError ? '#ffebee' : '#e8f5e9';
}

// 저장된 정보 불러오기
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await chrome.storage.local.get(['username', 'password']);
    if (data.username) {
      document.getElementById('username').value = data.username;
      document.getElementById('password').value = data.password;
    }
  } catch (error) {
    console.error('Error loading saved data:', error);
  }
});

// 저장 버튼 클릭 이벤트
document.getElementById('saveButton').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showStatus('아이디와 비밀번호를 모두 입력해주세요.', true);
    return;
  }

  try {
    await chrome.storage.local.set({
      username: username,
      password: password
    });

    // 알람 설정
    await chrome.alarms.create('checkGrade', {
      periodInMinutes: 30 // 30분 간격으로 체크
    });

    showStatus('설정이 저장되었습니다.');
    
    // 즉시 한 번 체크 실행
    chrome.runtime.sendMessage({action: "checkNow"});
  } catch (error) {
    console.error('Error saving data:', error);
    showStatus('저장 중 오류가 발생했습니다.', true);
  }
});

// 저장된 정보 확인 버튼 클릭 이벤트
document.getElementById('checkInfoButton').addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get(['username', 'password']);
    if (data.username) {
      showStatus(`저장된 아이디: ${data.username}\n비밀번호: ${'*'.repeat(data.password.length)}`);
    } else {
      showStatus('저장된 정보가 없습니다.', true);
    }
  } catch (error) {
    console.error('Error checking saved data:', error);
    showStatus('정보 확인 중 오류가 발생했습니다.', true);
  }
});