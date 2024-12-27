// 상태 표시 함수
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.display = 'block';
  status.style.backgroundColor = isError ? '#ffebee' : '#e8f5e9';
}

// 성적 테이블 업데이트 함수
async function updateGradeTable() {
  try {
    showStatus('성적 정보를 불러오는 중...'); // 로딩 상태 표시

    // 먼저 즉시 체크 실행
    await chrome.runtime.sendMessage({action: "checkNow"});
    
    // 잠시 대기 후 데이터 요청
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const response = await chrome.runtime.sendMessage({action: "getGrades"});
    console.log('Received response:', response); // 디버깅을 위한 로그

    if (!response || !response.grades) {
      showStatus('성적 데이터를 받아올 수 없습니다.', true);
      return;
    }

    const tableBody = document.getElementById('gradeTableBody');
    tableBody.innerHTML = '';

    if (response.grades.length > 0) {
      response.grades.forEach(grade => {
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
      showStatus('성적 정보가 업데이트되었습니다.');
    } else {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = '등록된 성적 정보가 없습니다.';
      cell.style.textAlign = 'center';
      row.appendChild(cell);
      tableBody.appendChild(row);
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
    const data = await chrome.storage.local.get(['username', 'password', 'checkInterval']);
    if (data.username) {
      document.getElementById('username').value = data.username;
      document.getElementById('password').value = data.password;
    }
    if (data.checkInterval) {
      document.getElementById('checkInterval').value = data.checkInterval;
    }
    
    // 초기 테이블 로드
    setTimeout(async () => {
      await updateGradeTable();
    }, 1000);

  } catch (error) {
    console.error('Error loading saved data:', error);
    showStatus('데이터 로딩 중 오류가 발생했습니다.', true);
  }
});

// 저장 버튼 클릭 이벤트
document.getElementById('saveButton').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const checkInterval = document.getElementById('checkInterval').value;

  if (!username || !password) {
    showStatus('아이디와 비밀번호를 모두 입력해주세요.', true);
    return;
  }

  try {
    // 설정 저장
    await chrome.storage.local.set({
      username: username,
      password: password,
      checkInterval: checkInterval
    });

    // 알람 주기 업데이트
    await chrome.alarms.clear('checkGrade');
    await chrome.alarms.create('checkGrade', {
      periodInMinutes: parseInt(checkInterval)
    });

    showStatus('설정이 저장되었습니다.');
    
    // 즉시 체크 실행 및 테이블 업데이트
    chrome.runtime.sendMessage({action: "checkNow"});
    await updateGradeTable();
  } catch (error) {
    console.error('Error saving data:', error);
    showStatus('저장 중 오류가 발생했습니다.', true);
  }
});

// 저장된 정보 확인 버튼 클릭 이벤트
document.getElementById('checkInfoButton').addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get(['username', 'password', 'checkInterval']);
    if (data.username) {
      const message = `아이디: ${data.username}\n` +
                     `비밀번호: ${'*'.repeat(data.password.length)}\n` +
                     `확인 주기: ${data.checkInterval}분`;
      showStatus(message);
    } else {
      showStatus('저장된 정보가 없습니다.', true);
    }
  } catch (error) {
    console.error('Error checking saved data:', error);
    showStatus('정보 확인 중 오류가 발생했습니다.', true);
  }
});

// 새로고침 버튼 클릭 이벤트
document.getElementById('refreshButton').addEventListener('click', async () => {
  try {
    await updateGradeTable();
    showStatus('성적 정보가 업데이트되었습니다.');
  } catch (error) {
    showStatus('성적 정보 업데이트 중 오류가 발생했습니다.', true);
  }
});