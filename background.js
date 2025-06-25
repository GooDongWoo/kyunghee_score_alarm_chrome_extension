class GradeCheckerBackground {
  constructor() {
    this.isChecking = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 알람 이벤트
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkGrade') {
        console.log('🕐 정기 성적 확인 시작');
        this.checkGrade();
      }
    });

    // 메시지 이벤트
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📩 메시지 수신:', message);

      switch (message.action) {
        case "checkNow":
          this.handleCheckNow(sendResponse);
          return true;

        case "testLogin":
          this.handleTestLogin(message, sendResponse);
          return true;

        case "getGrades":
          this.handleGetGrades(sendResponse);
          return true;

        default:
          console.warn('⚠️ 알 수 없는 액션:', message.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    });

    // 확장프로그램 설치/업데이트 시
    chrome.runtime.onInstalled.addListener(() => {
      console.log('🚀 확장프로그램 설치/업데이트');
      this.initializeExtension();
    });
  }

  async initializeExtension() {
    try {
      // 기본 알람 설정
      await chrome.alarms.clear('checkGrade');
      await chrome.alarms.create('checkGrade', {
        periodInMinutes: 30
      });

      // 알림 권한 요청
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '경희대 성적 확인 알리미',
        message: '확장프로그램이 설치되었습니다!',
        priority: 1
      });

      console.log('✅ 확장프로그램 초기화 완료');
    } catch (error) {
      console.error('❌ 초기화 실패:', error);
    }
  }

  async handleCheckNow(sendResponse) {
    try {
      if (this.isChecking) {
        sendResponse({ 
          success: false, 
          message: '이미 확인 중입니다. 잠시 후 다시 시도해주세요.' 
        });
        return;
      }

      const grades = await this.checkGrade();
      sendResponse({ 
        success: true, 
        grades: grades,
        message: '성적 확인이 완료되었습니다.'
      });
    } catch (error) {
      console.error('❌ 즉시 확인 실패:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        message: '성적 확인 중 오류가 발생했습니다.'
      });
    }
  }

  async handleTestLogin(message, sendResponse) {
    try {
      const { username, password } = message;
      console.log('🔐 로그인 테스트 시작:', username);

      const isValid = await this.testLogin(username, password);
      
      if (isValid) {
        sendResponse({ 
          success: true, 
          message: '로그인에 성공했습니다!' 
        });
      } else {
        sendResponse({ 
          success: false, 
          message: '아이디 또는 비밀번호가 올바르지 않습니다.' 
        });
      }
    } catch (error) {
      console.error('❌ 로그인 테스트 실패:', error);
      sendResponse({ 
        success: false, 
        message: '로그인 테스트 중 오류가 발생했습니다.',
        error: error.message 
      });
    }
  }

  async handleGetGrades(sendResponse) {
    try {
      const data = await chrome.storage.local.get(['lastGradeData']);
      sendResponse({ 
        success: true,
        grades: data.lastGradeData || [] 
      });
    } catch (error) {
      console.error('❌ 성적 데이터 조회 실패:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  }

  async testLogin(username, password) {
    try {
      console.log('🧪 로그인 테스트 진행 중...');

      // SSO 로그인 시도
      const loginResponse = await fetch('https://info21.khu.ac.kr/com/LoginCtr/login.do?sso=ok', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `userId=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        credentials: 'include'
      });

      if (!loginResponse.ok) {
        throw new Error(`HTTP ${loginResponse.status}: ${loginResponse.statusText}`);
      }

      const responseText = await loginResponse.text();
      
      // 로그인 실패 체크 (응답에 에러 메시지가 있는지 확인)
      if (responseText.includes('로그인') && responseText.includes('실패')) {
        return false;
      }

      if (responseText.includes('오류') || responseText.includes('error')) {
        return false;
      }

      // 포털 접속 테스트
      const portalResponse = await fetch('https://portal.khu.ac.kr/', {
        credentials: 'include',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      console.log('✅ 로그인 테스트 성공');
      return portalResponse.ok;

    } catch (error) {
      console.error('❌ 로그인 테스트 실패:', error);
      return false;
    }
  }

  async checkGrade() {
    if (this.isChecking) {
      console.log('⏳ 이미 성적 확인 중...');
      return [];
    }

    this.isChecking = true;
    console.log('🎓 성적 확인 시작');
    
    try {
      const data = await chrome.storage.local.get([
        'username', 
        'password',
        'notificationEnabled',
        'soundEnabled',
        'lastGradeData',
        'lastCheckTime',
        'loginVerified'
      ]);
      
      if (!data.username || !data.password) {
        console.log('⚠️ 저장된 계정 정보 없음');
        return [];
      }

      if (!data.loginVerified) {
        console.log('⚠️ 로그인이 검증되지 않음');
        return data.lastGradeData || [];
      }

      // 최근 확인한 데이터가 있으면 반환 (5분 이내)
      const now = Date.now();
      const timeSinceLastCheck = now - (data.lastCheckTime || 0);
      const CACHE_DURATION = 5 * 60 * 1000; // 5분

      if (data.lastGradeData && timeSinceLastCheck < CACHE_DURATION) {
        console.log('📂 캐시된 데이터 반환 (5분 이내)');
        return data.lastGradeData;
      }

      // 새로운 성적 데이터 가져오기
      const newGrades = await this.fetchGradeData(data.username, data.password);
      
      // 변경사항 확인 및 알림
      await this.handleGradeChanges(data, newGrades);

      // 데이터 저장
      await chrome.storage.local.set({
        lastGradeData: newGrades,
        lastCheckTime: now
      });

      console.log(`✅ 성적 확인 완료 (${newGrades.length}개 과목)`);
      return newGrades;

    } catch (error) {
      console.error('❌ 성적 확인 실패:', error);
      
      // 에러 발생 시 알림
      const data = await chrome.storage.local.get(['notificationEnabled']);
      if (data.notificationEnabled) {
        await this.createNotification(
          '성적 확인 오류',
          '성적 확인 중 오류가 발생했습니다. 로그인 정보를 확인해주세요.',
          'error'
        );
      }

      // 캐시된 데이터 반환
      const cachedData = await chrome.storage.local.get(['lastGradeData']);
      return cachedData.lastGradeData || [];

    } finally {
      this.isChecking = false;
    }
  }

  async fetchGradeData(username, password) {
    console.log('🌐 성적 데이터 가져오기 시작');

    try {
      // 1. SSO 로그인
      console.log('🔑 SSO 로그인 시도');
      const loginResponse = await fetch('https://info21.khu.ac.kr/com/LoginCtr/login.do?sso=ok', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `userId=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        credentials: 'include'
      });

      if (!loginResponse.ok) {
        throw new Error(`로그인 실패: HTTP ${loginResponse.status}`);
      }

      console.log('✅ 로그인 성공');

      // 2. 포털로 이동
      console.log('🏛️ 포털 이동');
      const portalResponse = await fetch('https://portal.khu.ac.kr/', {
        credentials: 'include',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!portalResponse.ok) {
        throw new Error(`포털 접속 실패: HTTP ${portalResponse.status}`);
      }

      console.log('✅ 포털 이동 완료');

      // 3. 성적 페이지 접속
      console.log('📊 성적 페이지 접속');
      const gradePageResponse = await fetch('https://portal.khu.ac.kr/haksa/clss/scre/tyScre/index.do', {
        credentials: 'include',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!gradePageResponse.ok) {
        throw new Error(`성적 페이지 접속 실패: HTTP ${gradePageResponse.status}`);
      }

      const pageText = await gradePageResponse.text();
      console.log('📄 성적 페이지 로드 완료');

      // 4. 성적 데이터 파싱
      return this.parseGradeData(pageText);

    } catch (error) {
      console.error('❌ 성적 데이터 가져오기 실패:', error);
      throw error;
    }
  }

  parseGradeData(pageText) {
    console.log('🔍 성적 데이터 파싱 시작');

    try {
      // 정규 표현식으로 테이블 행과 셀 추출
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const cellRegex = /<td[^>]*data-mb="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi;

      const grades = [];
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(pageText)) !== null) {
        const cellData = {};
        let cellMatch;
        const rowContent = rowMatch[1];
        
        // 각 행의 셀 데이터 추출
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          const dataType = cellMatch[1];
          const content = cellMatch[2]
            .replace(/<[^>]+>/g, '') // HTML 태그 제거
            .replace(/&nbsp;/g, ' ') // &nbsp; 제거
            .trim();
          
          if (content) {
            cellData[dataType] = content;
          }
        }
        
        // 교과목이 있는 행만 추가
        if (cellData['교과목'] && cellData['교과목'] !== '교과목') {
          grades.push(cellData);
        }
      }

      console.log(`✅ 성적 데이터 파싱 완료 (${grades.length}개 과목)`);
      return grades;

    } catch (error) {
      console.error('❌ 성적 데이터 파싱 실패:', error);
      return [];
    }
  }

  async handleGradeChanges(data, newGrades) {
    if (!data.notificationEnabled) {
      console.log('📴 알림 비활성화됨');
      return;
    }

    const oldGrades = data.lastGradeData || [];
    
    // 새로 마감된 과목 찾기
    const newFinishedSubjects = newGrades.filter(newGrade => {
      const oldGrade = oldGrades.find(g => g['교과목'] === newGrade['교과목']);
      return newGrade['마감여부'] === '마감' && 
             (!oldGrade || oldGrade['마감여부'] !== '마감');
    });

    // 성적이 변경된 과목 찾기
    const gradeChangedSubjects = newGrades.filter(newGrade => {
      const oldGrade = oldGrades.find(g => g['교과목'] === newGrade['교과목']);
      return oldGrade && 
             oldGrade['마감여부'] === '마감' && 
             newGrade['마감여부'] === '마감' &&
             oldGrade['등급'] !== newGrade['등급'];
    });

    // 알림 생성
    if (newFinishedSubjects.length > 0) {
      const message = newFinishedSubjects
        .map(subject => `${subject['교과목']}: ${subject['등급'] || '등급 미정'}`)
        .join('\n');

      await this.createNotification(
        `새로운 마감 과목 (${newFinishedSubjects.length}개)`,
        message,
        'finish'
      );

      console.log(`🎉 새로 마감된 과목: ${newFinishedSubjects.length}개`);
    }

    if (gradeChangedSubjects.length > 0) {
      const message = gradeChangedSubjects
        .map(subject => {
          const oldGrade = oldGrades.find(g => g['교과목'] === subject['교과목']);
          return `${subject['교과목']}: ${oldGrade['등급']} → ${subject['등급']}`;
        })
        .join('\n');

      await this.createNotification(
        `성적 변경 (${gradeChangedSubjects.length}개)`,
        message,
        'change'
      );

      console.log(`📝 성적 변경된 과목: ${gradeChangedSubjects.length}개`);
    }

    // 전체 확인 완료 알림 (변경사항이 없는 경우)
    if (newFinishedSubjects.length === 0 && gradeChangedSubjects.length === 0 && oldGrades.length > 0) {
      const finishedCount = newGrades.filter(g => g['마감여부'] === '마감').length;
      const totalCount = newGrades.length;
      
      console.log(`📊 변경사항 없음 (${finishedCount}/${totalCount} 마감)`);
    }
  }

  async createNotification(title, message, type = 'info') {
    try {
      const iconUrl = 'icon.png';
      let priority = 1;

      if (type === 'finish' || type === 'change') {
        priority = 2; // 높은 우선순위
      } else if (type === 'error') {
        priority = 2;
      }

      await chrome.notifications.create({
        type: 'basic',
        iconUrl: iconUrl,
        title: title,
        message: message,
        priority: priority
      });

      // 소리 알림 (설정된 경우)
      const data = await chrome.storage.local.get(['soundEnabled']);
      if (data.soundEnabled && (type === 'finish' || type === 'change')) {
        // 브라우저 기본 알림음 사용
        console.log('🔊 소리 알림');
      }

      console.log(`📢 알림 생성: ${title}`);

    } catch (error) {
      console.error('❌ 알림 생성 실패:', error);
    }
  }
}

// 백그라운드 스크립트 초기화
console.log('🚀 경희대 성적 확인 알리미 백그라운드 시작');
new GradeCheckerBackground();