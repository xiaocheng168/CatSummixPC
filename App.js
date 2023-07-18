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
            const key = configJson.drivers[jsonData.derive]
            //解密数据 获取解析出来的数据
            const copyText = decryptWithRC4(jsonData.d, key)
            //超链接表达式
            const regExp = new RegExp("^(?:(http|https|ftp):\\/\\/)?((?:[\\w-]+\\.)+[a-z0-9]+)((?:\\/[^/?#]*)+)?(\\?[^#]+)?(#.+)?$");
            //判断是否为链接
            if (regExp.test(copyText)) {
                const not = new Notification({
                    title: `收到来自 ${jsonData.derive} 的链接`,
                    body: `点击打开?\nLink: ${copyText}`,
                    icon: path.join(__dirname, "application.ico")
                });
                not.on('click', () => {
                    setTimeout(() => {
                        childProcess.exec(`start ${copyText}`)
                    }, 0)
                })
                not.show()
            } else {
                cp.copy(copyText)
            }
            break
        }
        //被扫描到了！
        case 3: {
            const not = new Notification({
                title: `设备连接 (${jsonData.d.id})`,
                body: `请求与您配对，点击接受匹配!`,
                icon: path.join(__dirname, "application.ico")
            });
            not.on('click', () => {
                sendPacket(3, info.address, info.port, "Me!").then(r => {
                    console.log("send ok!")
                })
            })
            not.show()
            break
        }
        case 4: {
            configJson.drivers[jsonData.derive] = jsonData.d
            new Notification({
                title: `设备连接 (${jsonData.d.id})`,
                body: `手机端已同意，匹配成功!`,
                icon: path.join(__dirname, "application.ico")
            }).show()

            console.log(configJson)

            saveConfig()
            break
        }
        default: {
            console.log(`invalid packet id ${packetType} data: ${data}`)
        }
    }
})

//发送数据包
async function sendPacket(type, address, port, data) {
    const d = {
        t: type, time: Date.now(), d: data, data: data, derive: `${os.hostname()}(${os.type()})`
    }
    socket.send(Buffer.from(JSON.stringify(d), 'utf-8').toString('base64'), port, address)
}

app.on('ready', () => {
    //设置应用包名
    app.setAppUserModelId('cc.mcyx.catsummix')
    //尝试绑定！3333 端口
    socket.bind(listenerPort, "0.0.0.0", (err) => {
        console.log(`Bind ${listenerPort} Successfully`)
        new Notification({
            title: `兮兮`, body: `跨平台协同启动成功!`, icon: path.join(__dirname, "application.ico")
        }).show()


        //设置托盘图标
        const tray = new Tray(path.join(__dirname, "application.ico"));

        //设置menu
        function setTrayMenu() {
            tray.setContextMenu(Menu.buildFromTemplate([{
                label: '关于', type: 'normal', click: () => {
                    dialog.showMessageBoxSync({
                        title: "关于项目",
                        message: "这是一个 Node.js 平台 Electron框架搭建的项目",
                        type: 'question',
                        icon: path.join(__dirname, "application.ico")
                    })
                }
            }, {
                label: `设置自启动服务`, type: 'normal', click: (e) => {
                    const loginItemSettings = app.getLoginItemSettings();
                    //设置开机自启
                    app.setLoginItemSettings({
                        openAtLogin: !loginItemSettings.openAtLogin,
                        openAsHidden: false,
                        path: process.execPath,
                        args: []
                    })
                    notification(undefined, loginItemSettings.openAtLogin ? '已安装开机自启服务' : '已卸载开启自启服务')
                }
            }, {
                label: '退出', type: 'normal', click: () => {
                    notification(undefined, "程序已关闭!")
                    //销毁托盘
                    tray.destroy()
                    //结束进程
                    process.exit(0)
                }
            }]))
        }

        //设置托盘图标
        setTrayMenu()
        //设置托盘标题
        tray.setToolTip("CatSummix")
    })

    //当监听端口错误事触发的Event
    socket.on('error', (err) => {
        new Notification({
            title: `启动错误!`, body: `${err.message}`, icon: path.join(__dirname, "application.ico")
        }).show()
        //禁止重复启动应用
        process.exit(0)
    })
})


const configDir = path.join(os.userInfo().homedir, "CatSummix")
const configFile = path.join(configDir, "config.json")

let configJson = {
    drivers: {}
};
//判断文件是否存在
if (!fs.existsSync(configFile)) {
    //文件不存在，创建文件
    const initConfig = {
        drivers: {}
    }
    // 初始化配置文件
    fs.writeFile(configFile, JSON.stringify(initConfig), (err) => {
        if (err) {
            console.error(err)
        } else {
            console.log("init config!!!!")
            //读入配置文件
            loadConfig()
        }
    })
} else loadConfig()


//读入配置文件
function loadConfig() {
    fs.readFile(configFile, (err, data) => {
        configJson = JSON.parse((data.toString('utf-8')))
    })
}

//保存配置文件
function saveConfig() {
    fs.rm(configFile, (err) => {
        if (!err) {
            fs.writeFile(configFile, JSON.stringify(configJson), (err) => {
                if (err) {
                    console.error(err)
                }
            })
        }
    })
}

function notification(title = "兮兮互联", message, callback) {
    const notification = new Notification({
        title: title, body: message, icon: path.join(__dirname, "application.ico")
    });
    notification.on('click', (e) => callback(e))
    notification.show()
}

//RC4解密模块

// RC4解密函数
function rc4Decrypt(key, data) {
    const decipher = crypto.createDecipheriv('rc4', key, '');
    let decrypted = decipher.update(data, 'binary', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

// Base64转换为Buffer
function base64ToBuffer(base64String) {
    return Buffer.from(base64String, 'base64');
}


// RC4解密方法
function decryptWithRC4(encryptedData, key) {
    const encryptedBuffer = base64ToBuffer(encryptedData);
    return rc4Decrypt(key, encryptedBuffer);
}