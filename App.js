console.log(`wait run CatSummix For Desktop.....`)
const dgram = require('dgram');
const {childProcess, exec} = require('child_process');
const os = require("os");
const socket = dgram.createSocket('udp4');
const {app, dialog, Notification, Tray, Menu} = require('electron')
const path = require("path");
const fs = require("fs");
const crypto = require('crypto')
const iconv = require('iconv-lite')
const net = require("net");
const child_process = require("child_process");


const network = {
    //发送数据包
    async sendPacket(type, address, port, data) {
        const d = {
            t: type, time: Date.now(), d: data, data: data, derive: `${os.hostname()}(${os.type()})`
        }
        socket.send(Buffer.from(JSON.stringify(d), 'utf-8').toString('base64'), port, address)
    },
    startService() {
        //尝试绑定！3333 端口
        socket.bind(3333, "0.0.0.0", () => {
            console.log(`udp listener in ${socket.address().address}:${socket.address().port} ! start successfully!`)
            app.notify(undefined, `跨平台协同启动成功!`)
        })

        //当监听端口错误事触发的Event
        socket.on('error', (err) => {
            app.notify(`启动错误!`, `${err.message}`)
            //禁止重复启动应用
            process.exit(0)
        })
    }
}

const config = {
    configDir: path.join(os.userInfo().homedir, "CatSummix"),
    configFile: "",
    configJson: {
        dropFileSaveDir: "",
        drivers: {}
    },
    //读入配置文件
    loadConfig() {
        fs.readFile(this.configFile, (err, data) => {
            this.configJson = JSON.parse((data.toString('utf-8')))
        })
    },
    //保存配置文件
    saveConfig() {
        fs.rm(this.configFile, (err) => {
            if (!err) {
                fs.writeFile(this.configFile, JSON.stringify(this.configJson), (err) => {
                    if (err) {
                        console.error(err)
                    }
                })
            }
        })
    },
    //获取drop文件路径
    getDropFileDir() {
        //判断这个存储路径是不是空的
        if (this.configJson.dropFileSaveDir === undefined) {
            //如果是空的将设置路径，并且保存
            this.configJson.dropFileSaveDir = path.join(this.configDir, "DropFile")
            //保存配置
            this.saveConfig()
            return this.configJson.dropFileSaveDir
        } else return this.configJson.dropFileSaveDir
    },
    init() {
        this.configFile = path.join(this.configDir, "config.json")
        this.configJson.dropFileSaveDir = path.join(this.configDir, "DropFile")
        if (!fs.existsSync(this.configDir)) fs.mkdirSync(this.configDir)

        if (!fs.existsSync(this.configJson.dropFileSaveDir)) fs.mkdirSync(this.configJson.dropFileSaveDir)
        //判断文件是否存在
        if (!fs.existsSync(this.configFile)) {
            // 初始化配置文件
            fs.writeFile(this.configFile, JSON.stringify(this.configJson), (err) => {
                if (err) {
                    console.error(err)
                } else {
                    console.log("init config!!!!")
                    //读入配置文件
                    this.loadConfig()
                }
            })
        } else this.loadConfig()
    },
    openFolder(folderPath) {
        if (!folderPath) {
            console.error('Folder path is missing.');
            return;
        }

        switch (os.platform()) {
            case 'darwin': // macOS
                exec(`open "${folderPath}"`, this.onExecComplete);
                break;
            case 'win32': // Windows
                exec(`start "" "${folderPath}"`, this.onExecComplete);
                break;
            case 'linux': // Linux
                const desktopEnv = process.env.XDG_CURRENT_DESKTOP || '';
                switch (desktopEnv.toLowerCase()) {
                    case 'gnome':
                    case 'unity':
                        exec(`nautilus "${folderPath}"`, this.onExecComplete);
                        break;
                    case 'cinnamon':
                        exec(`nemo "${folderPath}"`, this.onExecComplete);
                        break;
                    case 'kde':
                        exec(`dolphin "${folderPath}"`, this.onExecComplete);
                        break;
                    default:
                        exec(`xdg-open "${folderPath}"`, this.onExecComplete);
                        break;
                }
                break;
            default:
                console.error('Unsupported platform:', os.platform());
                break;
        }
    },
    onExecComplete(error) {
        if (error) {
            console.error('Error opening folder:', error);
        } else {
            console.log('Folder opened successfully!');
        }
    }
}


const codeRc4 = {
    rc4Decrypt(key, data) {
        const decipher = crypto.createDecipheriv('rc4', key, '');
        let decrypted = decipher.update(data, 'binary', 'utf-8');
        decrypted += decipher.final('utf-8');
        return decrypted;
    },
    // Base64转换为Buffer
    base64ToBuffer(base64String) {
        return Buffer.from(base64String, 'base64');
    },

    // RC4解密方法
    decryptWithRC4(encryptedData, key) {
        const encryptedBuffer = this.base64ToBuffer(encryptedData);
        return this.rc4Decrypt(key, encryptedBuffer);
    }
}


//Init Block
//判断接收时间
let recTime
socket.on('message', (buffer, info) => {
    const data = Buffer.from(buffer.toString(), 'base64').toString('utf-8');
    let jsonData
    try {
        jsonData = JSON.parse(data);
    } catch (e) {
        console.log(`error data ${data}`)
        return;
    }

    //收到数据包
    console.log(`receive data ${data}`)

    let d //JsonData.d... 内数据
    //判断是否为加密数据
    if (jsonData.encode) {
        //解密数据

        //获取解密密钥
        const key = config.configJson.drivers[jsonData.derive]
        //设备key不存在将不处理
        if (key === undefined || key === null) return;
        //解密数据 获取解析出来的数据
        d = codeRc4.decryptWithRC4(jsonData.d, key)

    } else d = jsonData.d;

    //计算收到的数据包时间 与上次收到的数据包时间计算 相减取绝对值 判断是否小于 100Ms
    if (Math.abs(jsonData.time - recTime) <= 100) return;
    //记录本次接收的数据包时间
    recTime = jsonData.time
    let packetType = jsonData.t;
    switch (packetType) {
        //复制数据请求
        case 1: {
            let copyText = d
            //超链接表达式
            const regExp = new RegExp("^(?:(http|https|ftp):\\/\\/)?((?:[\\w-]+\\.)+[a-z0-9]+)((?:\\/[^/?#]*)+)?(\\?[^#]+)?(#.+)?$");
            //判断是否为链接
            if (regExp.test(copyText)) {
                app.notify(
                    `收到来自 ${jsonData.derive} 的链接`,
                    `点击打开?\nLink: ${copyText}`,
                    () => {
                        setTimeout(() => childProcess.exec(`start ${copyText}`))
                    });
            } else {
                exec("clip").stdin.end(iconv.encode(copyText, "gbk"));
            }
            break
        }
        //被扫描到了！
        case 3: {
            app.notify(
                `设备连接 (${jsonData.d.id})`,
                `请求与您配对，点击接受匹配!`,
                () => {
                    network.sendPacket(3, info.address, info.port, "Me!").then(() => console.log("send ok!"))
                }
            );
            break
        }
        //匹配完成，手机端已传输的密钥
        case 4: {
            config.configJson.drivers[jsonData.derive] = jsonData.d
            app.notify(`设备连接 (${jsonData.d.id})`, `手机端已同意，匹配成功!`)
            config.saveConfig()
            break
        }
        case 5: {
            //还原json格式数据
            dropFiles = JSON.parse(d)
            //清空缓存相关信息
            tempBuffer = []
            tempBufferSize = 0
            // console.log(dropFiles)
            /* network.sendPacket(5, info.address, info.port, {}).then(() => {
             })*/
            app.notify(`收到来自 ${jsonData.derive} 的个文件`, `文件名数量 ${dropFiles.count} 个\n大小 ${(dropFiles.size / 1024 / 1024).toFixed(2)} M\n点击接收`, () => {
                network.sendPacket(5, info.address, info.port, {}).then(() => {
                })
            })
            break
        }
        default: {
            console.log(`invalid packet id ${packetType} data: ${data}`)
        }
    }
})
let dropFiles = {}
let tempBuffer = []
let tempBufferSize = 0

const tcpServer = {
    tcp: net.createServer((e) => {
        e.on('data', (data) => {
            //判断是否处于上传文件状态
            if (dropFiles.size === undefined) return
            //汇总所有byte数据
            tempBuffer.push(data)
            //累加接收到的buffer数据大小
            tempBufferSize += data.length
            //打包为buffer
            // console.log(`${tempBufferSize}/${dropFiles.size}`)
            //判断是否接收完毕 原理为收到的bytes 是否与 传过来的json数据匹配
            if (tempBufferSize === dropFiles.size) {
                let bufferData = Buffer.concat(tempBuffer)
                //循环所有drop文件
                for (let file of dropFiles.files) {
                    //建立空文件
                    let writeStream = fs.createWriteStream(path.join(config.getDropFileDir(), file.name));
                    //写出数据
                    writeStream.write(bufferData.slice(0, file.size))
                    //关闭文件流
                    writeStream.close()
                    //从原bytes里删除这段byte数据
                    bufferData = Buffer.concat([bufferData.slice(0, 0), bufferData.slice(file.size)])
                }
                //清空记录
                dropFiles = {}
                tempBufferSize = 0
                config.openFolder(config.getDropFileDir())
            }
        })
        e.on('error', (e) => {
            console.error(e)
            app.notify(undefined, `文件接收失败\n${e}`)
        })
    }),
    start() {
        this.tcp.listen(3333, () => {
            console.log(`tcp listener in ${this.tcp.address().address}${this.tcp.address().port} ! start successfully!`)
        })
    }
}

app.on('ready', () => {
    //给app加通知方法
    app.notify = function notify(title = "兮兮互联", message, callback = () => {
    }) {
        const notification = new Notification({
            title: title, body: message, icon: path.join(__dirname, "application.ico")
        });
        notification.on('click', (e) => callback(e))
        notification.show()
    }

    //设置应用包名
    app.setAppUserModelId('cc.mcyx.catsummix')


    //设置menu
    function setTrayMenu() {
        //设置托盘图标
        const tray = new Tray(path.join(__dirname, "application.ico"));
        tray.setContextMenu(Menu.buildFromTemplate([{
            label: '关于', type: 'normal', click: () => {
                dialog.showMessageBoxSync({
                    title: "关于项目",
                    message: `这是一个 Node.js 平台 Electron框架搭建的项目\n目前已配对 ${Object.keys(config.configJson.drivers).length} 个设备`,
                    type: 'question',
                    icon: path.join(__dirname, "application.ico")
                })
            }
        }, {
            label: '打开配置文件', type: 'normal', click: () => {
                child_process.exec(config.configFile)
            }
        }
            , {
                label: '重载配置', type: 'normal', click: () => {
                    config.loadConfig()
                    app.notify(undefined, `重载成功! 已配对设备数 ${Object.keys(config.configJson.drivers).length} 个`)
                }
            }, {
                label: '重置匹配设备', type: 'normal', click: () => {
                    config.configJson = {
                        drivers: {}
                    }
                    config.saveConfig()
                    app.notify(undefined, `重置成功!已清除所有已匹配设备`)
                }
            }, {
                label: `设置自启动服务`, type: 'normal', click: () => {
                    const loginItemSettings = app.getLoginItemSettings();
                    //设置开机自启
                    app.setLoginItemSettings({
                        openAtLogin: !loginItemSettings.openAtLogin,
                        openAsHidden: false,
                        path: process.execPath,
                        args: []
                    })
                    app.notify(undefined, loginItemSettings.openAtLogin ? '已安装开机自启服务' : '已卸载开启自启服务')
                }
            }, {
                label: '退出', type: 'normal', click: () => {
                    app.notify(undefined, "程序已关闭!")
                    //销毁托盘
                    tray.destroy()
                    //结束进程
                    process.exit(0)
                }
            }]))
        tray.on('double-click', () => app.notify("兮兮 IKUN", "你干嘛哎呀...别摸我脑袋!!!"))
        //设置托盘标题
        tray.setToolTip("CatSummix")
    }

    //设置托盘图标
    setTrayMenu()
    //启动服务 Udp
    network.startService()
    //启动服务 Tcp
    tcpServer.start()
    //初始化配置项
    config.init()

})