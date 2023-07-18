console.log(`wait run CatSummix For Desktop.....`)
const dgram = require('dgram');
const childProcess = require('child_process');
const cp = require('copy-paste');
const os = require("os");
const socket = dgram.createSocket('udp4');
const {app, dialog, Notification, Tray, Menu} = require('electron')
const path = require("path");
const fs = require("fs");
const crypto = require('crypto')


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
        socket.bind(listenerPort, "0.0.0.0", () => {
            console.log(`listener in ${socket.address().address}:${socket.address().port} ! start successfully!`)
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
    init() {
        this.configFile = path.join(this.configDir, "config.json")
        //判断文件是否存在
        if (!fs.existsSync(this.configFile)) {
            //文件不存在，创建文件
            const initConfig = {
                drivers: {}
            }
            // 初始化配置文件
            fs.writeFile(this.configFile, JSON.stringify(initConfig), (err) => {
                if (err) {
                    console.error(err)
                } else {
                    console.log("init config!!!!")
                    //读入配置文件
                    this.loadConfig()
                }
            })
        } else this.loadConfig()
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

//监听端口
const listenerPort = 3333
//判断接收时间
let recTime

socket.on('message', (buffer, info) => {
    const data = Buffer.from(buffer.toString(), 'base64').toString('utf-8');
    const jsonData = JSON.parse(data);
    jsonData.phone = undefined;
    //收到数据包
    console.log(`receive data ${data}`)
    //计算收到的数据包时间 与上次收到的数据包时间计算 相减取绝对值 判断是否小于 100Ms
    if (Math.abs(jsonData.time - recTime) <= 100) {
        return;
    }
    //记录本次接收的数据包时间
    recTime = jsonData.time
    let packetType = jsonData.t;
    switch (packetType) {
        //复制数据请求
        case 1: {
            //获取解密密钥
            const key = config.configJson.drivers[jsonData.derive]

            //设备key不存在将不处理
            if (key === undefined || key === null) return;
            //解密数据 获取解析出来的数据
            const copyText = codeRc4.decryptWithRC4(jsonData.d, key)
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
                cp.copy(copyText)
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
        default: {
            console.log(`invalid packet id ${packetType} data: ${data}`)
        }
    }
})

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
                childProcess.exec(config.configFile)
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
    //启动服务
    network.startService()
    //初始化配置项
    config.init()

})

