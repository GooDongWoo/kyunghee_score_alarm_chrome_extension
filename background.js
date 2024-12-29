// 성적 확인 함수
async function checkGrade() {
  console.log('성적 확인 시작');
  
  try {
    const data = await chrome.storage.local.get([
      'username', 
      'password',
      'notificationEnabled',
      'lastGradeData',  // 저장된 성적 데이터
      'lastCheckTime'   // 마지막 확인 시간
    ]);
    
    if (!data.username || !data.password) {
      console.log('저장된 계정 정보 없음');
      return;
    }

    // SSO 로그인 및 성적 확인 전에 기존 데이터 반환
    if (data.lastGradeData) {
      console.log('캐시된 성적 데이터 반환');
      return data.lastGradeData;
    }

    // 1. SSO 로그인
    console.log('로그인 시도');
    const loginResponse = await fetch('https://info21.khu.ac.kr/com/LoginCtr/login.do?sso=ok', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `userId=${encodeURIComponent(data.username)}&password=${encodeURIComponent(data.password)}`,
      credentials: 'include'
    });

    if (!loginResponse.ok) {
      throw new Error('로그인 실패');
    }
    console.log('로그인 성공');

    // 2. 포털로 이동
    await fetch('https://portal.khu.ac.kr/', {
      credentials: 'include'
    });
    console.log('포털 이동 완료');

    // 3. 성적 페이지 접속
    const gradePageResponse = await fetch('https://portal.khu.ac.kr/haksa/clss/scre/tyScre/index.do', {
      credentials: 'include'
    });
    
    const pageText = await gradePageResponse.text();
    console.log('성적 페이지 로드 완료');

    // 정규 표현식 정의
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*data-mb="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi;

    // 성적 데이터 파싱
    const grades = [];
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(pageText)) !== null) {
      const cellData = {};
      let cellMatch;
      const rowContent = rowMatch[1];
      
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const dataType = cellMatch[1];
        const content = cellMatch[2].replace(/<[^>]+>/g, '').trim();
        cellData[dataType] = content;
      }
      
      if (cellData['교과목']) {
        grades.push(cellData);
      }
    }

    // 새로운 성적 데이터를 이전 데이터와 비교
    const hasChanges = JSON.stringify(grades) !== JSON.stringify(data.lastGradeData);

    if (hasChanges) {
      // 변경사항이 있을 경우에만 저장 및 알림
      await chrome.storage.local.set({
        lastGradeData: grades,
        lastCheckTime: new Date().getTime()
      });

      if (data.notificationEnabled) {
        // 변경된 과목에 대해서만 알림 생성
        const newFinishedSubjects = grades.filter(newGrade => {
          const oldGrade = data.lastGradeData?.find(g => g['교과목'] === newGrade['교과목']);
          return newGrade['마감여부'] === '마감' && 
                 (!oldGrade || oldGrade['마감여부'] !== '마감');
        });

        if (newFinishedSubjects.length > 0) {
          const message = newFinishedSubjects.map(subject => 
            `${subject['교과목']}: ${subject['등급'] || '-'}`
          ).join('\n');

          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: '새로운 마감 과목 알림',
            message: message,
            priority: 1
          });
        }
      }
    }

    return grades;

  } catch (error) {
    console.error('Error:', error);
    // 에러 발생 시 캐시된 데이터 반환
    const data = await chrome.storage.local.get(['lastGradeData', 'notificationEnabled']);
    if (data.notificationEnabled) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '오류 발생',
        message: '성적 확인 중 오류가 발생했습니다.',
        priority: 2
      });
    }
    return data.lastGradeData || [];
  }
}

// 알람 이벤트 리스너
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkGrade') {
    console.log('알람에 의한 체크 시작');
    await checkGrade();
  }
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);

  if (message.action === "checkNow") {
    checkGrade()
      .then((grades) => {
        console.log('Check completed, sending response');
        sendResponse({success: true, grades: grades});
      })
      .catch(error => {
        console.error('Check failed:', error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  }
  
  if (message.action === "getGrades") {
    chrome.storage.local.get(['lastGradeData'], (data) => {
      console.log('Sending grades:', data.lastGradeData);
      sendResponse({grades: data.lastGradeData || []});
    });
    return true;
  }
});

// 확장프로그램 설치/업데이트 시 알람 설정
chrome.runtime.onInstalled.addListener(() => {
  console.log('확장프로그램 설치/업데이트');
  chrome.alarms.create('checkGrade', {
    periodInMinutes: 30  // 30분으로 설정
  });
});