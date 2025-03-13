// script.js
const socket = io('http://localhost:3000');
// 偶像数据（示例）
const idols = [{
    id: 1,
    name: "星野爱",
    image: "images/1.jpg",
    description: "18岁｜东京出身｜擅长rap",
    profile: {
        phone: "iOS 15",
        age: 18,
        location: "东京"
    }
}, {
    id: 2,
    name: "白石琴乃",
    image: "images/2.jpg",
    description: "19岁｜大阪出身｜舞蹈天才",
    profile: {
        phone: "Android",
        age: 19,
        location: "大阪"
    }
}];
//获取cookie
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}
//设置cookie
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
let userId = getCookie('userId');
if (!userId) {
    userId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    setCookie('userId', userId, 365);
}
let locationChart, ageChart;
let locationChartCanvas, ageChartCanvas
document.addEventListener('DOMContentLoaded', () => {
    // 初始化偶像列表
    renderIdolList();
    // 默认选中第一个偶像
    if (idols.length > 0) {
        selectIdol(idols[0]);
    }
    // 用户信息
    const ageInput = document.getElementById('age-input');
    const userInfo = {
        device: navigator.userAgent,
        location: navigator.language,
        age: ageInput.value || 18 // 假设默认年龄
    };
    socket.emit('update-user-info', userInfo);
    locationChartCanvas = document.getElementById('location-chart').getContext('2d');
    ageChartCanvas = document.getElementById('age-chart').getContext('2d');
    document.getElementById('age-input').addEventListener('change', function() {
        const userInfo = {
            age: this.value
        };
        socket.emit('update-user-info', userInfo);
    });
});
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
    listContainer.innerHTML = ''; // 清空容器
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
    fetchFanProfile(idol.id); // 获取粉丝画像
    renderDanmaku()
}
// 更新偶像详细信息
function updateIdolInfo() {
    const description = document.getElementById('idol-description');
    if (currentIdol) {
        description.innerHTML = `
            <img src="${currentIdol.image}" width="200">
            <p>年龄：${currentIdol.profile.age}</p>
            <p>所在地：${currentIdol.profile.location}</p>
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
        });
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
        }); // 发送偶像ID
        input.value = '';
    }
}
// 添加弹幕
function addDanmaku(data) {
    const {
        text,
        idolId
    } = data;
    // 如果没有选择偶像或者弹幕属于当前偶像，则显示
    if (!currentIdol || idolId === currentIdol.id) {
        const danmaku = document.createElement('div');
        danmaku.className = 'danmaku';
        danmaku.textContent = text;
        document.getElementById('danmaku-container').appendChild(danmaku);
    }
}
// 监听新弹幕
socket.on('new-danmaku', (data) => {
    danmakuList.push(data) // 将弹幕放入list
    renderDanmaku()
});

function renderDanmaku() {
    const danmakuContainer = document.getElementById('danmaku-container');
    danmakuContainer.innerHTML = ''; // 清空容器
    danmakuList.forEach((item) => {
        const {
            text,
            idolId
        } = item;
        // 如果没有选择偶像或者弹幕属于当前偶像，则显示
        if (!currentIdol || idolId === currentIdol.id) {
            const danmaku = document.createElement('div');
            danmaku.className = 'danmaku';
            danmaku.textContent = text;
            danmakuContainer.appendChild(danmaku);
        }
    })
}