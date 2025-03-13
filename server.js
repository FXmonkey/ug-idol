const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // 允许所有来源，生产环境请修改为你的域名
        methods: ["GET", "POST"]
    }
});

// 静态资源目录
app.use('/css', express.static(__dirname + '/public/css'));
app.use('/images', express.static(__dirname + '/public/images'));
app.use('/script.js', express.static(__dirname + '/public/script.js'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});
// 粉丝数据 (按偶像ID存储)
const idolFans = {};
// 获取用户唯一ID，建议用更可靠的方式生成（例如：根据session）
function generateUserId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
// 处理Socket连接
io.on('connection', (socket) => {
    console.log('用户连接成功！');
    // 为新用户生成ID
    const userId = generateUserId();
    socket.userId = userId; // 将用户ID附加到socket对象
    socket.favoriteIdol = null; // 初始喜欢的偶像为空
    // 接收弹幕
    socket.on('send-danmaku', (data) => {
        const { text, idolId } = data; // 接收偶像ID
        socket.favoriteIdol = idolId; // 更新喜欢的偶像
        //  初始化偶像的粉丝列表
        if (!idolFans[idolId]) {
            idolFans[idolId] = {};
        }
        if (!idolFans[idolId][userId]) {
            idolFans[idolId][userId] = {
                userId: userId,
                username: '匿名用户', // 默认昵称
                avatar: 'images/default_avatar.png', // 默认头像
                device: 'Unknown',
                location: 'Unknown',
                age: null,
                danmakuCount: 0,
                favoriteIdol: idolId
            };
        }
        // 更新粉丝数据
        idolFans[idolId][userId].danmakuCount++;
        // 广播给所有人,带上idolId
        io.emit('new-danmaku', { text: text, userId: socket.userId, idolId: idolId });
    });
    socket.on('update-user-info', (userInfo) => {
        // 初始化
        const idolId = socket.favoriteIdol || 'default';
        if (!idolFans[idolId]) {
            idolFans[idolId] = {};
        }
        if (!idolFans[idolId][userId]) {
            idolFans[idolId][userId] = {
                userId: userId,
                username: '匿名用户', // 默认昵称
                avatar: 'images/default_avatar.png', // 默认头像
                device: 'Unknown',
                location: 'Unknown',
                age: null,
                danmakuCount: 0,
                favoriteIdol: idolId
            };
        }
        idolFans[idolId][userId] = { ...idolFans[idolId][userId], ...userInfo };
    });
    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接');
        // 从所有偶像的粉丝列表中移除用户
        for (const idolId in idolFans) {
            delete idolFans[idolId][userId];
        }
    });
});
// API: 获取粉丝画像
app.get('/api/idol/:idolId/fans/profile', (req, res) => {
    const idolId = req.params.idolId;
    const fans = idolFans[idolId] ? Object.values(idolFans[idolId]) : [];
    // 统计地域分布
    const locationCounts = {};
    fans.forEach(fan => {
        const location = fan.location || '未知';
        locationCounts[location] = (locationCounts[location] || 0) + 1;
    });
    // 统计年龄分布
    const ageCounts = {};
    fans.forEach(fan => {
        const age = fan.age || '未知';
        ageCounts[age] = (ageCounts[age] || 0) + 1;
    });
    // 获取弹幕数量排名
    const ranking = fans.sort((a, b) => b.danmakuCount - a.danmakuCount).slice(0, 10);
    res.json({
        locationCounts: locationCounts,
        ageCounts: ageCounts,
        ranking: ranking
    });
});
// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});