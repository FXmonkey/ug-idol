const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静态资源目录
app.use('/css', express.static(__dirname + '/public/css'));
app.use('/images', express.static(__dirname + '/public/images'));
app.use('/script.js', express.static(__dirname + '/public/script.js'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// 处理Socket连接
io.on('connection', (socket) => {
    console.log('用户连接成功！');

    // 接收弹幕
    socket.on('send-danmaku', (text) => {
        // 广播给所有人
        io.emit('new-danmaku', text);
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接');
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});