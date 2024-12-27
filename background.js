let lastGradeData = null;  // 마지막으로 가져온 성적 데이터 저장

async function checkGrade() {
  console.log('성적 확인 시작');
  
  try {
    const data = await chrome.storage.local.get([
      'username', 
      'password',
      'notificationEnabled'
    ]);
    
    if (!data.username || !data.password) {
      console.log('저장된 계정 정보 없음');
      return;
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

    // 마지막 성적 데이터 저장
    lastGradeData = grades;

    // 마감된 과목 체크
    const finishedSubjects = grades.filter(grade => grade['마감여부'] === '마감');
    
    // 알림이 활성화된 경우에만 알림 생성
    if (data.notificationEnabled) {
      if (finishedSubjects.length > 0) {
        const message = finishedSubjects.map(subject => 
          `${subject['교과목']}: ${subject['등급'] || '-'}`
        ).join('\n');

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: '현재 마감된 과목 현황',
          message: message,
          priority: 1
        });
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: '마감된 과목 없음',
          message: '현재 마감된 과목이 없습니다.',
          priority: 1
        });
      }
    }

    console.log('성적 확인 완료');

  } catch (error) {
    console.error('Error:', error);
    // 알림이 활성화된 경우에만 에러 알림 생성
    const data = await chrome.storage.local.get(['notificationEnabled']);
    if (data.notificationEnabled) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '오류 발생',
        message: '성적 확인 중 오류가 발생했습니다.',
        priority: 2
      });
    }
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
  console.log('Message received:', message); // 디버깅을 위한 로그

  if (message.action === "checkNow") {
    checkGrade()
      .then(() => {
        console.log('Check completed, sending response');
        sendResponse({success: true});
      })
      .catch(error => {
        console.error('Check failed:', error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  }
  
  if (message.action === "getGrades") {
    console.log('Sending grades:', lastGradeData); // 디버깅을 위한 로그
    if (lastGradeData && lastGradeData.length > 0) {
      sendResponse({grades: lastGradeData});
    } else {
      // lastGradeData가 없으면 즉시 체크를 실행
      checkGrade()
        .then(() => {
          console.log('Grades after check:', lastGradeData);
          sendResponse({grades: lastGradeData || []});
        })
        .catch(error => {
          console.error('Error checking grades:', error);
          sendResponse({grades: []});
        });
    }
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