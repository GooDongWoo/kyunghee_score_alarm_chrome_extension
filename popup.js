class GradeChecker {
  constructor() {
    this.currentTab = 'dashboard';
    this.isLoading = false;
    this.loginStatus = false;
    this.init();
  }

  async init() {
    try {
      this.setupEventListeners();
      await this.loadSettings();
      await this.updateLoginStatus();
      await this.updateDashboard();
      this.showAlert('dashboard', '시스템이 준비되었습니다.', 'success');
    } catch (error) {
      console.error('Initialization error:', error);
      this.showAlert('dashboard', '초기화 중 오류가 발생했습니다.', 'error');
    }
  }

  setupEventListeners() {
    // 탭 전환
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // 대시보드 새로고침
    document.getElementById('quickRefreshBtn').addEventListener('click', () => {
      this.refreshGrades();
    });

    // 로그인 테스트
    document.getElementById('testLoginBtn').addEventListener('click', () => {
      this.testLogin();
    });

    // 설정 저장
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // 데이터 삭제
    document.getElementById('clearDataBtn').addEventListener('click', () => {
      this.clearAllData();
    });

    // 입력 필드 변경 감지
    ['username', 'password'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        this.onCredentialsChange();
      });
    });

    // 설정 변경 감지
    ['checkInterval', 'notificationEnabled', 'soundEnabled'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.onSettingsChange();
        });
      }
    });
  }

  switchTab(tabName) {
    // 탭 버튼 업데이트
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // 탭 컨텐츠 업데이트
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    this.currentTab = tabName;

    // 탭별 데이터 로드
    if (tabName === 'grades') {
      this.loadGrades();
    } else if (tabName === 'dashboard') {
      this.updateDashboard();
    }
  }

  async loadSettings() {
    try {
      const data = await chrome.storage.local.get([
        'username', 'password', 'checkInterval', 
        'notificationEnabled', 'soundEnabled'
      ]);

      if (data.username) {
        document.getElementById('username').value = data.username;
      }
      if (data.password) {
        document.getElementById('password').value = data.password;
      }
      if (data.checkInterval) {
        document.getElementById('checkInterval').value = data.checkInterval;
      }
      
      document.getElementById('notificationEnabled').checked = data.notificationEnabled !== false;
      document.getElementById('soundEnabled').checked = data.soundEnabled === true;

    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async updateLoginStatus() {
    try {
      const data = await chrome.storage.local.get(['username', 'password', 'loginVerified']);
      const hasCredentials = data.username && data.password;
      const isVerified = data.loginVerified === true;
      
      this.loginStatus = hasCredentials && isVerified;

      // 상태 업데이트
      const statusElements = ['quickLoginStatus', 'settingsLoginStatus'];
      statusElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          if (this.loginStatus) {
            element.className = 'login-status connected';
            element.innerHTML = '<div class="login-status-icon"></div><span>로그인 인증됨</span>';
          } else if (hasCredentials && !isVerified) {
            element.className = 'login-status disconnected';
            element.innerHTML = '<div class="login-status-icon"></div><span>로그인 인증 필요</span>';
          } else {
            element.className = 'login-status disconnected';
            element.innerHTML = '<div class="login-status-icon"></div><span>로그인 정보 없음</span>';
          }
        }
      });

      // 연결 상태 표시
      const connectionStatus = document.getElementById('connectionStatus');
      if (connectionStatus) {
        connectionStatus.className = this.loginStatus ? 'status-indicator' : 
                                    hasCredentials ? 'status-indicator warning' : 'status-indicator error';
      }

    } catch (error) {
      console.error('Error updating login status:', error);
    }
  }

  async testLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
      this.showAlert('settings', '아이디와 비밀번호를 모두 입력해주세요.', 'error');
      return;
    }

    this.setLoading('testLoginBtn', true);
    this.showAlert('settings', '로그인을 테스트하는 중...', 'info');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'testLogin',
        username,
        password
      });

      if (response && response.success) {
        // 로그인 성공
        await chrome.storage.local.set({
          username,
          password,
          loginVerified: true,
          lastLoginTest: new Date().getTime()
        });

        this.showAlert('settings', '로그인 인증에 성공했습니다!', 'success');
        await this.updateLoginStatus();
        this.enableSaveButton();
      } else {
        // 로그인 실패
        await chrome.storage.local.set({ loginVerified: false });
        this.showAlert('settings', response?.message || '로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.', 'error');
        await this.updateLoginStatus();
      }
    } catch (error) {
      console.error('Login test error:', error);
      this.showAlert('settings', '로그인 테스트 중 오류가 발생했습니다.', 'error');
    } finally {
      this.setLoading('testLoginBtn', false);
    }
  }

  async saveSettings() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const checkInterval = document.getElementById('checkInterval').value;
    const notificationEnabled = document.getElementById('notificationEnabled').checked;
    const soundEnabled = document.getElementById('soundEnabled').checked;

    if (!username || !password) {
      this.showAlert('settings', '아이디와 비밀번호를 모두 입력해주세요.', 'error');
      return;
    }

    // 로그인이 검증되지 않은 경우
    const data = await chrome.storage.local.get(['loginVerified']);
    if (!data.loginVerified) {
      this.showAlert('settings', '먼저 로그인 테스트를 해주세요.', 'warning');
      return;
    }

    this.setLoading('saveBtn', true);

    try {
      // 설정 저장
      await chrome.storage.local.set({
        username,
        password,
        checkInterval: parseInt(checkInterval),
        notificationEnabled,
        soundEnabled
      });

      // 알람 업데이트
      await chrome.alarms.clear('checkGrade');
      await chrome.alarms.create('checkGrade', {
        periodInMinutes: parseInt(checkInterval)
      });

      this.showAlert('settings', '설정이 저장되었습니다.', 'success');
      
      // 입력 필드 초기화
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      
      await this.updateLoginStatus();
      await this.refreshGrades();

    } catch (error) {
      console.error('Error saving settings:', error);
      this.showAlert('settings', '설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      this.setLoading('saveBtn', false);
    }
  }

  async refreshGrades() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.setLoading('quickRefreshBtn', true);
    this.showAlert('dashboard', '성적 정보를 확인하는 중...', 'info');

    try {
      // 캐시 삭제
      await chrome.storage.local.remove(['lastGradeData', 'lastCheckTime']);
      
      const response = await chrome.runtime.sendMessage({ action: "checkNow" });
      
      if (response && response.success && response.grades) {
        await this.updateGradeTable(response.grades);
        await this.updateDashboard();
        this.showAlert('dashboard', `성적 정보가 업데이트되었습니다. (${response.grades.length}개 과목)`, 'success');
      } else {
        this.showAlert('dashboard', response?.message || '성적 정보를 가져올 수 없습니다.', 'error');
      }
    } catch (error) {
      console.error('Error refreshing grades:', error);
      this.showAlert('dashboard', '성적 정보 업데이트 중 오류가 발생했습니다.', 'error');
    } finally {
      this.isLoading = false;
      this.setLoading('quickRefreshBtn', false);
    }
  }

  async loadGrades() {
    this.showElement('gradesLoading', true);
    this.showElement('gradesContent', false);

    try {
      const data = await chrome.storage.local.get(['lastGradeData', 'lastCheckTime']);
      
      if (data.lastGradeData && data.lastGradeData.length > 0) {
        await this.updateGradeTable(data.lastGradeData);
        this.showElement('gradesLoading', false);
        this.showElement('gradesContent', true);
        
        const lastCheck = data.lastCheckTime ? 
          new Date(data.lastCheckTime).toLocaleString() : '확인된 적 없음';
        this.showAlert('grades', `마지막 업데이트: ${lastCheck}`, 'info');
      } else {
        this.showElement('gradesLoading', false);
        this.showAlert('grades', '성적 데이터가 없습니다. 대시보드에서 새로고침을 해주세요.', 'warning');
      }
    } catch (error) {
      console.error('Error loading grades:', error);
      this.showElement('gradesLoading', false);
      this.showAlert('grades', '성적 데이터 로드 중 오류가 발생했습니다.', 'error');
    }
  }

  async updateGradeTable(grades) {
    const tableBody = document.getElementById('gradeTableBody');
    tableBody.innerHTML = '';

    if (grades && grades.length > 0) {
      grades.forEach(grade => {
        const row = document.createElement('tr');
        const isFinished = grade['마감여부'] === '마감';
        
        // 교과목명 (최대 길이 제한)
        const subjectCell = document.createElement('td');
        const subjectName = grade['교과목'] || '-';
        subjectCell.textContent = subjectName.length > 10 ? 
          subjectName.substring(0, 10) + '...' : subjectName;
        subjectCell.title = subjectName; // 툴팁으로 전체 이름 표시
        subjectCell.className = isFinished ? 'finished' : 'unfinished';
        row.appendChild(subjectCell);

        // 이수구분
        const typeCell = document.createElement('td');
        typeCell.textContent = grade['이수구분'] || '-';
        typeCell.className = isFinished ? 'finished' : 'unfinished';
        row.appendChild(typeCell);

        // 학점
        const creditCell = document.createElement('td');
        creditCell.textContent = grade['학점'] || '-';
        creditCell.className = isFinished ? 'finished' : 'unfinished';
        row.appendChild(creditCell);

        // 등급
        const gradeCell = document.createElement('td');
        gradeCell.textContent = grade['등급'] || '-';
        gradeCell.className = isFinished ? 'finished' : 'unfinished';
        row.appendChild(gradeCell);

        // 상태
        const statusCell = document.createElement('td');
        statusCell.textContent = isFinished ? '마감' : '진행중';
        statusCell.className = isFinished ? 'finished' : 'unfinished';
        row.appendChild(statusCell);

        tableBody.appendChild(row);
      });
    } else {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = '등록된 성적 정보가 없습니다.';
      cell.className = 'no-data';
      row.appendChild(cell);
      tableBody.appendChild(row);
    }
  }

  async updateDashboard() {
    try {
      const data = await chrome.storage.local.get(['lastGradeData', 'lastCheckTime']);
      const grades = data.lastGradeData || [];
      
      // 통계 업데이트
      const totalSubjects = grades.length;
      const finishedSubjects = grades.filter(g => g['마감여부'] === '마감').length;
      
      document.getElementById('totalSubjects').textContent = totalSubjects;
      document.getElementById('finishedSubjects').textContent = finishedSubjects;

      // 마지막 확인 시간
      const lastCheckElement = document.getElementById('lastCheckTime');
      if (data.lastCheckTime) {
        const lastCheck = new Date(data.lastCheckTime);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastCheck) / 60000);
        
        if (diffMinutes === 0) {
          lastCheckElement.textContent = '방금 전';
        } else if (diffMinutes < 60) {
          lastCheckElement.textContent = `${diffMinutes}분 전`;
        } else {
          lastCheckElement.textContent = lastCheck.toLocaleString();
        }
      } else {
        lastCheckElement.textContent = '확인된 적 없음';
      }

    } catch (error) {
      console.error('Error updating dashboard:', error);
    }
  }

  async clearAllData() {
    if (confirm('정말로 모든 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      try {
        await chrome.storage.local.clear();
        await chrome.alarms.clearAll();
        
        // UI 초기화
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('checkInterval').value = '30';
        document.getElementById('notificationEnabled').checked = true;
        document.getElementById('soundEnabled').checked = false;
        
        await this.updateLoginStatus();
        await this.updateDashboard();
        
        this.showAlert('settings', '모든 데이터가 삭제되었습니다.', 'success');
      } catch (error) {
        console.error('Error clearing data:', error);
        this.showAlert('settings', '데이터 삭제 중 오류가 발생했습니다.', 'error');
      }
    }
  }

  onCredentialsChange() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    // 로그인 검증 상태 초기화
    chrome.storage.local.set({ loginVerified: false });
    this.updateLoginStatus();
    
    // 저장 버튼 비활성화
    this.disableSaveButton();
  }

  onSettingsChange() {
    // 설정이 변경되면 저장 버튼 활성화 (로그인이 검증된 경우)
    chrome.storage.local.get(['loginVerified']).then(data => {
      if (data.loginVerified) {
        this.enableSaveButton();
      }
    });
  }

  enableSaveButton() {
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = false;
    saveBtn.textContent = '설정 저장';
  }

  disableSaveButton() {
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = '로그인 테스트 필요';
  }

  setLoading(elementId, isLoading) {
    const element = document.getElementById(elementId);
    const spinner = element.querySelector('.spinner');
    
    if (isLoading) {
      element.disabled = true;
      if (spinner) spinner.classList.remove('hidden');
    } else {
      element.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    }
  }

  showElement(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.toggle('hidden', !show);
    }
  }

  showAlert(context, message, type = 'info') {
    const alertElement = document.getElementById(`${context}Alert`);
    if (alertElement) {
      alertElement.textContent = message;
      alertElement.className = `alert ${type}`;
      alertElement.style.display = 'block';
      
      // 3초 후 자동 숨김 (에러가 아닌 경우)
      if (type !== 'error') {
        setTimeout(() => {
          alertElement.style.display = 'none';
        }, 3000);
      }
    }
  }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  new GradeChecker();
});