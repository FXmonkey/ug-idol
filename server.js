const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise'); // 引入 MySQL2
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const idolName = req.body.name;
        const uploadDir = path.join(__dirname, 'public', 'images', idolName);
        
        // 确保目录存在
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 生成文件名：时间戳-原始文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
    // 只接受图片文件
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('只能上传图片文件！'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 限制5MB
        files: 10 // 最多10个文件
    }
});
// const bcrypt = require('bcrypt'); // 引入 bcrypt  先注释掉
const app = express();
const server = http.createServer(app);
const cors = require('cors');
const session = require('express-session');
const io = socketIo(server, {
    cors: {
        origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true
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
// 在 initializeDatabase 中添加弹幕表
async function initializeDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('Connected to MySQL');
        // 创建偶像表（新增）
        await pool.query(`
            CREATE TABLE IF NOT EXISTS idols (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                gender ENUM('男','女') NOT NULL,
                group_name VARCHAR(255),
                image VARCHAR(255) NOT NULL,
                homepage VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Idols table created');
        // 创建 users 表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        // 创建密码表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS userpasswd (
                user_id INT PRIMARY KEY,
                password VARCHAR(255) NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Users table created (if not exist)');
        
        // 创建弹幕表（新增）
        await pool.query(`
            CREATE TABLE IF NOT EXISTS danmaku (
                id INT PRIMARY KEY AUTO_INCREMENT,
                text VARCHAR(255) NOT NULL,
                idol_id INT NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_idol_id (idol_id)
            )
        `);
        console.log('Danmaku table created');

        // 修改 fans 表结构
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fans (
                fans_id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                idol_id INT NOT NULL,
                area VARCHAR(255) DEFAULT 'UnKnown',
                age INT DEFAULT 18,
                create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (idol_id) REFERENCES idols(id)
            )
        `);
        console.log('Fans table created (if not exist)');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}
// 在启动服务器后初始化数据库
(async () => {
    await initializeDatabase();
})();
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // 开发环境用false，生产环境需要https
}));
// 配置跨域资源共享
app.use((req, res, next) => {
    const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin); // 动态设置来源
    }
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
app.use(cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "PUT"],
    credentials: true
}));
// 添加需要登录才能访问的路由保护
app.get('/profile.html', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        res.redirect('/login.html');
    } else {
        res.sendFile(__dirname + '/public/profile.html');
    }
});

// 静态文件中间件，不包括profile.html（已经由上面的路由处理）
app.use(express.static(__dirname + '/public'));
// 注册 API
app.post('/api/register', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { username, password } = req.body;
        
        // 创建用户（使用事务保证原子性）
        const [userResult] = await connection.query(
            'INSERT INTO users (username) VALUES (?)',
            [username]
        );
        
        // 插入密码
        await connection.query(
            'INSERT INTO userpasswd (user_id, password) VALUES (?, ?)',
            [userResult.insertId, password] // 后续需要替换为加密后的密码
        );
        
        await connection.commit();
        res.json({ message: '注册成功' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: '用户名已存在' });
        } else {
            res.status(500).json({ error: '注册失败' });
        }
    } finally {
        connection.release();
    }
});
// 登录 API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.query(`
            SELECT u.id, up.password 
            FROM users u
            JOIN userpasswd up ON u.id = up.user_id
            WHERE u.username = ?`, 
            [username]
        );
        
        if (!rows[0] || rows[0].password !== password) {
            return res.status(401).json({ 
                error: '用户名或密码错误',
                userId: null  // 明确返回null
            });
        }
        
        // 设置session
        req.session.userId = rows[0].id;
        
        res.json({ 
            message: '登录成功',
            userId: rows[0].id.toString(),  // 确保返回字符串
            redirectUrl: '/'
        });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ 
            error: '登录失败',
            userId: null  // 明确返回null
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

io.on('connection', (socket) => {
    // 移除session验证
    console.log('新用户连接');

    socket.on('send-danmaku', async (data) => {
        try {
            await pool.query(
                'INSERT INTO danmaku (text, idol_id, user_id) VALUES (?, ?, ?)',
                [data.text, data.idolId, data.userId] // 前端直接传递userId
            );
            const [user] = await pool.query('SELECT username FROM users WHERE id = ?', [data.userId]);
            io.emit('new-danmaku', { ...data, username: user[0].username });
        } catch (error) {
            console.error('弹幕存储失败:', error);
        }
    });
    socket.on('update-user-info', async (userInfo) => {
        try {
            const { username, email } = userInfo;
            await pool.query(
                `UPDATE users SET username = ?, email = ? WHERE id = ?`,
                [username, email, userId]
            );
            console.log(`用户 ${userId} 信息更新成功！`);
        } catch (error) {
            console.error('更新用户信息失败:', error);
        }
    });
    
    // 移动断开连接事件到这里
    socket.on('disconnect', () => {
        console.log('用户断开连接');
    });
});

// 获取偶像图片列表的函数
function getImagesFromFolder(folderPath) {
    if (!folderPath) {
        console.warn('图片文件夹路径未定义');
        return [];
    }
    const fullPath = path.join(__dirname, 'public', folderPath);
    try {
        if (fs.existsSync(fullPath)) {
            return fs.readdirSync(fullPath)
                .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
                .map(file => `/${folderPath}/${file}`);
        } else {
            console.warn(`文件夹不存在: ${fullPath}`);
        }
    } catch (error) {
        console.error('读取图片文件夹失败:', error);
    }
    return [];
}

// 获取偶像列表 API
app.get('/api/idols', async (req, res) => {
    try {
        const [idols] = await pool.query('SELECT * FROM idols');
        
        // 为每个偶像添加图片列表
        const idolsWithImages = idols.map(idol => {
            const images = idol.image ? getImagesFromFolder(idol.image) : [];
            return {
                ...idol,
                images: images,
                image: images[0] || '/images/default_avatar.png' // 设置默认图片
            };
        });
        
        res.json(idolsWithImages);
    } catch (error) {
        console.error('获取偶像列表失败:', error);
        res.status(500).json({
            error: '获取偶像列表失败'
        });
    }
});

// 添加一个用于检查数据库结构的路由
app.get('/api/check-db', async (req, res) => {
    try {
        const [rows] = await pool.query('DESCRIBE idols');
        res.json(rows);
    } catch (error) {
        console.error('检查数据库结构失败:', error);
        res.status(500).json({
            error: '检查数据库结构失败'
        });
    }
});

// 获取用户信息 API
app.get('/api/users/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const [users] = await pool.query('SELECT id, username, email, created_at FROM users WHERE id = ?', [userId]);
        
        if (users.length === 0) {
            return res.status(404).json({
                error: '用户不存在'
            });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({
            error: '获取用户信息失败'
        });
    }
});

// 添加偶像 API
app.post('/api/idols', upload.array('photos', 10), async (req, res) => {
    const { name, gender, group_name, homepage } = req.body;

    // 验证必填字段
    if (!name || !gender || !group_name || !homepage) {
        return res.status(400).json({
            error: '所有字段都是必填的'
        });
    }

    // 确保至少上传了一张图片
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            error: '请至少上传一张图片'
        });
    }

    try {
        // 图片文件夹路径（相对于public目录）
        const imagePath = `images/${name}`;

        // 插入偶像信息到数据库
        const [result] = await pool.query(
            'INSERT INTO idols (name, gender, group_name, image, homepage) VALUES (?, ?, ?, ?, ?)',
            [name, gender, group_name, imagePath, homepage]
        );

        res.status(201).json({
            message: '偶像添加成功',
            idolId: result.insertId,
            images: req.files.map(file => `/${imagePath}/${file.filename}`)
        });
    } catch (error) {
        // 如果数据库操作失败，删除已上传的文件
        if (req.files) {
            req.files.forEach(file => {
                fs.unlinkSync(file.path);
            });
        }
        
        console.error('添加偶像失败:', error);
        res.status(500).json({
            error: '添加偶像失败'
        });
    }
});

// 新增获取历史弹幕的API（添加到 server.js 路由部分）
// 修改获取弹幕的 API（约在 452 行附近）
app.get('/api/danmaku/:idolId', async (req, res) => {
    const idolId = req.params.idolId;
    const { startTime, endTime, keyword } = req.query;

    try {
        let query = `
            SELECT d.text, u.username, d.created_at 
            FROM danmaku d
            JOIN users u ON d.user_id = u.id
            WHERE d.idol_id = ?
        `;
        const queryParams = [idolId];

        if (startTime) {
            query += ' AND d.created_at >= ?';
            queryParams.push(new Date(startTime));
        }
        if (endTime) {
            query += ' AND d.created_at <= ?';
            queryParams.push(new Date(endTime));
        }
        if (keyword) {
            query += ' AND d.text LIKE ?';
            queryParams.push(`%${keyword}%`);
        }

        query += ' ORDER BY d.created_at DESC LIMIT 100';

        const [danmaku] = await pool.query(query, queryParams);
        res.json(danmaku);
    } catch (error) {
        console.error('获取弹幕失败:', error);
        res.status(500).json({ error: '获取弹幕失败' });
    }
});

// 获取粉丝画像 API
app.get('/api/idol/:idolId/fans/profile', async (req, res) => {
    const idolId = req.params.idolId;
    try {
        const [fans] = await pool.query(`
            SELECT location, age FROM fans 
            WHERE idol_id = ?`, [idolId]);        // 统计地域分布
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
        res.json({
            locationCounts,
            ageCounts,
            ranking: [3] // 暂时返回空数组
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
    const { oldPassword, newPassword, userId } = req.body;

    try {
        // 联合查询密码表
        const [rows] = await pool.query(`
            SELECT up.password 
            FROM userpasswd up
            WHERE up.user_id = ?
        `, [userId]);

        if (!rows[0] || rows[0].password !== oldPassword) {
            return res.status(400).json({ error: '旧密码不正确' });
        }

        await pool.query(`
            UPDATE userpasswd 
            SET password = ? 
            WHERE user_id = ?
        `, [newPassword, userId]);
        
        res.json({ message: '密码修改成功' });
    } catch (error) {
        console.error('密码修改失败:', error);
        res.status(500).json({ error: '密码修改失败' });
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, username, email, created_at 
            FROM users 
            WHERE id = ?
        `, [req.params.id]);
        
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ error: '获取用户信息失败' });
    }
});