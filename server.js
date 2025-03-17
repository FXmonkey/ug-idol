const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise'); // 引入 MySQL2
// const bcrypt = require('bcrypt'); // 引入 bcrypt  先注释掉
const app = express();
const session = require('express-session'); // 引入 express-session
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // 允许所有来源，生产环境请修改为你的域名
        methods: ["GET", "POST"],
        credentials: true // 允许发送 cookie
    }
});
// MySQL 连接配置
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: 'zcw19980710', // 替换为你的 MySQL 密码
    database: 'idol_msg'
};
let pool;
async function initializeDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('Connected to MySQL');
        // 创建 users 表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('Users table created (if not exist)');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}
// 在启动服务器后初始化数据库
(async () => {
    await initializeDatabase();
})();
// 配置 session
app.use(session({
    secret: 'your secret key', // 用于加密 session ID 的密钥
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // 如果使用 HTTPS，则设置为 true
        maxAge: 60 * 60 * 1000 // Session 过期时间，单位毫秒
    }
}));
// 配置跨域资源共享
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000'); // 允许的来源
    res.header('Access-Control-Allow-Credentials', 'true'); // 允许携带 cookie
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
// 解析 JSON 请求体
app.use(express.json());
// 静态资源目录
app.use('/css', express.static(__dirname + '/public/css'));
app.use('/images', express.static(__dirname + '/public/images'));
app.use('/script.js', express.static(__dirname + '/public/script.js'));
// 检查登录状态的中间件
const checkLoginMiddleware = (req, res, next) => {
    if (req.path.startsWith('/login.html') || req.path.startsWith('/register.html') || req.path.startsWith('/api/')) {
        // 如果请求的是登录页面或注册页面或api请求，则跳过重定向
        next();
    } else if (req.session.userId) {
        // 用户已登录，继续访问
        next();
    } else {
        // 用户未登录，重定向到登录页面
        res.redirect('/login.html');
    }
};
// 应用于需要登录才能访问的路由
app.use(checkLoginMiddleware);
app.use(express.static(__dirname + '/public'));
// 注册 API
app.post('/api/register', async (req, res) => {
    const {
        username,
        password
    } = req.body;
    try {
        // 检查用户名是否已存在
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            return res.status(400).json({
                error: '用户名已存在'
            });
        }
        // 加密密码 先注释掉
        // const hashedPassword = await bcrypt.hash(password, 10);
        // 创建用户
        await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
        console.log(`用户 ${username} 注册成功`);
        res.json({
            message: '注册成功'
        });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({
            error: '注册失败'
        });
    }
});
// 登录 API
app.post('/api/login', async (req, res) => {
    const {
        username,
        password
    } = req.body;
    try {
        // 查找用户
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];
        if (!user) {
            return res.status(400).json({
                error: '用户名或密码错误'
            });
        }
        // 验证密码 先注释掉
        // const passwordMatch = await bcrypt.compare(password, user.password);
        // if (!passwordMatch) {
        //     return res.status(400).json({
        //         error: '用户名或密码错误'
        //     });
        // }
        if (password !== user.password) {
            return res.status(400).json({
                error: '用户名或密码错误'
            });
        }
        // 设置 session
        req.session.userId = user.id;
        console.log(`用户 ${username} 登录成功`);
        res.json({
            message: '登录成功'
        });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({
            error: '登录失败'
        });
    }
});
// 登出 API
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('登出失败:', err);
            return res.status(500).json({
                error: '登出失败'
            });
        }
        console.log('用户登出成功');
        res.json({
            message: '登出成功'
        });
    });
});
// 检查登录状态 API
app.get('/api/checkLogin', (req, res) => {
    if (req.session.userId) {
        res.json({
            isLogin: true
        });
    } else {
        res.json({
            isLogin: false
        });
    }
});
// 获取用户唯一ID，建议用更可靠的方式生成（例如：根据session）
function generateUserId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
// 处理Socket连接
io.on('connection', async (socket) => {
    console.log('用户连接成功！');
    // 为新用户生成ID
    // const userId = generateUserId();
    let userId;
    if (socket.handshake.headers.cookie) {
        const cookies = socket.handshake.headers.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'userId') {
                userId = value;
                break;
            }
        }
    }
    // const userId = "dw3y14npwpk2rzdci21kw4";
    // console.log(`获取到的userId = ${userId}`);
    if (!userId) {
        userId = generateUserId();
        socket.emit('setUserId', userId); // 通过socket发送给前端
    }
    socket.userId = userId; // 将用户ID附加到socket对象
    socket.favoriteIdol = null; // 初始喜欢的偶像为空
    try {
        // 查找用户
        console.log(`查询用户 ${userId}`);
        const [rows] = await pool.query('SELECT * FROM fans WHERE userId = ?', [userId]);
        let fan = rows[0];
        if (!fan) {
            // 创建用户
            await pool.query(`
                INSERT INTO fans (userId, username, avatar, device, location, age)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, '匿名用户', 'images/default_avatar.png', 'Unknown', 'Unknown', null]);
            // console.log(`用户 ${userId} 创建成功！`);
        }
    } catch (error) {
        console.error('创建用户失败:', error);
    }
    // 接收弹幕
    socket.on('send-danmaku', async (data) => {
        const {
            text,
            idolId
        } = data; // 接收偶像ID
        socket.favoriteIdol = idolId; // 更新喜欢的偶像
        try {
            // 更新粉丝弹幕数量和喜欢的偶像
            await pool.query('UPDATE fans SET danmakuCount = danmakuCount + 1, favoriteIdol = ? WHERE userId = ?', [idolId, userId]);
            // 广播给所有人,带上idolId
            io.emit('new-danmaku', {
                text: text,
                userId: socket.userId,
                idolId: idolId
            });
        } catch (error) {
            console.error('发送弹幕失败:', error);
        }
    });
    // 更新用户信息
    socket.on('update-user-info', async (userInfo) => {
        try {
            const {
                username,
                avatar,
                device,
                location,
                age
            } = userInfo;
            await pool.query(`
                UPDATE fans
                SET username = ?, avatar = ?, device = ?, location = ?, age = ?
                WHERE userId = ?
            `, [username, avatar, device, location, age, userId]);
            console.log(`用户 ${userId} 信息更新成功！`);
        } catch (error) {
            console.error('更新用户信息失败:', error);
        }
    });
    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接');
    });
});
// 获取偶像列表 API
app.get('/api/idols', async (req, res) => {
    try {
        const [idols] = await pool.query('SELECT * FROM idols');
        res.json(idols); // 返回偶像数据
    } catch (error) {
        console.error('获取偶像列表失败:', error);
        res.status(500).json({
            error: '获取偶像列表失败'
        });
    }
});
// 获取粉丝画像 API
app.get('/api/idol/:idolId/fans/profile', async (req, res) => {
    const idolId = req.params.idolId;
    try {
        const [fans] = await pool.query('SELECT * FROM fans WHERE favoriteIdol = ?', [idolId]);
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
        const ranking = [...fans].sort((a, b) => b.danmakuCount - a.danmakuCount).slice(0, 10);
        res.json({
            locationCounts: locationCounts,
            ageCounts: ageCounts,
            ranking: ranking
        });
    } catch (error) {
        console.error('获取粉丝画像失败:', error);
        res.status(500).json({
            error: '获取粉丝画像失败'
        });
    }
});
// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});
// 新增修改密码API
app.put('/api/change-password', async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.session.userId;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = rows[0];
        
        if (!user || user.password !== oldPassword) {
            return res.status(400).json({ error: '旧密码不正确' });
        }

        await pool.query('UPDATE users SET password = ? WHERE id = ?', [newPassword, userId]);
        res.json({ message: '密码修改成功' });
    } catch (error) {
        console.error('密码修改失败:', error);
        res.status(500).json({ error: '密码修改失败' });
    }
});