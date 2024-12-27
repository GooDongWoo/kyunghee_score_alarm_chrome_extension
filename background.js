// 성적 확인 함수
async function checkGrade() {
  console.log('성적 확인 시작');
  
  try {
    const data = await chrome.storage.local.get(['username', 'password']);
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

    // 정규 표현식을 사용하여 HTML 파싱
    const finishedSubjects = [];
    
    // 테이블 행을 찾는 정규식
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*data-mb="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi;
    
    console.log('성적 상태 분석 시작');
    
    let rowMatch;
    while ((rowMatch = rowRegex.exec(pageText)) !== null) {
      let subject = '';
      let status = '';
      let credit = '';
      
      // 현재 행의 내용에서 셀 찾기
      const rowContent = rowMatch[1];
      const cellData = {};
      
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const dataType = cellMatch[1];
        const content = cellMatch[2].replace(/<[^>]+>/g, '').trim();
        cellData[dataType] = content;
      }
      
      if (cellData['마감여부'] === '마감') {
        finishedSubjects.push({
          name: cellData['교과목'],
          credit: cellData['학점']
        });
      }
    }

    // 마감된 과목이 있으면 알림 생성
    if (finishedSubjects.length > 0) {
      const message = finishedSubjects.map(subject => 
        `${subject.name} (${subject.credit}학점)`
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

    console.log('성적 확인 완료');

  } catch (error) {
    console.error('Error:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: '오류 발생',
      message: '성적 확인 중 오류가 발생했습니다.',
      priority: 2
    });
  }
}

// 알람 이벤트 리스너
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkGrade') {
    console.log('알람에 의한 체크 시작');
    await checkGrade();
  }
});

// 메시지 리스너 (즉시 체크용)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkNow") {
    console.log('즉시 체크 요청 수신');
    checkGrade();
  }
});

// 확장프로그램 설치/업데이트 시 알람 설정
chrome.runtime.onInstalled.addListener(() => {
  console.log('확장프로그램 설치/업데이트');
  chrome.alarms.create('checkGrade', {
    periodInMinutes: 30  // 30분으로 설정
  });
});