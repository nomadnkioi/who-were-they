// State Management
let state = {
  projects: [],
  currentProjectId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  isConnecting: false, // Edge 생성 모드 플래그
  connectingSourceId: null
};

// Canvas Navigation State (Zoom & Pan)
let transform = { x: 0, y: 0, k: 1 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let draggedNode = null;
let dragOffset = { x: 0, y: 0 };

// DOM Elements
const svg = document.getElementById('relation-canvas');
const canvasContent = document.getElementById('canvas-content');
const nodesGroup = document.getElementById('nodes-group');
const linksGroup = document.getElementById('links-group');
const projectList = document.getElementById('project-list');
const currentProjectTitle = document.getElementById('current-project-title');
const emptyCanvasMessage = document.getElementById('empty-canvas-message');

// Buttons & Controls
const btnAddProject = document.getElementById('btn-add-project');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const btnAddNode = document.getElementById('btn-add-node');
const btnAddEdge = document.getElementById('btn-add-edge');

// Firebase Config & Instance Setup
const firebaseConfig = {
  apiKey: "AIzaSyBCp85y1bSw5dK7mmzHXv9Y51-4VtFAXJY",
  authDomain: "who-were-they.firebaseapp.com",
  projectId: "who-were-they",
  storageBucket: "who-were-they.firebasestorage.app",
  messagingSenderId: "1011591199673",
  appId: "1:1011591199673:web:dd3867a22e0668fe80d468",
  databaseURL: "https://who-were-they-default-rtdb.firebaseio.com"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// UI Elements for Firebase Sync
const syncStatus = document.getElementById('sync-status');
const syncSetupContainer = document.getElementById('sync-setup-container');
const btnGithubLogin = document.getElementById('btn-github-login');
const syncActiveContainer = document.getElementById('sync-active-container');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const btnFirebaseLogout = document.getElementById('btn-firebase-logout');

// Detail Panel
const detailPanel = document.getElementById('detail-panel');
const detailPanelTitle = document.getElementById('detail-panel-title');
const detailNodeType = document.getElementById('detail-node-type');
const detailNodeName = document.getElementById('detail-node-name');
const detailNodeDescription = document.getElementById('detail-node-description');
const detailRelationsList = document.getElementById('detail-relations-list');
const btnCloseDetail = document.getElementById('btn-close-detail');
const btnEditNodeTrigger = document.getElementById('btn-edit-node-trigger');
const btnDeleteNodeTrigger = document.getElementById('btn-delete-node-trigger');

// Modals
const nodeModal = document.getElementById('node-modal');
const nodeForm = document.getElementById('node-form');
const nodeModalTitle = document.getElementById('node-modal-title');
const edgeModal = document.getElementById('edge-modal');
const edgeForm = document.getElementById('edge-form');

// Initialize App
async function init() {
  loadData();

  // Firebase Auth 상태 리스너 등록
  auth.onAuthStateChanged(async (user) => {
    updateSyncUI(user);
    if (user) {
      // 로그인 시 클라우드에서 데이터 가져오기
      try {
        syncStatus.textContent = '연동 중...';
        syncStatus.className = 'sync-status-offline';
        
        const snapshot = await db.ref(`users/${user.uid}/projects`).once('value');
        const cloudProjects = snapshot.val();
        
        if (cloudProjects && Array.isArray(cloudProjects)) {
          state.projects = cloudProjects;
          // 현재 프로젝트 ID가 유효한지 검증
          if (state.projects.length > 0) {
            const hasCurrent = state.projects.some(p => p.id === state.currentProjectId);
            if (!hasCurrent) {
              state.currentProjectId = state.projects[0].id;
            }
          } else {
            state.currentProjectId = null;
          }
          // 로컬 데이터도 갱신
          localStorage.setItem('relation_map_projects', JSON.stringify(state.projects));
          localStorage.setItem('relation_map_current_id', state.currentProjectId);
        } else {
          // 클라우드에 데이터가 아예 없는 신규 유저인 경우, 현재 로컬 데이터를 클라우드에 업로드
          if (state.projects.length > 0) {
            await db.ref(`users/${user.uid}/projects`).set(state.projects);
          }
        }
        syncStatus.textContent = '연동 완료';
        syncStatus.className = 'sync-status-online';
        renderSidebar();
        renderProject();
        resetZoom();
      } catch (err) {
        console.error('클라우드 데이터를 가져오지 못했습니다. 로컬 데이터를 유지합니다.', err);
        syncStatus.textContent = '연동 오류';
        syncStatus.className = 'sync-status-offline';
      }
    } else {
      // 로그아웃 시 로컬 데이터 기반으로 다시 로딩 및 렌더링
      loadData();
      renderSidebar();
      renderProject();
      resetZoom();
    }
  });

  if (state.projects.length === 0) {
    // 기본 프로젝트 생성
    const defaultProj = {
      id: 'proj_' + Date.now(),
      title: '삼국지 인물 관계도 (예제)',
      nodes: [
        { id: 'node_1', name: '유비', type: 'character', importance: 'core', desc: '촉한의 초대 황제. 자는 현덕. 덕망이 높고 사람을 끌어당기는 매력이 있음.', x: 250, y: 220, group: '촉한 진영' },
        { id: 'node_2', name: '관우', type: 'character', importance: 'high', desc: '유비의 의형제. 자는 운장. 의리가 굳고 무예가 뛰어남.', x: 120, y: 350, group: '촉한 진영' },
        { id: 'node_3', name: '장비', type: 'character', importance: 'high', desc: '유비의 의형제. 자는 익덕. 용맹하며 술을 좋아함.', x: 380, y: 350, group: '촉한 진영' },
        { id: 'node_4', name: '제갈량', type: 'character', importance: 'high', desc: '유비의 군사. 자는 공명. 당대 최고의 전략가이자 지략가.', x: 250, y: 440, group: '촉한 진영' },
        { id: 'node_5', name: '촉한', type: 'group', importance: 'core', desc: '유비가 건국한 국가.', x: 250, y: 50, group: '' }
      ],
      edges: [
        { id: 'edge_1', source: 'node_2', target: 'node_1', type: '의형제 (차남)', direction: 'bidirectional', color: '#3b82f6' },
        { id: 'edge_2', source: 'node_3', target: 'node_1', type: '의형제 (삼남)', direction: 'bidirectional', color: '#3b82f6' },
        { id: 'edge_3', source: 'node_2', target: 'node_3', type: '의형제', direction: 'bidirectional', color: '#3b82f6' },
        { id: 'edge_4', source: 'node_4', target: 'node_1', type: '군신 관계 (책사)', direction: 'directed', color: '#00A699' },
        { id: 'edge_5', source: 'node_1', target: 'node_5', type: '군주', direction: 'directed', color: '#00A699' },
        { id: 'edge_6', source: 'node_2', target: 'node_5', type: '장수', direction: 'directed', color: '#00A699' },
        { id: 'edge_7', source: 'node_3', target: 'node_5', type: '장수', direction: 'directed', color: '#00A699' },
        { id: 'edge_8', source: 'node_4', target: 'node_5', type: '승상', direction: 'directed', color: '#F5C400' }
      ]
    };
    state.projects.push(defaultProj);
    state.currentProjectId = defaultProj.id;
    saveData();
  } else if (!state.currentProjectId) {
    state.currentProjectId = state.projects[0].id;
  }
  
  renderSidebar();
  renderProject();
  setupEventListeners();
  resetZoom();
}

// Data Saving & Loading
function saveData() {
  localStorage.setItem('relation_map_projects', JSON.stringify(state.projects));
  localStorage.setItem('relation_map_current_id', state.currentProjectId);
  if (auth.currentUser) {
    syncDataToServer();
  }
}

function loadData() {
  try {
    const savedProjects = localStorage.getItem('relation_map_projects');
    const savedCurrentId = localStorage.getItem('relation_map_current_id');
    if (savedProjects) {
      state.projects = JSON.parse(savedProjects);
    }
    if (savedCurrentId) {
      state.currentProjectId = savedCurrentId;
    }
  } catch (e) {
    console.error('로컬 데이터 로드 실패:', e);
  }
}

// Cloud Sync UI & API Helpers
function updateSyncUI(user) {
  if (user) {
    syncSetupContainer.classList.add('hidden');
    syncActiveContainer.classList.remove('hidden');
    
    // 유저 프로필 세팅
    userName.textContent = user.displayName || user.email || 'GitHub 유저';
    userAvatar.src = user.photoURL || 'https://cdn-icons-png.flaticon.com/512/25/25231.png';
    
    syncStatus.textContent = '연동 완료';
    syncStatus.className = 'sync-status-online';
  } else {
    syncSetupContainer.classList.remove('hidden');
    syncActiveContainer.classList.add('hidden');
    syncStatus.textContent = '연동 안 됨';
    syncStatus.className = 'sync-status-offline';
  }
}

async function syncDataToServer() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    syncStatus.textContent = '연동 중...';
    syncStatus.className = 'sync-status-offline';
    await db.ref(`users/${user.uid}/projects`).set(state.projects);
    syncStatus.textContent = '연동 완료';
    syncStatus.className = 'sync-status-online';
  } catch (e) {
    console.error('서버 동기화 실패:', e);
    syncStatus.textContent = '연동 실패';
    syncStatus.className = 'sync-status-offline';
  }
}

// Sidebar Rendering
function renderSidebar() {
  projectList.innerHTML = '';
  state.projects.forEach(proj => {
    const li = document.createElement('li');
    li.className = `sidebar-item ${proj.id === state.currentProjectId ? 'active' : ''}`;
    li.dataset.id = proj.id;
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = proj.title;
    li.appendChild(titleSpan);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-delete-project';
    btnDelete.title = '프로젝트 삭제';
    btnDelete.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProject(proj.id);
    });
    li.appendChild(btnDelete);

    li.addEventListener('click', () => {
      state.currentProjectId = proj.id;
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      hideDetailPanel();
      saveData();
      renderSidebar();
      renderProject();
      resetZoom();
    });

    projectList.appendChild(li);
  });
}

function getCurrentProject() {
  return state.projects.find(p => p.id === state.currentProjectId);
}

// Canvas Rendering
function renderProject() {
  const proj = getCurrentProject();
  if (!proj) {
    currentProjectTitle.textContent = '선택된 프로젝트 없음';
    nodesGroup.innerHTML = '';
    linksGroup.innerHTML = '';
    const groupsGroup = document.getElementById('groups-group');
    if (groupsGroup) groupsGroup.innerHTML = '';
    emptyCanvasMessage.style.display = 'block';
    return;
  }

  currentProjectTitle.textContent = proj.title;
  
  if (proj.nodes.length === 0) {
    emptyCanvasMessage.style.display = 'block';
  } else {
    emptyCanvasMessage.style.display = 'none';
  }

  renderGroups(proj);
  renderLinks(proj);
  renderNodes(proj);
}

// Render Groups (공통점 있는 개체들을 쫀득하고 유기적으로 묶어주는 Gooey Metaball 젤리 배경)
function renderGroups(proj) {
  const groupsGroup = document.getElementById('groups-group');
  if (!groupsGroup) return;
  groupsGroup.innerHTML = '';

  // 1. 소속 그룹별 노드 수집
  const groupMap = {};
  proj.nodes.forEach(node => {
    if (node.group && node.group.trim()) {
      const gName = node.group.trim();
      if (!groupMap[gName]) groupMap[gName] = [];
      groupMap[gName].push(node);
    }
  });

  // 2. 각 그룹별 유기적 블롭(Blob) 렌더링
  Object.keys(groupMap).forEach((gName, idx) => {
    const nodes = groupMap[gName];
    if (nodes.length === 0) return;

    // 젤리 색상을 차가운 블루그레이와 잘 어울리는 화이트로 변경하여 유리 질감 효과 부여
    const themeColor = '#FFFFFF';

    // Gooey 필터를 적용할 그룹 컨테이너 생성 (최종 젤리 덩어리의 불투명도를 설정)
    const blobGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    blobGroup.setAttribute('filter', 'url(#goo)');
    blobGroup.setAttribute('opacity', '0.24'); // 회색 젤리가 확실히 보이도록 불투명도 상향
    
    // 계산을 위한 노드 범위 확인 (문자열 더하기 버그 방지를 위해 Number 캐스팅)
    let sumX = 0;
    let maxY = -Infinity;
    
    nodes.forEach(n => {
      let r = 44;
      if (n.importance === 'high') r = 56;
      if (n.importance === 'core') r = 68;

      sumX += Number(n.x);
      maxY = Math.max(maxY, Number(n.y) + r);

      // 각 노드 위치에 젤리 원형 배경 추가 (Gooey 필터 처리를 위해 완전히 불투명하게 그림)
      const blobCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      blobCircle.setAttribute('cx', Number(n.x));
      blobCircle.setAttribute('cy', Number(n.y));
      blobCircle.setAttribute('r', r + 38); 
      blobCircle.setAttribute('fill', themeColor);
      blobCircle.setAttribute('fill-opacity', '1'); 
      blobGroup.appendChild(blobCircle);
    });

    groupsGroup.appendChild(blobGroup);

    // 3. 그룹 이름 라벨 추가 (가독성을 위해 젤리 하단부에 배치 및 회색 폰트 적용)
    const avgX = sumX / nodes.length;
    const textY = maxY + 48; // 그룹의 최하단 노드 아래 젤리 외곽 영역

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', avgX);
    text.setAttribute('y', textY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'svg-group-title');
    text.setAttribute('style', `fill: #6B6A66; font-family: var(--font-title); font-weight: 800; font-size: 11px; letter-spacing: 0.08em; pointer-events: none;`);
    text.textContent = `▼ ${gName.toUpperCase()}`;
    groupsGroup.appendChild(text);
  });
}

// Render Links
function renderLinks(proj) {
  linksGroup.innerHTML = '';
  proj.edges.forEach(edge => {
    const sourceNode = proj.nodes.find(n => n.id === edge.source);
    const targetNode = proj.nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return;

    // 선 좌표 계산
    const x1 = sourceNode.x;
    const y1 = sourceNode.y;
    const x2 = targetNode.x;
    const y2 = targetNode.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dr = Math.sqrt(dx * dx + dy * dy);

    // 중요도에 따른 원형 반지름 값 얻기 (내부 텍스트 삽입을 위해 확장됨)
    const getRadius = (importance) => {
      if (importance === 'core') return 68;
      if (importance === 'high') return 56;
      return 44;
    };

    const sourceR = getRadius(sourceNode.importance);
    const targetR = getRadius(targetNode.importance);

    // 원의 경계면에서 정확히 마주치도록 시작/끝 좌표 보정
    const sourceOffset = sourceR + 2;
    const targetOffset = targetR + 2;
    
    let x1_adj = x1;
    let y1_adj = y1;
    let x2_adj = x2;
    let y2_adj = y2;

    if (dr > (sourceOffset + targetOffset)) {
      x1_adj = x1 + (dx / dr) * sourceOffset;
      y1_adj = y1 + (dy / dr) * sourceOffset;
      x2_adj = x2 - (dx / dr) * targetOffset;
      y2_adj = y2 - (dy / dr) * targetOffset;
    }
    
    let d = `M${x1_adj},${y1_adj}L${x2_adj},${y2_adj}`;
    
    // 관계선 Path 요소
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `svg-link ${state.selectedEdgeId === edge.id ? 'selected' : ''}`);
    path.setAttribute('id', edge.id);
    
    // 성격(색상)에 따른 선의 색상 설정 (기존 데이터 호환용 키워드 분석 포함)
    let lineColor = edge.color;
    if (!lineColor) {
      const typeText = edge.type || '';
      if (typeText.includes('적대') || typeText.includes('경쟁') || typeText.includes('원수') || typeText.includes('싸움')) {
        lineColor = '#FF4E3A'; // 다홍색
      } else if (typeText.includes('동맹') || typeText.includes('우호') || typeText.includes('친구') || typeText.includes('군신') || typeText.includes('군주') || typeText.includes('장수') || typeText.includes('주군') || typeText.includes('멤버')) {
        lineColor = '#00A699'; // 민트색
      } else if (typeText.includes('형제') || typeText.includes('의형제') || typeText.includes('가족') || typeText.includes('부부') || typeText.includes('부모') || typeText.includes('자식') || typeText.includes('아들') || typeText.includes('딸') || typeText.includes('아버지') || typeText.includes('패밀리')) {
        lineColor = '#3b82f6'; // 파란색
      } else if (typeText.includes('승상') || typeText.includes('스승') || typeText.includes('특별') || typeText.includes('기타')) {
        lineColor = '#F5C400'; // 노란색
      } else {
        lineColor = '#D1CFCA'; // 기본 회색
      }
    }
    
    // stroke 속성과 인라인 style 모두 지정하여 확실하게 색상 고정
    path.setAttribute('stroke', lineColor);
    path.setAttribute('style', `stroke: ${lineColor} !important;`);
    
    // 색상에 부합하는 화살표 마커 매핑
    const getMarkerUrl = (color) => {
      if (state.selectedEdgeId === edge.id) return 'url(#arrow-selected)';
      if (color === '#FF4E3A') return 'url(#arrow-red)';
      if (color === '#00A699') return 'url(#arrow-teal)';
      if (color === '#3b82f6') return 'url(#arrow-blue)';
      if (color === '#F5C400') return 'url(#arrow-yellow)';
      return 'url(#arrow)';
    };

    const markerUrl = getMarkerUrl(lineColor);
    
    // 방향성 마커 추가
    if (edge.direction === 'directed') {
      path.setAttribute('marker-end', markerUrl);
    } else if (edge.direction === 'bidirectional') {
      path.setAttribute('marker-end', markerUrl);
      path.setAttribute('marker-start', markerUrl);
    }

    // 클릭 시 선택 처리
    path.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEdge(edge.id);
    });

    linksGroup.appendChild(path);
  });
}

// Render Nodes
function renderNodes(proj) {
  nodesGroup.innerHTML = '';
  proj.nodes.forEach(node => {
    // 내부 텍스트 입력을 위해 원 크기 확장
    let r = 44;
    if (node.importance === 'high') r = 56;
    if (node.importance === 'core') r = 68;
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `svg-node type-${node.type} importance-${node.importance} ${state.selectedNodeId === node.id ? 'selected' : ''}`);
    g.setAttribute('transform', `translate(${node.x},${node.y})`);
    g.setAttribute('id', node.id);

    // 은은한 파스텔 방사형 그라데이션이 적용된 메인 원형 노드
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', 0);
    circle.setAttribute('cy', 0);
    circle.setAttribute('r', r);
    
    // 그라데이션 연결
    let gradId = 'grad-character';
    if (node.type === 'group') gradId = 'grad-group';
    if (node.type === 'concept') gradId = 'grad-concept';
    circle.setAttribute('fill', `url(#${gradId})`);
    g.appendChild(circle);

    // 텍스트 그룹 컨테이너 (중앙 정렬)
    const textContainer = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textContainer.setAttribute('class', 'node-text-container-inner');
    textContainer.setAttribute('text-anchor', 'middle');

    // 설명 텍스트 쪼개기 (원 내부에 맞춰 한 줄에 9~12자 내외)
    const descText = node.desc || '';
    const maxChars = 11;
    const descLines = [];
    
    descText.split('\n').forEach(rawLine => {
      let temp = rawLine.trim();
      if (!temp) return;
      while (temp.length > maxChars) {
        descLines.push(temp.substring(0, maxChars));
        temp = temp.substring(maxChars);
      }
      if (temp) {
        descLines.push(temp);
      }
    });

    // 화면 복잡도를 위해 최대 3줄까지만 요약 노출 후 상세는 사이드바 유도
    const displayLines = descLines.slice(0, 3);
    const totalLinesCount = 1 + displayLines.length; // 이름 1줄 + 설명 줄수

    // 첫 줄의 dy 시작 좌표를 계산하여 전체 텍스트 블록이 원 정중앙에 위치하도록 배치
    // 한 줄 간격을 약 14px로 계산
    const startDy = -((totalLinesCount - 1) * 7) + 3;

    // 1. 이름 (tspan)
    const nameTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    nameTspan.setAttribute('x', 0);
    nameTspan.setAttribute('y', startDy);
    nameTspan.setAttribute('class', 'node-inner-title');
    nameTspan.textContent = node.name;
    textContainer.appendChild(nameTspan);

    // 2. 부가 설명 라인들 (tspan)
    displayLines.forEach((line) => {
      const lineTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      lineTspan.setAttribute('x', 0);
      lineTspan.setAttribute('dy', 14); // 다음 줄 줄바꿈 간격
      lineTspan.setAttribute('class', 'node-inner-desc');
      lineTspan.textContent = line;
      textContainer.appendChild(lineTspan);
    });

    g.appendChild(textContainer);

    // 드래그 및 클릭 이벤트 핸들러
    g.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (state.isConnecting) {
        handleConnection(node.id);
      } else {
        draggedNode = node;
        const coords = getEventCoords(e);
        dragOffset.x = coords.x - node.x;
        dragOffset.y = coords.y - node.y;
        selectNode(node.id);
      }
    });

    g.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (state.isConnecting) {
        handleConnection(node.id);
      } else {
        draggedNode = node;
        const coords = getEventCoords(e.touches[0]);
        dragOffset.x = coords.x - node.x;
        dragOffset.y = coords.y - node.y;
        selectNode(node.id);
      }
    });

    nodesGroup.appendChild(g);
  });
}


// Zoom & Pan Actions
function updateTransform() {
  canvasContent.setAttribute('transform', `translate(${transform.x}, ${transform.y}) scale(${transform.k})`);
}

function zoom(factor, clientX, clientY) {
  const proj = getCurrentProject();
  if (!proj) return;
  
  let newK = transform.k * factor;
  newK = Math.max(0.15, Math.min(newK, 4)); // 최소 15%, 최대 400%
  
  // 마우스 커서 기준으로 줌인/아웃 처리
  const rect = svg.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  
  transform.x = x - (x - transform.x) * (newK / transform.k);
  transform.y = y - (y - transform.y) * (newK / transform.k);
  transform.k = newK;
  
  updateTransform();
}

function resetZoom() {
  const rect = svg.getBoundingClientRect();
  transform = {
    x: rect.width / 8,
    y: rect.height / 8,
    k: 1
  };
  updateTransform();
}

// Event Coordinates Helper
function getEventCoords(e) {
  const rect = svg.getBoundingClientRect();
  // 스크린 좌표에서 SVG 내부 좌표계(줌/팬 반영 전)로 변환
  const clientX = e.clientX - rect.left;
  const clientY = e.clientY - rect.top;
  return {
    x: (clientX - transform.x) / transform.k,
    y: (clientY - transform.y) / transform.k
  };
}

// Setup Event Listeners
function setupEventListeners() {
  // SVG Canvas Pan and Drag
  svg.addEventListener('mousedown', (e) => {
    if (e.target === svg || e.target.classList.contains('canvas-grid-bg')) {
      isPanning = true;
      panStart.x = e.clientX - transform.x;
      panStart.y = e.clientY - transform.y;
    }
  });

  svg.addEventListener('mousemove', (e) => {
    if (isPanning) {
      transform.x = e.clientX - panStart.x;
      transform.y = e.clientY - panStart.y;
      updateTransform();
    } else if (draggedNode) {
      const coords = getEventCoords(e);
      draggedNode.x = coords.x - dragOffset.x;
      draggedNode.y = coords.y - dragOffset.y;
      
      // 노드 엘리먼트 갱신
      const nodeEl = document.getElementById(draggedNode.id);
      if (nodeEl) {
        nodeEl.setAttribute('transform', `translate(${draggedNode.x},${draggedNode.y})`);
      }
      
      // 연결선들 및 그룹배경 실시간 업데이트
      const proj = getCurrentProject();
      renderLinks(proj);
      renderGroups(proj);
    }
  });

  window.addEventListener('mouseup', () => {
    if (draggedNode) {
      draggedNode = null;
      saveData();
    }
    isPanning = false;
  });

  // Touch support for Pan and Drag
  svg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1 && (e.target === svg || e.target.classList.contains('canvas-grid-bg'))) {
      isPanning = true;
      panStart.x = e.touches[0].clientX - transform.x;
      panStart.y = e.touches[0].clientY - transform.y;
    }
  });

  svg.addEventListener('touchmove', (e) => {
    if (isPanning && e.touches.length === 1) {
      transform.x = e.touches[0].clientX - panStart.x;
      transform.y = e.touches[0].clientY - panStart.y;
      updateTransform();
    } else if (draggedNode && e.touches.length === 1) {
      const coords = getEventCoords(e.touches[0]);
      draggedNode.x = coords.x - dragOffset.x;
      draggedNode.y = coords.y - dragOffset.y;
      
      const nodeEl = document.getElementById(draggedNode.id);
      if (nodeEl) {
        nodeEl.setAttribute('transform', `translate(${draggedNode.x},${draggedNode.y})`);
      }
      
      const proj = getCurrentProject();
      renderLinks(proj);
      renderGroups(proj);
    }
  });

  svg.addEventListener('touchend', () => {
    if (draggedNode) {
      draggedNode = null;
      saveData();
    }
    isPanning = false;
  });

  // Zoom on Wheel
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoom(factor, e.clientX, e.clientY);
  }, { passive: false });

  // Control panel actions
  btnZoomIn.addEventListener('click', () => zoom(1.2, window.innerWidth / 2, window.innerHeight / 2));
  btnZoomOut.addEventListener('click', () => zoom(0.8, window.innerWidth / 2, window.innerHeight / 2));
  btnZoomReset.addEventListener('click', resetZoom);

  // Add Project
  btnAddProject.addEventListener('click', () => {
    const title = prompt('새 관계도 프로젝트 제목을 입력하세요:');
    if (title && title.trim()) {
      const newProj = {
        id: 'proj_' + Date.now(),
        title: title.trim(),
        nodes: [],
        edges: []
      };
      state.projects.push(newProj);
      state.currentProjectId = newProj.id;
      saveData();
      renderSidebar();
      renderProject();
      resetZoom();
    }
  });

  // Add Node Modal Triggers
  btnAddNode.addEventListener('click', () => {
    const proj = getCurrentProject();
    if (!proj) {
      alert('프로젝트를 먼저 생성해 주세요.');
      return;
    }
    showNodeModal();
  });

  // Form Submissions
  nodeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('node-id').value;
    const name = document.getElementById('node-name').value.trim();
    const type = document.getElementById('node-type').value;
    const importance = document.getElementById('node-importance').value;
    const group = document.getElementById('node-group-input').value.trim();
    const desc = document.getElementById('node-desc').value.trim();

    const proj = getCurrentProject();
    if (!proj) return;

    if (id) {
      // Edit mode
      const node = proj.nodes.find(n => n.id === id);
      if (node) {
        node.name = name;
        node.type = type;
        node.importance = importance;
        node.group = group;
        node.desc = desc;
      }
    } else {
      // Create mode
      // 화면 중앙 쪽에 노드 소환
      const rect = svg.getBoundingClientRect();
      const screenX = rect.width / 2;
      const screenY = rect.height / 2;
      const canvasCoords = {
        x: (screenX - transform.x) / transform.k,
        y: (screenY - transform.y) / transform.k
      };

      const newNode = {
        id: 'node_' + Date.now(),
        name,
        type,
        importance,
        group,
        desc,
        x: canvasCoords.x + (Math.random() - 0.5) * 40,
        y: canvasCoords.y + (Math.random() - 0.5) * 40
      };
      proj.nodes.push(newNode);
    }

    saveData();
    hideModals();
    renderProject();
    if (id && state.selectedNodeId === id) {
      selectNode(id); // 디테일 패널 정보 즉시 갱신
    }
  });

  // Edge Trigger
  btnAddEdge.addEventListener('click', () => {
    const proj = getCurrentProject();
    if (!proj || proj.nodes.length < 2) {
      alert('관계를 연결하려면 최소 2개 이상의 노드가 필요합니다.');
      return;
    }
    showEdgeModal();
  });

  edgeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const source = document.getElementById('edge-source').value;
    const target = document.getElementById('edge-target').value;
    const type = document.getElementById('edge-type').value.trim();
    const direction = document.getElementById('edge-direction').value;
    const color = document.getElementById('edge-color').value;

    if (source === target) {
      alert('자기 자신과는 관계를 맺을 수 없습니다.');
      return;
    }

    const proj = getCurrentProject();
    if (!proj) return;

    const newEdge = {
      id: 'edge_' + Date.now(),
      source,
      target,
      type,
      direction,
      color
    };
    proj.edges.push(newEdge);

    saveData();
    hideModals();
    renderProject();
  });

  // Detail panel close & action
  btnCloseDetail.addEventListener('click', hideDetailPanel);
  btnEditNodeTrigger.addEventListener('click', () => {
    const proj = getCurrentProject();
    const node = proj.nodes.find(n => n.id === state.selectedNodeId);
    if (node) showNodeModal(node);
  });
  btnDeleteNodeTrigger.addEventListener('click', () => {
    if (state.selectedNodeId && confirm('이 노드를 정말 삭제하시겠습니까? 관련 연결 선도 함께 삭제됩니다.')) {
      deleteNode(state.selectedNodeId);
    }
  });

  // Close modals on clicking overlay or close buttons
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideModals();
    });
  });
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', hideModals);
  });

  // Firebase Auth Event Listeners (GitHub 소셜 로그인 및 로그아웃)
  btnGithubLogin.addEventListener('click', async () => {
    try {
      btnGithubLogin.disabled = true;
      btnGithubLogin.textContent = '로그인 중...';
      const provider = new firebase.auth.GithubAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (err) {
      console.error('GitHub 로그인 오류:', err);
      alert('GitHub 로그인에 실패했습니다. Firebase 콘솔의 Auth 및 GitHub OAuth 설정을 다시 확인해 주세요.');
    } finally {
      btnGithubLogin.disabled = false;
      btnGithubLogin.textContent = 'GitHub 로그인 연동';
    }
  });

  btnFirebaseLogout.addEventListener('click', async () => {
    if (confirm('로그아웃 하시겠습니까? 로그아웃해도 기기에 마지막으로 백업된 데이터는 로컬 스토리지에 남아있습니다.')) {
      try {
        await auth.signOut();
        alert('로그아웃되었습니다.');
      } catch (err) {
        console.error('로그아웃 오류:', err);
      }
    }
  });
}

// Modal actions
function showNodeModal(node = null) {
  hideModals();
  nodeModal.classList.remove('hidden');
  
  if (node) {
    nodeModalTitle.textContent = '노드 정보 수정';
    document.getElementById('node-id').value = node.id;
    document.getElementById('node-name').value = node.name;
    document.getElementById('node-type').value = node.type;
    document.getElementById('node-importance').value = node.importance;
    document.getElementById('node-group-input').value = node.group || '';
    document.getElementById('node-desc').value = node.desc || '';
  } else {
    nodeModalTitle.textContent = '새 인물/개념 추가';
    document.getElementById('node-id').value = '';
    nodeForm.reset();
    document.getElementById('node-group-input').value = '';
  }
}

function showEdgeModal() {
  hideModals();
  edgeModal.classList.remove('hidden');
  edgeForm.reset();

  const proj = getCurrentProject();
  const sourceSelect = document.getElementById('edge-source');
  const targetSelect = document.getElementById('edge-target');

  sourceSelect.innerHTML = '';
  targetSelect.innerHTML = '';

  proj.nodes.forEach(node => {
    const opt1 = document.createElement('option');
    opt1.value = node.id;
    opt1.textContent = `${node.name} (${node.type === 'character' ? '인물' : node.type === 'group' ? '집단' : '개념'})`;
    sourceSelect.appendChild(opt1);

    const opt2 = opt1.cloneNode(true);
    targetSelect.appendChild(opt2);
  });
}

function hideModals() {
  nodeModal.classList.add('hidden');
  edgeModal.classList.add('hidden');
}

// Detail Panel Actions
function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  state.selectedEdgeId = null; // 링크 선택은 취소
  
  // SVG 하이라이트 반영을 위해 리렌더링
  const proj = getCurrentProject();
  const node = proj.nodes.find(n => n.id === nodeId);
  if (!node) return;

  // 노드들의 하이라이트 클래스 갱신
  document.querySelectorAll('.svg-node').forEach(el => {
    el.classList.remove('selected');
    if (el.id === nodeId) el.classList.add('selected');
  });
  document.querySelectorAll('.svg-link').forEach(el => el.classList.remove('selected'));

  // 디테일 채우기
  detailPanelTitle.textContent = '노드 정보';
  
  let typeKo = '인물';
  if (node.type === 'group') typeKo = '집단 / 조직';
  if (node.type === 'concept') typeKo = '개념 / 키워드';
  detailNodeType.textContent = typeKo;
  
  detailNodeName.textContent = node.name;
  detailNodeDescription.textContent = node.desc || '설명이 입력되지 않았습니다.';

  // 관련 엣지 리스트업
  detailRelationsList.innerHTML = '';
  const relatedEdges = proj.edges.filter(e => e.source === nodeId || e.target === nodeId);
  
  if (relatedEdges.length === 0) {
    detailRelationsList.innerHTML = '<li class="relation-list-item" style="color: var(--text-muted);">연결된 관계가 없습니다.</li>';
  } else {
    relatedEdges.forEach(edge => {
      const otherNodeId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = proj.nodes.find(n => n.id === otherNodeId);
      if (!otherNode) return;

      const li = document.createElement('li');
      li.className = 'relation-list-item';
      
      // 단방향/양방향 기호 표시
      let arrowSymbol = '➔';
      if (edge.direction === 'bidirectional') arrowSymbol = '⇄';
      if (edge.direction === 'none') arrowSymbol = '—';

      // 내가 출발지인지 아닌지에 따른 텍스트 구성
      if (edge.source === nodeId) {
        li.innerHTML = `<span><strong>${node.name}</strong> <span class="relation-arrow">${arrowSymbol}</span> ${otherNode.name}</span> <span style="color: var(--accent-color);">${edge.type}</span>`;
      } else {
        li.innerHTML = `<span>${otherNode.name} <span class="relation-arrow">${arrowSymbol}</span> <strong>${node.name}</strong></span> <span style="color: var(--accent-color);">${edge.type}</span>`;
      }
      
      // 관계선 삭제 버튼 추가
      const btnDelEdge = document.createElement('button');
      btnDelEdge.innerHTML = '&times;';
      btnDelEdge.className = 'btn-icon-small';
      btnDelEdge.style.color = '#D9383A';
      btnDelEdge.style.marginLeft = '10px';
      btnDelEdge.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('이 관계 연결을 삭제하시겠습니까?')) {
          deleteEdge(edge.id);
        }
      });
      li.appendChild(btnDelEdge);

      detailRelationsList.appendChild(li);
    });
  }

  // 액션 버튼 보이기
  btnEditNodeTrigger.style.display = 'block';
  btnDeleteNodeTrigger.style.display = 'block';

  detailPanel.classList.remove('hidden');
}

function selectEdge(edgeId) {
  state.selectedEdgeId = edgeId;
  state.selectedNodeId = null;

  const proj = getCurrentProject();
  const edge = proj.edges.find(e => e.id === edgeId);
  if (!edge) return;

  document.querySelectorAll('.svg-link').forEach(el => {
    el.classList.remove('selected');
    if (el.id === edgeId) el.classList.add('selected');
  });
  document.querySelectorAll('.svg-node').forEach(el => el.classList.remove('selected'));

  const sourceNode = proj.nodes.find(n => n.id === edge.source);
  const targetNode = proj.nodes.find(n => n.id === edge.target);

  detailPanelTitle.textContent = '관계 정보';
  detailNodeType.textContent = '연결선';
  detailNodeName.textContent = edge.type;
  detailNodeDescription.textContent = `${sourceNode ? sourceNode.name : '알 수 없음'} 와(과) ${targetNode ? targetNode.name : '알 수 없음'} 의 관계입니다.`;

  detailRelationsList.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'relation-list-item';
  li.innerHTML = `<span>방향성: ${edge.direction === 'directed' ? '단방향 (➔)' : edge.direction === 'bidirectional' ? '양방향 (⇄)' : '방향 없음 (—)'}</span>`;
  detailRelationsList.appendChild(li);

  // 관계 삭제를 상세에서 쉽게 할 수 있도록 액션 버튼 수정
  btnEditNodeTrigger.style.display = 'none';
  btnDeleteNodeTrigger.style.display = 'block';
  btnDeleteNodeTrigger.onclick = () => {
    if (confirm('이 관계 연결을 삭제하시겠습니까?')) {
      deleteEdge(edgeId);
    }
  };

  detailPanel.classList.remove('hidden');
}

function hideDetailPanel() {
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  detailPanel.classList.add('hidden');
  document.querySelectorAll('.svg-node').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.svg-link').forEach(el => el.classList.remove('selected'));
}

// Delete Actions
function deleteProject(projId) {
  if (state.projects.length <= 1) {
    alert('최소한 하나의 프로젝트는 유지되어야 합니다.');
    return;
  }
  if (confirm('이 프로젝트와 모든 관계도 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
    state.projects = state.projects.filter(p => p.id !== projId);
    if (state.currentProjectId === projId) {
      state.currentProjectId = state.projects[0].id;
    }
    hideDetailPanel();
    saveData();
    renderSidebar();
    renderProject();
    resetZoom();
  }
}

function deleteNode(nodeId) {
  const proj = getCurrentProject();
  if (!proj) return;

  // 노드와 연관된 모든 엣지 함께 제거
  proj.nodes = proj.nodes.filter(n => n.id !== nodeId);
  proj.edges = proj.edges.filter(e => e.source !== nodeId && e.target !== nodeId);

  hideDetailPanel();
  saveData();
  renderProject();
}

function deleteEdge(edgeId) {
  const proj = getCurrentProject();
  if (!proj) return;

  proj.edges = proj.edges.filter(e => e.id !== edgeId);

  hideDetailPanel();
  saveData();
  renderProject();
}

// Boot
window.onload = init;
