"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const os = require("os");
const path = require("path");
const exec = require("execa");
const util = require("util");
const sncp = require("ncp");
const cache = require("@actions/cache");
const DevTool_1 = require("./DevTool");
const email_1 = require("../util/email");
const exist_1 = require("../util/exist");
const idle_1 = require("../util/idle");
const readdir = util.promisify(fs.readdir);
const rename = util.promisify(fs.rename);
const ncp = util.promisify(sncp);
async function sendLoginCode(qrcode) {
    await exist_1.default(qrcode);
    const workflow = process.env.GITHUB_WORKFLOW;
    const actor = process.env.GITHUB_ACTOR;
    const repository = process.env.GITHUB_REPOSITORY;
    const sha = process.env.GITHUB_SHA;
    await email_1.default({
        subject: `[${repository}] Login Request: ${workflow}`,
        html: `<p>Author: ${actor}</p><p>Commit: ${sha}</p><p><img src="cid:login-qrcode" /></p>`,
        attachments: [
            {
                filename: 'login-qrcode.png',
                path: qrcode,
                cid: 'login-qrcode',
            },
        ],
    });
}
class Launcher {
    constructor() {
        const dev = DevTool_1.devToolMap[os.platform()];
        if (!dev) {
            throw new Error('Failed to locate CLI of WeChat Developer Tools.');
        }
        this.tool = dev;
    }
    async prepare() {
        if (!fs.existsSync(this.tool.installDir)) {
            throw new Error(`Install location is not found at ${this.tool.installDir}`);
        }
        const guiApp = path.join(this.tool.installDir, this.tool.gui);
        if (!fs.existsSync(guiApp)) {
            throw new Error(`GUI app is not found at ${guiApp}`);
        }
        const restored = await this.restoreUserData();
        if (restored) {
            await this.allowCli();
        }
        else {
            const cmd = os.platform() === 'win32' ? this.tool.gui : `./${this.tool.gui}`;
            await Promise.all([
                exec(cmd, ['--disable-gpu', '--enable-service-port'], {
                    cwd: this.tool.installDir,
                    shell: true,
                    stdio: 'inherit',
                }),
                this.allowCli(),
            ]);
        }
    }
    async login() {
        const loginQrCode = path.join(os.tmpdir(), 'login-qrcode.png');
        await Promise.all([
            this.cli('login', '-f', 'image', '-o', loginQrCode),
            sendLoginCode(loginQrCode),
        ]);
        await this.cli('quit');
        await idle_1.default(os.platform() === 'win32' ? 10000 : 3000);
        await this.saveUserData();
    }
    cli(...args) {
        return exec(this.getCommand(), args, {
            cwd: this.tool.installDir,
            shell: true,
            stdio: 'inherit',
        });
    }
    getCommand() {
        return os.platform() === 'win32' ? this.tool.cli : `./${this.tool.cli}`;
    }
    async allowCli() {
        const toolDir = path.join(os.homedir(), this.tool.dataDir);
        await exist_1.default(toolDir);
        const userDataDir = os.platform() === 'win32' ? path.join(toolDir, 'User Data') : toolDir;
        await exist_1.default(userDataDir);
        const userDirs = await readdir(userDataDir);
        let found = false;
        for (const userDir of userDirs) {
            if (userDir.length !== 32 || userDir.startsWith('.')) {
                continue;
            }
            found = true;
            const markFiles = ['.ide', '.ide-status'];
            await Promise.all(markFiles.map((markFile) => exist_1.default(path.join(userDataDir, userDir, 'Default', markFile))));
        }
        if (!found) {
            throw new Error('No user data directory is found.');
        }
    }
    async isAnonymous() {
        const str = await exec(this.getCommand(), [
            'cloud', 'functions', 'list',
            '--env', 'test-123',
            '--appid', 'wx1111111111111',
        ], {
            cwd: this.tool.installDir,
            shell: true,
        });
        return str.stdout.includes('Login is required');
    }
    async saveUserData() {
        await ncp(this.getDataDir(), 'UserData');
        await cache.saveCache(['UserData'], `wechat-devtools-${os.platform()}`);
    }
    async restoreUserData() {
        const cacheKey = await cache.restoreCache(['UserData'], `wechat-devtools-${os.platform()}`);
        if (cacheKey && fs.existsSync('UserData')) {
            await rename('UserData', this.getDataDir());
            return true;
        }
        return false;
    }
    getDataDir() {
        return path.join(os.homedir(), this.tool.dataDir);
    }
}
exports.default = Launcher;
