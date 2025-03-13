// 连接后端服务器
const socket = io('http://localhost:3000');

// 偶像数据（示例）
const idols = [
    {
        id: 1,
        name: "星野爱",
        image: "images/1.jpg",
        description: "18岁｜东京出身｜擅长rap",
        profile: {
            phone: "iOS 15",
            age: 18,
            location: "东京"
        }
    },
    {
        id: 2,
        name: "白石琴乃",
        image: "images/2.jpg",
        description: "19岁｜大阪出身｜舞蹈天才",
        profile: {
            phone: "Android",
            age: 19,
            location: "大阪"
        }
    }
];

let currentIdol = null;

document.addEventListener('DOMContentLoaded', () => {
    // 初始化偶像列表
    renderIdolList();
    // 默认选中第一个偶像
    if (idols.length > 0) {
        selectIdol(idols[0]);
    }
});

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
    updateFanProfile();
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

// 更新粉丝画像
function updateFanProfile() {
    const profileContainer = document.getElementById('fan-profile-container');
    if (currentIdol) {
        profileContainer.innerHTML = `
            <div class="fan-badge">${currentIdol.profile.phone}</div>
            <div class="fan-badge">${currentIdol.profile.age}歳</div>
            <div class="fan-badge">${currentIdol.profile.location}</div>
        `;
    } else {
        profileContainer.innerHTML = '<p>未选择偶像</p>';
    }
}

// 发送弹幕
function sendDanmaku() {
    const input = document.getElementById('danmaku-input');
    const text = input.value.trim();
    if (text) {
        socket.emit('send-danmaku', text);
        input.value = '';
    }
}

// 添加弹幕
function addDanmaku(text) {
    const danmaku = document.createElement('div');
    danmaku.className = 'danmaku';
    danmaku.textContent = text;
    document.getElementById('danmaku-container').appendChild(danmaku);
}

// 监听新弹幕
socket.on('new-danmaku', (danmaku) => {
    addDanmaku(danmaku);
});