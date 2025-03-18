const socket = io('http://localhost:3000');
let idols = [];

// 获取 cookie
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// 设置 cookie
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}
let currentIdol = null;
let danmakuList = [];

let locationChart, ageChart;
let locationChartCanvas, ageChartCanvas
document.addEventListener('DOMContentLoaded', () => {
    // 获取偶像列表
    fetchIdols();
    // 初始化图表
    locationChartCanvas = document.getElementById('location-chart').getContext('2d');
    ageChartCanvas = document.getElementById('age-chart').getContext('2d');
    // 年龄输入框事件
    document.getElementById('age-input').addEventListener('change', function() {
        const userInfo = {
            age: this.value
        };
        socket.emit('update-user-info', userInfo);
    });
    // 检查登录状态
    checkLoginStatus();
    // 修改下拉菜单事件监听
    document.addEventListener('DOMContentLoaded', () => {
        // 密码修改模态框
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="password-modal" style="display:none;">
                <div class="modal-content">
                    <h3>修改密码</h3>
                    <input type="password" id="old-pwd" placeholder="旧密码">
                    <input type="password" id="new-pwd" placeholder="新密码">
                    <button onclick="submitPasswordChange()">提交</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    
        // 绑定修改密码点击事件
        document.getElementById('change-password').addEventListener('click', () => {
            document.querySelector('.password-modal').style.display = 'flex';
        });
    });
});
// 新增密码修改函数
function submitPasswordChange() {
    const oldPwd = document.getElementById('old-pwd').value;
    const newPwd = document.getElementById('new-pwd').value;

    fetch('/api/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        document.querySelector('.password-modal').style.display = 'none';
    })
    .catch(error => console.error('修改失败:', error));
}
// 在 fetchIdols 函数中添加默认选择逻辑
function fetchIdols() {
    fetch('/api/idols')
        .then(response => response.json())
        .then(data => {
            idols = data;
            renderIdolList();
            // 始终默认选择第一个偶像
            if (idols.length > 0) {
                selectIdol(idols[0]);
            }
        })
        .catch(error => console.error('获取偶像列表失败:', error));
}

let danmakuCache = {};
let currentDisplayedIdol = null;
// 修改弹幕发送函数
function sendDanmaku() {
    const input = document.getElementById('danmaku-input');
    const text = input.value.trim();
    if (text && currentIdol) { // 确保必须选择偶像
        socket.emit('send-danmaku', {
            text: text,
            idolId: currentIdol.id
        });
        input.value = '';
    } else {
        alert('请先选择偶像');
    }
}
// 创建图表
function createChart(canvas, type, data, options) {
    return new Chart(canvas, {
        type: type,
        data: data,
        options: options
    });
}
// 渲染偶像列表
// 在 renderIdolList 中更新点击处理
function renderIdolList() {
    const listContainer = document.getElementById('idol-list-container');
    listContainer.innerHTML = '';
    idols.forEach(idol => {
        const item = document.createElement('div');
        item.className = 'idol-item';
        item.textContent = idol.name;
        // 添加点击后选中样式
        item.onclick = () => {
            selectIdol(idol);
            // 移除所有选中样式
            document.querySelectorAll('.idol-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        }
        listContainer.appendChild(item);
    });
    
    // 默认选中第一个
    if (idols.length > 0) {
        listContainer.firstChild?.classList.add('selected');
    }
}
// 选中偶像
// 修改偶像选择逻辑（约145行）
function selectIdol(idol) {
    currentIdol = idol;
    currentDisplayedIdol = idol.id;
    updateIdolInfo();
    fetchFanProfile(idol.id);
    
    // 切换时先清空容器
    const container = document.getElementById('danmaku-container');
    container.innerHTML = '';
    danmakuCache[idol.id] = []; // 清空当前偶像的缓存
    
    // 优先显示缓存数据
    // if (danmakuCache[idol.id]) {
    //     danmakuCache[idol.id].forEach(appendSingleDanmaku);
    // }
    
    // 从服务器获取历史记录
    fetch(`/api/danmaku/${idol.id}`)
        .then(response => response.json())
        .then(newDanmaku => {
            danmakuCache[idol.id] = newDanmaku; // 直接替换而不是合并
            if (currentDisplayedIdol === idol.id) {
                container.innerHTML = '';
                danmakuCache[idol.id].forEach(appendSingleDanmaku);
            }
        });
}

// 修改弹幕渲染逻辑（约 283 行）
function renderDanmaku(list = []) {
    console.log("渲染弹幕")
    const container = document.getElementById('danmaku-container');
    container.innerHTML = '';
    list.forEach(item => {
        const danmaku = document.createElement('div');
        danmaku.className = 'danmaku';
        danmaku.textContent = `${item.id}: ${item.text}`;
        container.appendChild(danmaku);
        console.log(item.text);
    });
}

// 在收到实时弹幕时更新（约 265 行）
function addDanmaku(data) {
    if (currentIdol && data.idolId === currentIdol.id) {
        console.log("收到实时弹幕时更新", data.idolId, currentIdol.id)
        const danmakuList = [data, ...danmakuList]; // 保持历史记录
        renderDanmaku(danmakuList);
    }
}
// 更新偶像详细信息
function updateIdolInfo() {
    const description = document.getElementById('idol-description');
    if (currentIdol) {
        description.innerHTML = `
            <img src="${currentIdol.image}" width="200">
            <p>年龄：${currentIdol.age}</p>
            <p>所在地：${currentIdol.location}</p>
            <p>${currentIdol.description}</p>
        `;
    } else {
        description.innerHTML = '<p>请选择一位偶像</p>';
    }
}
// 获取粉丝画像
function fetchFanProfile(idolId) {
    fetch(`/api/idol/${idolId}/fans/profile`)
        .then(response => response.json())
        .then(profile => {
            renderFanProfile(profile);
        })
        .catch(error => console.error('获取粉丝画像失败:', error));
}
// 显示地域分布图表
function showLocationChart() {
    document.getElementById('location-chart').style.display = 'block';
    document.getElementById('age-chart').style.display = 'none';
    document.getElementById('ranking-list').style.display = 'none';
}
// 显示年龄分布图表
function showAgeChart() {
    document.getElementById('location-chart').style.display = 'none';
    document.getElementById('age-chart').style.display = 'block';
    document.getElementById('ranking-list').style.display = 'none';
}
// 显示排名列表
function showRanking() {
    document.getElementById('location-chart').style.display = 'none';
    document.getElementById('age-chart').style.display = 'none';
    document.getElementById('ranking-list').style.display = 'block';
}
// 渲染粉丝画像
function renderFanProfile(profile) {
    const rankingListDiv = document.getElementById('ranking-list');
    rankingListDiv.innerHTML = '';
    // 地域分布
    const locationLabels = Object.keys(profile.locationCounts);
    const locationData = Object.values(profile.locationCounts);
    if (locationChart) {
        locationChart.destroy();
    }
    locationChart = createChart(locationChartCanvas, 'bar', {
        labels: locationLabels,
        datasets: [{
            label: '地域分布',
            data: locationData,
            backgroundColor: 'rgba(54, 162, 235, 0.5)'
        }]
    }, {
        scales: {
            y: {
                beginAtZero: true
            }
        }
    });
    const ageLabels = Object.keys(profile.ageCounts);
    const ageData = Object.values(profile.ageCounts);
    if (ageChart) {
        ageChart.destroy();
    }
    ageChart = createChart(ageChartCanvas, 'bar', {
        labels: ageLabels,
        datasets: [{
            label: '年龄分布',
            data: ageData,
            backgroundColor: 'rgba(255, 99, 132, 0.5)'
        }]
    }, {
        scales: {
            y: {
                beginAtZero: true
            }
        }
    });
    showLocationChart();
    // 弹幕数量排名
    const rankingTitle = document.createElement('h4');
    rankingTitle.textContent = '弹幕数量排名';
    rankingListDiv.appendChild(rankingTitle);
    const rankingList = document.createElement('ol');
    profile.ranking.forEach(fan => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <img src="${fan.avatar}" width="30" height="30" style="border-radius: 50%;">
            <span>${fan.username}</span>
            <span>弹幕数: ${fan.danmakuCount}</span>
        `;
        rankingList.appendChild(listItem);
    });
    rankingListDiv.appendChild(rankingList);
}

// 添加弹幕
function addDanmaku(data) {
    const {
        text,
        idolId
    } = data;
    if (!currentIdol || idolId === currentIdol.id) {
        const danmaku = document.createElement('div');
        danmaku.className = 'danmaku';
        danmaku.textContent = text;
        document.getElementById('danmaku-container').appendChild(danmaku);
    }
}
// 监听新弹幕
socket.on('new-danmaku', (data) => {
    // 按偶像ID缓存弹幕
    if (!danmakuCache[data.idolId]) {
        danmakuCache[data.idolId] = [];
    }
    danmakuCache[data.idolId].push(data);
    
    // 只渲染当前显示的弹幕
    if (currentIdol && data.idolId === currentIdol.id) {
        appendSingleDanmaku(data);
    }
});
let danmakuSpeed = 6; // 初始速度 8 秒
// 修改弹幕追加方法
function appendSingleDanmaku(data) {
    const container = document.getElementById('danmaku-container');
    const danmaku = document.createElement('div');
    danmaku.className = 'danmaku';
    danmaku.textContent = data.text;
    
    // 随机行位置
    const lineHeight = 30;
    const randomLine = Math.floor(Math.random() * 8) * lineHeight;
    danmaku.style.top = `${10 + randomLine}px`;
    
    // 设置动画速度变量（基础速度+随机偏移）
    const baseSpeed = danmakuSpeed * 1000; // 转成毫秒
    const randomOffset = Math.random() * 2000; // 2秒内的随机偏移
    danmaku.style.setProperty('--speed', `${baseSpeed + randomOffset}ms`);
    
    // 自动移除旧弹幕（当超过100条时）
    if (container.children.length > 100) {
        container.removeChild(container.children[0]);
    }
    
    container.appendChild(danmaku);
}
    
//     // 自动滚动到底部（保留垂直滚动）
//     container.scrollTop = container.scrollHeight;
// }

function renderDanmaku() {
    const danmakuContainer = document.getElementById('danmaku-container');
    danmakuContainer.innerHTML = '';
    danmakuList.forEach((item) => {
        const {
            text,
            idolId
        } = item;
        if (!currentIdol || idolId === currentIdol.id) {
            const danmaku = document.createElement('div');
            danmaku.className = 'danmaku';
            danmaku.textContent = text;
            danmakuContainer.appendChild(danmaku);
        }
    })
}
// 注册函数
function register(username, password) {
    fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                alert(data.message);
                // 注册成功后跳转到登录页面
                window.location.href = 'login.html';
            }
        })
        .catch(error => console.error('注册失败:', error));
}
// 登录函数
function login(username, password) {
    fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                alert(data.message);
                // 登录成功后更新页面状态
                checkLoginStatus();
                // 登录成功后跳转到主页面
                window.location.href = '/';
            }
        })
        .catch(error => console.error('登录失败:', error));
}
// 修改登出函数（约第300行）
function logout() {
    console.log('[Debug] 开始执行登出流程');
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin' // 确保携带cookie
    })
    .then(response => {
        if (!response.ok) throw new Error('登出失败');
        return response.json();
    })
    .then(data => {
        // 强制清除前端会话状态
        document.cookie = 'connect.sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'; 
        window.location.href = '/login.html';
    })
    .catch(error => {
        console.error('Error:', error);
        // 强制跳转作为保底
        window.location.href = '/login.html?force=true'; 
    });
}
// 检查登录状态
function checkLoginStatus() {
    fetch('/api/checkLogin')
        .then(response => response.json())
        .then(data => {
            const loginStatus = document.getElementById('login-status');
            const profileLink = document.getElementById('profile-link');
            const logoutButton = document.getElementById('logout-button');
            const registerLink = document.getElementById('register-link');
            const loginLink = document.getElementById('login-link');
            if (data.isLogin) {
                loginStatus.textContent = '已登录';
                profileLink.style.display = 'inline';
                logoutButton.style.display = 'inline';
                registerLink.style.display = 'none';
                loginLink.style.display = 'none';
            } else {
                loginStatus.textContent = '未登录';
                profileLink.style.display = 'none';
                logoutButton.style.display = 'none';
                registerLink.style.display = 'inline';
                loginLink.style.display = 'inline';
            }
        })
        .catch(error => console.error('检查登录状态失败:', error));
}

// 在DOMContentLoaded中添加密码修改弹窗 (HTML+CSS)
document.addEventListener('DOMContentLoaded', () => {
    // 创建模态框
    const modal = document.createElement('div');
    modal.innerHTML = `
        <div class="password-modal">
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🔐 修改密码</h3>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="form-group">
                    <label>旧密码</label>
                    <input type="password" id="old-pwd" class="cute-input">
                </div>
                <div class="form-group">
                    <label>新密码</label>
                    <input type="password" id="new-pwd" class="cute-input">
                </div>
                <div class="form-group">
                    <label>确认新密码</label>
                    <input type="password" id="confirm-pwd" class="cute-input">
                </div>
                <div class="error-msg" id="password-error"></div>
                <div class="modal-actions">
                    <button class="cancel-btn">取消</button>
                    <button class="confirm-btn">确认修改</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 控制弹窗显示
    // 在密码弹窗显示时添加滚动锁定
    document.querySelector('.password-modal').addEventListener('click', (e) => {
        if (e.target.closest('.modal-content')) return;
        closeModal();
    });
    
    // 修改弹窗显示逻辑（约第369行附近）
    document.getElementById('change-password').addEventListener('click', () => {
        document.querySelector('.password-modal').style.display = 'block';
        document.documentElement.classList.add('disable-scroll'); // 新增滚动锁定
    });

    document.getElementById('logout-button').addEventListener('click', logout);
    // 关闭弹窗逻辑
    const closeModal = () => {
        document.querySelector('.password-modal').style.display = 'none';
        // 清空输入
        ['#old-pwd', '#new-pwd', '#confirm-pwd'].forEach(selector => {
            document.querySelector(selector).value = '';
        });
        document.getElementById('password-error').textContent = '';
    };

    // 页面加载时自动滚动到底部
    // const container = document.getElementById('danmaku-container');
    // container.scrollTop = container.scrollHeight;
    
    // 存储当前选择的偶像到sessionStorage
    if (currentIdol) {
        sessionStorage.setItem('lastIdolId', currentIdol.id);
    }

    // 绑定关闭事件
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    modal.querySelector('.close-btn').addEventListener('click', closeModal);
    modal.querySelector('.cancel-btn').addEventListener('click', closeModal);

    // 提交逻辑
    modal.querySelector('.confirm-btn').addEventListener('click', () => {
        const oldPwd = document.getElementById('old-pwd').value;
        const newPwd = document.getElementById('new-pwd').value;
        const confirmPwd = document.getElementById('confirm-pwd').value;
        const errorEl = document.getElementById('password-error');

        // 前端验证
        if (!oldPwd || !newPwd || !confirmPwd) {
            errorEl.textContent = '请填写所有字段';
            return;
        }
        if (newPwd !== confirmPwd) {
            errorEl.textContent = '两次输入的新密码不一致';
            return;
        }
        if (newPwd.length < 6) {
            errorEl.textContent = '密码长度不能少于6位';
            return;
        }

        // 提交到后端
        fetch('/api/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                oldPassword: oldPwd, 
                newPassword: newPwd 
            })
        })
        .then(response => {
            if (!response.ok) throw response;
            return response.json();
        })
        .then(data => {
            alert('✅ ' + data.message);
            closeModal();
        })
        .catch(async (error) => {
            const err = await error.json();
            errorEl.textContent = '❌ ' + (err.error || '修改失败');
        });
    });
});

// 新增页面恢复逻辑
window.addEventListener('load', () => {
    const lastIdolId = sessionStorage.getItem('lastIdolId');
    if (lastIdolId && idols.length) {
        const targetIdol = idols.find(i => i.id == lastIdolId);
        if (targetIdol) selectIdol(targetIdol);
    }
});