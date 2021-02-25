const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
const axios = require('axios');

/**
 * 判断文件目录是否存在
 * @param pathname
 * @returns {boolean}
 */
function existsDir(pathname) {
	if (fs.existsSync(pathname)) {
		// 存在文件
		return true;
	} else if (!fs.existsSync(pathname)) {
		let dir = path.dirname(pathname);
		if (path.extname(pathname).length > 0 && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
			return true;
		} else {
			return false;
		}
	}
}

/**
 * 迭代生成文件目录
 * @param pathname
 */
function makeDirs(pathname) {
	if (existsDir(pathname)) {
		return;
	} else if (existsDir(path.dirname(pathname)) && path.extname(pathname).length <= 0) {
		fs.mkdirSync(pathname);
	} else {
		makeDirs(path.dirname(pathname));
		path.extname(pathname).length <= 0 && fs.mkdirSync(pathname);
	}
}

module.exports = class AliOSS {
	constructor(options = {}) {
		const DEFAULT = {
			oss: null,
			customFolder: '' // 自定义目录，默认在根目录
		};
		this.options = Object.assign({}, DEFAULT, options);

		const ossConfig = this.options.oss;
		if (!ossConfig && (!ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket)) {
			throw Error('请传入oss配置参数');
		}
		this.client = new OSS(ossConfig);
	}

	/**
	 * @function batchPutStream 批量上传文件到oss
	 * @param {Array} files
	 * [{
	 *  path: 要上传的文件路径,
	 *  filename: 要上传的文件名称，如果需要区分目录格式用/分割开，如: filedir/filename
	 * }]
	 * @param {String|undefined} replacePath 要剔除的路径，便于在oss上存储
	 */
	batchPutStream(files, replacePath = '') {
		const batchArr = [];
		if (replacePath && replacePath.lastIndexOf('/') > -1) {
			replacePath += '/';
		}
		files.forEach(item => {
			let filename = item.filename;
			if (replacePath) {
				filename = item.path.replace(replacePath, '');
			}

			let saveTo = `${this.options.customFolder}/${filename}`;

			console.log('save file to ', saveTo);
			batchArr.push(this.putStream(item.path, saveTo));
		});

		return Promise.all(batchArr);
	}

	/**
	 * @function readFileList 读取文件列表
	 *
	 * @param {String} path 要读取的文件路径
	 */
	readFileList(path) {
		let filesList = [];
		let files = fs.readdirSync(path);
		files.forEach(filename => {
			const filepath = path + '/' + filename;
			let stat = fs.statSync(filepath);
			if (stat.isDirectory()) {
				filesList = filesList.concat(this.readFileList(filepath));
			} else {
				let obj = {};
				obj.path = filepath;
				obj.filename = filename;
				filesList.push(obj);
			}
		});
		return filesList;
	}

	/**
	 *
	 * @param {String} filepath
	 * @param {String} filename
	 */
	putStream(filepath, filename) {
		let result;
		try {
			console.log(filepath, filename)
			const stream = fs.createReadStream(filepath);
			let size = fs.statSync(filepath).size;
			result = this.client.putStream(filename, stream, {
				contentLength: size
			});
		} catch (err) {
			console.error(err);
			result = err;
		}
		return result;
	}

	/**
	 * 上传 buffer 内容
	 * @param name  oss 对象(bucket)相对目录地址
	 * @param buffer
	 * @returns {*}
	 */
	async putBuffer(name, buffer) {
		if (!name || !buffer) {
			throw new Error('upload param error!');
		}

		if (buffer instanceof Buffer) {
			try {
				const result = await this.client.put(name, buffer);
				return result;
			} catch (err) {
				console.error(err);
				return err;
			}
		}
	}

	/**
	 * 直接上传字符串
	 * @param name  oss 对象(bucket)相对目录地址
	 * @param str
	 * @returns {*}
	 */
	async putString(name, str) {
		return await this.putBuffer(name, Buffer.from(str));
	}

	/**
	 * 删除文件对象
	 * @param name 文件对象名称 eg. 'ismanhua_prev/static/style/index.css'
	 * @returns {Promise<void>}
	 */
	async deleteObj(name) {
		try {
			console.log(`delete ${name} starting...`);
			let result = await this.client.delete(name);
			console.log(`delete ${name} finished`);
			return result;
		} catch (err) {
			console.error(err);
		}
	}

	/**
	 * 获取远程地址url 路径
	 * @param relativePath 文档相对路径
	 * @returns {string}
	 */
	getRemotePath(relativePath) {
		let opt = this.options;
		let domain = opt.oss.accessDomain;
		let folder = opt.oss.customFolder;
		return `${domain}/${folder}${relativePath}`;
	}

	/**
	 * 获取远程域名目录地址
	 * @returns {string}
	 */
	getDomain() {
		let opt = this.options;
		let domain = opt.oss.accessDomain;
		let folder = opt.oss.customFolder;
		return `${domain}/${folder}`;
	}


	/**
	 * 下载内容到指定文件
	 * @param osObj
	 * @param pathname
	 */
	downFileTo(osObj, pathname) {
		console.log(`file ${osObj.name} save to ${pathname}`);
		return axios.get(osObj.url).then(res => {
			if (res.status === 200) {
				if (!fs.existsSync(pathname) && !existsDir(pathname)) {
					makeDirs(pathname);
				}
				fs.writeFile(pathname, res.data, { encoding: 'utf-8' }, function(err) {
					if (err) {
						console.error(err);
					}
				});
			}
		}).catch(e => {
			console.error(e);
		});
	}


	downFile(osObj) {
		return axios.get(osObj.url).then(res => {
			if (res.status === 200) {
				osObj.content = res.data;
				return osObj;
			} else {
				return null;
			}
		}).catch(e => {
			console.error(e);
			return null;
		});
	}

	/**
	 * 返回服务目录下所有文件列表
	 * @param dir
	 * @returns {Promise<Array>}
	 */
	async listDir(dir) {
		let result = await this.client.list({
			prefix: dir,
			delimiter: '/'
		});

		let objArr = [];
		if (result.objects) {
			objArr = objArr.concat(result.objects);
		}

		if (result.prefixes) {
			for (let i = 0; i < result.prefixes.length; i++) {
				let subDir = result.prefixes[i];
				let subObjs = await this.listDir(subDir);
				objArr = objArr.concat(subObjs);
			}
		}
		return objArr;
	}
};
