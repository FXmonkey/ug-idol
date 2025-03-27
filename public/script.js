const socket = io('http://localhost:3000', {
    transports: ['websocket'] // 强制使用 websocket
});
// 增加连接状态监听
socket.on('connect', () => {
    console.log('已连接到服务器');
});

socket.on('connect_error', (error) => {
    console.error('连接失败:', error);
});

socket.on('authentication', (data) => {
    console.log('认证状态:', data.status);
});
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
    // 访问控制
    const isAuthPage = window.location.pathname.includes('login.html') || 
                      window.location.pathname.includes('register.html');
    // 只在主页面初始化图表
    if (!isAuthPage) {
        // 初始化图表
        locationChartCanvas = document.getElementById('location-chart')?.getContext('2d');
        ageChartCanvas = document.getElementById('age-chart')?.getContext('2d');
    }
    if (!localStorage.getItem('currentUserId') && !isAuthPage) {
        window.location.href = '/login.html';
        return;
    }
    // 获取偶像列表
    fetchIdols();
    // 初始化图表
    locationChartCanvas = document.getElementById('location-chart').getContext('2d');
    ageChartCanvas = document.getElementById('age-chart').getContext('2d');
    // 检查登录状态
    // checkLoginStatus();
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
function submitPasswordChange(userId, oldPwd, newPwd, errorEl, closeCallback) {
    fetch('/api/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            oldPassword: oldPwd, 
            newPassword: newPwd,
            userId: userId  // 新增用户ID参数
        })
    })
    .then(response => {
        if (!response.ok) throw response;
        return response.json();
    })
    .then(data => {
        alert('✅ ' + data.message)
        closeCallback();
    })
    .catch(async (error) => {
        errorEl.textContent = '❌ ' + (error || '修改失败');
    });
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

function handleLoginSuccess(userId) {
    localStorage.setItem('currentUserId', userId);
    checkLoginStatus();
    // Socket连接改为简单模式
    socket = io('http://localhost:3000', {
        transports: ['websocket']
    });
}

// 发送弹幕时携带本地存储的userId
function sendDanmaku() {
    const input = document.getElementById('danmaku-input'); // 新增获取输入框
    const text = input.value.trim();  // 新增
    const userId = localStorage.getItem('currentUserId');
    console.log(userId, '  发送弹幕:', text);  // 新增
    if (!text) {
        alert('请输入弹幕内容');
        return;
    }

    if (!userId) {
        alert('请先登录');
        window.location.href = '/login.html';  // 未登录时跳转
        return;
    }

    if (!currentIdol) {
        alert('请先选择偶像');
        return;
    }

    try {
        socket.emit('send-danmaku', {
            text: text,
            idolId: currentIdol.id,
            userId: userId
        });
        input.value = '';
    } catch (error) {
        console.error('弹幕发送失败:', error);
        alert('弹幕发送失败，请检查网络连接');
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
    if (danmakuCache[idol.id]) {
        danmakuCache[idol.id].forEach(appendSingleDanmaku);
    }
    
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

// 更新偶像详细信息
function updateIdolInfo() {
    const description = document.getElementById('idol-description');
    const previewImages = document.getElementById('preview-images');
    const viewMoreButton = document.getElementById('view-more-images');
    console.log("当前偶像的图片:", currentIdol.images);
    if (currentIdol) {
        description.innerHTML = `
            <p>年龄：${currentIdol.age}</p>
            <p>所在地：${currentIdol.location}</p>
            <p>${currentIdol.description}</p>
        `;
        
        // 清空预览图片容器
        previewImages.innerHTML = '';
        
        // 显示最多4张图片
        const imagesToShow = currentIdol.images.slice(0, 4);
        imagesToShow.forEach(image => {
            const img = document.createElement('img');
            img.src = image;
            img.width = 100;
            img.height = 100;
            img.style.objectFit = 'cover';
            img.style.margin = '5px';
            img.onclick = () => showOriginalImage(image);
            img.title = "点击查看原图";
            previewImages.appendChild(img);
        });
        
        // 如果图片超过4张，显示"查看更多"按钮
        if (currentIdol.images.length > 4) {
            viewMoreButton.style.display = 'block';
            viewMoreButton.onclick = showAllImages;
        } else {
            viewMoreButton.style.display = 'none';
        }
    } else {
        description.innerHTML = '<p>请选择一位偶像</p>';
        previewImages.innerHTML = '';
        viewMoreButton.style.display = 'none';
    }
}

// 显示原图的函数
function showOriginalImage(imageSrc) {
    const modal = document.createElement('div');
    modal.className = 'image-modal original-image-view';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <div class="original-image-container">
                <img src="${imageSrc}" alt="原图">
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.close');
    const closeModal = () => {
        document.body.removeChild(modal);
    };

    closeBtn.onclick = closeModal;
    modal.onclick = (event) => {
        if (event.target === modal) {
            closeModal();
        }
    };
}

function showAllImages() {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <div class="image-gallery"></div>
        </div>
    `;
    document.body.appendChild(modal);

    const gallery = modal.querySelector('.image-gallery');
    currentIdol.images.forEach(image => {
        const img = document.createElement('img');
        img.src = image;
        img.width = 200;
        img.height = 200;
        img.style.objectFit = 'cover';
        img.style.margin = '10px';
        img.onclick = () => showOriginalImage(image);
        img.title = "点击查看原图";
        gallery.appendChild(img);
    });

    const closeBtn = modal.querySelector('.close');
    const closeModal = () => {
        document.body.removeChild(modal);
    };

    closeBtn.onclick = closeModal;
    modal.onclick = (event) => {
        if (event.target === modal) {
            closeModal();
        }
    };
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

// 监听新弹幕
socket.on('new-danmaku', (data) => {
    // 按偶像ID缓存弹幕
    console.log("按偶像ID缓存弹幕", data, currentIdol.id)
    if (!danmakuCache[data.idolId]) {
        danmakuCache[data.idolId] = [];
    }
    danmakuCache[data.idolId].push(data);
    
    // 只渲染当前显示的弹幕
    if (currentIdol && data.idolId === currentIdol.id) {
        console.log("渲染当前显示的弹幕", data)
        appendSingleDanmaku(data);
    }
});

let danmakuSpeed = 6; // 初始速度 6 秒
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            username: username,
            password: password
        })
    })
    .then(response => {
        if (!response.ok) {
            // 添加详细的错误日志
            console.error('登录失败，状态码:', response.status);
            return response.text().then(text => { throw new Error(text) });
        }
        return response.json();
    })
    .then(data => {
        if (data.userId) {
            localStorage.setItem('currentUserId', data.userId.toString());
            checkLoginStatus();
            window.location.href = data.redirectUrl || '/';
        } else {
            alert(data.error || '登录失败');
        }
    })
    .catch(error => {
        console.error('登录请求失败:', error);
        let errorMsg = '';
        try {
            let errorObj = JSON.parse(error.message);
            errorMsg = errorObj.error;
        } catch (parseError) {
            console.error('解析 JSON 时出错:', parseError);
        }
        alert(errorMsg || '网络连接不稳定，请检查网络后重试',);
    });
}
function logout() {
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        localStorage.removeItem('currentUserId');
        checkLoginStatus();
        window.location.href = '/login.html';
    })
    .catch(error => {
        console.error('登出失败:', error);
        alert('登出失败，请重试');
    });
}

// 检查登录状态
function checkLoginStatus() {
    const userId = localStorage.getItem('currentUserId');
    const elements = {
        loginStatus: document.getElementById('login-status'),
        profileLink: document.getElementById('profile-link'),
        logoutButton: document.getElementById('logout-button'),
        registerLink: document.getElementById('register-link'),
        loginLink: document.getElementById('login-link')
    };

    // 添加元素存在性检查
    const updateElement = (element, prop, value) => {
        if (element) element[prop] = value;
    };

    if (userId) {
        updateElement(elements.loginStatus, 'textContent', '已登录');
        updateElement(elements.profileLink, 'style.display', 'inline');
        updateElement(elements.logoutButton, 'style.display', 'inline');
        updateElement(elements.registerLink, 'style.display', 'none');
        updateElement(elements.loginLink, 'style.display', 'none');
    } else {
        updateElement(elements.loginStatus, 'textContent', '未登录');
        updateElement(elements.profileLink, 'style.display', 'none');
        updateElement(elements.logoutButton, 'style.display', 'none');
        updateElement(elements.registerLink, 'style.display', 'inline');
        updateElement(elements.loginLink, 'style.display', 'inline');
    }
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
        const userId = localStorage.getItem('currentUserId'); // 新增用户ID获取

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

        // 统一调用修改密码函数
        submitPasswordChange(userId, oldPwd, newPwd, errorEl, closeModal);
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