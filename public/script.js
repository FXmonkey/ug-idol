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
// let userId = getCookie('userId'); //  不需要了
// const userId = "dw3y14npwpk2rzdci21kw4"; //  不能写死
// if (!userId) {  //不需要了
//     // userId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
//     // setCookie('userId', userId, 365);
//     console.log(`当前没有userId`);
// }
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
    document.querySelector('.avatar-wrapper').addEventListener('click', function() {
        document.querySelector('.dropdown-content').style.display = 'block';
    });
});
// 监听来自服务器的 setUserId 事件
// socket.on('setUserId', (newUserId) => {  //不需要了
//     console.log(`来自后端新的newUserId = ${newUserId}`);
//     userId = newUserId;
//     setCookie('userId', userId, 365);
// });
// 获取偶像列表
function fetchIdols() {
    fetch('/api/idols')
        .then(response => response.json())
        .then(data => {
            idols = data;
            renderIdolList();
            if (idols.length > 0) {
                selectIdol(idols[0]);
            }
        })
        .catch(error => console.error('获取偶像列表失败:', error));
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
function renderIdolList() {
    const listContainer = document.getElementById('idol-list-container');
    listContainer.innerHTML = '';
    idols.forEach(idol => {
        const item = document.createElement('div');
        item.className = 'idol-item';
        item.textContent = idol.name;
        item.onclick = () => selectIdol(idol);
        listContainer.appendChild(item);
    });
}
// 选中偶像
function selectIdol(idol) {
    currentIdol = idol;
    updateIdolInfo();
    fetchFanProfile(idol.id);
    renderDanmaku();
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
// 发送弹幕
function sendDanmaku() {
    const input = document.getElementById('danmaku-input');
    const text = input.value.trim();
    if (text) {
        socket.emit('send-danmaku', {
            text: text,
            idolId: currentIdol ? currentIdol.id : null
        });
        input.value = '';
    }
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
    danmakuList.push(data);
    renderDanmaku();
});

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
// 登出函数
function logout() {
    fetch('/api/logout', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            // 登出成功后更新页面状态
            checkLoginStatus();
        })
        .catch(error => console.error('登出失败:', error));
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